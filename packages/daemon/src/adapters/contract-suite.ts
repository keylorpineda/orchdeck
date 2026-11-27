import type { NormalizedEvent, ProviderAdapter } from '@orchdeck/shared';
import { expect } from 'vitest';

export function assertValidCapabilities(adapter: ProviderAdapter): Promise<void> {
  return adapter.healthCheck().then((health) => {
    expect(typeof health.installed).toBe('boolean');
    expect(typeof health.authenticated).toBe('boolean');
    expect(typeof health.capabilities.streamJson).toBe('boolean');
    expect(typeof health.capabilities.strictMcpConfig).toBe('boolean');
    expect(typeof health.capabilities.modelSelectionFlag).toBe('boolean');
    expect(typeof health.capabilities.readOnlyFlag).toBe('boolean');
    expect(typeof health.capabilities.supportsResume).toBe('boolean');
  });
}

export async function runProviderAdapterContractTests(
  createAdapter: () => ProviderAdapter,
): Promise<void> {
  const adapter = createAdapter();

  await assertValidCapabilities(adapter);

  const models = await adapter.listModels();
  expect(models.length).toBeGreaterThan(0);
  const firstModel = models[0];
  expect(firstModel?.provider).toBe(adapter.id);

  const session = await adapter.startSession({
    cwd: process.cwd(),
    modelId: firstModel?.id ?? 'default',
    role: 'builder',
    approvalMode: 'architect',
  });
  expect(session.provider).toBe(adapter.id);
  expect(session.sessionId.length).toBeGreaterThan(0);

  // 1. Streaming scenario ends with done(completed) and reports usage
  const streamEvents: NormalizedEvent[] = [];
  for await (const ev of adapter.sendTurn(session.sessionId, { prompt: 'Standard streaming turn' })) {
    streamEvents.push(ev);
  }
  expect(streamEvents.some((e) => e.type === 'text_delta')).toBe(true);
  expect(streamEvents.some((e) => e.type === 'usage')).toBe(true);
  expect(streamEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'completed' });

  // 2. Tool-diff scenario emits tool_use + tool_result + changedFiles
  const diffEvents: NormalizedEvent[] = [];
  for await (const ev of adapter.sendTurn(session.sessionId, { prompt: '[tool-diff] Edit sample' })) {
    diffEvents.push(ev);
  }
  expect(diffEvents.some((e) => e.type === 'tool_use')).toBe(true);
  expect(diffEvents.some((e) => e.type === 'tool_result')).toBe(true);
  expect(diffEvents.at(-1)).toMatchObject({
    type: 'done',
    outcome: 'completed',
    changedFiles: ['src/example.ts'],
  });

  // 3. Rate-limit scenario emits rate_limit and done(rate_limited)
  const quotaEvents: NormalizedEvent[] = [];
  for await (const ev of adapter.sendTurn(session.sessionId, { prompt: '[rate-limit] Hit quota' })) {
    quotaEvents.push(ev);
  }
  expect(quotaEvents.some((e) => e.type === 'rate_limit')).toBe(true);
  expect(quotaEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'rate_limited' });

  // 4. Cancellation aborts mid-turn cleanly
  const cancelSession = await adapter.startSession({
    cwd: process.cwd(),
    modelId: firstModel?.id ?? 'default',
    role: 'builder',
    approvalMode: 'architect',
  });
  const cancelEvents: NormalizedEvent[] = [];
  for await (const ev of adapter.sendTurn(cancelSession.sessionId, { prompt: '[slow-cancel]' })) {
    cancelEvents.push(ev);
    if (ev.type === 'text_delta') {
      await adapter.cancel(cancelSession.sessionId);
    }
  }
  expect(cancelEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'cancelled' });
}
