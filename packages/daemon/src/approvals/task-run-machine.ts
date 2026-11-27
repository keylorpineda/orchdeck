import crypto from 'node:crypto';
import type {
  TaskRunRecord,
  TaskRunStartParams,
  TaskRunState,
  TurnEventNotificationParams,
} from '@orchdeck/shared';
import type { TurnRunner } from '../adapters/turn-runner.js';
import type { GitService, WorkingTreeBaseline } from '../git/git-service.js';

export const ALLOWED_TASK_RUN_TRANSITIONS: Readonly<Record<TaskRunState, readonly TaskRunState[]>> = {
  IDLE: ['PLANNING', 'PREPARING_BRANCH'],
  PLANNING: ['AWAITING_PLAN_APPROVAL', 'DISCARDED'],
  AWAITING_PLAN_APPROVAL: ['PREPARING_BRANCH', 'DISCARDED'],
  PREPARING_BRANCH: ['EXECUTING', 'DISCARDED'],
  EXECUTING: ['VERIFYING', 'AWAITING_FINAL_REVIEW', 'COMMITTED_ON_BRANCH', 'DISCARDED'],
  VERIFYING: ['AWAITING_FINAL_REVIEW', 'COMMITTED_ON_BRANCH', 'EXECUTING', 'DISCARDED'],
  AWAITING_FINAL_REVIEW: ['COMMITTED_ON_BRANCH', 'EXECUTING', 'DISCARDED'],
  COMMITTED_ON_BRANCH: [],
  DISCARDED: [],
};

export function canTransitionTaskRun(from: TaskRunState, to: TaskRunState): boolean {
  return ALLOWED_TASK_RUN_TRANSITIONS[from].includes(to);
}

function deriveBranchSlug(prompt: string): string {
  const words = prompt
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
    .slice(0, 5);
  return words.length > 0 ? words.join('-') : `task-${Date.now()}`;
}

export interface TaskRunOrchestratorOptions {
  readonly turnRunner: TurnRunner;
  readonly gitService: GitService;
  readonly emitUpdated: (taskRun: TaskRunRecord) => void;
}

interface InternalRunState {
  record: TaskRunRecord;
  planBuffer: string;
  baseline: WorkingTreeBaseline | null;
}

export class TaskRunOrchestrator {
  private readonly turnRunner: TurnRunner;
  private readonly gitService: GitService;
  private readonly emitUpdated: (taskRun: TaskRunRecord) => void;
  private readonly runs = new Map<string, InternalRunState>();
  private readonly runByTurnId = new Map<string, string>();
  private readonly unsubscribeEvents: () => void;

