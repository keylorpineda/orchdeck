import { CaretDown, CaretRight, Scales } from '@phosphor-icons/react';
import { useState } from 'react';
import type { SecondOpinionRecord, SecondOpinionResolution } from '@orchdeck/shared';
import { formatModelLabel, type ModelOption } from '../state/turn-stream';
import { EngineMark } from './EngineMark';
import { MarkdownContent } from './MarkdownContent';

export interface SecondOpinionCardProps {
  readonly opinion: SecondOpinionRecord;
  readonly modelOptions: readonly ModelOption[];
  readonly busy: boolean;
  readonly onResolve: (
    secondOpinionId: string,
    resolution: SecondOpinionResolution,
    followUpPrompt: string,
  ) => Promise<void>;
}

export function SecondOpinionCard({
  opinion,
  modelOptions,
  busy,
  onResolve,
}: SecondOpinionCardProps) {
  const [expandedWhenResolved, setExpandedWhenResolved] = useState(false);

  const labelA = formatModelLabel(opinion.columnA.modelHandle, modelOptions);
  const labelB = formatModelLabel(opinion.columnB.modelHandle, modelOptions);
  const bothReady =
    opinion.columnA.status === 'COMPLETED' && opinion.columnB.status === 'COMPLETED';
  const showBody = !opinion.collapsed || expandedWhenResolved;

  const buildFollowUp = (resolution: SecondOpinionResolution): string => {
    if (resolution === 'A') {
      return `Continue with Option A (${labelA}) from Second Opinion:\n${opinion.columnA.text}\n\nOriginal question: ${opinion.prompt}`;
    }
    if (resolution === 'B') {
      return `Continue with Option B (${labelB}) from Second Opinion:\n${opinion.columnB.text}\n\nOriginal question: ${opinion.prompt}`;
    }
    return `Synthesize the strongest points from both read-only opinions:\n\nOption A (${labelA}):\n${opinion.columnA.text}\n\nOption B (${labelB}):\n${opinion.columnB.text}\n\nOriginal question: ${opinion.prompt}`;
  };

  return (
    <section
      className="surface-card max-w-[800px] overflow-hidden"
      aria-label="Second Opinion Comparison"
    >
      <div className="flex min-h-[38px] items-center justify-between gap-2 border-b border-border-subtle bg-inset px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpandedWhenResolved((prev) => !prev)}
          className="flex items-center gap-2 text-left text-[12px] font-medium text-ink"
        >
          {opinion.collapsed ? (
            expandedWhenResolved ? (
              <CaretDown size={12} weight="regular" className="text-ink-tertiary" />
            ) : (
              <CaretRight size={12} weight="regular" className="text-ink-tertiary" />
            )
          ) : (
            <Scales size={13} weight="regular" className="text-accent" />
          )}
          <span>Second Opinion (Read-Only Comparison)</span>
          {opinion.resolution ? (
            <span className="tabular-mono rounded-[4px] bg-pass-bg px-1.5 py-0.5 text-[10.5px] text-pass">
              Resolved: {opinion.resolution}
            </span>
          ) : null}
        </button>

        <span className="tabular-mono text-[11px] text-ink-tertiary">Zero repository edits</span>
      </div>

      {opinion.roleViolationDetected ? (
        <div className="border-b border-border-subtle bg-fail-bg px-3 py-1.5 text-[12px] text-fail">
          Read-only guard detected an unauthorized edit attempt and reverted the working tree.
        </div>
      ) : null}

      {showBody ? (
        <>
          <div className="grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-2 md:divide-x md:divide-y-0">
            {[
              { col: opinion.columnA, label: labelA, slot: 'A' as const },
              { col: opinion.columnB, label: labelB, slot: 'B' as const },
            ].map(({ col, label, slot }) => (
              <div key={slot} className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between border-b border-border-subtle pb-1.5 text-[11.5px]">
                  <div className="flex items-center gap-1.5">
                    <EngineMark provider={col.provider} />
                    <span className="font-medium text-ink">
                      {slot} · {label}
                    </span>
                  </div>
                  <span className="tabular-mono text-[10.5px] text-ink-tertiary">{col.status}</span>
                </div>
                <div className="max-h-[260px] overflow-auto text-[12.5px]">
                  {col.errorMessage ? (
                    <p className="m-0 text-fail">{col.errorMessage}</p>
                  ) : col.text ? (
                    <MarkdownContent content={col.text} />
                  ) : (
                    <p className="tabular-mono m-0 text-ink-tertiary">Analyzing in parallel...</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!opinion.collapsed ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-inset px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !bothReady}
                  onClick={() => void onResolve(opinion.id, 'A', buildFollowUp('A'))}
                  className="orch-transition rounded-[6px] border border-border-strong bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink hover:border-accent disabled:opacity-50"
                >
                  Continue with A
                </button>
                <button
                  type="button"
                  disabled={busy || !bothReady}
                  onClick={() => void onResolve(opinion.id, 'B', buildFollowUp('B'))}
                  className="orch-transition rounded-[6px] border border-border-strong bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink hover:border-accent disabled:opacity-50"
                >
                  Continue with B
                </button>
                <button
                  type="button"
                  disabled={busy || !bothReady}
                  onClick={() =>
                    void onResolve(opinion.id, 'SYNTHESIZE', buildFollowUp('SYNTHESIZE'))
                  }
                  className="orch-transition rounded-[6px] border border-accent bg-accent px-2.5 py-1 text-[11.5px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
                >
                  Synthesize both
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
