import { PassThrough } from 'node:stream';
import type { NormalizedEvent, ProviderAdapter } from '@orchdeck/shared';
import { describe, expect, it } from 'vitest';
import type { ManagedProcess, ManagedProcessExit } from '../process/process-tree.js';
import { AntigravityAdapter } from './antigravity-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
import type { CliProcessLauncher, CliSpawnOptions, VersionProbeResult } from './cli-base.js';
import { CodexAdapter } from './codex-adapter.js';
import {
  AGY_JSONL_FIXTURE,
  AGY_PLAINTEXT_FIXTURE,
  CLAUDE_RATE_LIMIT_FIXTURE,
  CLAUDE_STREAM_FIXTURE,
  CODEX_JSONL_FIXTURE,
  CODEX_RATE_LIMIT_FIXTURE,
} from './fixtures/cli-fixtures.js';

interface RecordedInvocation {
  readonly binary: string;
  readonly args: readonly string[];
  readonly options: CliSpawnOptions;
  cancelled: boolean;
}

class FakeCliLauncher implements CliProcessLauncher {
  readonly invocations: RecordedInvocation[] = [];
  private readonly probeMap: Readonly<Record<string, VersionProbeResult>>;
  private readonly linesFactory: (binary: string, args: readonly string[]) => readonly string[];
  private readonly hangUntilCancel: boolean;

  constructor(options: {
    readonly probeMap: Readonly<Record<string, VersionProbeResult>>;
    readonly linesFactory: (binary: string, args: readonly string[]) => readonly string[];
    readonly hangUntilCancel?: boolean | undefined;
  }) {
    this.probeMap = options.probeMap;
    this.linesFactory = options.linesFactory;
    this.hangUntilCancel = options.hangUntilCancel ?? false;
  }

  async execVersion(binary: string): Promise<VersionProbeResult> {
    return this.probeMap[binary] ?? { installed: false };
  }

  spawnCli(binary: string, args: readonly string[], options: CliSpawnOptions): ManagedProcess {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const record: RecordedInvocation = { binary, args, options, cancelled: false };
    this.invocations.push(record);

    let resolveWait!: (exit: ManagedProcessExit) => void;
    const wait = new Promise<ManagedProcessExit>((resolve) => {
      resolveWait = resolve;
    });

    const lines = this.linesFactory(binary, args);

    if (this.hangUntilCancel) {
      queueMicrotask(() => {
        stdout.write(`${lines[0] ?? 'Working...'}\n`);
      });
    } else {
      queueMicrotask(() => {
        for (const line of lines) {
          stdout.write(`${line}\n`);
        }
        stdout.end();
        stderr.end();
        resolveWait({ code: 0, signal: null });
      });
    }

    return {
      pid: 99999,
      usesWin32JobObject: false,
      stdout,
      stderr,
      wait,
      cancel: async () => {
        record.cancelled = true;
        stdout.end();
        stderr.end();
        resolveWait({ code: null, signal: 'SIGTERM' });
      },
    };
  }
}

async function collectTurn(
  adapter: ProviderAdapter,
  sessionId: string,
  prompt: string,
): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  for await (const ev of adapter.sendTurn(sessionId, { prompt })) {
    events.push(ev);
  }
  return events;
}

