import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROVIDER_IDS,
  redactSecrets,
  type EmpiricalCalibration,
  type ProviderId,
  type ProviderRadarStatus,
  type ProviderUsageSummary,
  type TurnEventNotificationParams,
  type UsageSummaryResult,
} from '@orchdeck/shared';
import type { TurnRunner } from '../adapters/turn-runner.js';
import type { DaemonDatabase, UsageEventRecord } from '../db/database.js';

interface CooldownState {
  readonly cooldownUntilMs: number;
  readonly cooldownUntil: string;
  readonly lastRateLimitMessage: string;
}

export class ProviderCooldownTracker {
  private readonly cooldowns = new Map<ProviderId, CooldownState>();
  private readonly unsubscribe: (() => void) | null;

  constructor(turnRunner?: TurnRunner) {
    this.unsubscribe = turnRunner
      ? turnRunner.subscribeEvents((notification) => {
          this.handleTurnEvent(notification);
        })
      : null;
  }

  dispose(): void {
    this.unsubscribe?.();
  }

  private handleTurnEvent(notification: TurnEventNotificationParams): void {
    if (notification.event.type !== 'rate_limit') {
      return;
    }
    this.recordRateLimit(
      notification.provider,
      notification.event.message,
      notification.event.resetAt,
      notification.event.retryAfterSeconds,
    );
  }

  recordRateLimit(
    providerId: ProviderId,
    message: string,
    resetAt?: string | undefined,
    retryAfterSeconds?: number | undefined,
    nowMs = Date.now(),
  ): void {
    let cooldownUntilMs = nowMs + (retryAfterSeconds ?? 900) * 1000;
    if (resetAt) {
      const parsedMs = Date.parse(resetAt);
      if (Number.isFinite(parsedMs) && parsedMs > nowMs) {
        cooldownUntilMs = parsedMs;
      }
    }

    this.cooldowns.set(providerId, {
      cooldownUntilMs,
      cooldownUntil: new Date(cooldownUntilMs).toISOString(),
      lastRateLimitMessage: redactSecrets(message.trim()) || 'Rate limit reached.',
    });
  }

  getStatus(
    providerId: ProviderId,
    nowMs = Date.now(),
  ): {
    readonly status: ProviderRadarStatus;
    readonly cooldownUntil: string | null;
    readonly lastRateLimitMessage: string | null;
  } {
    const state = this.cooldowns.get(providerId);
    if (!state) {
      return { status: 'available', cooldownUntil: null, lastRateLimitMessage: null };
    }
    if (nowMs >= state.cooldownUntilMs) {
      this.cooldowns.delete(providerId);
      return { status: 'available', cooldownUntil: null, lastRateLimitMessage: null };
    }
    return {
      status: 'cooldown',
      cooldownUntil: state.cooldownUntil,
      lastRateLimitMessage: state.lastRateLimitMessage,
    };
  }
}

export function computeEmpiricalCalibration(
  events: readonly UsageEventRecord[],
  recent5hTokens: number,
  localCliLogEvents = 0,
): EmpiricalCalibration {
  const ordered = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const fiveHoursMs = 5 * 3600_000;
  const observedCeilings: number[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    if (!current || !current.rateLimited) {
      continue;
    }
    const eventTimeMs = Date.parse(current.createdAt);
    if (!Number.isFinite(eventTimeMs)) {
      continue;
    }

    let rollingVolume = 0;
    for (let j = i; j >= 0; j -= 1) {
      const prior = ordered[j];
      if (!prior) {
        continue;
      }
      const priorMs = Date.parse(prior.createdAt);
      if (!Number.isFinite(priorMs) || eventTimeMs - priorMs > fiveHoursMs) {
        break;
      }
      rollingVolume += prior.inputTokens + prior.outputTokens;
    }

    if (rollingVolume > 0) {
      observedCeilings.push(rollingVolume);
    }
  }

  if (observedCeilings.length === 0) {
    return {
      label: 'Local Calibration',
      sampleCount: 0,
      observedCeilingTokens: null,
      pressureBlocks: 0,
      localCliLogEvents,
    };
  }

  const observedCeilingTokens = Math.min(...observedCeilings);
  const ratio = observedCeilingTokens > 0 ? recent5hTokens / observedCeilingTokens : 0;

  let pressureBlocks = 0;
  if (recent5hTokens > 0) {
    if (ratio > 0.8) {
      pressureBlocks = 4;
    } else if (ratio > 0.5) {
      pressureBlocks = 3;
    } else if (ratio > 0.25) {
      pressureBlocks = 2;
    } else {
      pressureBlocks = 1;
    }
  }

  return {
    label: 'Local Calibration',
    sampleCount: observedCeilings.length,
    observedCeilingTokens,
    pressureBlocks,
    localCliLogEvents,
  };
}

function countJsonlLinesBounded(rootDir: string, maxFiles = 20): number {
  if (!fs.existsSync(rootDir)) {
    return 0;
  }

  let filesVisited = 0;
  let totalLines = 0;
  const stack: string[] = [rootDir];

  while (stack.length > 0 && filesVisited < maxFiles) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (filesVisited >= maxFiles) {
        break;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        filesVisited += 1;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= 512 * 1024) {
            const raw = fs.readFileSync(fullPath, 'utf8');
            for (const line of raw.split('\n')) {
              if (line.trim().length > 0) {
                totalLines += 1;
              }
            }
          }
        } catch {
          // Ignore unreadable CLI log files safely.
        }
      }
    }
  }

  return totalLines;
}

export function scanLocalCliLogs(
  optIn: boolean,
  homeDir = os.homedir(),
): Readonly<Record<ProviderId, number>> {
  if (!optIn) {
    return { claude: 0, codex: 0, antigravity: 0 };
  }
  return {
    claude: countJsonlLinesBounded(path.join(homeDir, '.claude', 'projects')),
    codex: countJsonlLinesBounded(path.join(homeDir, '.codex', 'sessions')),
    antigravity: 0,
  };
}

export function buildUsageSummaryWithRadar(options: {
  readonly db: DaemonDatabase;
  readonly tracker?: ProviderCooldownTracker | undefined;
  readonly providerFilter?: ProviderId | undefined;
  readonly includeLocalLogs?: boolean | undefined;
  readonly homeDir?: string | undefined;
}): UsageSummaryResult {
  const base = options.db.getUsageSummary(options.providerFilter);
  const allEvents = options.db.listUsageEvents();
  const logCounts = scanLocalCliLogs(options.includeLocalLogs === true, options.homeDir);

  const providers: ProviderUsageSummary[] = base.providers.map((item) => {
    const providerEvents = allEvents.filter((evt) => evt.providerId === item.providerId);
    const recentTokens = item.last5Hours.inputTokens + item.last5Hours.outputTokens;
    const radar = options.tracker?.getStatus(item.providerId) ?? {
      status: 'available' as const,
      cooldownUntil: null,
      lastRateLimitMessage: null,
    };

    const calibration = computeEmpiricalCalibration(
      providerEvents,
      recentTokens,
      logCounts[item.providerId] ?? 0,
    );

    return {
      ...item,
      status: radar.status,
      cooldownUntil: radar.cooldownUntil,
      lastRateLimitMessage: radar.lastRateLimitMessage,
      calibration,
    };
  });

  // Preserve requested provider list ordering
  void PROVIDER_IDS;

  return {
    generatedAt: base.generatedAt,
    providers,
  };
}
