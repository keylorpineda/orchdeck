import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';
import type { RecipeRunRecord } from '@orchdeck/shared';
import { formatModelLabel, type ModelOption } from '../state/turn-stream';

export interface CoordinationLogCardProps {
  readonly recipeRun: RecipeRunRecord;
  readonly modelOptions: readonly ModelOption[];
}

export function CoordinationLogCard({ recipeRun, modelOptions }: CoordinationLogCardProps) {
  const [expanded, setExpanded] = useState(true);

  const badgeClasses =
    recipeRun.status === 'COMPLETED'
      ? 'bg-pass-bg text-pass'
      : recipeRun.status === 'RATE_LIMITED'
        ? 'bg-warn-bg text-warn'
        : recipeRun.status === 'FAILED'
          ? 'bg-fail-bg text-fail'
          : 'bg-accent-soft text-accent';

  return (
    <section className="surface-card overflow-hidden" aria-label="Coordination Log">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex min-h-[36px] w-full items-center justify-between gap-2 border-b border-border-subtle bg-inset px-3 py-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <CaretDown size={12} weight="regular" className="text-ink-tertiary" />
          ) : (
            <CaretRight size={12} weight="regular" className="text-ink-tertiary" />
          )}
          <span className="text-[12px] font-medium text-ink">Fusion Coordination Log</span>
          <span className={`tabular-mono rounded-[4px] px-1.5 py-0.5 text-[10.5px] ${badgeClasses}`}>
            {recipeRun.status}
          </span>
          {recipeRun.retryCount > 0 ? (
            <span className="tabular-mono text-[11px] text-ink-secondary">
              {recipeRun.retryCount} review fix {recipeRun.retryCount === 1 ? 'cycle' : 'cycles'}
            </span>
          ) : null}
        </div>
        {recipeRun.branchName ? (
          <span className="tabular-mono text-[11px] text-ink-tertiary">{recipeRun.branchName}</span>
        ) : null}
      </button>

      {expanded ? (
        <div className="divide-y divide-border-subtle px-3 py-1">
          {recipeRun.steps.length === 0 ? (
            <p className="tabular-mono py-2 text-[11.5px] text-ink-tertiary">
              Running {recipeRun.currentStage} stage...
            </p>
          ) : (
            recipeRun.steps.map((step) => (
              <div key={step.id} className="flex flex-col gap-0.5 py-2 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="tabular-mono rounded-[4px] border border-border-subtle bg-inset px-1.5 py-0.5 text-[10.5px] uppercase text-ink-secondary">
                      {step.stage}
                    </span>
                    <span className="font-medium text-ink">
                      {formatModelLabel(step.modelHandle, modelOptions)}
                    </span>
                    <span className="tabular-mono text-[10.5px] text-ink-tertiary">
                      {step.outcome}
                    </span>
                  </div>
                  <span className="tabular-mono text-[11px] text-ink-tertiary">
                    {Math.round(step.durationMs)}ms
                  </span>
                </div>
                <p className="m-0 text-[12px] text-ink-secondary">{step.summary}</p>
              </div>
            ))
          )}
          {recipeRun.errorMessage ? (
            <div className="py-2 text-[12px] text-fail">{recipeRun.errorMessage}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
