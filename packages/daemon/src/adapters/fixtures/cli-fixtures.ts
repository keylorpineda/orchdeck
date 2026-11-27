export const CLAUDE_STREAM_FIXTURE: readonly string[] = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-sess-1' }),
  JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'thinking', thinking: 'Checking repository files before editing.' },
        {
          type: 'tool_use',
          id: 'toolu_01',
          name: 'Edit',
          input: { file_path: 'src/index.ts' },
        },
      ],
    },
  }),
  JSON.stringify({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'Updated src/index.ts' }],
    },
  }),
  JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: 'Updated src/index.ts cleanly.' },
  }),
  JSON.stringify({
    type: 'result',
    is_error: false,
    duration_ms: 420,
    usage: {
      input_tokens: 350,
      output_tokens: 120,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 15,
    },
  }),
];

export const CLAUDE_RATE_LIMIT_FIXTURE: readonly string[] = [
  JSON.stringify({
    type: 'result',
    is_error: true,
    result: 'Rate limit exceeded. Retry after 300s (resets 2026-11-27T08:00:00.000Z).',
  }),
];

export const CODEX_JSONL_FIXTURE: readonly string[] = [
  JSON.stringify({ type: 'thread.started', thread_id: 'codex-thread-1' }),
  JSON.stringify({ type: 'turn.started' }),
  JSON.stringify({
    type: 'item.completed',
    item: { id: 'r1', type: 'reasoning', text: 'Inspecting package exports.' },
  }),
  JSON.stringify({
    type: 'item.started',
    item: { id: 'cmd1', type: 'command_execution', command: 'pnpm test' },
  }),
  JSON.stringify({
    type: 'item.completed',
    item: {
      id: 'cmd1',
      type: 'command_execution',
      command: 'pnpm test',
      exit_code: 0,
      aggregated_output: 'All tests passed',
    },
  }),
  JSON.stringify({
    type: 'item.completed',
    item: { id: 'msg1', type: 'agent_message', text: 'Verified test suite in workspace.' },
  }),
  JSON.stringify({
    type: 'turn.completed',
    duration_ms: 310,
    usage: { input_tokens: 280, output_tokens: 90, cached_input_tokens: 40 },
  }),
];

export const CODEX_RATE_LIMIT_FIXTURE: readonly string[] = [
  JSON.stringify({ type: 'thread.started', thread_id: 'codex-thread-2' }),
  JSON.stringify({
    type: 'turn.failed',
    error: { message: '429 Too Many Requests: quota exceeded until 2026-11-27T09:00:00.000Z' },
  }),
];

export const AGY_JSONL_FIXTURE: readonly string[] = [
  JSON.stringify({ type: 'thinking_delta', text: 'Reviewing module boundaries.' }),
  JSON.stringify({
    type: 'tool_use',
    id: 'agy-t1',
    name: 'read_file',
    summary: 'Read packages/shared/src/adapter.ts',
  }),
  JSON.stringify({
    type: 'tool_result',
    id: 'agy-t1',
    name: 'read_file',
    ok: true,
    output: 'Read 180 lines',
  }),
  JSON.stringify({ type: 'text_delta', text: 'Completed architecture review.' }),
  JSON.stringify({
    type: 'usage',
    input_tokens: 510,
    output_tokens: 140,
    cache_read_tokens: 100,
    duration_ms: 260,
  }),
  JSON.stringify({ type: 'done' }),
];

export const AGY_PLAINTEXT_FIXTURE: readonly string[] = [
  'Analyzing repository structure...',
  'Plain-text Antigravity response completed.',
];
