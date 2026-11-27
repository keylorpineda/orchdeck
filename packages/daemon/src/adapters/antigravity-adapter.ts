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
  readLines,
  type CliProcessLauncher,
} from './cli-base.js';

export const DEFAULT_AGY_CAPABILITIES: ProviderCapabilities = {
  streamJson: true,
  strictMcpConfig: false,
  modelSelectionFlag: true,
  readOnlyFlag: true,
  supportsResume: false,
};

export const AGY_MODELS: readonly ModelDescriptor[] = [
  {
    id: 'gemini-4-neon',
    provider: 'antigravity',
    displayName: 'Gemini 4 Neon',
    supportsReasoningEffort: true,
    defaultReasoningEffort: 'high',
  },
  {
    id: 'gemini-3-pro',
    provider: 'antigravity',
    displayName: 'Gemini 3 Pro',
    supportsReasoningEffort: false,
  },
];

interface AgySessionState {
  readonly session: AdapterSession;
  readonly options: SessionOptions;
}

export interface AntigravityAdapterOptions {
  readonly binary?: string | undefined;
  readonly launcher?: CliProcessLauncher | undefined;
  readonly capabilities?: ProviderCapabilities | undefined;
  readonly useGitShim?: boolean | undefined;
}

export function detectAgyCapabilitiesFromHelp(helpText: string | undefined): ProviderCapabilities {
  if (!helpText || helpText.trim().length === 0) {
    return DEFAULT_AGY_CAPABILITIES;
  }
  return {
    streamJson: helpText.includes('--output-format') || helpText.includes('stream-json'),
    strictMcpConfig: helpText.includes('--strict-mcp-config'),
    modelSelectionFlag: helpText.includes('--model'),
    readOnlyFlag: helpText.includes('--read-only') || helpText.includes('--sandbox'),
    supportsResume: helpText.includes('--resume'),
  };
}

export function buildAgyArgs(
  session: AdapterSession,
  input: TurnInput,
  capabilities: ProviderCapabilities,
  resumeSessionId?: string,
): readonly string[] {
  const args: string[] = [];

  if (capabilities.modelSelectionFlag) {
    args.push('--model', session.modelId);
  }
  if (capabilities.streamJson) {
    args.push('--output-format', 'stream-json');
  }
  if (capabilities.readOnlyFlag && (session.role === 'planner' || session.role === 'reviewer')) {
    args.push('--read-only');
  }
  if (capabilities.supportsResume && resumeSessionId && resumeSessionId.trim().length > 0) {
    args.push('--resume', resumeSessionId.trim());
  }

  args.push(input.prompt);
  return args;
}

export function parseAgyOutputLine(rawLine: string): readonly NormalizedEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawLine);
  } catch {
    const rateLimit = detectRateLimitMessage(rawLine);
    if (rateLimit) {
      return [{ type: 'rate_limit', ...rateLimit }];
    }
    return [{ type: 'text_delta', text: `${rawLine}\n` }];
  }

  const obj = asRecord(parsed);
  if (!obj) {
    return [];
  }

  const type = obj['type'];
  if (type === 'text_delta' && typeof obj['text'] === 'string') {
    return [{ type: 'text_delta', text: obj['text'] }];
  }
  if (type === 'thinking_delta' && typeof obj['text'] === 'string') {
    return [{ type: 'thinking_delta', text: obj['text'] }];
  }
  if (type === 'tool_use') {
    return [
      {
        type: 'tool_use',
        toolCallId: typeof obj['id'] === 'string' ? obj['id'] : crypto.randomUUID(),
        toolName: typeof obj['name'] === 'string' ? obj['name'] : 'tool',
        summary: typeof obj['summary'] === 'string' ? obj['summary'] : 'tool call',
      },
    ];
  }
  if (type === 'tool_result') {
    return [
      {
        type: 'tool_result',
        toolCallId: typeof obj['id'] === 'string' ? obj['id'] : 'unknown',
        toolName: typeof obj['name'] === 'string' ? obj['name'] : 'tool',
        ok: obj['ok'] !== false,
        outputSummary: typeof obj['output'] === 'string' ? obj['output'] : '',
      },
    ];
  }
  if (type === 'usage') {
    return [
      {
        type: 'usage',
        inputTokens: Number(obj['input_tokens'] ?? 0),
        outputTokens: Number(obj['output_tokens'] ?? 0),
        cacheReadTokens: Number(obj['cache_read_tokens'] ?? 0),
        cacheWriteTokens: 0,
        durationMs: Number(obj['duration_ms'] ?? 0),
      },
    ];
  }
  if (type === 'error') {
    const msg = typeof obj['message'] === 'string' ? obj['message'] : 'Antigravity CLI error.';
    const rateLimit = detectRateLimitMessage(msg);
    if (rateLimit) {
      return [
        { type: 'rate_limit', ...rateLimit },
        { type: 'done', outcome: 'rate_limited' },
      ];
    }
    return [
      { type: 'error', code: 'AGY_STREAM_ERROR', message: msg, recoverable: false },
      { type: 'done', outcome: 'error' },
    ];
  }
  if (type === 'done') {
    return [{ type: 'done', outcome: 'completed' }];
  }

  return [];
}

export class AntigravityAdapter implements ProviderAdapter {
  readonly id = 'antigravity' as const;
  readonly pinnedCliVersionRange = '>=0.1.0 <2.0.0';
  private readonly binary: string;
  private readonly launcher: CliProcessLauncher;
  private readonly explicitCapabilities: ProviderCapabilities | undefined;
  private readonly useGitShim: boolean;
  private resolvedCapabilities: ProviderCapabilities = DEFAULT_AGY_CAPABILITIES;
  private readonly sessions = new Map<string, AgySessionState>();
  private readonly activeProcesses = new Map<string, ManagedProcess>();
  private readonly cancelledSessions = new Set<string>();

  constructor(options: AntigravityAdapterOptions = {}) {
    this.binary = options.binary ?? 'agy';
    this.launcher = options.launcher ?? new DefaultCliProcessLauncher();
    this.explicitCapabilities = options.capabilities;
    if (options.capabilities) {
      this.resolvedCapabilities = options.capabilities;
    }
    this.useGitShim = options.useGitShim ?? true;
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    const probe = await this.launcher.execVersion(this.binary);
    const capabilities =
      this.explicitCapabilities ?? detectAgyCapabilitiesFromHelp(probe.helpText);
    this.resolvedCapabilities = capabilities;

    return {
      installed: probe.installed,
      version: probe.version,
      authenticated: probe.installed,
      capabilities,
    };
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return [...AGY_MODELS];
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
      throw new Error(`Unknown AntigravityAdapter session "${sessionId}".`);
    }

    this.cancelledSessions.delete(sessionId);
    const args = buildAgyArgs(
      state.session,
      input,
      this.resolvedCapabilities,
      state.options.resumeSessionId,
    );

    let shimDirRoot: string | null = null;
    let gitShim: GitShimHandle | undefined;
    if (this.useGitShim) {
      shimDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-agy-shim-'));
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
        for (const event of parseAgyOutputLine(line)) {
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
            code: 'AGY_EXIT_NONZERO',
            message: stderrText.trim() || `agy exited with code ${String(exit.code)}.`,
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
