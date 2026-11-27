import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import type {
  AdapterSession,
  ModelDescriptor,
  NormalizedEvent,
  ProviderAdapter,
  ProviderHealthCheck,
  ProviderId,
  SecondOpinionRecord,
  SessionOptions,
  TaskRunRecord,
  TurnInput,
} from '@orchdeck/shared';
import { MockAdapter } from '../adapters/mock-adapter.js';
import { startDaemon } from '../daemon.js';
import { DaemonRpcClient } from '../ipc/client.js';
import { resolveSocketPath } from '../ipc/socket-path.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runGitSync(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function initGitRepo(dir: string): void {
  runGitSync(dir, ['init', '-b', 'main']);
  runGitSync(dir, ['config', 'user.name', 'Keylor Pineda']);
  runGitSync(dir, ['config', 'user.email', 'keylor@example.com']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo\n', 'utf8');
  runGitSync(dir, ['add', 'README.md']);
  runGitSync(dir, ['commit', '-m', 'chore: initial commit']);
}

class FileWritingAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange = '^1.0.0';
  private readonly action: (opts: SessionOptions) => string;
  private readonly sessions = new Map<string, SessionOptions>();

  constructor(id: ProviderId, action: (opts: SessionOptions) => string) {
    this.id = id;
    this.action = action;
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    return {
      installed: true,
      version: '1.0.0',
      authenticated: true,
      capabilities: {
        streamJson: true,
        strictMcpConfig: true,
        modelSelectionFlag: true,
        readOnlyFlag: true,
        supportsResume: true,
      },
    };
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return [
      {
        id: 'stub',
        provider: this.id,
        displayName: 'Stub',
        supportsReasoningEffort: false,
      },
    ];
  }

  async startSession(opts: SessionOptions): Promise<AdapterSession> {
    const sessionId = `${this.id}-${Math.random().toString(36).slice(2, 10)}`;
    this.sessions.set(sessionId, opts);
    return { sessionId, provider: this.id, modelId: opts.modelId, cwd: opts.cwd, role: opts.role };
  }

  async *sendTurn(sessionId: string, _input: TurnInput): AsyncIterable<NormalizedEvent> {
    const opts = this.sessions.get(sessionId);
    if (!opts) {
      throw new Error('Unknown session');
    }
    const text = this.action(opts);
    yield { type: 'text_delta', text };
    yield { type: 'done', outcome: 'completed' };
  }

  async cancel(): Promise<void> {}
}