  constructor(options: TaskRunOrchestratorOptions) {
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

  getRun(taskRunId: string): TaskRunRecord | null {
    return this.runs.get(taskRunId)?.record ?? null;
  }

  private transition(
    entry: InternalRunState,
    nextState: TaskRunState,
    patch: Partial<
      Pick<
        TaskRunRecord,
        'branchName' | 'activeTurnId' | 'planText' | 'commitSha' | 'roleViolationDetected' | 'errorMessage'
      >
    > = {},
  ): TaskRunRecord {
    const currentState = entry.record.state;
    if (!canTransitionTaskRun(currentState, nextState)) {
      throw new Error(`Illegal TaskRun transition from ${currentState} to ${nextState}.`);
    }

    const updated: TaskRunRecord = {
      ...entry.record,
      ...patch,
      state: nextState,
      updatedAt: new Date().toISOString(),
    };
    entry.record = updated;
    this.emitUpdated(updated);
    return updated;
  }

  private handleTurnEvent(notification: TurnEventNotificationParams): void {
    const runId = this.runByTurnId.get(notification.turnId);
    if (!runId) {
      return;
    }
    const entry = this.runs.get(runId);
    if (!entry) {
      this.runByTurnId.delete(notification.turnId);
      return;
    }

    const { event } = notification;
    if (entry.record.state === 'PLANNING' && event.type === 'text_delta') {
      entry.planBuffer += event.text;
      return;
    }

    if (event.type !== 'done') {
      return;
    }

    this.runByTurnId.delete(notification.turnId);

    if (entry.record.state === 'PLANNING') {
      void this.finalizePlanningTurn(entry, event.outcome);
      return;
    }

    if (entry.record.state === 'EXECUTING') {
      void this.finalizeExecutingTurn(entry, event.outcome);
    }
  }

  private async finalizePlanningTurn(
    entry: InternalRunState,
    outcome: 'completed' | 'cancelled' | 'rate_limited' | 'error',
  ): Promise<void> {
    if (entry.baseline && (await this.gitService.isGitRepository(entry.record.cwd))) {
      const guard = await this.gitService.verifyAndRevertReadOnlyTurn(
        entry.record.cwd,
        entry.baseline,
      );
      if (guard.violated) {
        this.transition(entry, 'DISCARDED', {
          activeTurnId: null,
          roleViolationDetected: true,
          errorMessage: `Read-only Planner role attempted unauthorized modifications (${guard.touchedFiles.join(', ')}); changes were reverted cleanly.`,
        });
        return;
      }
    }

    if (outcome === 'completed') {
      const planText = entry.planBuffer.trim() || 'Plan generated cleanly.';
      this.transition(entry, 'AWAITING_PLAN_APPROVAL', {
        activeTurnId: null,
        planText,
      });
    } else {
      this.transition(entry, 'DISCARDED', {
        activeTurnId: null,
        errorMessage: `Planning turn ended with outcome: ${outcome}.`,
      });
    }
  }

  private async finalizeExecutingTurn(
    entry: InternalRunState,
    outcome: 'completed' | 'cancelled' | 'rate_limited' | 'error',
  ): Promise<void> {
    if (outcome !== 'completed') {
      this.transition(entry, 'DISCARDED', {
        activeTurnId: null,
        errorMessage: `Execution turn ended with outcome: ${outcome}.`,
      });
      return;
    }

    if (entry.record.mode === 'branch_pilot') {
      const isGit = await this.gitService.isGitRepository(entry.record.cwd);
      if (isGit) {
        const status = await this.gitService.getStatus(entry.record.cwd);
        if (!status.isClean) {
          const slug = deriveBranchSlug(entry.record.prompt);
          const commitSha = await this.gitService.commitApprovedChanges(
            entry.record.cwd,
            `feat(pilot): ${slug}`,
          );
          this.transition(entry, 'COMMITTED_ON_BRANCH', {
            activeTurnId: null,
            commitSha,
          });
          return;
        }
      }
    }

    this.transition(entry, 'AWAITING_FINAL_REVIEW', {
      activeTurnId: null,
    });
  }

  private async ensureIsolatedBranchIfGit(cwd: string, prompt: string): Promise<string | null> {
    const isGit = await this.gitService.isGitRepository(cwd);
    if (!isGit) {
      return null;
    }
    return this.gitService.ensureTaskBranch(cwd, deriveBranchSlug(prompt));
  }

  async startRun(params: TaskRunStartParams): Promise<TaskRunRecord> {
    const now = new Date().toISOString();
    const initialRecord: TaskRunRecord = {
      id: crypto.randomUUID(),
      projectId: params.projectId,
      chatId: params.chatId,
      cwd: params.cwd,
      modelHandle: params.modelHandle,
      prompt: params.prompt,
      mode: params.mode,
      state: 'IDLE',
      branchName: null,
      activeTurnId: null,
      planText: null,
      commitSha: null,
      roleViolationDetected: false,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    const entry: InternalRunState = {
      record: initialRecord,
      planBuffer: '',
      baseline: null,
    };
    this.runs.set(initialRecord.id, entry);

    if (params.mode === 'plan' || params.mode === 'architect') {
      if (await this.gitService.isGitRepository(params.cwd)) {
        entry.baseline = await this.gitService.captureWorkingTreeBaseline(params.cwd);
      }

      const turnId = crypto.randomUUID();
      this.runByTurnId.set(turnId, initialRecord.id);
      this.transition(entry, 'PLANNING', { activeTurnId: turnId });

      try {
        await this.turnRunner.startTurn(
          {
            projectId: params.projectId,
            chatId: params.chatId,
            cwd: params.cwd,
            modelHandle: params.modelHandle,
            prompt: params.prompt,
            role: 'planner',
            approvalMode: params.mode,
          },
          { turnId },
        );
      } catch (err) {
        this.runByTurnId.delete(turnId);
        this.transition(entry, 'DISCARDED', {
          activeTurnId: null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      return entry.record;
    }

    // Express / Branch Pilot: enforce protected branch isolation before executing writes.
    this.transition(entry, 'PREPARING_BRANCH');
    let branchName: string | null = null;
    try {
      branchName = await this.ensureIsolatedBranchIfGit(params.cwd, params.prompt);
    } catch (err) {
      this.transition(entry, 'DISCARDED', {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const turnId = crypto.randomUUID();
    this.runByTurnId.set(turnId, initialRecord.id);
    this.transition(entry, 'EXECUTING', {
      branchName,
      activeTurnId: turnId,
    });

    try {
      await this.turnRunner.startTurn(
        {
          projectId: params.projectId,
          chatId: params.chatId,
          cwd: params.cwd,
          modelHandle: params.modelHandle,
          prompt: params.prompt,
          role: 'builder',
          approvalMode: params.mode,
        },
        { turnId },
      );
    } catch (err) {
      this.runByTurnId.delete(turnId);
      this.transition(entry, 'DISCARDED', {
        activeTurnId: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    return entry.record;
  }

  async approvePlan(taskRunId: string): Promise<TaskRunRecord> {
    const entry = this.runs.get(taskRunId);
    if (!entry) {
      throw new Error(`TaskRun "${taskRunId}" not found.`);
    }
    if (entry.record.state !== 'AWAITING_PLAN_APPROVAL') {
      throw new Error(
        `TaskRun "${taskRunId}" cannot approve plan while in state ${entry.record.state}.`,
      );
    }
    if (entry.record.mode === 'plan') {
      throw new Error('Read-only plan mode cannot execute repository edits.');
    }

    this.transition(entry, 'PREPARING_BRANCH');
    let branchName: string | null = null;
    try {
      branchName = await this.ensureIsolatedBranchIfGit(entry.record.cwd, entry.record.prompt);
    } catch (err) {
      this.transition(entry, 'DISCARDED', {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const turnId = crypto.randomUUID();
    this.runByTurnId.set(turnId, entry.record.id);
    this.transition(entry, 'EXECUTING', {
      branchName,
      activeTurnId: turnId,
    });

    const executionPrompt = entry.record.planText
      ? `Execute the approved plan:\n${entry.record.planText}\n\nOriginal request: ${entry.record.prompt}`
      : entry.record.prompt;

    try {
      await this.turnRunner.startTurn(
        {
          projectId: entry.record.projectId,
          chatId: entry.record.chatId,
          cwd: entry.record.cwd,
          modelHandle: entry.record.modelHandle,
          prompt: executionPrompt,
          role: 'builder',
          approvalMode: entry.record.mode,
        },
        { turnId },
      );
    } catch (err) {
      this.runByTurnId.delete(turnId);
      this.transition(entry, 'DISCARDED', {
        activeTurnId: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    return entry.record;
  }

  async rejectPlan(taskRunId: string): Promise<TaskRunRecord> {
    const entry = this.runs.get(taskRunId);
    if (!entry) {
      throw new Error(`TaskRun "${taskRunId}" not found.`);
    }
    if (entry.record.state !== 'AWAITING_PLAN_APPROVAL' && entry.record.state !== 'PLANNING') {
      throw new Error(
        `TaskRun "${taskRunId}" cannot reject plan while in state ${entry.record.state}.`,
      );
    }

    const activeTurnId = entry.record.activeTurnId;
    if (activeTurnId) {
      this.runByTurnId.delete(activeTurnId);
      await this.turnRunner.cancelTurn(activeTurnId);
    }

    return this.transition(entry, 'DISCARDED', {
      activeTurnId: null,
    });
  }
}
