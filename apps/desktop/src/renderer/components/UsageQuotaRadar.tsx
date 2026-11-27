import { useEffect, useState } from 'react';
import type { ProviderId, ProviderUsageSummary, UsageSummaryResult } from '@orchdeck/shared';
import { formatCooldownCountdown } from '../state/inline-comments';
import { EngineMark } from './EngineMark';

export interface UsageQuotaRadarProps {
  readonly summary: UsageSummaryResult | null;
  readonly includeLocalLogs: boolean;
  readonly loading: boolean;
  readonly onToggleLocalLogs: (next: boolean) => void;
  readonly onRefresh: () => Promise<void>;
}

const PROVIDER_NAMES: Readonly<Record<ProviderId, string>> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  antigravity: 'Antigravity CLI',
};

export function UsageQuotaRadar({
  summary,
  includeLocalLogs,
  loading,
  onToggleLocalLogs,
  onRefresh,
}: UsageQuotaRadarProps) {
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasActiveCooldown =
    summary?.providers.some((p) => p.status === 'cooldown' && p.cooldownUntil !== null) ?? false;

  useEffect(() => {
    if (!hasActiveCooldown && !open) {
      return;
    }
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [hasActiveCooldown, open]);

  const providers: readonly ProviderUsageSummary[] = summary?.providers ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) {
            void onRefresh();
          }
        }}
        className="orch-transition flex items-center gap-2 rounded-[4px] border border-border-subtle bg-surface px-2 py-1 hover:border-border-strong"
        aria-label="Honest Usage and Quota Radar"
        title="Usage & Quota Radar (click for 5h/7d telemetry)"
      >
        {(['claude', 'codex', 'antigravity'] as const).map((providerId) => {
          const entry = providers.find((p) => p.providerId === providerId);
          const isCooldown = entry?.status === 'cooldown';
          const countdown = isCooldown ? formatCooldownCountdown(entry.cooldownUntil, nowMs) : null;

          return (
            <span
              key={providerId}
              className={`inline-flex items-center gap-1 ${isCooldown ? 'text-warn' : ''}`}
            >
              <EngineMark provider={providerId} muted={!isCooldown} />
              {countdown ? (
                <span className="tabular-mono text-[10.5px] font-medium text-warn">
                  {countdown}
                </span>
              ) : null}
            </span>
          );
        })}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Usage & Quota Telemetry"
          className="surface-card absolute top-[calc(100%+6px)] right-0 z-30 w-[380px] overflow-hidden shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border-subtle bg-inset px-3 py-2 text-[11.5px]">
            <span className="font-medium text-ink">Honest Usage & Quota Radar</span>
            <button
              type="button"
              disabled={loading}
              onClick={() => void onRefresh()}
              className="text-accent hover:underline disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="divide-y divide-border-subtle">
            {providers.map((item) => {
              const isCooldown = item.status === 'cooldown';
              const countdown = isCooldown
                ? formatCooldownCountdown(item.cooldownUntil, nowMs)
                : null;
              const blocks = item.calibration.pressureBlocks;

              return (
                <div key={item.providerId} className="flex flex-col gap-1.5 px-3 py-2.5 text-[11.5px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <EngineMark provider={item.providerId} muted={!isCooldown} />
                      <span className="font-medium text-ink">{PROVIDER_NAMES[item.providerId]}</span>
                    </div>
                    <span
                      className={`tabular-mono rounded-[4px] px-1.5 py-0.5 text-[10.5px] ${
                        isCooldown ? 'bg-warn-bg text-warn' : 'bg-pass-bg text-pass'
                      }`}
                    >
                      {isCooldown ? `Cooldown ${countdown ?? ''}`.trim() : 'Available'}
                    </span>
                  </div>

                  <div className="tabular-mono grid grid-cols-2 gap-2 text-[11px] text-ink-secondary">
                    <div>
                      5h: {item.last5Hours.totalTurns} turns ·{' '}
                      {(item.last5Hours.inputTokens + item.last5Hours.outputTokens).toLocaleString()}{' '}
                      tok
                    </div>
                    <div>
                      7d: {item.last7Days.totalTurns} turns ·{' '}
                      {(item.last7Days.inputTokens + item.last7Days.outputTokens).toLocaleString()}{' '}
                      tok
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10.5px] text-ink-tertiary">
                    <span>
                      {item.calibration.label}
                      {item.calibration.observedCeilingTokens
                        ? ` (${item.calibration.sampleCount} limit obs)`
                        : ' (uncalibrated)'}
                    </span>
                    <span className="flex items-center gap-[3px]" aria-label="Calibration pressure">
                      {[1, 2, 3, 4].map((slot) => (
                        <span
                          key={slot}
                          className={`h-[8px] w-[10px] ${
                            slot <= blocks
                              ? blocks >= 4
                                ? 'bg-fail'
                                : blocks >= 3
                                  ? 'bg-warn'
                                  : 'bg-pass'
                              : 'bg-border-subtle'
                          }`}
                        />
                      ))}
                    </span>
                  </div>

                  {includeLocalLogs && item.calibration.localCliLogEvents > 0 ? (
                    <span className="tabular-mono text-[10.5px] text-ink-tertiary">
                      Local CLI logs observed: {item.calibration.localCliLogEvents} events
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <label className="flex cursor-pointer items-center justify-between border-t border-border-subtle bg-inset px-3 py-2 text-[11px] text-ink-secondary">
            <span>Read local CLI logs (~/.claude, ~/.codex)</span>
            <input
              type="checkbox"
              checked={includeLocalLogs}
              onChange={(e) => onToggleLocalLogs(e.target.checked)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
