import type { ZompoMoodState } from '../state/i18n';

export interface ZompoMascotProps {
  readonly mood?: ZompoMoodState | undefined;
  readonly frame?: number | undefined;
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Zompo: Costa Rican Leafcutter Ant (Zompopa) rendered on an integer-snapped
 * 16x14 pixel grid using semantic Design System CSS custom properties.
 */
export function ZompoMascot({
  mood = 'idle',
  frame = 0,
  size = 24,
  className = '',
}: ZompoMascotProps) {
  const altStep = mood === 'working' && frame % 2 === 1;
  const leafLift = mood === 'working' ? (altStep ? -1 : 0) : mood === 'waiting' ? -1 : 0;
  const height = Math.round((size * 14) / 16);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 16 14"
      role="img"
      aria-label="Zompo"
      className={`pixel-crisp shrink-0 ${className}`}
    >
      {/* Moss-green hoisted leaf-card payload (Change Card metaphor) */}
      {mood !== 'committed' ? (
        <g transform={`translate(0, ${leafLift})`}>
          <rect x="3" y="1" width="6" height="4" fill="var(--pass-text)" />
          <rect x="4" y="0" width="4" height="1" fill="var(--pass-text)" />
          <rect x="5" y="2" width="3" height="1" fill="var(--pass-bg)" />
          <rect x="8" y="3" width="1" height="2" fill="var(--engine-codex)" />
        </g>
      ) : (
        <g>
          {/* Set-down leaf badge beside Zompo on clean commit */}
          <rect x="1" y="9" width="3" height="3" fill="var(--pass-text)" />
          <rect x="2" y="10" width="1" height="1" fill="var(--pass-bg)" />
        </g>
      )}

      {/* Slate-dark antennae */}
      <rect x="11" y="3" width="1" height="2" fill="var(--text-primary)" />
      <rect x="12" y="2" width="1" height="1" fill="var(--text-primary)" />
      <rect x="13" y="3" width="1" height="2" fill="var(--text-primary)" />
      <rect x="14" y="2" width="1" height="1" fill="var(--text-primary)" />

      {/* Three-segment vermilion chassis: abdomen, thorax, head */}
      <rect x="2" y="7" width="4" height="3" fill="var(--accent)" />
      <rect x="3" y="6" width="2" height="1" fill="var(--accent-hover)" />
      <rect x="6" y="8" width="1" height="1" fill="var(--accent-hover)" />
      <rect x="7" y="7" width="3" height="3" fill="var(--accent)" />
      <rect x="10" y="6" width="1" height="1" fill="var(--accent-hover)" />
      <rect x="10" y="6" width="4" height="4" fill="var(--accent)" />

      {/* Crisp single-pixel eye & mandible detail */}
      <rect x="12" y="7" width="1" height="1" fill="var(--bg-surface)" />
      <rect x="14" y="9" width="1" height="1" fill="var(--text-secondary)" />

      {/* 6 stepped pixel legs (2-frame alternating stride while working) */}
      <rect x={altStep ? 4 : 3} y="10" width="1" height="2" fill="var(--text-primary)" />
      <rect x={altStep ? 7 : 8} y="10" width="1" height="2" fill="var(--text-primary)" />
      <rect x={altStep ? 12 : 11} y="10" width="1" height="2" fill="var(--text-primary)" />
      <rect x="5" y="10" width="1" height="1" fill="var(--text-secondary)" />
      <rect x="9" y="10" width="1" height="1" fill="var(--text-secondary)" />
    </svg>
  );
}
