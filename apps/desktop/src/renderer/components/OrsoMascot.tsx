import { type ReactElement, useEffect, useId, useState } from 'react';
import type { OrsoMoodState } from '../state/i18n.js';

export interface OrsoMascotProps {
  readonly mood?: OrsoMoodState;
  readonly size?: number;
  readonly showDesk?: boolean;
  readonly interactive?: boolean;
  readonly label?: string;
  readonly className?: string;
  readonly onInteract?: (() => void) | undefined;
}

/**
 * Orso, Orchdeck's textured bear engineer mascot.
 * Combines SVG fur/knit surface grain filters, articulated paw keystrokes,
 * steaming ceramic coffee mug, mechanical keys, and interactive click-to-wave.
 */
export function OrsoMascot({
  mood = 'idle',
  size = 96,
  showDesk = true,
  interactive = false,
  label = 'Orso mascot',
  className = '',
  onInteract,
}: OrsoMascotProps): ReactElement {
  const uid = useId().replace(/:/g, '');
  const furGradId = `${uid}-fur`;
  const snoutGradId = `${uid}-snout`;
  const sweaterGradId = `${uid}-sweater`;
  const knitPatternId = `${uid}-knit`;
  const furGrainId = `${uid}-grain`;
  const glowGradId = `${uid}-glow`;

  const [waving, setWaving] = useState(false);

  useEffect(() => {
    if (!waving) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWaving(false);
    }, 1300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [waving]);

  const handleTrigger = (): void => {
    if (!interactive) {
      return;
    }
    setWaving(true);
    onInteract?.();
  };

  const viewBox = showDesk ? '0 0 120 104' : '22 6 76 68';
  const heightPx = showDesk ? Math.round((size * 104) / 120) : Math.round((size * 68) / 76);

  return (
    <svg
      width={size}
      height={heightPx}
      viewBox={viewBox}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      data-mood={mood}
      data-waving={waving ? 'true' : 'false'}
      onClick={interactive ? handleTrigger : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleTrigger();
              }
            }
          : undefined
      }
      className={`orso-svg select-none ${interactive ? 'cursor-pointer transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98]' : ''} ${className}`}
    >
      <defs>
        <radialGradient id={furGradId} cx="42%" cy="32%" r="68%">
          <stop offset="0%" stopColor="var(--orso-fur-hi)" />
          <stop offset="62%" stopColor="var(--orso-fur-mid)" />
          <stop offset="100%" stopColor="var(--orso-fur-deep)" />
        </radialGradient>

        <radialGradient id={snoutGradId} cx="48%" cy="36%" r="65%">
          <stop offset="0%" stopColor="var(--orso-snout)" />
          <stop offset="100%" stopColor="var(--orso-ear-inner)" stopOpacity="0.88" />
        </radialGradient>

        <linearGradient id={sweaterGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--orso-sweater-hi)" />
          <stop offset="55%" stopColor="var(--orso-sweater-mid)" />
          <stop offset="100%" stopColor="var(--orso-sweater-deep)" />
        </linearGradient>

        <linearGradient id={glowGradId} x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="var(--orso-glow)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--orso-glow)" stopOpacity="0" />
        </linearGradient>

        <pattern id={knitPatternId} width="6" height="6" patternUnits="userSpaceOnUse">
          <path
            d="M0 3 L3 0 L6 3 M0 6 L3 3 L6 6"
            fill="none"
            stroke="var(--orso-sweater-deep)"
            strokeWidth="0.7"
            strokeOpacity="0.34"
          />
        </pattern>

        <filter id={furGrainId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="14"
            result="noise"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.25  0 0 0 0 0.14  0 0 0 0 0.08  0 0 0 0.14 0"
            in="noise"
            result="tinted"
          />
          <feComposite in="tinted" in2="SourceAlpha" operator="in" result="clipped" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="clipped" />
          </feMerge>
        </filter>
      </defs>

      {showDesk ? (
        <ellipse
          cx="60"
          cy="97"
          rx="48"
          ry="4.5"
          fill="var(--orso-shadow)"
        />
      ) : null}

      {/* Torso + cozy textured knit sweater */}
      <g className="orso-torso">
        <path
          d="M31 74 C31 53 41 44 60 44 C79 44 89 53 89 74 L91 84 L29 84 Z"
          fill={`url(#${sweaterGradId})`}
          stroke="var(--orso-sweater-deep)"
          strokeWidth="1.2"
        />
        <path
          d="M31 74 C31 53 41 44 60 44 C79 44 89 53 89 74 L91 84 L29 84 Z"
          fill={`url(#${knitPatternId})`}
        />
        {/* Ribbed turtleneck collar */}
        <path
          d="M44 45 C49 49 71 49 76 45 L74 52 C68 55 52 55 46 52 Z"
          fill="var(--orso-sweater-deep)"
          opacity="0.72"
        />
        <path
          d="M46 47 L46 52 M52 48 L52 53 M60 48.5 L60 54 M68 48 L68 53 M74 47 L74 52"
          stroke="var(--orso-sweater-hi)"
          strokeWidth="0.9"
          strokeOpacity="0.45"
        />
      </g>

      {/* Bear Head with SVG fur texture filter */}
      <g className="orso-head" filter={showDesk ? `url(#${furGrainId})` : undefined}>
        {/* Left & Right round ears with subtle wiggle */}
        <g className="orso-ear-l">
          <circle
            cx="37"
            cy="21"
            r="9.2"
            fill={`url(#${furGradId})`}
            stroke="var(--orso-fur-deep)"
            strokeWidth="1.1"
          />
          <circle cx="37.5" cy="21.5" r="4.6" fill="var(--orso-ear-inner)" opacity="0.88" />
        </g>
        <g className="orso-ear-r">
          <circle
            cx="83"
            cy="21"
            r="9.2"
            fill={`url(#${furGradId})`}
            stroke="var(--orso-fur-deep)"
            strokeWidth="1.1"
          />
          <circle cx="82.5" cy="21.5" r="4.6" fill="var(--orso-ear-inner)" opacity="0.88" />
        </g>

        {/* Sculpted rounded bear head */}
        <path
          d="M34 34 C34 19.5 44.5 13 60 13 C75.5 13 86 19.5 86 34 C86 46.5 76.2 52.5 60 52.5 C43.8 52.5 34 46.5 34 34 Z"
          fill={`url(#${furGradId})`}
          stroke="var(--orso-fur-deep)"
          strokeWidth="1.2"
        />

        {/* Subtle tuft of fur on crown */}
        <path
          d="M55 13.5 C57 10.5 60 11 60.5 13.2 C62.5 11.2 64.5 12 63.5 14"
          fill="none"
          stroke="var(--orso-fur-deep)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Warm cheek blushes */}
        <ellipse cx="42" cy="38.5" rx="4.2" ry="2.3" fill="var(--orso-sweater-hi)" opacity="0.28" />
        <ellipse cx="78" cy="38.5" rx="4.2" ry="2.3" fill="var(--orso-sweater-hi)" opacity="0.28" />

        {/* Cream snout patch */}
        <ellipse
          cx="60"
          cy="39.5"
          rx="12.5"
          ry="9.6"
          fill={`url(#${snoutGradId})`}
          stroke="var(--orso-fur-deep)"
          strokeWidth="0.7"
          strokeOpacity="0.45"
        />

        {/* Glossy bear nose + soft specular highlight */}
        <path
          d="M55.2 36.2 C55.2 34.4 57.5 33.8 60 33.8 C62.5 33.8 64.8 34.4 64.8 36.2 C64.8 38.2 62.2 39.8 60 39.8 C57.8 39.8 55.2 38.2 55.2 36.2 Z"
          fill="var(--orso-nose)"
        />
        <ellipse cx="58.4" cy="35.3" rx="1.6" ry="0.7" fill="#FFFFFF" opacity="0.35" />

        {/* Expressive mouth */}
        {mood === 'committed' ? (
          <path
            d="M54.5 42.2 Q60 46.8 65.5 42.2"
            fill="none"
            stroke="var(--orso-nose)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        ) : mood === 'waiting' ? (
          <path
            d="M56.5 43.2 Q60 41.8 63.5 43.2"
            fill="none"
            stroke="var(--orso-nose)"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M55.5 42.5 Q58 44.6 60 42.4 Q62 44.6 64.5 42.5 M60 39.8 L60 42.4"
            fill="none"
            stroke="var(--orso-nose)"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        )}

        {/* Eyebrows */}
        {mood === 'typing' || mood === 'working' ? (
          <>
            <path d="M44 27.2 L51 28.8" stroke="var(--orso-fur-deep)" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M76 27.2 L69 28.8" stroke="var(--orso-fur-deep)" strokeWidth="1.4" strokeLinecap="round" />
          </>
        ) : mood === 'waiting' ? (
          <>
            <path d="M44 26.5 Q47.5 24.5 51 26.5" stroke="var(--orso-fur-deep)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            <path d="M69 27.5 L75.5 27.5" stroke="var(--orso-fur-deep)" strokeWidth="1.3" strokeLinecap="round" />
          </>
        ) : null}

        {/* Eyes */}
        {mood === 'committed' ? (
          <>
            <path
              d="M44.5 32 Q48 28.4 51.5 32"
              fill="none"
              stroke="var(--orso-eye)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M68.5 32 Q72 28.4 75.5 32"
              fill="none"
              stroke="var(--orso-eye)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <g className="orso-eye-blink">
              <circle cx="48" cy="31.5" r="2.7" fill="var(--orso-eye)" />
              <circle cx="47" cy="30.4" r="0.95" fill="#FFFFFF" />
            </g>
            <g className="orso-eye-blink">
              <circle cx="72" cy="31.5" r="2.7" fill="var(--orso-eye)" />
              <circle cx="71" cy="30.4" r="0.95" fill="#FFFFFF" />
            </g>
          </>
        )}
      </g>

      {showDesk ? (
        <>
          {/* Desk surface & edge */}
          <rect
            x="10"
            y="81"
            width="100"
            height="14"
            rx="3"
            fill="var(--orso-desk)"
            stroke="var(--orso-desk-edge)"
            strokeWidth="1.1"
          />
          <line
            x1="12"
            y1="84"
            x2="108"
            y2="84"
            stroke="var(--orso-desk-edge)"
            strokeWidth="0.7"
            opacity="0.5"
          />

          {/* Subtle screen glow cast onto keyboard when typing/working */}
          {mood === 'typing' || mood === 'working' ? (
            <ellipse cx="60" cy="80" rx="22" ry="7" fill={`url(#${glowGradId})`} />
          ) : null}

          {/* Mechanical keyboard deck + depressing keycaps */}
          <rect
            x="33"
            y="77"
            width="48"
            height="11"
            rx="2"
            fill="var(--orso-key-base)"
            stroke="var(--orso-desk-edge)"
            strokeWidth="0.8"
          />
          <g className="orso-key-a">
            <rect x="36.5" y="79" width="6" height="3" rx="0.8" fill="var(--orso-key-cap)" />
            <rect x="44" y="79" width="6" height="3" rx="0.8" fill="var(--orso-key-cap)" />
            <rect x="66.5" y="79" width="6" height="3" rx="0.8" fill="var(--orso-key-cap)" />
            <rect x="45.5" y="83.2" width="17" height="2.8" rx="0.8" fill="var(--orso-glow)" opacity="0.85" />
          </g>
          <g className="orso-key-b">
            <rect x="51.5" y="79" width="6" height="3" rx="0.8" fill="var(--orso-key-cap)" />
            <rect x="59" y="79" width="6" height="3" rx="0.8" fill="var(--orso-key-cap)" />
            <rect x="74" y="79" width="4.5" height="3" rx="0.8" fill="var(--orso-sweater-hi)" />
            <rect x="36.5" y="83.2" width="7.5" height="2.8" rx="0.8" fill="var(--orso-key-cap)" />
            <rect x="64" y="83.2" width="14.5" height="2.8" rx="0.8" fill="var(--orso-key-cap)" />
          </g>

          {/* Ceramic coffee mug on right side of desk + steam */}
          <g transform="translate(89, 68)">
            <path
              d="M3 -2 C2 -4 4 -6 3 -8"
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth="1.1"
              strokeLinecap="round"
              className="orso-steam-1"
            />
            <path
              d="M7.5 -2.5 C8.5 -4.5 6.5 -6.5 7.8 -8.5"
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth="1"
              strokeLinecap="round"
              className="orso-steam-2"
            />
            <path
              d="M11 3.5 C14.5 3.5 14.5 9.5 11 9.5"
              fill="none"
              stroke="var(--orso-mug)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <rect
              x="0"
              y="1"
              width="11"
              height="12"
              rx="1.8"
              fill="var(--orso-mug)"
              stroke="var(--orso-desk-edge)"
              strokeWidth="0.9"
            />
            <ellipse cx="5.5" cy="1.8" rx="4.2" ry="1.3" fill="var(--orso-coffee)" />
          </g>

          {/* Left & Right bear paws poised over mechanical keys */}
          <g className="orso-paw-l">
            <path
              d="M33 65 C31 71 36 78 44 78 C50 78 52 74 49 69 L42 63 Z"
              fill={`url(#${furGradId})`}
              stroke="var(--orso-fur-deep)"
              strokeWidth="1.1"
            />
            <circle cx="41.5" cy="74.8" r="1.4" fill="var(--orso-ear-inner)" opacity="0.8" />
            <circle cx="45.2" cy="74.2" r="1.2" fill="var(--orso-ear-inner)" opacity="0.8" />
          </g>

          <g className="orso-paw-r">
            <path
              d="M84 65 C86 71 81 78 73 78 C67 78 65 74 68 69 L75 63 Z"
              fill={`url(#${furGradId})`}
              stroke="var(--orso-fur-deep)"
              strokeWidth="1.1"
            />
            <circle cx="75.5" cy="74.8" r="1.4" fill="var(--orso-ear-inner)" opacity="0.8" />
            <circle cx="71.8" cy="74.2" r="1.2" fill="var(--orso-ear-inner)" opacity="0.8" />
          </g>

          {/* Celebration spark when commit lands */}
          {mood === 'committed' ? (
            <g transform="translate(92, 18)">
              <rect
                x="0"
                y="0"
                width="16"
                height="16"
                rx="4"
                fill="var(--pass-bg)"
                stroke="var(--pass-text)"
                strokeWidth="1.1"
              />
              <path
                d="M4.5 8.5 L7 11 L12 5.2"
                fill="none"
                stroke="var(--pass-text)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}
