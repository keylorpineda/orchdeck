import type { ProviderId } from './adapter.js';

export const TASK_TAGS = ['feature', 'bugfix', 'refactor', 'test', 'docs'] as const;

export type TaskTag = (typeof TASK_TAGS)[number];

export type RecommendationSource = 'local_history' | 'heuristic' | 'cooldown_fallback';

export type RecommendationConfidence = 'low' | 'medium' | 'high';

export interface TaskMetricRecord {
  readonly id: string;
  readonly projectId: string;
  readonly tag: TaskTag;
  readonly providerId: ProviderId;
  readonly modelHandle: string;
  readonly recipeId: string | null;
  readonly approvedFirstPass: boolean;
  readonly iterations: number;
  readonly durationMs: number;
  readonly createdAt: string;
}

export interface RecommendationHeuristic {
  readonly tag: TaskTag;
  readonly modelHandle: string;
  readonly recipeId: string | null;
}

export interface ModelRecommendation {
  readonly tag: TaskTag;
  readonly recommendedHandle: string;
  readonly recommendedProvider: ProviderId;
  readonly recommendedRecipeId: string | null;
  readonly source: RecommendationSource;
  readonly confidence: RecommendationConfidence;
  readonly sampleSize: number;
  readonly firstPassApprovalRate: number | null;
  readonly avgDurationMs: number | null;
  readonly cooldownSkippedProviders: readonly ProviderId[];
  readonly reason: string;
}

export interface TaskMetricsRecordParams {
  readonly projectId: string;
  readonly tag: TaskTag;
  readonly modelHandle: string;
  readonly recipeId?: string | null | undefined;
  readonly approvedFirstPass: boolean;
  readonly iterations?: number | undefined;
  readonly durationMs?: number | undefined;
}

export interface TaskMetricsRecordResult {
  readonly metric: TaskMetricRecord;
}

export interface MetricsRecommendParams {
  readonly projectId: string;
  readonly tag?: TaskTag | undefined;
  readonly prompt?: string | undefined;
  readonly availableHandles?: readonly string[] | undefined;
}

export interface MetricsRecommendResult {
  readonly recommendation: ModelRecommendation;
}

export interface MetricsHeuristicsGetResult {
  readonly heuristics: readonly RecommendationHeuristic[];
}

export interface MetricsHeuristicsSetParams {
  readonly heuristics: readonly RecommendationHeuristic[];
}

export interface MetricsHeuristicsSetResult {
  readonly heuristics: readonly RecommendationHeuristic[];
}
