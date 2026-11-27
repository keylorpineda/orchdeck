import type { ApprovalMode, ProviderId } from './adapter.js';

export const TASK_RUN_STATES = [
  'IDLE',
  'PLANNING',
  'AWAITING_PLAN_APPROVAL',
  'PREPARING_BRANCH',
  'EXECUTING',
  'VERIFYING',
  'AWAITING_FINAL_REVIEW',
  'COMMITTED_ON_BRANCH',
  'DISCARDED',
] as const;

export type TaskRunState = (typeof TASK_RUN_STATES)[number];

export interface TaskRunRecord {
  readonly id: string;
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly modelHandle: string;
  readonly prompt: string;
  readonly mode: ApprovalMode;
  readonly state: TaskRunState;
  readonly branchName: string | null;
  readonly activeTurnId: string | null;
  readonly planText: string | null;
  readonly commitSha: string | null;
  readonly roleViolationDetected: boolean;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TaskRunUpdatedNotificationParams {
  readonly taskRun: TaskRunRecord;
}

export interface UsageWindowBucket {
  readonly windowHours: number;
  readonly totalTurns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly totalDurationMs: number;
  readonly rateLimitCount: number;
}

export interface ProviderUsageSummary {
  readonly providerId: ProviderId;
  readonly last5Hours: UsageWindowBucket;
  readonly last7Days: UsageWindowBucket;
}

export interface UsageSummaryResult {
  readonly generatedAt: string;
  readonly providers: readonly ProviderUsageSummary[];
}
