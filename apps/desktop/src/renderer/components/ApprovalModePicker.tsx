import { CaretUpDown, ShieldCheck } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { ApprovalMode } from '@orchdeck/shared';
import {
  ALL_APPROVAL_MODES,
  cycleV01ApprovalMode,
  getApprovalModeMeta,
} from '../state/approval-mode';
import { useLanguage } from './LanguageProvider';
import { PixelGlyph } from './PixelGlyphs';

export interface ApprovalModePickerProps {
  readonly mode: ApprovalMode;
  readonly onChangeMode: (mode: ApprovalMode) => void;
  readonly disabled?: boolean | undefined;
}

export function ApprovalModePicker({ mode, onChangeMode, disabled }: ApprovalModePickerProps) {
  const [open, setOpen] = useState(false);
  const { dict } = useLanguage();
  const currentMeta = getApprovalModeMeta(mode);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (disabled) {
        return;
      }
      if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        onChangeMode(cycleV01ApprovalMode(mode));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [disabled, mode, onChangeMode]);

  const badgeTone =
    mode === 'branch_pilot'
      ? 'border-accent bg-accent-soft text-accent'
      : mode === 'express'
        ? 'border-warn bg-warn-bg text-warn'
        : 'border-border-subtle bg-inset text-ink-secondary';

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        title="Approval Mode (Shift+Tab to switch)"
        className={`orch-transition inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11.5px] font-medium hover:border-border-strong disabled:opacity-50 ${badgeTone}`}
      >
        <ShieldCheck size={13} weight="regular" />
        <span>{currentMeta.label}</span>
        <span className="tabular-mono text-[10.5px] opacity-75">Shift+Tab</span>
        <CaretUpDown size={12} weight="regular" />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Approval mode selector"
          className="surface-card absolute bottom-[calc(100%+6px)] left-0 z-20 w-[320px] overflow-hidden shadow-sm"
        >
          <div className="divide-y divide-border-subtle">
            {ALL_APPROVAL_MODES.map((candidate) => {
              const meta = getApprovalModeMeta(candidate);
              const selected = candidate === mode;
              return (
                <button
                  key={candidate}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChangeMode(candidate);
                    setOpen(false);
                  }}
                  className={`orch-transition flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-inset ${
                    selected ? 'bg-inset' : 'bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ink">{meta.label}</span>
                    {selected ? (
                      <span className="tabular-mono text-[10.5px] text-accent">ACTIVE</span>
                    ) : null}
                  </div>
                  <span className="text-[11.5px] text-ink-secondary">{meta.summary}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 border-t border-border-subtle bg-inset px-3 py-1.5 text-[11px] text-ink-tertiary">
            <PixelGlyph name="shield-main" size={11} />
            <span>{dict.noModeWritesMain}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
