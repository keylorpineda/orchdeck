import { useId } from 'react';
import type { ZompoMoodState } from '../state/i18n';

export interface ZompoMascotProps {
  readonly mood?: ZompoMoodState | undefined;
  readonly frame?: number | undefined;
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Zompo: Costa Rican Leafcutter Ant (Atta cephalotes / Zompopa).
 * Anatomically articulated 64x52 vector character with gradient chitin depth,
 * dorsal thoracic spines, serrated cut leaf payload, and smooth GPU-accelerated
 * tripod stride & antenna sensing motion.
 */
export function ZompoMascot({
  mood = 'idle',
  size = 32,
  className = '',
}: ZompoMascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gasterGradId = `zompo-gaster-${uid}`;
  const chitinGradId = `zompo-chitin-${uid}`;
  const leafGradId = `zompo-leaf-${uid}`;
  const height = Math.round((size * 52) / 64);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 64 52"
      role="img"
      aria-label="Zompo"
      data-mood={mood}
      className={`zompo-svg shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={gasterGradId} x1="20%" y1="10%" x2="85%" y2="92%">
          <stop offset="0%" stopColor="var(--zompo-shell-hi)" />
          <stop offset="52%" stopColor="var(--zompo-shell-mid)" />
          <stop offset="100%" stopColor="var(--zompo-shell-deep)" />
        </linearGradient>
        <linearGradient id={chitinGradId} x1="15%" y1="8%" x2="85%" y2="95%">
          <stop offset="0%" stopColor="var(--zompo-shell-hi)" />
          <stop offset="60%" stopColor="var(--zompo-shell-mid)" />
          <stop offset="100%" stopColor="var(--zompo-shell-deep)" />
        </linearGradient>
        <linearGradient id={leafGradId} x1="8%" y1="5%" x2="90%" y2="95%">
          <stop offset="0%" stopColor="var(--zompo-leaf-hi)" />
          <stop offset="62%" stopColor="var(--zompo-leaf-mid)" />
          <stop offset="100%" stopColor="var(--zompo-leaf-deep)" />
        </linearGradient>
      </defs>

      {/* Soft contact shadow anchored beneath Zompo */}
      <ellipse
        className="zompo-shadow"
        cx="33"
        cy="47"
        rx="18.5"
        ry="2.8"
        fill="var(--zompo-shadow)"
      />

      {/* Far-side articulated legs for organic 3/4 depth */}
      <g
        fill="none"
        stroke="var(--zompo-leg)"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.64"
      >
        <g className="zompo-leg-b">
          <path d="M 27.5 34.5 L 22.5 39.5 L 18.5 45.2 L 16.6 45.8" />
          <path d="M 39.2 33.8 L 43.8 39.0 L 45.6 44.8 L 47.2 45.4" />
        </g>
        <g className="zompo-leg-a">
          <path d="M 33.8 34.5 L 35.8 39.8 L 36.2 45.2 L 37.8 45.8" />
        </g>
      </g>

      {/* Main articulated body chassis */}
      <g className="zompo-body">
        {/* Gaster (abdomen) with subtle chitin rim highlight and tergite bands */}
        <path
          d="M 10.5 31.8 C 9.8 25.4, 17.5 22.6, 22.5 26.8 C 25.0 29.0, 24.4 34.2, 20.4 36.3 C 15.2 38.6, 11.0 36.2, 10.5 31.8 Z"
          fill={`url(#${gasterGradId})`}
          stroke="var(--zompo-shell-deep)"
          strokeWidth="0.65"
        />
        <path
          d="M 13.0 27.6 C 15.2 25.8, 18.6 25.8, 20.6 27.4"
          fill="none"
          stroke="var(--bg-surface)"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.34"
        />
        <path
          d="M 14.8 26.2 C 15.6 29.8, 15.5 33.8, 14.3 36.6"
          fill="none"
          stroke="var(--zompo-shell-deep)"
          strokeWidth="0.7"
          opacity="0.45"
        />
        <path
          d="M 18.6 26.1 C 19.3 29.6, 19.2 33.4, 18.2 36.2"
          fill="none"
          stroke="var(--zompo-shell-deep)"
          strokeWidth="0.7"
          opacity="0.4"
        />

        {/* Two-node petiole waist characteristic of Myrmicinae */}
        <ellipse cx="25.0" cy="31.5" rx="2.0" ry="1.65" fill="var(--zompo-shell-mid)" stroke="var(--zompo-shell-deep)" strokeWidth="0.55" />
        <ellipse cx="28.2" cy="31.4" rx="1.8" ry="1.55" fill="var(--zompo-shell-mid)" stroke="var(--zompo-shell-deep)" strokeWidth="0.55" />

        {/* Mesosoma (thorax) with twin Costa Rican leafcutter dorsal spines */}
        <path
          d="M 29.4 31.0 C 30.2 26.5, 34.0 24.8, 37.8 27.2 C 39.8 28.4, 41.2 30.2, 41.4 32.8 C 39.2 34.8, 33.4 35.0, 29.6 33.0 Z"
          fill={`url(#${chitinGradId})`}
          stroke="var(--zompo-shell-deep)"
          strokeWidth="0.65"
        />
        {/* Pronotal & propodeal spines */}
        <path
          d="M 32.0 26.4 L 30.6 24.3 L 33.3 25.8 M 36.4 26.5 L 36.6 24.2 L 38.0 26.8"
          fill="var(--zompo-shell-deep)"
          stroke="var(--zompo-shell-deep)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
        <path
          d="M 32.6 27.8 C 34.4 26.9, 36.5 27.2, 38.2 28.4"
          fill="none"
          stroke="var(--bg-surface)"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.32"
        />

        {/* Head capsule + glossy eye + serrated mandibles */}
        <path
          d="M 40.6 29.6 C 40.2 24.6, 44.5 21.8, 49.4 23.0 C 52.8 23.8, 54.4 27.4, 53.5 31.2 C 52.6 34.5, 48.2 36.0, 44.2 34.8 C 41.8 34.0, 40.8 32.2, 40.6 29.6 Z"
          fill={`url(#${chitinGradId})`}
          stroke="var(--zompo-shell-deep)"
          strokeWidth="0.65"
        />
        <path
          d="M 44.0 24.4 C 46.2 23.5, 48.5 23.8, 50.2 24.8"
          fill="none"
          stroke="var(--bg-surface)"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.32"
        />

        {/* Geniculate (elbowed) antennae */}
        <path
          className="zompo-antenna-l"
          d="M 47.0 24.0 L 44.6 17.6 L 40.4 15.2"
          fill="none"
          stroke="var(--zompo-leg)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="40.2" cy="15.1" r="0.8" fill="var(--zompo-shell-deep)" />
        <path
          className="zompo-antenna-r"
          d="M 50.2 24.4 L 53.8 18.0 L 58.0 16.0"
          fill="none"
          stroke="var(--zompo-leg)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="58.2" cy="15.9" r="0.8" fill="var(--zompo-shell-deep)" />

        {/* Glossy compound eye with natural periodic blink */}
        <g className="zompo-eye-blink">
          <ellipse cx="49.2" cy="28.3" rx="1.75" ry="2.05" fill="var(--zompo-eye)" />
          <circle cx="49.7" cy="27.6" r="0.55" fill="var(--bg-surface)" />
        </g>

        {/* Serrated mandibles grasping leaf petiole / relaxed cleanly */}
        <path
          d="M 52.8 30.8 C 55.2 31.0, 56.8 32.3, 56.2 33.8 C 54.8 33.8, 53.4 33.3, 52.2 32.4 Z"
          fill="var(--zompo-shell-deep)"
        />
        <path
          d="M 51.6 33.0 C 53.6 34.1, 55.0 34.8, 54.4 36.0 C 52.9 35.8, 51.5 34.8, 50.6 33.8 Z"
          fill="var(--zompo-leg)"
        />

        {/* Costa Rican serrated leaf payload */}
        {mood !== 'committed' ? (
          <g className="zompo-leaf">
            {/* Leaf stem anchored in mandibles */}
            <path
              d="M 54.8 32.2 C 51.2 27.6, 48.2 22.8, 45.2 19.6"
              fill="none"
              stroke="var(--zompo-leaf-deep)"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
            {/* Leaf blade with organic leafcutter bite notch along upper arc */}
            <path
              d="M 46.2 20.6 C 41.2 22.6, 33.2 21.8, 25.0 18.2 C 19.6 15.8, 15.2 11.4, 14.0 6.8 C 19.4 4.8, 26.8 5.2, 33.8 8.0 C 35.2 10.6, 37.8 11.2, 39.4 9.5 C 43.2 11.6, 46.2 15.6, 46.2 20.6 Z"
              fill={`url(#${leafGradId})`}
              stroke="var(--zompo-leaf-deep)"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            {/* Curved midrib & delicate lateral leaf veins */}
            <path
              d="M 45.4 19.8 C 36.5 16.0, 25.2 11.8, 15.4 7.4"
              fill="none"
              stroke="var(--zompo-leaf-vein)"
              strokeWidth="0.95"
              strokeLinecap="round"
            />
            <path
              d="M 38.6 16.8 L 35.8 11.2 M 31.8 14.0 L 29.2 8.2 M 24.8 11.2 L 22.6 6.8 M 36.2 16.0 L 31.6 19.2 M 28.8 13.0 L 24.4 16.2"
              fill="none"
              stroke="var(--zompo-leaf-vein)"
              strokeWidth="0.7"
              strokeLinecap="round"
              opacity="0.78"
            />
          </g>
        ) : (
          <g>
            {/* Delivered fresh leaf resting beside Zompo on committed state */}
            <path
              d="M 4.5 45.6 C 6.4 39.2, 13.8 36.8, 21.2 38.6 C 18.8 43.2, 12.2 46.2, 4.5 45.6 Z"
              fill={`url(#${leafGradId})`}
              stroke="var(--zompo-leaf-deep)"
              strokeWidth="0.75"
              strokeLinejoin="round"
            />
            <path
              d="M 6.0 44.8 C 10.6 42.6, 15.4 40.4, 20.2 38.9"
              fill="none"
              stroke="var(--zompo-leaf-vein)"
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Near-side articulated tripod legs */}
        <g
          fill="none"
          stroke="var(--zompo-leg)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g className="zompo-leg-a">
            {/* Hind leg */}
            <path d="M 30.2 33.4 L 24.6 38.8 L 21.0 46.2 L 18.8 46.6" />
            {/* Fore leg */}
            <path d="M 38.2 33.2 L 42.8 38.6 L 46.0 46.0 L 48.2 46.4" />
          </g>
          <g className="zompo-leg-b">
            {/* Mid leg */}
            <path d="M 34.4 33.8 L 34.8 39.4 L 33.2 46.2 L 31.2 46.6" />
          </g>
        </g>
      </g>
    </svg>
  );
}
