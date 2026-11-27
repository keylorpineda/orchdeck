import { CaretDown, CaretRight, Check, WarningCircle, Wrench } from '@phosphor-icons/react';
import { useState } from 'react';
import type { ToolActivityEntry } from '../state/turn-stream';

export interface ToolActivityBlockProps {
  readonly tools: readonly ToolActivityEntry[];
  readonly thinking?: string | undefined;
  readonly changedFiles?: readonly string[] | undefined;
  readonly defaultExpanded?: boolean | undefined;
}

export function ToolActivityBlock({
  tools,
  thinking,
  changedFiles = [],
  defaultExpanded = false,
}: ToolActivityBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasThinking = Boolean(thinking && thinking.trim().length > 0);
  if (tools.length === 0 && changedFiles.length === 0 && !hasThinking) {
    return null;
  }

  const failedCount = tools.filter((t) => t.ok === false).length;

  return (
    <div className="mb-2 max-w-[68ch] rounded-[6px] border border-border-subtle bg-sidebar/60 text-[12px]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="orch-transition flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-ink-secondary hover:text-ink"
      >
        <span className="inline-flex items-center gap-1.5">
          {expanded ? (
            <CaretDown size={12} weight="regular" />
          ) : (
            <CaretRight size={12} weight="regular" />
          )}
          <Wrench size={12} weight="regular" />
          <span className="tabular-mono">
            {tools.length > 0 ? `${tools.length} tool call${tools.length === 1 ? '' : 's'}` : 'Reasoning'}
          </span>
          {changedFiles.length > 0 ? (
            <span className="tabular-mono text-ink-tertiary">
              · {changedFiles.length} file{changedFiles.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
        {failedCount > 0 ? (
          <span className="tabular-mono rounded-[4px] bg-fail-bg px-1.5 py-0.5 text-[11px] text-fail">
            {failedCount} failed
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle px-2.5 py-2">
          {hasThinking ? (
            <div className="rounded-[4px] bg-inset px-2 py-1.5 text-[11.5px] text-ink-secondary">
              {thinking}
            </div>
          ) : null}

          {tools.map((tool) => (
            <div key={tool.id} className="flex flex-col gap-0.5 text-[11.5px]">
              <div className="flex items-center gap-1.5 text-ink">
                {tool.ok === false ? (
                  <WarningCircle size={12} weight="regular" className="text-fail" />
                ) : (
                  <Check size={12} weight="regular" className="text-pass" />
                )}
                <span className="tabular-mono font-medium">{tool.toolName}</span>
                <span className="truncate text-ink-secondary">{tool.summary}</span>
              </div>
              {tool.outputSummary ? (
                <div className="tabular-mono pl-4 text-[11px] text-ink-tertiary">
                  {tool.outputSummary}
                </div>
              ) : null}
            </div>
          ))}

          {changedFiles.length > 0 ? (
            <div className="tabular-mono flex flex-wrap gap-1 pt-0.5 text-[11px] text-ink-secondary">
              {changedFiles.map((file) => (
                <span
                  key={file}
                  className="rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5"
                >
                  {file}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
