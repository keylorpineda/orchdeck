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
  ReasoningEffort,
  SessionOptions,
  TurnInput,
} from '@orchdeck/shared';
import type { ManagedProcess } from '../process/process-tree.js';
import { createGitShim, type GitShimHandle } from '../security/git-shim.js';
import {
  DefaultCliProcessLauncher,
  asRecord,
  detectRateLimitMessage,
  readLines,
  type CliProcessLauncher,
} from './cli-base.js';

export const CODEX_CAPABILITIES: ProviderCapabilities = {
  streamJson: true,
  strictMcpConfig: false,
  modelSelectionFlag: true,
  readOnlyFlag: true,
  supportsResume: true,
};

export const CODEX_MODELS: readonly ModelDescriptor[] = [
  {
    id: 'gpt-5-codex',
    provider: 'codex',
    displayName: 'GPT-5 Codex',
    supportsReasoningEffort: true,
    defaultReasoningEffort: 'high',
  },
  {
    id: 'o3',
    provider: 'codex',
    displayName: 'OpenAI o3',
    supportsReasoningEffort: true,
    defaultReasoningEffort: 'high',
  },
  {
    id: 'gpt-5',
    provider: 'codex',
    displayName: 'GPT-5',
    supportsReasoningEffort: true,
    defaultReasoningEffort: 'medium',
  },
];

interface CodexSessionState {
  readonly session: AdapterSession;
  readonly options: SessionOptions;
}

export interface CodexAdapterOptions {
  readonly binary?: string | undefined;
  readonly launcher?: CliProcessLauncher | undefined;
  readonly useGitShim?: boolean | undefined;
}

export function buildCodexArgs(
  session: AdapterSession,
  input: TurnInput,
  reasoningEffort?: ReasoningEffort,
  resumeSessionId?: string,
): readonly string[] {
  const args: string[] = ['exec', '--json', '--model', session.modelId];

  if (reasoningEffort) {
    args.push('-c', `model_reasoning_effort=${reasoningEffort}`);
  }

  if (session.role === 'planner' || session.role === 'reviewer') {
    args.push('--sandbox', 'read-only');
  }

  if (resumeSessionId && resumeSessionId.trim().length > 0) {
    args.push('--resume', resumeSessionId.trim());
  }

  args.push(input.prompt);
  return args;
}

export function parseCodexJsonlLine(rawLine: string): readonly NormalizedEvent[] {
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
  if (type === 'thread.started' || type === 'turn.started') {
    return [{ type: 'status', phase: 'running', detail: `codex:${type}` }];
  }

  if (type === 'item.started' || type === 'item.completed') {
    const item = asRecord(obj['item']);
    if (!item) {
      return [];
    }
    const itemType = item['type'];
    const itemId = typeof item['id'] === 'string' ? item['id'] : crypto.randomUUID();

    if (itemType === 'agent_message' && typeof item['text'] === 'string') {
      return [{ type: 'text_delta', text: item['text'] }];
    }
    if (itemType === 'reasoning' && typeof item['text'] === 'string') {
      return [{ type: 'thinking_delta', text: item['text'] }];
    }
    if (itemType === 'command_execution') {
      const command = typeof item['command'] === 'string' ? item['command'] : 'command';
      if (type === 'item.started') {
        return [{ type: 'tool_use', toolCallId: itemId, toolName: 'command_execution', summary: command }];
      }
      const exitCode = typeof item['exit_code'] === 'number' ? item['exit_code'] : 0;
      const output = typeof item['aggregated_output'] === 'string' ? item['aggregated_output'] : '';
      return [
        {
          type: 'tool_result',
          toolCallId: itemId,
          toolName: 'command_execution',
          ok: exitCode === 0,
          outputSummary: output || `exit ${String(exitCode)}`,
        },
      ];
    }
    if (itemType === 'file_change' && type === 'item.completed') {
      const changes = Array.isArray(item['changes']) ? item['changes'] : [];
      const summary = changes
        .map((c) => {
          const rec = asRecord(c);
          return typeof rec?.['path'] === 'string' ? rec['path'] : '';
        })
        .filter((p) => p.length > 0)
        .join(', ');
      return [
        {
          type: 'tool_result',
          toolCallId: itemId,
          toolName: 'file_change',
          ok: true,
          outputSummary: summary || 'file_change',
        },
      ];
    }
    return [];
  }

  if (type === 'turn.completed') {
    const events: NormalizedEvent[] = [];
    const usage = asRecord(obj['usage']);
    if (usage) {
      events.push({
        type: 'usage',
        inputTokens: Number(usage['input_tokens'] ?? 0),
        outputTokens: Number(usage['output_tokens'] ?? 0),
        cacheReadTokens: Number(usage['cached_input_tokens'] ?? 0),
        cacheWriteTokens: 0,
        durationMs: Number(obj['duration_ms'] ?? 0),
      });
    }
    events.push({ type: 'done', outcome: 'completed' });
    return events;
  }

  if (type === 'turn.failed' || type === 'error') {
    const errObj = asRecord(obj['error']);
    const msg =
      (typeof errObj?.['message'] === 'string' ? errObj['message'] : undefined) ??
      (typeof obj['message'] === 'string' ? obj['message'] : 'Codex turn failed.');
    const rateLimit = detectRateLimitMessage(msg);
    if (rateLimit) {
      return [
        { type: 'rate_limit', ...rateLimit },
        { type: 'done', outcome: 'rate_limited' },
      ];
    }
    return [
      { type: 'error', code: 'CODEX_TURN_FAILED', message: msg, recoverable: false },
      { type: 'done', outcome: 'error' },
    ];
  }

  return [];
}

export class CodexAdapter implements ProviderAdapter {
  readonly id = 'codex' as const;
  readonly pinnedCliVersionRange = '>=0.1.0 <2.0.0';
  private readonly binary: string;
  private readonly launcher: CliProcessLauncher;
  private readonly useGitShim: boolean;
  private readonly sessions = new Map<string, CodexSessionState>();
  private readonly activeProcesses = new Map<string, ManagedProcess>();
  private readonly cancelledSessions = new Set<string>();

  constructor(options: CodexAdapterOptions = {}) {
    this.binary = options.binary ?? 'codex';
    this.launcher = options.launcher ?? new DefaultCliProcessLauncher();
    this.useGitShim = options.useGitShim ?? true;
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    const probe = await this.launcher.execVersion(this.binary);
    return {
      installed: probe.installed,
      version: probe.version,
      authenticated: probe.installed,
      capabilities: CODEX_CAPABILITIES,
    };
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return [...CODEX_MODELS];
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
      throw new Error(`Unknown CodexAdapter session "${sessionId}".`);
    }

    this.cancelledSessions.delete(sessionId);
    const args = buildCodexArgs(
      state.session,
      input,
      state.options.reasoningEffort,
      state.options.resumeSessionId,
    );

    let shimDirRoot: string | null = null;
    let gitShim: GitShimHandle | undefined;
    if (this.useGitShim) {
      shimDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-codex-shim-'));
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
        for (const event of parseCodexJsonlLine(line)) {
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
            code: 'CODEX_EXIT_NONZERO',
            message: stderrText.trim() || `codex exited with code ${String(exit.code)}.`,
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
