import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AdapterSession,
  ModelDescriptor,
  NormalizedEvent,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderHealthCheck,
  SessionOptions,
  TurnInput,
} from '@orchdeck/shared';
import type { ManagedProcess } from '../process/process-tree.js';
import { createGitShim, type GitShimHandle } from '../security/git-shim.js';
import {
  DefaultCliProcessLauncher,
  asRecord,
  detectRateLimitMessage,
  isMinimumMajorVersion,
  readLines,
  type CliProcessLauncher,
} from './cli-base.js';

export const CLAUDE_CAPABILITIES: ProviderCapabilities = {
  streamJson: true,
  strictMcpConfig: true,
  modelSelectionFlag: true,
  readOnlyFlag: true,
  supportsResume: true,
};

export const CLAUDE_MODELS: readonly ModelDescriptor[] = [
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
  {
    id: 'haiku-4-5',
    provider: 'claude',
    displayName: 'Claude Haiku 4.5',
    supportsReasoningEffort: false,
  },
];

interface ClaudeSessionState {
  readonly session: AdapterSession;
  readonly options: SessionOptions;
}

export interface ClaudeAdapterOptions {
  readonly binary?: string | undefined;
  readonly launcher?: CliProcessLauncher | undefined;
  readonly useGitShim?: boolean | undefined;
}

export function buildClaudeArgs(
  session: AdapterSession,
  input: TurnInput,
  resumeSessionId?: string,
): readonly string[] {
  const args: string[] = [
    '-p',
    input.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    session.modelId,
  ];

  if (session.role === 'planner' || session.role === 'reviewer') {
    args.push('--permission-mode', 'plan');
  }

  if (resumeSessionId && resumeSessionId.trim().length > 0) {
    args.push('--resume', resumeSessionId.trim());
  }

  return args;
}

