import { type ReactElement, useEffect, useState } from 'react';
import {
  type OrsoMoodState,
  type UiLocale,
  getOrsoStatusPhrase,
  getUiDictionary,
} from '../state/i18n.js';
import { OrsoMascot } from './OrsoMascot.js';

export interface OrsoStatusStripProps {
  readonly locale: UiLocale;
  readonly mood: OrsoMoodState;
}

const STEP_COUNT = 6;

export function OrsoStatusStrip({ locale, mood }: OrsoStatusStripProps): ReactElement {
  const [frame, setFrame] = useState(0);
  const [greetingVisible, setGreetingVisible] = useState(false);

  useEffect(() => {
    if (mood !== 'working') {
      setFrame(0);
      return;
    }
    const timer = window.setInterval(() => {
      setFrame((prev) => prev + 1);
    }, 3200);
    return () => {
      window.clearInterval(timer);
    };
  }, [mood]);

  useEffect(() => {
    if (!greetingVisible) {
      return;
    }
    const timer = window.setTimeout(() => {
      setGreetingVisible(false);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [greetingVisible]);

  const dict = getUiDictionary(locale);
  const phrase = greetingVisible ? dict.orsoWaving : getOrsoStatusPhrase(locale, mood, frame);
  const activeStep = mood === 'working' ? frame % STEP_COUNT : -1;

  const badgeClass =
    mood === 'working' || mood === 'typing'
      ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
      : mood === 'waiting'
        ? 'border-[var(--warn-text)]/40 bg-[var(--warn-bg)] text-[var(--warn-text)]'
        : mood === 'committed'
          ? 'border-[var(--pass-text)]/40 bg-[var(--pass-bg)] text-[var(--pass-text)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-inset)] text-[var(--text-tertiary)]';

  return (
    <div
      data-testid="orso-status-strip"
      className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 orch-transition"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <OrsoMascot
          mood={mood}
          size={58}
          interactive
          label={phrase}
          onInteract={() => setGreetingVisible(true)}
          className="shrink-0"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[11px] font-medium text-[var(--text-primary)]">
              {phrase}
            </span>
            <span
              className={`shrink-0 rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${badgeClass}`}
            >
              {mood}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: STEP_COUNT }).map((_, index) => (
              <span
                key={index}
                className={`h-[3px] w-3.5 rounded-[1px] transition-colors duration-200 ${
                  mood === 'working'
                    ? index === activeStep
                      ? 'bg-[var(--accent)]'
                      : 'bg-[var(--border-strong)]'
                    : mood === 'typing'
                      ? index % 2 === 0
                        ? 'bg-[var(--accent)]'
                        : 'bg-[var(--border-strong)]'
                      : mood === 'committed'
                        ? 'bg-[var(--pass-text)]'
                        : mood === 'waiting'
                          ? 'bg-[var(--warn-text)]/70'
                          : 'bg-[var(--border-subtle)]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] sm:inline">
        Orso · 2026
      </span>
    </div>
  );
}
