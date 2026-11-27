import {
  TASK_TAGS,
  isProviderId,
  parseModelHandle,
  type ModelRecommendation,
  type ProviderId,
  type RecommendationHeuristic,
  type TaskMetricRecord,
  type TaskTag,
} from '@orchdeck/shared';
import type { DaemonDatabase } from '../db/database.js';
import type { ProviderCooldownTracker } from '../usage/quota-radar.js';

const HEURISTICS_KV_KEY = 'recommender:heuristics';

export const DEFAULT_HEURISTICS: readonly RecommendationHeuristic[] = [
  { tag: 'feature', modelHandle: 'claude:sonnet-4-6', recipeId: null },
  { tag: 'bugfix', modelHandle: 'codex:gpt-5-codex', recipeId: null },
  { tag: 'refactor', modelHandle: 'claude:opus-4-6', recipeId: null },
  { tag: 'test', modelHandle: 'codex:gpt-5-codex', recipeId: null },
  { tag: 'docs', modelHandle: 'antigravity:gemini-4-neon', recipeId: null },
];

export function isTaskTag(value: unknown): value is TaskTag {
  return typeof value === 'string' && (TASK_TAGS as readonly string[]).includes(value);
}

export function inferTaskTag(prompt: string): TaskTag {
  const lower = prompt.toLowerCase();
  if (
    lower.includes('fix') ||
    lower.includes('bug') ||
    lower.includes('error') ||
    lower.includes('fail') ||
    lower.includes('crash')
  ) {
    return 'bugfix';
  }
  if (lower.includes('test') || lower.includes('spec') || lower.includes('vitest')) {
    return 'test';
  }
  if (lower.includes('refactor') || lower.includes('clean') || lower.includes('simplify')) {
    return 'refactor';
  }
  if (lower.includes('doc') || lower.includes('readme') || lower.includes('guide')) {
    return 'docs';
  }
  return 'feature';
}

function providerFromHandle(handle: string): ProviderId {
  try {
    return parseModelHandle(handle).provider;
  } catch {
    const colon = handle.indexOf(':');
    const prefix = colon > 0 ? handle.slice(0, colon) : handle;
    return isProviderId(prefix) ? prefix : 'claude';
  }
}

export function getRecommenderHeuristics(db: DaemonDatabase): readonly RecommendationHeuristic[] {
  const raw = db.getKv(HEURISTICS_KV_KEY);
  if (!raw) {
    return DEFAULT_HEURISTICS;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_HEURISTICS;
    }
    const byTag = new Map<TaskTag, RecommendationHeuristic>();
    for (const def of DEFAULT_HEURISTICS) {
      byTag.set(def.tag, def);
    }
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        continue;
      }
      const obj = item as Record<string, unknown>;
      if (!isTaskTag(obj['tag']) || typeof obj['modelHandle'] !== 'string') {
        continue;
      }
      byTag.set(obj['tag'], {
        tag: obj['tag'],
        modelHandle: obj['modelHandle'],
        recipeId: typeof obj['recipeId'] === 'string' ? obj['recipeId'] : null,
      });
    }
    return TASK_TAGS.map((tag) => byTag.get(tag) ?? DEFAULT_HEURISTICS[0]!);
  } catch {
    return DEFAULT_HEURISTICS;
  }
}

export function setRecommenderHeuristics(
  db: DaemonDatabase,
  nextHeuristics: readonly RecommendationHeuristic[],
): readonly RecommendationHeuristic[] {
  const byTag = new Map<TaskTag, RecommendationHeuristic>();
  for (const def of DEFAULT_HEURISTICS) {
    byTag.set(def.tag, def);
  }
  for (const item of nextHeuristics) {
    if (isTaskTag(item.tag) && item.modelHandle.trim().length > 0) {
      byTag.set(item.tag, {
        tag: item.tag,
        modelHandle: item.modelHandle.trim(),
        recipeId: item.recipeId ?? null,
      });
    }
  }
  const merged = TASK_TAGS.map((tag) => byTag.get(tag) ?? DEFAULT_HEURISTICS[0]!);
  db.setKv(HEURISTICS_KV_KEY, JSON.stringify(merged));
  return merged;
}

interface CandidateAggregate {
  readonly modelHandle: string;
  readonly provider: ProviderId;
  readonly recipeId: string | null;
  readonly count: number;
  readonly firstPassRate: number;
  readonly avgIterations: number;
  readonly avgDurationMs: number;
  readonly score: number;
}

