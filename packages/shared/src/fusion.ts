import type { AgentRole } from './adapter.js';

export type RecipeStepStage = AgentRole | 'relay';

export interface RecipeRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly plannerModel: string;
  readonly builderModel: string;
  readonly reviewerModel: string;
  readonly fallbackModel: string | null;
  readonly maxReviewRetries: number;
  readonly isBuiltin: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecipeStepLogEntry {
  readonly id: string;
  readonly stage: RecipeStepStage;
  readonly modelHandle: string;
  readonly summary: string;
  readonly outcome: 'completed' | 'changes_requested' | 'rate_limited' | 'error' | 'relayed';
  readonly durationMs: number;
  readonly createdAt: string;
}

export type RecipeRunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RATE_LIMITED';

export interface RecipeRunRecord {
  readonly id: string;
  readonly recipeId: string;
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly prompt: string;
  readonly status: RecipeRunStatus;
  readonly branchName: string | null;
  readonly currentStage: RecipeStepStage;
  readonly retryCount: number;
  readonly steps: readonly RecipeStepLogEntry[];
  readonly activeTurnId: string | null;
  readonly handoffPath: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecipeRunUpdatedNotificationParams {
  readonly recipeRun: RecipeRunRecord;
}

export interface HandoffPacketInput {
  readonly goal: string;
  readonly decisions: readonly string[];
  readonly diffStat: string;
  readonly latestTestOutput: string;
  readonly nextStep: string;
  readonly sourceModelHandle?: string | undefined;
  readonly targetModelHandle?: string | undefined;
  readonly reason?: string | undefined;
}

export interface ParsedInlineMention {
  readonly alias: string | null;
  readonly overrideHandle: string | null;
  readonly cleanedPrompt: string;
}

const MENTION_MODEL_MAP: Readonly<Record<string, string>> = {
  neon: 'antigravity:gemini-4-neon:high',
  codex: 'codex:gpt-5.4:high',
  opus: 'claude:opus-4-6:high',
  sonnet: 'claude:sonnet-4-6:medium',
};

export const INLINE_MENTION_ALIASES: readonly string[] = Object.keys(MENTION_MODEL_MAP);

export function parseInlineMention(rawPrompt: string): ParsedInlineMention {
  const trimmed = rawPrompt.trim();
  const match = /^@([a-z0-9_-]{2,20})\b\s*(.*)$/is.exec(trimmed);
  if (!match) {
    return {
      alias: null,
      overrideHandle: null,
      cleanedPrompt: trimmed,
    };
  }

  const candidate = (match[1] ?? '').toLowerCase();
  const mappedHandle = MENTION_MODEL_MAP[candidate];
  if (!mappedHandle) {
    return {
      alias: null,
      overrideHandle: null,
      cleanedPrompt: trimmed,
    };
  }

  const remainder = (match[2] ?? '').trim();
  return {
    alias: candidate,
    overrideHandle: mappedHandle,
    cleanedPrompt: remainder.length > 0 ? remainder : trimmed,
  };
}
