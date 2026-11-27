import crypto from 'node:crypto';
import type {
  AgentRole,
  HandoffRelayParams,
  HandoffRelayResult,
  RecipeRecord,
  RecipeRunRecord,
  RecipeRunStartParams,
  RecipeStepLogEntry,
  RecipeStepStage,
  TurnEventNotificationParams,
} from '@orchdeck/shared';
import type { TurnRunner } from '../adapters/turn-runner.js';
import type { DaemonDatabase } from '../db/database.js';
import type { GitService } from '../git/git-service.js';
import { writeHandoffPacket } from './handoff-builder.js';

interface TurnOutcomeWaiter {
  text: string;
  rateLimitMessage: string | null;
  startedAtMs: number;
  resolve: (result: CompletedStageResult) => void;
}

interface CompletedStageResult {
  readonly text: string;
  readonly outcome: 'completed' | 'cancelled' | 'rate_limited' | 'error';
  readonly rateLimitMessage: string | null;
  readonly durationMs: number;
}

function deriveSlug(prompt: string): string {
  const words = prompt
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
    .slice(0, 4);
  return words.length > 0 ? words.join('-') : `recipe-${Date.now()}`;
}

export function reviewRequestsChanges(reviewOutput: string): boolean {
  const upper = reviewOutput.toUpperCase();
  return upper.includes('CHANGES_REQUESTED') || upper.includes('NEEDS_FIX');
}

export interface RecipeOrchestratorOptions {
  readonly db: DaemonDatabase;
  readonly turnRunner: TurnRunner;
  readonly gitService: GitService;
  readonly emitUpdated: (recipeRun: RecipeRunRecord) => void;
}

export class RecipeOrchestrator {
  private readonly db: DaemonDatabase;
  private readonly turnRunner: TurnRunner;
  private readonly gitService: GitService;
  private readonly emitUpdated: (recipeRun: RecipeRunRecord) => void;
  private readonly runs = new Map<string, RecipeRunRecord>();
  private readonly waiters = new Map<string, TurnOutcomeWaiter>();
  private readonly unsubscribeEvents: () => void;

  constructor(options: RecipeOrchestratorOptions) {
    this.db = options.db;
    this.turnRunner = options.turnRunner;
    this.gitService = options.gitService;
    this.emitUpdated = options.emitUpdated;
    this.unsubscribeEvents = this.turnRunner.subscribeEvents((notification) => {
      this.handleTurnEvent(notification);
    });
  }

  dispose(): void {
    this.unsubscribeEvents();
  }

  getRun(recipeRunId: string): RecipeRunRecord | null {
    return this.runs.get(recipeRunId) ?? null;
  }

  private handleTurnEvent(notification: TurnEventNotificationParams): void {
    const waiter = this.waiters.get(notification.turnId);
    if (!waiter) {
      return;
    }

    const { event } = notification;
    if (event.type === 'text_delta') {
      waiter.text += event.text;
      return;
    }
    if (event.type === 'rate_limit') {
      waiter.rateLimitMessage = event.message;
      return;
    }
    if (event.type !== 'done') {
      return;
    }

    this.waiters.delete(notification.turnId);
    waiter.resolve({
      text: waiter.text.trim(),
      outcome: event.outcome,
      rateLimitMessage: waiter.rateLimitMessage,
      durationMs: Date.now() - waiter.startedAtMs,
    });
  }

  private updateRun(
    runId: string,
    patch: Partial<RecipeRunRecord>,
  ): RecipeRunRecord {
    const existing = this.runs.get(runId);
    if (!existing) {
      throw new Error(`RecipeRun "${runId}" missing.`);
    }
    const next: RecipeRunRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(runId, next);
    this.emitUpdated(next);
    return next;
  }