describe('Real CLI Adapters (offline fixture contract tests)', () => {
  it('ClaudeAdapter probes version, respects read_only plan mode, streams NDJSON, and preserves Native Passthrough', async () => {
    const launcher = new FakeCliLauncher({
      probeMap: { claude: { installed: true, version: '2.1.14' } },
      linesFactory: () => CLAUDE_STREAM_FIXTURE,
    });
    const adapter = new ClaudeAdapter({ launcher, useGitShim: false });

    const health = await adapter.healthCheck();
    expect(health.installed).toBe(true);
    expect(health.authenticated).toBe(true);
    expect(health.version).toBe('2.1.14');

    const models = await adapter.listModels();
    expect(models.length).toBeGreaterThanOrEqual(2);

    const session = await adapter.startSession({
      cwd: process.cwd(),
      modelId: 'opus-4-6',
      role: 'planner',
      approvalMode: 'architect',
      resumeSessionId: 'prev-123',
    });

    const events = await collectTurn(adapter, session.sessionId, 'Plan changes');
    const args = launcher.invocations[0]?.args ?? [];
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--model');
    expect(args).toContain('opus-4-6');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('plan');
    expect(args).toContain('--resume');
    expect(args).toContain('prev-123');
    // Native Passthrough: must not strip user MCPs in v0.1
    expect(args).not.toContain('--strict-mcp-config');

    expect(events.some((e) => e.type === 'thinking_delta')).toBe(true);
    expect(events.some((e) => e.type === 'tool_use')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.some((e) => e.type === 'usage')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: 'completed' });
  });

  it('ClaudeAdapter detects rate-limit cooldowns and missing binaries', async () => {
    const missing = new ClaudeAdapter({
      launcher: new FakeCliLauncher({ probeMap: {}, linesFactory: () => [] }),
      useGitShim: false,
    });
    expect((await missing.healthCheck()).installed).toBe(false);

    const quotaAdapter = new ClaudeAdapter({
      launcher: new FakeCliLauncher({
        probeMap: { claude: { installed: true, version: '2.1.0' } },
        linesFactory: () => CLAUDE_RATE_LIMIT_FIXTURE,
      }),
      useGitShim: false,
    });
    const session = await quotaAdapter.startSession({
      cwd: process.cwd(),
      modelId: 'opus-4-6',
      role: 'builder',
      approvalMode: 'architect',
    });
    const events = await collectTurn(quotaAdapter, session.sessionId, 'Edit');
    const rl = events.find((e) => e.type === 'rate_limit');
    expect(rl?.type).toBe('rate_limit');
    if (rl?.type === 'rate_limit') {
      expect(rl.retryAfterSeconds).toBe(300);
      expect(rl.resetAt).toBe('2026-11-27T08:00:00.000Z');
    }
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: 'rate_limited' });
  });

  it('CodexAdapter passes reasoning effort, read-only sandbox, parses JSONL, and detects quota failures', async () => {
    const launcher = new FakeCliLauncher({
      probeMap: { codex: { installed: true, version: '0.42.0' } },
      linesFactory: (_bin, args) =>
        args.at(-1)?.includes('quota') ? CODEX_RATE_LIMIT_FIXTURE : CODEX_JSONL_FIXTURE,
    });
    const adapter = new CodexAdapter({ launcher, useGitShim: false });

    const health = await adapter.healthCheck();
    expect(health.installed).toBe(true);
    expect(health.version).toBe('0.42.0');

    const reviewerSession = await adapter.startSession({
      cwd: process.cwd(),
      modelId: 'gpt-5-codex',
      reasoningEffort: 'high',
      role: 'reviewer',
      approvalMode: 'architect',
    });

    const events = await collectTurn(adapter, reviewerSession.sessionId, 'Review diff');
    const args = launcher.invocations[0]?.args ?? [];
    expect(args.slice(0, 2)).toEqual(['exec', '--json']);
    expect(args).toContain('model_reasoning_effort=high');
    expect(args).toContain('--sandbox');
    expect(args).toContain('read-only');

    expect(events.some((e) => e.type === 'thinking_delta')).toBe(true);
    expect(events.some((e) => e.type === 'tool_use')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    expect(events.some((e) => e.type === 'usage')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: 'completed' });

    const quotaEvents = await collectTurn(adapter, reviewerSession.sessionId, 'Trigger quota');
    expect(quotaEvents.some((e) => e.type === 'rate_limit')).toBe(true);
    expect(quotaEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'rate_limited' });
  });

  it('AntigravityAdapter probes capabilities, falls back to plain text gracefully, and cancels subprocesses', async () => {
    const jsonLauncher = new FakeCliLauncher({
      probeMap: {
        agy: {
          installed: true,
          version: '0.9.1',
          helpText: 'Usage: agy [--model <id>] [--output-format stream-json] [--read-only] <prompt>',
        },
      },
      linesFactory: () => AGY_JSONL_FIXTURE,
    });
    const jsonAdapter = new AntigravityAdapter({ launcher: jsonLauncher, useGitShim: false });
    const health = await jsonAdapter.healthCheck();
    expect(health.capabilities.streamJson).toBe(true);
    expect(health.capabilities.readOnlyFlag).toBe(true);

    const s1 = await jsonAdapter.startSession({
      cwd: process.cwd(),
      modelId: 'gemini-4-neon',
      role: 'planner',
      approvalMode: 'architect',
    });
    const jsonEvents = await collectTurn(jsonAdapter, s1.sessionId, 'Analyze');
    expect(jsonLauncher.invocations[0]?.args).toContain('--read-only');
    expect(jsonEvents.some((e) => e.type === 'tool_use')).toBe(true);
    expect(jsonEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'completed' });

    // Graceful fallback when optional CLI flags are unavailable and output is plain text
    const plainLauncher = new FakeCliLauncher({
      probeMap: {
        agy: { installed: true, version: '0.2.0', helpText: 'Usage: agy <prompt>' },
      },
      linesFactory: () => AGY_PLAINTEXT_FIXTURE,
    });
    const plainAdapter = new AntigravityAdapter({ launcher: plainLauncher, useGitShim: false });
    const fallbackHealth = await plainAdapter.healthCheck();
    expect(fallbackHealth.capabilities.streamJson).toBe(false);
    expect(fallbackHealth.capabilities.modelSelectionFlag).toBe(false);

    const s2 = await plainAdapter.startSession({
      cwd: process.cwd(),
      modelId: 'gemini-4-neon',
      role: 'builder',
      approvalMode: 'express',
    });
    const plainEvents = await collectTurn(plainAdapter, s2.sessionId, 'Hello');
    expect(plainLauncher.invocations[0]?.args).toEqual(['Hello']);
    expect(plainEvents.some((e) => e.type === 'text_delta')).toBe(true);
    expect(plainEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'completed' });

    // Cancellation terminates active managed process
    const cancelLauncher = new FakeCliLauncher({
      probeMap: { agy: { installed: true, version: '0.9.1' } },
      linesFactory: () => ['Starting...'],
      hangUntilCancel: true,
    });
    const cancelAdapter = new AntigravityAdapter({ launcher: cancelLauncher, useGitShim: false });
    const s3 = await cancelAdapter.startSession({
      cwd: process.cwd(),
      modelId: 'gemini-4-neon',
      role: 'builder',
      approvalMode: 'architect',
    });

    const cancelEvents: NormalizedEvent[] = [];
    for await (const ev of cancelAdapter.sendTurn(s3.sessionId, { prompt: 'Wait' })) {
      cancelEvents.push(ev);
      if (ev.type === 'text_delta') {
        await cancelAdapter.cancel(s3.sessionId);
      }
    }
    expect(cancelLauncher.invocations[0]?.cancelled).toBe(true);
    expect(cancelEvents.at(-1)).toMatchObject({ type: 'done', outcome: 'cancelled' });
  });
});
