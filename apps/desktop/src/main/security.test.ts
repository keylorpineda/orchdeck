import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_CSP,
  createSecureWebPreferences,
  isAllowedExternalUrl,
  sanitizeDaemonEnv,
} from './security.js';

describe('Electron security configuration', () => {
  it('enforces sandboxed, context-isolated webPreferences', () => {
    const prefs = createSecureWebPreferences('/app/dist/preload/index.cjs');
    expect(prefs).toEqual({
      preload: '/app/dist/preload/index.cjs',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  it('enforces strict production Content-Security-Policy', () => {
    expect(PRODUCTION_CSP).toContain("default-src 'self'");
    expect(PRODUCTION_CSP).toContain("connect-src 'none'");
    expect(PRODUCTION_CSP).toContain("object-src 'none'");
    expect(PRODUCTION_CSP).toContain("frame-ancestors 'none'");
  });

  it('strips billing API keys from spawned daemon environments', () => {
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'secret-ant',
      OPENAI_API_KEY: 'secret-oai',
      GEMINI_API_KEY: 'secret-gem',
      GOOGLE_API_KEY: 'secret-goo',
      AZURE_OPENAI_API_KEY: 'secret-az',
      AWS_SECRET_ACCESS_KEY: 'secret-aws',
      CUSTOM_KEY: 'secret-custom',
      ORCHDECK_LOG_LEVEL: 'info',
    };

    const cleaned = sanitizeDaemonEnv(env, ['CUSTOM_KEY']);
    expect(cleaned['PATH']).toBe('/usr/bin');
    expect(cleaned['ORCHDECK_LOG_LEVEL']).toBe('info');
    expect(cleaned['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(cleaned['OPENAI_API_KEY']).toBeUndefined();
    expect(cleaned['GEMINI_API_KEY']).toBeUndefined();
    expect(cleaned['GOOGLE_API_KEY']).toBeUndefined();
    expect(cleaned['AZURE_OPENAI_API_KEY']).toBeUndefined();
    expect(cleaned['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
    expect(cleaned['CUSTOM_KEY']).toBeUndefined();
  });

  it('allows only https URLs for external links', () => {
    expect(isAllowedExternalUrl('https://github.com/keylorpineda/orchdeck')).toBe(true);
    expect(isAllowedExternalUrl('http://example.com')).toBe(false);
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('not-a-url')).toBe(false);
  });
});
