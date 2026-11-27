import { type ReactElement, useEffect, useState } from 'react';
import { type UiLocale, getUiDictionary } from '../state/i18n.js';
import { OrsoMascot } from './OrsoMascot.js';

export interface SplashScreenProps {
  readonly locale: UiLocale;
  readonly ready: boolean;
  readonly onFinished: () => void;
}

const MIN_SPLASH_MS = 950;
const EXIT_ANIM_MS = 320;

export function SplashScreen({ locale, ready, onFinished }: SplashScreenProps): ReactElement {
  const dict = getUiDictionary(locale);
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinElapsed(true);
    }, MIN_SPLASH_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready || !minElapsed || exiting) {
      return;
    }
    setExiting(true);
    const doneTimer = window.setTimeout(() => {
      onFinished();
    }, EXIT_ANIM_MS);
    return () => {
      window.clearTimeout(doneTimer);
    };
  }, [exiting, minElapsed, onFinished, ready]);

  return (
    <div
      data-testid="orchdeck-splash"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 ${
        exiting ? 'orch-splash-exit pointer-events-none' : ''
      }`}
    >
      <div className="surface-elevated orch-enter flex w-full max-w-[440px] flex-col items-center rounded-[12px] px-8 py-8 text-center">
        <OrsoMascot
          mood={ready && minElapsed ? 'committed' : 'working'}
          size={152}
          label="Orso loading Orchdeck"
        />

        <div className="mt-4 flex items-center gap-2">
          <span className="font-mono text-[13px] font-semibold tracking-[0.14em] uppercase text-[var(--text-primary)]">
            Orchdeck
          </span>
          <span className="rounded-[4px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            v0.1
          </span>
        </div>

        <p className="mt-2 font-sans text-[13px] text-[var(--text-secondary)]">
          {ready && minElapsed ? dict.splashReady : dict.splashBooting}
        </p>

        <div
          className="mt-5 h-1.5 w-full overflow-hidden rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-inset)]"
          aria-hidden="true"
        >
          {ready && minElapsed ? (
            <div className="h-full w-full bg-[var(--pass-text)] transition-all duration-200" />
          ) : (
            <div className="orch-splash-sweep h-full w-2/5 rounded-[2px] bg-[var(--accent)]" />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--engine-claude)]" />
            Claude
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--engine-codex)]" />
            Codex
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-[var(--engine-antigravity)]" />
            Antigravity
          </span>
        </div>
      </div>
    </div>
  );
}
