import type { ModelDescriptor, NormalizedEvent, ProviderId } from '@orchdeck/shared';

export type MockScenarioName = 'streaming' | 'tool-diff' | 'rate-limit' | 'slow-cancel';

export function getDefaultMockModels(provider: ProviderId): readonly ModelDescriptor[] {
  switch (provider) {
    case 'claude':
      return [
        {
          id: 'opus-4-6',
          provider: 'claude',
          displayName: 'Claude Opus 4.6',
          supportsReasoningEffort: true,
          defaultReasoningEffort: 'high',
        },
        {
          id: 'sonnet-4-6',
          provider: 'claude',
          displayName: 'Claude Sonnet 4.6',
          supportsReasoningEffort: true,
          defaultReasoningEffort: 'medium',
        },
      ];
    case 'codex':
      return [
        {
          id: 'gpt-5-codex',
          provider: 'codex',
          displayName: 'GPT-5 Codex',
          supportsReasoningEffort: true,
          defaultReasoningEffort: 'high',
        },
      ];
    case 'antigravity':
      return [
        {
          id: 'gemini-4-neon',
          provider: 'antigravity',
          displayName: 'Gemini 4 Neon',
          supportsReasoningEffort: true,
          defaultReasoningEffort: 'high',
        },
      ];
  }
}

export function selectScenarioFromPrompt(prompt: string): MockScenarioName {
  if (prompt.includes('[rate-limit]')) {
    return 'rate-limit';
  }
  if (prompt.includes('[tool-diff]')) {
    return 'tool-diff';
  }
  if (prompt.includes('[slow-cancel]')) {
    return 'slow-cancel';
  }
  return 'streaming';
}

export function buildMockScenarioEvents(
  provider: ProviderId,
  scenario: MockScenarioName,
): readonly NormalizedEvent[] {
  const syntheticSecret = 'sk-ant-' + 'api03-abcdefghijklmnop1234567890'; // orchdeck-secret-ignore

  switch (scenario) {
    case 'tool-diff':
      return [
        { type: 'status', phase: 'starting', detail: `${provider} tool-diff fixture` },
        { type: 'status', phase: 'running' },
        {
          type: 'tool_use',
          toolCallId: 'call-1',
          toolName: 'edit_file',
          summary: 'Update src/example.ts with typed handler',
        },
        {
          type: 'tool_result',
          toolCallId: 'call-1',
          toolName: 'edit_file',
          ok: true,
          outputSummary: `Edited src/example.ts (sanitized check: ${syntheticSecret})`,
        },
        { type: 'text_delta', text: 'Applied requested edit and verified diff.' },
        {
          type: 'usage',
          inputTokens: 420,
          outputTokens: 180,
          cacheReadTokens: 120,
          cacheWriteTokens: 0,
          durationMs: 240,
        },
        { type: 'done', outcome: 'completed', changedFiles: ['src/example.ts'] },
      ];

    case 'rate-limit':
      return [
        { type: 'status', phase: 'starting', detail: `${provider} rate-limit fixture` },
        { type: 'text_delta', text: 'Starting request before hitting window limit.' },
        {
          type: 'rate_limit',
          message: `Provider ${provider} quota limit reached.`,
          resetAt: '2026-11-27T06:00:00.000Z',
          retryAfterSeconds: 900,
        },
        { type: 'done', outcome: 'rate_limited' },
      ];

    case 'slow-cancel':
      return [
        { type: 'status', phase: 'starting', detail: `${provider} slow-cancel fixture` },
        { type: 'status', phase: 'running' },
        { type: 'text_delta', text: 'Chunk 1 ' },
        { type: 'text_delta', text: 'Chunk 2 ' },
        { type: 'text_delta', text: 'Chunk 3 ' },
        { type: 'text_delta', text: 'Chunk 4 ' },
        { type: 'text_delta', text: 'Chunk 5 ' },
        {
          type: 'usage',
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          durationMs: 500,
        },
        { type: 'done', outcome: 'completed' },
      ];

    case 'streaming':
      return [
        { type: 'status', phase: 'starting', detail: `${provider} streaming fixture` },
        { type: 'thinking_delta', text: 'Inspecting workspace context and constraints.' },
        { type: 'status', phase: 'running' },
        { type: 'text_delta', text: 'Hello from ' },
        { type: 'text_delta', text: `${provider} MockAdapter.` },
        {
          type: 'usage',
          inputTokens: 210,
          outputTokens: 95,
          cacheReadTokens: 64,
          cacheWriteTokens: 0,
          durationMs: 120,
        },
        { type: 'done', outcome: 'completed' },
      ];
  }
}
