import { DEFAULT_BLOCKED_BILLING_KEYS } from '@orchdeck/shared';

export const STRIPPED_BILLING_ENV_KEYS: readonly string[] = DEFAULT_BLOCKED_BILLING_KEYS;

export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export interface SecureWebPreferences {
  readonly preload: string;
  readonly contextIsolation: true;
  readonly nodeIntegration: false;
  readonly sandbox: true;
  readonly webSecurity: true;
  readonly allowRunningInsecureContent: false;
}

export function createSecureWebPreferences(preloadPath: string): SecureWebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeDaemonEnv(
  baseEnv: NodeJS.ProcessEnv,
  extraBlockedKeys: readonly string[] = [],
): NodeJS.ProcessEnv {
  const blocked = new Set(
    [...STRIPPED_BILLING_ENV_KEYS, ...extraBlockedKeys].map((k) => k.toUpperCase()),
  );
  const sanitized: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined || blocked.has(key.toUpperCase())) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}
