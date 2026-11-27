import { DEFAULT_BLOCKED_BILLING_KEYS } from '@orchdeck/shared';

export interface SanitizeEnvOptions {
  readonly extraBlockedKeys?: readonly string[] | undefined;
  readonly extraEnv?: Readonly<Record<string, string>> | undefined;
}

/**
 * Constructs a sanitized subprocess environment that strips all API billing keys
 * so official CLIs authenticate strictly through local user subscriptions.
 */
export function sanitizeSubprocessEnv(
  baseEnv: NodeJS.ProcessEnv,
  options: SanitizeEnvOptions = {},
): NodeJS.ProcessEnv {
  const blockedUpper = new Set(
    [...DEFAULT_BLOCKED_BILLING_KEYS, ...(options.extraBlockedKeys ?? [])].map((key) =>
      key.toUpperCase(),
    ),
  );

  const sanitized: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined || blockedUpper.has(key.toUpperCase())) {
      continue;
    }
    sanitized[key] = value;
  }

  if (options.extraEnv) {
    for (const [key, value] of Object.entries(options.extraEnv)) {
      if (blockedUpper.has(key.toUpperCase())) {
        continue;
      }
      sanitized[key] = value;
    }
  }

  return sanitized;
}
