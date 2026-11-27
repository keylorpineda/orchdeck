import { useEffect, useState } from 'react';
import { getZompoStatusPhrase, type ZompoMoodState } from '../state/i18n';
import { useLanguage } from './LanguageProvider';
import { PixelStepTrack } from './PixelGlyphs';
import { ZompoMascot } from './ZompoMascot';

export interface ZompoStatusStripProps {
  readonly mood: ZompoMoodState;
  readonly detailLabel?: string | undefined;
}

export function ZompoStatusStrip({ mood, detailLabel }: ZompoStatusStripProps) {
  const { locale } = useLanguage();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (mood !== 'working') {
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      return;
    }

    const timer = setInterval(() => {
      setFrame((prev) => prev + 1);
    }, 320);
    return () => {
      clearInterval(timer);
    };
  }, [mood]);

  // Rotate bilingual cooking/working phrases smoothly every ~3.2s (every 10 track ticks)
  const phraseTick = Math.floor(frame / 10);
  const phrase = getZompoStatusPhrase(locale, mood, phraseTick);

  return (
    <div
      className="surface-card pixel-frame flex items-center justify-between gap-3 px-3 py-2 text-[12px]"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ZompoMascot mood={mood} frame={frame} size={38} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{phrase}</span>
          {detailLabel ? (
            <span className="tabular-mono truncate text-[10.5px] text-ink-tertiary">
              {detailLabel}
            </span>
          ) : null}
        </div>
      </div>

      <PixelStepTrack active={mood === 'working'} frame={frame} />
    </div>
  );
}
