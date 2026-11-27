import { Check, X } from '@phosphor-icons/react';
import type { TaskRunRecord } from '@orchdeck/shared';
import { MarkdownContent } from './MarkdownContent';

export interface PlanApprovalCardProps {
  readonly taskRun: TaskRunRecord;
  readonly busy: boolean;
  readonly onApprovePlan: (taskRunId: string) => Promise<void>;
  readonly onRejectPlan: (taskRunId: string) => Promise<void>;
}

export function PlanApprovalCard({
  taskRun,
  busy,
  onApprovePlan,
  onRejectPlan,
}: PlanApprovalCardProps) {
  return (
    <section
      className="surface-card overflow-hidden border-l-2 border-l-warn"
      aria-label="Plan Approval Gate"
    >
      <div className="flex min-h-[38px] items-center justify-between gap-2 border-b border-border-subtle bg-inset px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-ink">Architect Plan Ready</span>
          <span className="tabular-mono rounded-[4px] border border-border-subtle bg-warn-bg px-1.5 py-0.5 text-[11px] text-warn">
            AWAITING APPROVAL
          </span>
        </div>
        <span className="tabular-mono text-[11px] text-ink-tertiary">
          Protected branch remains untouched until approved
        </span>
      </div>

      <div className="max-h-[240px] overflow-auto px-3 py-2.5 text-[13px]">
        <MarkdownContent content={taskRun.planText ?? 'No plan summary provided.'} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle bg-inset px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onApprovePlan(taskRun.id)}
            className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-accent bg-accent px-3 py-1 text-[12px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
          >
            <Check size={13} weight="regular" />
            Approve & Execute
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onRejectPlan(taskRun.id)}
            className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-border-strong bg-surface px-2.5 py-1 text-[12px] text-fail hover:border-fail disabled:opacity-50"
          >
            <X size={13} weight="regular" />
            Reject
          </button>
        </div>

        <span className="tabular-mono text-[11px] text-ink-tertiary">
          Auto-branches off main to agent/* before writing
        </span>
      </div>
    </section>
  );
}
