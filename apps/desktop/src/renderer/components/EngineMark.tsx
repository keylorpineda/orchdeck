import type { ProviderId } from '@orchdeck/shared';

export interface EngineMarkProps {
  readonly provider: ProviderId;
  readonly muted?: boolean | undefined;
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

const PROVIDER_COLOR_VAR: Record<ProviderId, string> = {
  claude: 'var(--engine-claude)',
  codex: 'var(--engine-codex)',
  antigravity: 'var(--engine-antigravity)',
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  antigravity: 'Antigravity',
};

export function EngineMark({
  provider,
  muted = false,
  size = 7,
  className = '',
}: EngineMarkProps) {
  const fill = muted ? 'var(--text-tertiary)' : PROVIDER_COLOR_VAR[provider];
  const label = PROVIDER_LABEL[provider];

  if (provider === 'claude') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        aria-label={label}
        role="img"
        className={`shrink-0 ${className}`}
      >
        <circle cx="4" cy="4" r="3.5" fill={fill} />
      </svg>
    );
  }

  if (provider === 'codex') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        aria-label={label}
        role="img"
        className={`shrink-0 ${className}`}
      >
        <rect x="0.75" y="0.75" width="6.5" height="6.5" rx="1" fill={fill} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-label={label}
      role="img"
      className={`shrink-0 ${className}`}
    >
      <polygon points="4,0.4 7.6,4 4,7.6 0.4,4" fill={fill} />
    </svg>
  );
}