function aggregateMetrics(metrics: readonly TaskMetricRecord[]): CandidateAggregate[] {
  const grouped = new Map<string, TaskMetricRecord[]>();
  for (const entry of metrics) {
    const bucket = grouped.get(entry.modelHandle) ?? [];
    bucket.push(entry);
    grouped.set(entry.modelHandle, bucket);
  }

  const scored: CandidateAggregate[] = [];
  for (const [modelHandle, rows] of grouped.entries()) {
    const count = rows.length;
    const firstPassCount = rows.filter((r) => r.approvedFirstPass).length;
    const firstPassRate = firstPassCount / count;
    const avgIterations = rows.reduce((sum, r) => sum + r.iterations, 0) / count;
    const avgDurationMs = rows.reduce((sum, r) => sum + r.durationMs, 0) / count;
    const recipeCounts = new Map<string, number>();
    for (const r of rows) {
      if (r.recipeId) {
        recipeCounts.set(r.recipeId, (recipeCounts.get(r.recipeId) ?? 0) + 1);
      }
    }
    let bestRecipeId: string | null = null;
    let bestRecipeVotes = 0;
    for (const [recipeId, votes] of recipeCounts.entries()) {
      if (votes > bestRecipeVotes) {
        bestRecipeId = recipeId;
        bestRecipeVotes = votes;
      }
    }

    const score =
      firstPassRate * 0.65 +
      (1 / Math.max(1, avgIterations)) * 0.2 +
      (1 / (1 + avgDurationMs / 60_000)) * 0.15;

    scored.push({
      modelHandle,
      provider: providerFromHandle(modelHandle),
      recipeId: bestRecipeId,
      count,
      firstPassRate,
      avgIterations,
      avgDurationMs,
      score,
    });
  }

  return scored.sort((a, b) => b.score - a.score || b.count - a.count);
}

export function recommendModelForTask(options: {
  readonly db: DaemonDatabase;
  readonly projectId: string;
  readonly tag?: TaskTag | undefined;
  readonly prompt?: string | undefined;
  readonly availableHandles?: readonly string[] | undefined;
  readonly cooldownTracker?: ProviderCooldownTracker | undefined;
  readonly minSamples?: number | undefined;
}): ModelRecommendation {
  const resolvedTag = options.tag ?? inferTaskTag(options.prompt ?? '');
  const minSamples = options.minSamples ?? 3;
  const heuristics = getRecommenderHeuristics(options.db);
  const heuristic = heuristics.find((h) => h.tag === resolvedTag) ?? DEFAULT_HEURISTICS[0]!;
  const allMetrics = options.db.listTaskMetrics(options.projectId, resolvedTag);

  const isHealthyProvider = (provider: ProviderId): boolean =>
    options.cooldownTracker?.getStatus(provider).status !== 'cooldown';

  const availablePool =
    options.availableHandles && options.availableHandles.length > 0
      ? options.availableHandles
      : DEFAULT_HEURISTICS.map((h) => h.modelHandle);

  const skippedSet = new Set<ProviderId>();

  if (allMetrics.length >= minSamples) {
    const candidates = aggregateMetrics(allMetrics);
    let picked: CandidateAggregate | null = null;
    let overrodeByCooldown = false;

    for (const candidate of candidates) {
      if (isHealthyProvider(candidate.provider)) {
        picked = candidate;
        break;
      }
      skippedSet.add(candidate.provider);
      overrodeByCooldown = true;
    }

    if (picked) {
      const pct = Math.round(picked.firstPassRate * 100);
      const avgSec = Math.max(1, Math.round(picked.avgDurationMs / 1000));
      const cooldownSuffix =
        skippedSet.size > 0
          ? ` (skipped cooldown: ${Array.from(skippedSet).join(', ')})`
          : '';
      return {
        tag: resolvedTag,
        recommendedHandle: picked.modelHandle,
        recommendedProvider: picked.provider,
        recommendedRecipeId: picked.recipeId,
        source: overrodeByCooldown ? 'cooldown_fallback' : 'local_history',
        confidence: allMetrics.length >= 6 ? 'high' : 'medium',
        sampleSize: picked.count,
        firstPassApprovalRate: picked.firstPassRate,
        avgDurationMs: Math.round(picked.avgDurationMs),
        cooldownSkippedProviders: Array.from(skippedSet),
        reason: `${pct}% 1st-pass approval (n=${picked.count}, avg ${avgSec}s)${cooldownSuffix}`,
      };
    }
  }

  // Cold-start or all historical candidates cooled down: evaluate heuristic, then healthy pool.
  const heuristicProvider = providerFromHandle(heuristic.modelHandle);
  if (isHealthyProvider(heuristicProvider)) {
    const cooldownSuffix =
      skippedSet.size > 0 ? ` (skipped cooldown: ${Array.from(skippedSet).join(', ')})` : '';
    return {
      tag: resolvedTag,
      recommendedHandle: heuristic.modelHandle,
      recommendedProvider: heuristicProvider,
      recommendedRecipeId: heuristic.recipeId,
      source: skippedSet.size > 0 ? 'cooldown_fallback' : 'heuristic',
      confidence: 'low',
      sampleSize: allMetrics.length,
      firstPassApprovalRate: null,
      avgDurationMs: null,
      cooldownSkippedProviders: Array.from(skippedSet),
      reason: `Cold-start heuristic for ${resolvedTag}${cooldownSuffix}`,
    };
  }

  skippedSet.add(heuristicProvider);
  const healthyFallback =
    availablePool.find((handle) => isHealthyProvider(providerFromHandle(handle))) ??
    heuristic.modelHandle;
  const fallbackProvider = providerFromHandle(healthyFallback);

  return {
    tag: resolvedTag,
    recommendedHandle: healthyFallback,
    recommendedProvider: fallbackProvider,
    recommendedRecipeId: heuristic.recipeId,
    source: 'cooldown_fallback',
    confidence: 'low',
    sampleSize: allMetrics.length,
    firstPassApprovalRate: null,
    avgDurationMs: null,
    cooldownSkippedProviders: Array.from(skippedSet),
    reason: `Healthy fallback while ${Array.from(skippedSet).join(', ')} in cooldown`,
  };
}