  private appendStep(runId: string, step: Omit<RecipeStepLogEntry, 'id' | 'createdAt'>): RecipeRunRecord {
    const existing = this.runs.get(runId);
    if (!existing) {
      throw new Error(`RecipeRun "${runId}" missing.`);
    }
    const fullStep: RecipeStepLogEntry = {
      ...step,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    return this.updateRun(runId, {
      steps: [...existing.steps, fullStep],
    });
  }

  private async runStageTurn(
    runId: string,
    stage: RecipeStepStage,
    role: AgentRole,
    modelHandle: string,
    params: RecipeRunStartParams,
    prompt: string,
  ): Promise<CompletedStageResult> {
    const turnId = crypto.randomUUID();
    this.updateRun(runId, {
      currentStage: stage,
      activeTurnId: turnId,
    });

    const completion = new Promise<CompletedStageResult>((resolve) => {
      this.waiters.set(turnId, {
        text: '',
        rateLimitMessage: null,
        startedAtMs: Date.now(),
        resolve,
      });
    });

    await this.turnRunner.startTurn(
      {
        projectId: params.projectId,
        chatId: params.chatId,
        cwd: params.cwd,
        modelHandle,
        prompt,
        role,
        approvalMode: 'architect',
      },
      { turnId },
    );

    const result = await completion;
    this.updateRun(runId, { activeTurnId: null });
    return result;
  }

  async runRecipe(params: RecipeRunStartParams): Promise<RecipeRunRecord> {
    const recipe = this.db.getRecipe(params.recipeId);
    if (!recipe) {
      throw new Error(`Recipe "${params.recipeId}" not found.`);
    }

    const now = new Date().toISOString();
    const initialRun: RecipeRunRecord = {
      id: crypto.randomUUID(),
      recipeId: recipe.id,
      projectId: params.projectId,
      chatId: params.chatId,
      cwd: params.cwd,
      prompt: params.prompt,
      status: 'RUNNING',
      branchName: null,
      currentStage: 'planner',
      retryCount: 0,
      steps: [],
      activeTurnId: null,
      handoffPath: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(initialRun.id, initialRun);
    this.emitUpdated(initialRun);

    void this.executePipeline(initialRun.id, recipe, params);
    return this.runs.get(initialRun.id) ?? initialRun;
  }

  private async tryFallbackHandoff(
    runId: string,
    recipe: RecipeRecord,
    params: RecipeRunStartParams,
    sourceModel: string,
    decisions: readonly string[],
    nextStep: string,
    reason: string,
  ): Promise<string | null> {
    const diffStat = (await this.gitService.isGitRepository(params.cwd))
      ? await this.gitService.getDiffStat(params.cwd)
      : '';
    const packet = await writeHandoffPacket(params.cwd, {
      goal: params.prompt,
      decisions,
      diffStat,
      latestTestOutput: '',
      nextStep,
      sourceModelHandle: sourceModel,
      targetModelHandle: recipe.fallbackModel ?? undefined,
      reason,
    });

    this.updateRun(runId, { handoffPath: packet.relativePath });
    this.appendStep(runId, {
      stage: 'relay',
      modelHandle: recipe.fallbackModel ?? sourceModel,
      summary: `Wrote handoff packet to ${packet.relativePath} after quota limit.`,
      outcome: 'relayed',
      durationMs: 0,
    });
    return packet.markdown;
  }

  private async runWithQuotaFallback(
    runId: string,
    stage: AgentRole,
    primaryModel: string,
    recipe: RecipeRecord,
    params: RecipeRunStartParams,
    prompt: string,
    decisions: readonly string[],
  ): Promise<{ readonly result: CompletedStageResult; readonly usedModel: string } | null> {
    const primaryResult = await this.runStageTurn(runId, stage, stage, primaryModel, params, prompt);
    if (primaryResult.outcome !== 'rate_limited') {
      return { result: primaryResult, usedModel: primaryModel };
    }

    const reason = primaryResult.rateLimitMessage ?? `Rate limit reached on ${primaryModel}.`;
    this.appendStep(runId, {
      stage,
      modelHandle: primaryModel,
      summary: reason,
      outcome: 'rate_limited',
      durationMs: primaryResult.durationMs,
    });

    const handoffMarkdown = await this.tryFallbackHandoff(
      runId,
      recipe,
      params,
      primaryModel,
      decisions,
      `Resume ${stage} stage: ${params.prompt}`,
      reason,
    );

    if (!recipe.fallbackModel || recipe.fallbackModel === primaryModel) {
      this.updateRun(runId, {
        status: 'RATE_LIMITED',
        errorMessage: reason,
      });
      return null;
    }

    const relayPrompt = `${prompt}\n\n${handoffMarkdown ?? ''}`.trim();
    const fallbackResult = await this.runStageTurn(
      runId,
      stage,
      stage,
      recipe.fallbackModel,
      params,
      relayPrompt,
    );
    if (fallbackResult.outcome === 'rate_limited') {
      this.updateRun(runId, {
        status: 'RATE_LIMITED',
        errorMessage: fallbackResult.rateLimitMessage ?? reason,
      });
      return null;
    }

    return { result: fallbackResult, usedModel: recipe.fallbackModel };
  }

  private async executePipeline(
    runId: string,
    recipe: RecipeRecord,
    params: RecipeRunStartParams,
  ): Promise<void> {
    try {
      const decisions: string[] = [];

      // Stage 1: Planner (read_only)
      const planRun = await this.runWithQuotaFallback(
        runId,
        'planner',
        recipe.plannerModel,
        recipe,
        params,
        `Create a concise implementation plan:\n${params.prompt}`,
        decisions,
      );
      if (!planRun) {
        return;
      }
      if (planRun.result.outcome !== 'completed') {
        this.updateRun(runId, {
          status: 'FAILED',
          errorMessage: `Planner ended with outcome ${planRun.result.outcome}.`,
        });
        return;
      }

      decisions.push(`Planner (${planRun.usedModel}): ${planRun.result.text.slice(0, 280)}`);
      this.appendStep(runId, {
        stage: 'planner',
        modelHandle: planRun.usedModel,
        summary: planRun.result.text || 'Planning step completed.',
        outcome: 'completed',
        durationMs: planRun.result.durationMs,
      });

      // Isolate protected branches before Builder writes.
      if (await this.gitService.isGitRepository(params.cwd)) {
        const branchName = await this.gitService.ensureTaskBranch(params.cwd, deriveSlug(params.prompt));
        this.updateRun(runId, { branchName });
      }

      // Stages 2 & 3: Builder + Reviewer bounded loop
      let feedback = '';
      for (let attempt = 0; attempt <= recipe.maxReviewRetries; attempt += 1) {
        const buildPrompt = feedback
          ? `Fix requested review items cleanly.\nReviewer feedback:\n${feedback}\n\nPlan:\n${planRun.result.text}\n\nGoal: ${params.prompt}`
          : `Implement according to plan:\n${planRun.result.text}\n\nGoal: ${params.prompt}`;

        const buildRun = await this.runWithQuotaFallback(
          runId,
          'builder',
          recipe.builderModel,
          recipe,
          params,
          buildPrompt,
          decisions,
        );
        if (!buildRun) {
          return;
        }
        if (buildRun.result.outcome !== 'completed') {
          this.updateRun(runId, {
            status: 'FAILED',
            errorMessage: `Builder ended with outcome ${buildRun.result.outcome}.`,
          });
          return;
        }

        this.appendStep(runId, {
          stage: 'builder',
          modelHandle: buildRun.usedModel,
          summary: buildRun.result.text || 'Implementation pass completed.',
          outcome: 'completed',
          durationMs: buildRun.result.durationMs,
        });

        const diffStat = (await this.gitService.isGitRepository(params.cwd))
          ? await this.gitService.getDiffStat(params.cwd)
          : '';
        const reviewPrompt = `Review implementation changes (reply CHANGES_REQUESTED if fixes are required):\nGoal: ${params.prompt}\nBuilder summary: ${buildRun.result.text}\nDiff stat:\n${diffStat || '(none)'}`;

        const reviewRun = await this.runWithQuotaFallback(
          runId,
          'reviewer',
          recipe.reviewerModel,
          recipe,
          params,
          reviewPrompt,
          decisions,
        );
        if (!reviewRun) {
          return;
        }
        if (reviewRun.result.outcome !== 'completed') {
          this.updateRun(runId, {
            status: 'FAILED',
            errorMessage: `Reviewer ended with outcome ${reviewRun.result.outcome}.`,
          });
          return;
        }

        const needsChanges = reviewRequestsChanges(reviewRun.result.text);
        this.appendStep(runId, {
          stage: 'reviewer',
          modelHandle: reviewRun.usedModel,
          summary: reviewRun.result.text || 'Review step completed.',
          outcome: needsChanges ? 'changes_requested' : 'completed',
          durationMs: reviewRun.result.durationMs,
        });

        if (!needsChanges || attempt >= recipe.maxReviewRetries) {
          this.updateRun(runId, {
            status: 'COMPLETED',
            retryCount: attempt,
          });
          return;
        }

        feedback = reviewRun.result.text;
        this.updateRun(runId, { retryCount: attempt + 1 });
      }
    } catch (err) {
      this.updateRun(runId, {
        status: 'FAILED',
        activeTurnId: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async relayHandoff(params: HandoffRelayParams): Promise<HandoffRelayResult> {
    const diffStat = (await this.gitService.isGitRepository(params.cwd))
      ? await this.gitService.getDiffStat(params.cwd)
      : '';

    const packet = await writeHandoffPacket(params.cwd, {
      goal: params.goal,
      decisions: params.decisions ?? [],
      diffStat,
      latestTestOutput: params.latestTestOutput ?? '',
      nextStep: params.nextStep,
      sourceModelHandle: params.sourceModelHandle,
      targetModelHandle: params.targetModelHandle,
      reason: params.reason,
    });

    const relayPrompt = `Continue this task using the deterministic handoff packet at ${packet.relativePath}.\n\n${packet.markdown}`;
    const started = await this.turnRunner.startTurn({
      projectId: params.projectId,
      chatId: params.chatId,
      cwd: params.cwd,
      modelHandle: params.targetModelHandle,
      prompt: relayPrompt,
      role: 'builder',
      approvalMode: 'architect',
    });

    return {
      handoffPath: packet.relativePath,
      turnId: started.turnId,
      sessionId: started.sessionId,
      targetModelHandle: params.targetModelHandle,
    };
  }
}
