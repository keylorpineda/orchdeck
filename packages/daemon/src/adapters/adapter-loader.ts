import type { ProviderAdapter } from '@orchdeck/shared';
import { AntigravityAdapter } from './antigravity-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { CodexAdapter } from './codex-adapter.js';
import { createDefaultMockAdapters } from './mock-adapter.js';

export type AdapterLoaderMode = 'auto' | 'live' | 'mock';

export function parseAdapterLoaderMode(raw: string | undefined): AdapterLoaderMode {
  if (raw === 'live' || raw === 'mock' || raw === 'auto') {
    return raw;
  }
  return 'auto';
}

export async function resolveDaemonAdapters(
  mode: AdapterLoaderMode = 'auto',
): Promise<readonly ProviderAdapter[]> {
  if (mode === 'mock') {
    return createDefaultMockAdapters();
  }

  const liveAdapters: readonly ProviderAdapter[] = [
    new ClaudeAdapter(),
    new CodexAdapter(),
    new AntigravityAdapter(),
  ];

  if (mode === 'live') {
    return liveAdapters;
  }

  const mocks = createDefaultMockAdapters();
  const resolved = await Promise.all(
    liveAdapters.map(async (liveAdapter, index) => {
      try {
        const health = await liveAdapter.healthCheck();
        if (health.installed) {
          return liveAdapter;
        }
      } catch {
        // Probe failed cleanly; fall back to deterministic MockAdapter for this engine.
      }
      return mocks[index] ?? liveAdapter;
    }),
  );

  return resolved;
}
