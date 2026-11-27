import type { AdapterSummary } from '@orchdeck/shared';
import { describe, expect, it } from 'vitest';
import {
  applyTurnEventToDraft,
  buildModelCatalog,
  formatModelLabel,
  type StreamingTurnState,
} from './turn-stream.js';

describe('Turn stream reducer and model catalog', () => {
  it('accumulates text, thinking, paired tool calls, and changed files', () => {
    let state: StreamingTurnState = {
      turnId: 't1',
      provider: 'claude',
      modelId: 'opus-4-6',
      text: '',
      thinking: '',
      tools: [],
      changedFiles: [],
      rateLimitMessage: null,
    };

    state = applyTurnEventToDraft(state, { type: 'thinking_delta', text: 'Inspecting files.' });
    state = applyTurnEventToDraft(state, {
      type: 'tool_use',
      toolCallId: 'c1',
      toolName: 'edit_file',
      summary: 'Update src/index.ts',
    });
    state = applyTurnEventToDraft(state, {
      type: 'tool_result',
      toolCallId: 'c1',
      toolName: 'edit_file',
      ok: true,
      outputSummary: 'Updated 4 lines',
    });
    state = applyTurnEventToDraft(state, { type: 'text_delta', text: 'Done ' });
    state = applyTurnEventToDraft(state, { type: 'text_delta', text: 'cleanly.' });
    state = applyTurnEventToDraft(state, {
      type: 'done',
      outcome: 'completed',
      changedFiles: ['src/index.ts'],
    });

    expect(state.thinking).toBe('Inspecting files.');
    expect(state.text).toBe('Done cleanly.');
    expect(state.tools).toEqual([
      {
        id: 'c1',
        toolName: 'edit_file',
        summary: 'Update src/index.ts',
        ok: true,
        outputSummary: 'Updated 4 lines',
      },
    ]);
    expect(state.changedFiles).toEqual(['src/index.ts']);
  });

  it('builds a unified model catalog from adapter summaries and formats labels', () => {
    const adapters: AdapterSummary[] = [
      {
        id: 'claude',
        pinnedCliVersionRange: '^2.0.0',
        health: {
          installed: true,
          authenticated: true,
          capabilities: {
            streamJson: true,
            strictMcpConfig: true,
            modelSelectionFlag: true,
            readOnlyFlag: true,
            supportsResume: true,
          },
        },
        models: [
          {
            id: 'opus-4-6',
            provider: 'claude',
            displayName: 'Claude Opus 4.6',
            supportsReasoningEffort: true,
            defaultReasoningEffort: 'high',
          },
        ],
      },
    ];

    const catalog = buildModelCatalog(adapters);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.handle).toBe('claude:opus-4-6:high');
    expect(formatModelLabel('claude:opus-4-6:high', catalog)).toBe('Claude Opus 4.6');
    expect(formatModelLabel('codex:gpt-5-codex:high', catalog)).toBe('gpt-5-codex');
  });
});
