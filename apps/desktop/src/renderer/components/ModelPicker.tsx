import { CaretUpDown, Check } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { PROVIDER_IDS, type ProviderId } from '@orchdeck/shared';
import { formatModelLabel, type ModelOption } from '../state/turn-stream';
import { EngineMark } from './EngineMark';

export interface ModelPickerProps {
  readonly options: readonly ModelOption[];
  readonly selectedHandle: string;
  readonly isTurnOverride: boolean;
  readonly onSelectChatModel: (handle: string) => void;
  readonly onSelectTurnOverride: (handle: string | null) => void;
}

const PROVIDER_TITLE: Record<ProviderId, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  antigravity: 'Antigravity CLI',
};

export function ModelPicker({
  options,
  selectedHandle,
  isTurnOverride,
  onSelectChatModel,
  onSelectTurnOverride,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.handle === selectedHandle);
  const activeProvider: ProviderId = selectedOption?.provider ?? 'claude';
  const activeLabel = formatModelLabel(selectedHandle, options);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onMouseDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Select engine and model (Ctrl+M)"
        className="orch-transition inline-flex items-center gap-2 rounded-[6px] border border-border-subtle bg-inset px-2.5 py-1 text-[12px] text-ink hover:border-border-strong"
      >
        <EngineMark provider={activeProvider} />
        <span className="font-medium">{activeLabel}</span>
        {isTurnOverride ? (
          <span className="tabular-mono rounded-[4px] bg-accent-soft px-1 py-0.5 text-[10px] text-accent">
            turn
          </span>
        ) : null}
        <span className="tabular-mono text-[10.5px] text-ink-tertiary">Ctrl+M</span>
        <CaretUpDown size={12} weight="regular" className="text-ink-tertiary" />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Engine and model selection"
          className="surface-elevated orch-popover absolute bottom-full left-0 z-30 mb-1.5 w-[290px] p-2"
        >
          <div className="mb-2 flex items-center justify-between border-b border-border-subtle pb-1.5 text-[11px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOverrideMode(false)}
                className={`rounded-[4px] px-2 py-0.5 ${
                  !overrideMode ? 'bg-accent-soft font-medium text-accent' : 'text-ink-secondary'
                }`}
              >
                Chat Default
              </button>
              <button
                type="button"
                onClick={() => setOverrideMode(true)}
                className={`rounded-[4px] px-2 py-0.5 ${
                  overrideMode ? 'bg-accent-soft font-medium text-accent' : 'text-ink-secondary'
                }`}
              >
                Next Turn Only
              </button>
            </div>
            {isTurnOverride ? (
              <button
                type="button"
                onClick={() => {
                  onSelectTurnOverride(null);
                  setOpen(false);
                }}
                className="text-ink-tertiary hover:text-ink"
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
            {PROVIDER_IDS.map((providerId) => {
              const providerModels = options.filter((opt) => opt.provider === providerId);
              if (providerModels.length === 0) {
                return null;
              }
              return (
                <div key={providerId}>
                  <div className="mb-1 flex items-center gap-1.5 px-1.5 text-[11px] font-medium text-ink-tertiary">
                    <EngineMark provider={providerId} />
                    <span>{PROVIDER_TITLE[providerId]}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {providerModels.map((opt) => {
                      const active = opt.handle === selectedHandle;
                      return (
                        <button
                          key={opt.handle}
                          type="button"
                          onClick={() => {
                            if (overrideMode) {
                              onSelectTurnOverride(opt.handle);
                            } else {
                              onSelectTurnOverride(null);
                              onSelectChatModel(opt.handle);
                            }
                            setOpen(false);
                          }}
                          className={`orch-transition flex w-full items-center justify-between rounded-[4px] px-2 py-1 text-left text-[12px] ${
                            active
                              ? 'bg-accent-soft text-ink'
                              : 'text-ink-secondary hover:bg-inset hover:text-ink'
                          }`}
                        >
                          <span className="truncate">{opt.displayName}</span>
                          <span className="flex items-center gap-1.5">
                            {opt.reasoningEffort ? (
                              <span className="tabular-mono text-[10.5px] text-ink-tertiary">
                                {opt.reasoningEffort}
                              </span>
                            ) : null}
                            {active ? <Check size={12} weight="regular" className="text-accent" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