async function waitForTaskRun(
  client: DaemonRpcClient,
  taskRunId: string,
  expected: readonly TaskRunRecord['state'][],
): Promise<TaskRunRecord> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { taskRun } = await client.call('taskRun.get', { taskRunId });
    if (taskRun && expected.includes(taskRun.state)) {
      return taskRun;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for TaskRun ${taskRunId}`);
}

async function waitForSecondOpinionDone(
  client: DaemonRpcClient,
  secondOpinionId: string,
): Promise<SecondOpinionRecord> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { secondOpinion } = await client.call('secondOpinion.get', { secondOpinionId });
    if (
      secondOpinion &&
      secondOpinion.columnA.status === 'COMPLETED' &&
      secondOpinion.columnB.status === 'COMPLETED'
    ) {
      return secondOpinion;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for SecondOpinion ${secondOpinionId}`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Four approval modes, read-only guard, branch integration, and Second Opinion', () => {
  it('enforces read-only guard rollback on Plan role violation and blocks plan->execute', async () => {
    const dataDir = makeTempDir('orchdeck-ro-data-');
    const repoDir = makeTempDir('orchdeck-ro-repo-');
    initGitRepo(repoDir);

    const roguePlanner = new FileWritingAdapter('claude', (opts) => {
      fs.writeFileSync(path.join(opts.cwd, 'README.md'), '# Tampered by planner\n', 'utf8');
      fs.writeFileSync(path.join(opts.cwd, 'rogue-new.txt'), 'unauthorized', 'utf8');
      return 'Attempted unauthorized write during read_only planning.';
    });

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
      adapters: [
        roguePlanner,
        new MockAdapter({ id: 'codex', eventDelayMs: 5 }),
        new MockAdapter({ id: 'antigravity', eventDelayMs: 5 }),
      ],
    });
    const client = new DaemonRpcClient({
      socketPath: daemon.socketPath,
      authToken: daemon.authToken,
    });

    try {
      await client.connect();
      const { project } = await client.call('projects.create', { rootPath: repoDir, name: 'Guard' });
      const { chat } = await client.call('chats.create', { projectId: project.id, title: 'Guard' });

      const started = await client.call('taskRun.start', {
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        modelHandle: 'claude:opus-4-6:high',
        prompt: 'Plan database migration',
        mode: 'plan',
      });

      const guarded = await waitForTaskRun(client, started.taskRun.id, ['DISCARDED']);
      assert.equal(guarded.roleViolationDetected, true);
      assert.ok(guarded.errorMessage?.includes('unauthorized modifications'));
      assert.equal(fs.existsSync(path.join(repoDir, 'rogue-new.txt')), false);
      assert.equal(fs.readFileSync(path.join(repoDir, 'README.md'), 'utf8').trim(), '# Demo');
    } finally {
      client.close();
      await daemon.close();
    }
  });

  it('commits atomically on agent/<slug> in Branch Pilot and integrates into main cleanly', async () => {
    const dataDir = makeTempDir('orchdeck-pilot-data-');
    const repoDir = makeTempDir('orchdeck-pilot-repo-');
    initGitRepo(repoDir);

    const writer = new FileWritingAdapter('codex', (opts) => {
      fs.writeFileSync(path.join(opts.cwd, 'pilot-feature.ts'), 'export const pilot = true;\n', 'utf8');
      return 'Created pilot-feature.ts';
    });

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
      adapters: [
        new MockAdapter({ id: 'claude', eventDelayMs: 5 }),
        writer,
        new MockAdapter({ id: 'antigravity', eventDelayMs: 5 }),
      ],
    });
    const client = new DaemonRpcClient({
      socketPath: daemon.socketPath,
      authToken: daemon.authToken,
    });

    try {
      await client.connect();
      const { project } = await client.call('projects.create', {
        rootPath: repoDir,
        name: 'Pilot Repo',
      });
      const { chat } = await client.call('chats.create', {
        projectId: project.id,
        title: 'Pilot Chat',
      });

      const started = await client.call('taskRun.start', {
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        modelHandle: 'codex:gpt-5.4:high',
        prompt: 'Ship pilot helper',
        mode: 'branch_pilot',
      });

      const committed = await waitForTaskRun(client, started.taskRun.id, ['COMMITTED_ON_BRANCH']);
      assert.ok(committed.branchName?.startsWith('agent/'));
      assert.ok(committed.commitSha);
      assert.equal(runGitSync(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), committed.branchName);

      // Human-triggered branch integration merges cleanly into main.
      const integrated = await client.call('changes.integrateBranch', {
        projectId: project.id,
        targetBranch: 'main',
        strategy: 'merge',
        commitMessage: 'feat(pilot): integrate pilot helper cleanly',
      });
      assert.equal(integrated.integrated, true);
      assert.equal(integrated.conflictDetected, false);
      assert.equal(integrated.targetBranch, 'main');
      assert.equal(runGitSync(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');
      assert.ok(fs.existsSync(path.join(repoDir, 'pilot-feature.ts')));
    } finally {
      client.close();
      await daemon.close();
    }
  });

  it('dispatches parallel read-only Second Opinion turns and resolves cleanly', async () => {
    const dataDir = makeTempDir('orchdeck-2nd-data-');
    const repoDir = makeTempDir('orchdeck-2nd-repo-');
    initGitRepo(repoDir);

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
      adapters: [
        new MockAdapter({ id: 'claude', eventDelayMs: 5 }),
        new MockAdapter({ id: 'codex', eventDelayMs: 5 }),
        new MockAdapter({ id: 'antigravity', eventDelayMs: 5 }),
      ],
    });
    const client = new DaemonRpcClient({
      socketPath: daemon.socketPath,
      authToken: daemon.authToken,
    });

    try {
      await client.connect();
      const { project } = await client.call('projects.create', { rootPath: repoDir, name: '2nd' });
      const { chat } = await client.call('chats.create', { projectId: project.id, title: '2nd' });

      const started = await client.call('secondOpinion.start', {
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        prompt: 'Compare SQLite WAL vs Postgres for desktop state',
        modelAHandle: 'claude:opus-4-6:high',
        modelBHandle: 'codex:gpt-5.4:high',
      });

      const finished = await waitForSecondOpinionDone(client, started.secondOpinion.id);
      assert.ok(finished.columnA.text.includes('claude'));
      assert.ok(finished.columnB.text.includes('codex'));
      assert.equal(finished.roleViolationDetected, false);

      const resolved = await client.call('secondOpinion.resolve', {
        secondOpinionId: finished.id,
        resolution: 'SYNTHESIZE',
      });
      assert.equal(resolved.secondOpinion.resolution, 'SYNTHESIZE');
      assert.equal(resolved.secondOpinion.collapsed, true);
    } finally {
      client.close();
      await daemon.close();
    }
  });
});