export function parseClaudeStreamLine(rawLine: string): readonly NormalizedEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawLine);
  } catch {
    const rateLimit = detectRateLimitMessage(rawLine);
    if (rateLimit) {
      return [{ type: 'rate_limit', ...rateLimit }];
    }
    return [{ type: 'text_delta', text: rawLine }];
  }

  const obj = asRecord(parsed);
  if (!obj) {
    return [];
  }

  const type = obj['type'];
  if (type === 'system') {
    const subtype = typeof obj['subtype'] === 'string' ? obj['subtype'] : 'init';
    return [{ type: 'status', phase: 'running', detail: `claude:${subtype}` }];
  }

  if (type === 'content_block_delta') {
    const delta = asRecord(obj['delta']);
    if (!delta) {
      return [];
    }
    if (delta['type'] === 'text_delta' && typeof delta['text'] === 'string') {
      return [{ type: 'text_delta', text: delta['text'] }];
    }
    if (delta['type'] === 'thinking_delta' && typeof delta['thinking'] === 'string') {
      return [{ type: 'thinking_delta', text: delta['thinking'] }];
    }
    return [];
  }

  if (type === 'assistant') {
    const message = asRecord(obj['message']);
    const content = message?.['content'];
    if (!Array.isArray(content)) {
      return [];
    }
    const events: NormalizedEvent[] = [];
    for (const blockRaw of content) {
      const block = asRecord(blockRaw);
      if (!block) {
        continue;
      }
      if (block['type'] === 'text' && typeof block['text'] === 'string') {
        events.push({ type: 'text_delta', text: block['text'] });
      } else if (block['type'] === 'thinking' && typeof block['thinking'] === 'string') {
        events.push({ type: 'thinking_delta', text: block['thinking'] });
      } else if (block['type'] === 'tool_use') {
        const toolCallId = typeof block['id'] === 'string' ? block['id'] : crypto.randomUUID();
        const toolName = typeof block['name'] === 'string' ? block['name'] : 'tool';
        const inputObj = asRecord(block['input']);
        const summary = inputObj ? JSON.stringify(inputObj) : toolName;
        events.push({ type: 'tool_use', toolCallId, toolName, summary });
      }
    }
    return events;
  }

  if (type === 'user') {
    const message = asRecord(obj['message']);
    const content = message?.['content'];
    if (!Array.isArray(content)) {
      return [];
    }
    const events: NormalizedEvent[] = [];
    for (const blockRaw of content) {
      const block = asRecord(blockRaw);
      if (!block || block['type'] !== 'tool_result') {
        continue;
      }
      const toolCallId =
        typeof block['tool_use_id'] === 'string' ? block['tool_use_id'] : 'unknown';
      const isError = block['is_error'] === true;
      const outputSummary =
        typeof block['content'] === 'string'
          ? block['content']
          : JSON.stringify(block['content'] ?? '');
      events.push({
        type: 'tool_result',
        toolCallId,
        toolName: 'tool',
        ok: !isError,
        outputSummary,
      });
    }
    return events;
  }

  if (type === 'result') {
    const events: NormalizedEvent[] = [];
    const usage = asRecord(obj['usage']);
    if (usage) {
      events.push({
        type: 'usage',
        inputTokens: Number(usage['input_tokens'] ?? 0),
        outputTokens: Number(usage['output_tokens'] ?? 0),
        cacheReadTokens: Number(usage['cache_read_input_tokens'] ?? 0),
        cacheWriteTokens: Number(usage['cache_creation_input_tokens'] ?? 0),
        durationMs: Number(obj['duration_ms'] ?? 0),
      });
    }

    const isError = obj['is_error'] === true;
    const resultText = typeof obj['result'] === 'string' ? obj['result'] : '';
    const rateLimit = detectRateLimitMessage(resultText);
    if (rateLimit) {
      events.push({ type: 'rate_limit', ...rateLimit });
      events.push({ type: 'done', outcome: 'rate_limited' });
      return events;
    }

    if (isError) {
      events.push({
        type: 'error',
        code: 'CLAUDE_RESULT_ERROR',
        message: resultText || 'Claude turn returned an error result.',
        recoverable: true,
      });
      events.push({ type: 'done', outcome: 'error' });
      return events;
    }

    events.push({ type: 'done', outcome: 'completed' });
    return events;
  }

  if (type === 'error') {
    const errObj = asRecord(obj['error']);
    const msg =
      (typeof errObj?.['message'] === 'string' ? errObj['message'] : undefined) ??
      (typeof obj['message'] === 'string' ? obj['message'] : 'Claude CLI stream error.');
    const rateLimit = detectRateLimitMessage(msg);
    if (rateLimit) {
      return [
        { type: 'rate_limit', ...rateLimit },
        { type: 'done', outcome: 'rate_limited' },
      ];
    }
    return [
      {
        type: 'error',
        code: 'CLAUDE_STREAM_ERROR',
        message: msg,
        recoverable: false,
      },
    ];
  }

  return [];
}

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = 'claude' as const;
  readonly pinnedCliVersionRange = '>=1.0.0 <3.0.0';
  private readonly binary: string;
  private readonly launcher: CliProcessLauncher;
  private readonly useGitShim: boolean;
  private readonly sessions = new Map<string, ClaudeSessionState>();
  private readonly activeProcesses = new Map<string, ManagedProcess>();
  private readonly cancelledSessions = new Set<string>();

  constructor(options: ClaudeAdapterOptions = {}) {
    this.binary = options.binary ?? 'claude';
    this.launcher = options.launcher ?? new DefaultCliProcessLauncher();
    this.useGitShim = options.useGitShim ?? true;
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    const probe = await this.launcher.execVersion(this.binary);
    return {
      installed: probe.installed,
      version: probe.version,
      authenticated: probe.installed && isMinimumMajorVersion(probe.version, 1),
      capabilities: CLAUDE_CAPABILITIES,
    };
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return [...CLAUDE_MODELS];
  }

  async startSession(opts: SessionOptions): Promise<AdapterSession> {
    const sessionId = crypto.randomUUID();
    const session: AdapterSession = {
      sessionId,
      provider: this.id,
      modelId: opts.modelId,
      cwd: opts.cwd,
      role: opts.role,
    };
    this.sessions.set(sessionId, { session, options: opts });
    return session;
  }

  async *sendTurn(sessionId: string, input: TurnInput): AsyncIterable<NormalizedEvent> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Unknown ClaudeAdapter session "${sessionId}".`);
    }

    this.cancelledSessions.delete(sessionId);
    const args = buildClaudeArgs(state.session, input, state.options.resumeSessionId);

    let shimDirRoot: string | null = null;
    let gitShim: GitShimHandle | undefined;
    if (this.useGitShim) {
      shimDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-claude-shim-'));
      gitShim = createGitShim({ runtimeDir: shimDirRoot });
    }

    yield { type: 'status', phase: 'starting', detail: `Spawning ${this.binary}` };

    const managed = this.launcher.spawnCli(this.binary, args, {
      cwd: state.session.cwd,
      envOverrides: state.options.envOverrides,
      gitShim,
    });
    this.activeProcesses.set(sessionId, managed);

    let stderrText = '';
    managed.stderr.setEncoding('utf8');
    managed.stderr.on('data', (chunk: string) => {
      stderrText += chunk;
    });

    let emittedDone = false;
    let sawRateLimit = false;

    try {
      for await (const line of readLines(managed.stdout)) {
        for (const event of parseClaudeStreamLine(line)) {
          if (event.type === 'rate_limit') {
            sawRateLimit = true;
          }
          if (event.type === 'done') {
            emittedDone = true;
          }
          yield event;
        }
      }

      const exit = await managed.wait;

      if (this.cancelledSessions.has(sessionId)) {
        if (!emittedDone) {
          yield { type: 'status', phase: 'cancelled', detail: 'Turn cancelled.' };
          yield { type: 'done', outcome: 'cancelled' };
        }
        return;
      }

      const stderrRateLimit = detectRateLimitMessage(stderrText);
      if (stderrRateLimit && !sawRateLimit) {
        sawRateLimit = true;
        yield { type: 'rate_limit', ...stderrRateLimit };
      }

      if (!emittedDone) {
        if (sawRateLimit) {
          yield { type: 'done', outcome: 'rate_limited' };
        } else if (exit.code !== 0) {
          yield {
            type: 'error',
            code: 'CLAUDE_EXIT_NONZERO',
            message: stderrText.trim() || `claude exited with code ${String(exit.code)}.`,
            recoverable: false,
          };
          yield { type: 'done', outcome: 'error' };
        } else {
          yield { type: 'done', outcome: 'completed' };
        }
      }
    } finally {
      this.activeProcesses.delete(sessionId);
      this.cancelledSessions.delete(sessionId);
      gitShim?.dispose();
      if (shimDirRoot && fs.existsSync(shimDirRoot)) {
        fs.rmSync(shimDirRoot, { recursive: true, force: true });
      }
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.cancelledSessions.add(sessionId);
    const managed = this.activeProcesses.get(sessionId);
    if (managed) {
      await managed.cancel();
    }
  }
}
