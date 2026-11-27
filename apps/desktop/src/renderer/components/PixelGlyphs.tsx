export type PixelGlyphName = 'leaf-card' | 'branch-trail' | 'shield-main' | 'spark-cook';

export interface PixelGlyphProps {
  readonly name: PixelGlyphName;
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

export function PixelGlyph({ name, size = 12, className = '' }: PixelGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={`pixel-crisp shrink-0 ${className}`}
    >
      {name === 'leaf-card' ? (
        <>
          <rect x="2" y="1" width="6" height="8" fill="var(--pass-bg)" />
          <rect x="2" y="1" width="6" height="1" fill="var(--pass-text)" />
          <rect x="3" y="4" width="4" height="1" fill="var(--pass-text)" />
          <rect x="3" y="6" width="3" height="1" fill="var(--text-tertiary)" />
        </>
      ) : null}

      {name === 'branch-trail' ? (
        <>
          <rect x="2" y="1" width="2" height="8" fill="var(--accent)" />
          <rect x="4" y="4" width="2" height="2" fill="var(--accent)" />
          <rect x="6" y="2" width="2" height="3" fill="var(--engine-codex)" />
        </>
      ) : null}

      {name === 'shield-main' ? (
        <>
          <rect x="2" y="1" width="6" height="5" fill="var(--warn-text)" />
          <rect x="3" y="6" width="4" height="2" fill="var(--warn-text)" />
          <rect x="4" y="8" width="2" height="1" fill="var(--warn-text)" />
          <rect x="4" y="3" width="2" height="2" fill="var(--bg-surface)" />
        </>
      ) : null}

      {name === 'spark-cook' ? (
        <>
          <rect x="4" y="1" width="2" height="2" fill="var(--accent)" />
          <rect x="2" y="4" width="6" height="4" fill="var(--warn-text)" />
          <rect x="3" y="8" width="4" height="1" fill="var(--text-secondary)" />
        </>
      ) : null}
    </svg>
  );
}

export interface PixelStepTrackProps {
  readonly active: boolean;
  readonly frame: number;
  readonly totalBlocks?: number | undefined;
}

export function PixelStepTrack({ active, frame, totalBlocks = 8 }: PixelStepTrackProps) {
  const headIdx = ((frame % totalBlocks) + totalBlocks) % totalBlocks;
  const trailIdx = (headIdx - 1 + totalBlocks) % totalBlocks;

  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: totalBlocks }, (_, idx) => {
        const isHead = active && idx === headIdx;
        const isTrail = active && idx === trailIdx;
        return (
          <span
            key={idx}
            className={`h-[6px] w-[6px] ${
              isHead
                ? 'bg-accent'
                : isTrail
                  ? 'bg-pass'
                  : 'bg-border-subtle'
            }`}
          />
        );
      })}
    </span>
  );
}
