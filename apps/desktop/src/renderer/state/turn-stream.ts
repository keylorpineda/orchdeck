import {
  formatModelHandle,
  parseModelHandle,
  type AdapterSummary,
  type NormalizedEvent,
  type ProviderId,
  type ReasoningEffort,
} from '@orchdeck/shared';

export interface ToolActivityEntry {
  readonly id: string;
  readonly toolName: string;
  readonly summary: string;
  readonly ok?: boolean | undefined;
  readonly outputSummary?: string | undefined;
}

export interface StreamingTurnState {
  readonly turnId: string;
  readonly provider: ProviderId;
  readonly modelId: string;
  readonly text: string;
  readonly thinking: string;
  readonly tools: readonly ToolActivityEntry[];
  readonly changedFiles: readonly string[];
  readonly rateLimitMessage: string | null;
}

export interface ModelOption {
  readonly handle: string;
  readonly provider: ProviderId;
  readonly modelId: string;
  readonly displayName: string;
  readonly reasoningEffort?: ReasoningEffort | undefined;
  readonly available: boolean;
}

export const FALLBACK_MODEL_OPTIONS: readonly ModelOption[] = [
  {
    handle: 'claude:opus-4-6:high',
    provider: 'claude',
    modelId: 'opus-4-6',
    displayName: 'Claude Opus 4.6',
    reasoningEffort: 'high',
    available: true,
  },
  {
    handle: 'claude:sonnet-4-6:medium',
    provider: 'claude',
    modelId: 'sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    reasoningEffort: 'medium',
    available: true,
  },
  {
    handle: 'codex:gpt-5-codex:high',
    provider: 'codex',
    modelId: 'gpt-5-codex',
    displayName: 'GPT-5 Codex',
    reasoningEffort: 'high',
    available: true,
  },
  {
    handle: 'codex:o3:high',
    provider: 'codex',
    modelId: 'o3',
    displayName: 'OpenAI o3',
    reasoningEffort: 'high',
    available: true,
  },
  {
    handle: 'antigravity:gemini-4-neon:high',
    provider: 'antigravity',
    modelId: 'gemini-4-neon',
    displayName: 'Gemini 4 Neon',
    reasoningEffort: 'high',
    available: true,
  },
];

export function applyTurnEventToDraft(
  state: StreamingTurnState,
  event: NormalizedEvent,
): StreamingTurnState {
  switch (event.type) {
    case 'text_delta':
      return { ...state, text: `${state.text}${event.text}` };

    case 'thinking_delta':
      return { ...state, thinking: `${state.thinking}${event.text}` };

    case 'tool_use':
      return {
        ...state,
        tools: [
          ...state.tools,
          {
            id: event.toolCallId,
            toolName: event.toolName,
            summary: event.summary,
          },
        ],
      };

    case 'tool_result': {
      const existingIndex = state.tools.findIndex((t) => t.id === event.toolCallId);
      if (existingIndex === -1) {
        return {
          ...state,
          tools: [
            ...state.tools,
            {
              id: event.toolCallId,
              toolName: event.toolName,
              summary: event.toolName,
              ok: event.ok,
              outputSummary: event.outputSummary,
            },
          ],
        };
      }
      const nextTools = state.tools.map((entry, idx) =>
        idx === existingIndex
          ? { ...entry, ok: event.ok, outputSummary: event.outputSummary }
          : entry,
      );
      return { ...state, tools: nextTools };
    }

    case 'rate_limit':
      return { ...state, rateLimitMessage: event.message };

    case 'error':
      return {
        ...state,
        text: state.text
          ? `${state.text}\n\n[Error: ${event.message}]`
          : `[Error: ${event.message}]`,
      };

    case 'done':
      return {
        ...state,
        changedFiles: event.changedFiles ?? state.changedFiles,
      };

    case 'status':
    case 'usage':
      return state;
  }
}

export function buildModelCatalog(adapters: readonly AdapterSummary[]): readonly ModelOption[] {
  if (adapters.length === 0) {
    return FALLBACK_MODEL_OPTIONS;
  }

  const options: ModelOption[] = [];
  for (const adapter of adapters) {
    const available = adapter.health.installed && adapter.health.authenticated;
    for (const model of adapter.models) {
      const handle = formatModelHandle({
        provider: adapter.id,
        modelId: model.id,
        reasoningEffort: model.defaultReasoningEffort,
      });
      options.push({
        handle,
        provider: adapter.id,
        modelId: model.id,
        displayName: model.displayName,
        reasoningEffort: model.defaultReasoningEffort,
        available,
      });
    }
  }

  return options.length > 0 ? options : FALLBACK_MODEL_OPTIONS;
}

export function formatModelLabel(
  handle: string,
  catalog: readonly ModelOption[] = FALLBACK_MODEL_OPTIONS,
): string {
  const match = catalog.find((item) => item.handle === handle);
  if (match) {
    return match.displayName;
  }
  try {
    return parseModelHandle(handle).modelId;
  } catch {
    return handle;
  }
}
