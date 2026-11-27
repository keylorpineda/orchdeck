import { describe, expect, it } from 'vitest';
import {
  formatModelHandle,
  isProviderId,
  parseModelHandle,
} from './adapter.js';
import { JSONRPC_VERSION, isJsonRpcNotification } from './rpc.js';

describe('Canonical model handle parser and notifications', () => {
  it('parses and formats model handles with and without reasoning effort', () => {
    const basic = parseModelHandle('antigravity:gemini-4-neon');
    expect(basic).toEqual({
      provider: 'antigravity',
      modelId: 'gemini-4-neon',
    });
    expect(formatModelHandle(basic)).toBe('antigravity:gemini-4-neon');

    const withEffort = parseModelHandle('codex:gpt-5-codex:high');
    expect(withEffort).toEqual({
      provider: 'codex',
      modelId: 'gpt-5-codex',
      reasoningEffort: 'high',
    });
    expect(formatModelHandle(withEffort)).toBe('codex:gpt-5-codex:high');
  });

  it('rejects malformed model handles and unknown providers', () => {
    expect(isProviderId('claude')).toBe(true);
    expect(isProviderId('unknown')).toBe(false);
    expect(() => parseModelHandle('claude')).toThrow();
    expect(() => parseModelHandle('openai:gpt-5')).toThrow();
    expect(() => parseModelHandle('claude:')).toThrow();
    expect(() => parseModelHandle('claude:opus-4-6:extreme')).toThrow();
  });

  it('validates JSON-RPC 2.0 notifications', () => {
    expect(
      isJsonRpcNotification({
        jsonrpc: JSONRPC_VERSION,
        method: 'turn.event',
        params: {
          turnId: 't1',
          sessionId: 's1',
          provider: 'claude',
          event: { type: 'text_delta', text: 'hello' },
        },
      }),
    ).toBe(true);

    expect(
      isJsonRpcNotification({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'turn.event',
        params: {},
      }),
    ).toBe(false);
  });
});
