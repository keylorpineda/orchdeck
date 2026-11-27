import { ArrowsLeftRight } from '@phosphor-icons/react';
import { useState } from 'react';
import type { ModelOption } from '../state/turn-stream';

export interface HandoffRelayBannerProps {
  readonly modelOptions: readonly ModelOption[];
  readonly currentModelHandle: string;
  readonly rateLimitReason: string | null;
  readonly busy: boolean;
  readonly lastHandoffNotice: string | null;
  readonly onRelay: (targetModelHandle: string) => Promise<void>;
}

export function HandoffRelayBanner({
  modelOptions,
  currentModelHandle,
  rateLimitReason,
  busy,
  lastHandoffNotice,
  onRelay,
}: HandoffRelayBannerProps) {
  const alternativeOptions = modelOptions.filter((opt) => opt.handle !== currentModelHandle);
  const [targetHandle, setTargetHandle] = useState(
    alternativeOptions[0]?.handle ?? modelOptions[0]?.handle ?? currentModelHandle,
  );

  const toneClass = rateLimitReason ? 'border-l-2 border-l-warn bg-warn-bg' : 'bg-inset';

  return (
    <div
      className={`surface-card flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px] ${toneClass}`}
      aria-label="Deterministic Handoff Relay"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-ink">
          {rateLimitReason
            ? 'Quota cooldown detected — 1-click handoff ready'
            : 'Hand off to another engine'}
        </span>
        <span className="text-[11.5px] text-ink-secondary">
          {rateLimitReason ??
            lastHandoffNotice ??
            'Writes a secret-redacted packet to .orchdeck/handoff.md and resumes on the target engine.'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={targetHandle}
          onChange={(e) => setTargetHandle(e.target.value)}
          disabled={busy || alternativeOptions.length === 0}
          aria-label="Handoff target model"
          className="rounded-[6px] border border-border-strong bg-surface px-2 py-1 text-[11.5px] text-ink"
        >
          {(alternativeOptions.length > 0 ? alternativeOptions : modelOptions).map((opt) => (
            <option key={opt.handle} value={opt.handle}>
              {opt.displayName}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onRelay(targetHandle)}
          className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-accent bg-accent px-2.5 py-1 text-[11.5px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
        >
          <ArrowsLeftRight size={13} weight="regular" />
          {busy ? 'Relaying...' : 'Hand Off'}
        </button>
      </div>
    </div>
  );
}
