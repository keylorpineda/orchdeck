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
  RecipeRunRecord,
  SessionOptions,
  TurnInput,
} from '@orchdeck/shared';
import { MockAdapter } from '../adapters/mock-adapter.js';
import { startDaemon } from '../daemon.js';
import { DaemonRpcClient } from '../ipc/client.js';
import { resolveSocketPath } from '../ipc/socket-path.js';
import { buildHandoffMarkdown, writeHandoffPacket } from './handoff-builder.js';

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
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fusion Demo\n', 'utf8');
  runGitSync(dir, ['add', 'README.md']);
  runGitSync(dir, ['commit', '-m', 'chore: initial commit']);
}

class ProgrammableAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange = '^1.0.0';
  private readonly responder: (
    opts: SessionOptions,
    input: TurnInput,
  ) => readonly NormalizedEvent[];
  private readonly sessions = new Map<string, SessionOptions>();

  constructor(
    id: ProviderId,
    responder: (opts: SessionOptions, input: TurnInput) => readonly NormalizedEvent[],
  ) {
    this.id = id;
    this.responder = responder;
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    return {
      installed: true,
      version: '1.0.0-stub',
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
        id: 'stub-model',
        provider: this.id,
        displayName: `${this.id} Stub`,
        supportsReasoningEffort: true,
        defaultReasoningEffort: 'high',
      },
    ];
  }

  async startSession(opts: SessionOptions): Promise<AdapterSession> {
    const sessionId = `${this.id}-${Math.random().toString(36).slice(2, 10)}`;
    this.sessions.set(sessionId, opts);
    return {
      sessionId,
      provider: this.id,
      modelId: opts.modelId,
      cwd: opts.cwd,
      role: opts.role,
    };
  }

  async *sendTurn(sessionId: string, input: TurnInput): AsyncIterable<NormalizedEvent> {
    const opts = this.sessions.get(sessionId);
    if (!opts) {
      throw new Error(`Unknown session ${sessionId}`);
    }
    const events = this.responder(opts, input);
    for (const event of events) {
      yield event;
    }
  }

  async cancel(): Promise<void> {}
}

async function waitForRecipeCompletion(
  client: DaemonRpcClient,
  recipeRunId: string,
): Promise<RecipeRunRecord> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { recipeRun } = await client.call('recipes.getRun', { recipeRunId });
    if (recipeRun && recipeRun.status !== 'RUNNING') {
      return recipeRun;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for RecipeRun ${recipeRunId}`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('HandoffPacketBuilder and .git/info/exclude isolation', () => {
  it('writes redacted handoff markdown to .orchdeck/handoff.md and keeps git status clean', async () => {
    const repoDir = makeTempDir('orchdeck-handoff-repo-');
    initGitRepo(repoDir);

    const fakeSecret = 'sk-ant-' + 'api03-secretvalue1234567890abcdef'; // orchdeck-secret-ignore
    const markdown = buildHandoffMarkdown({
      goal: `Migrate auth using ${fakeSecret}`,
      decisions: ['Use SQLite WAL'],
      diffStat: 'README.md | 1 +',
      latestTestOutput: `FAIL token=${fakeSecret}`,
      nextStep: 'Finish tests',
      sourceModelHandle: 'claude:opus-4-6:high',
      targetModelHandle: 'codex:gpt-5.4:high',
      reason: 'Rate limited',
    });

    assert.equal(markdown.includes(fakeSecret), false);
    assert.ok(markdown.includes('[REDACTED:anthropic-key]'));

    const written = await writeHandoffPacket(repoDir, {
      goal: 'Ship PR',
      decisions: ['Keep main clean'],
      diffStat: 'src/a.ts | 2 +-',
      latestTestOutput: 'PASS',
      nextStep: 'Review Change Card',
    });

    assert.equal(written.relativePath, '.orchdeck/handoff.md');
    assert.ok(fs.existsSync(written.absolutePath));

    const gitStatus = runGitSync(repoDir, ['status', '--porcelain=v1']).trim();
    assert.equal(gitStatus, '');

    const excludePath = path.join(repoDir, '.git', 'info', 'exclude');
    assert.ok(fs.readFileSync(excludePath, 'utf8').includes('.orchdeck/'));
  });
});

describe('RecipeOrchestrator, bounded Reviewer->Builder retries, and quota/manual relay', () => {
  it('supports Recipe CRUD, bounded reviewer fix retries, and automatic quota fallback', async () => {
    const dataDir = makeTempDir('orchdeck-fusion-data-');
    const repoDir = makeTempDir('orchdeck-fusion-repo-');
    initGitRepo(repoDir);

    let reviewAttempt = 0;
    let builderHitLimitOnce = false;

    const antigravity = new ProgrammableAdapter('antigravity', () => [
      { type: 'text_delta', text: 'Plan: 1) add helper 2) verify' },
      { type: 'done', outcome: 'completed' },
    ]);

    const codex = new ProgrammableAdapter('codex', () => {
      if (!builderHitLimitOnce) {
        builderHitLimitOnce = true;
        return [
          {
            type: 'rate_limit',
            message: 'Codex cooldown 30s',
            retryAfterSeconds: 30,
          },
          { type: 'done', outcome: 'rate_limited' },
        ];
      }
      return [
        { type: 'text_delta', text: 'Implemented requested helper.' },
        { type: 'done', outcome: 'completed' },
      ];
    });

    const claude = new ProgrammableAdapter('claude', (opts) => {
      if (opts.role === 'reviewer') {
        reviewAttempt += 1;
        if (reviewAttempt === 1) {
          return [
            { type: 'text_delta', text: 'CHANGES_REQUESTED: add missing null guard.' },
            { type: 'done', outcome: 'completed' },
          ];
        }
        return [
          { type: 'text_delta', text: 'APPROVED: clean diff and tests look good.' },
          { type: 'done', outcome: 'completed' },
        ];
      }
      // Fallback builder role executed when codex hits rate_limit
      return [
        { type: 'text_delta', text: 'Fallback builder implemented initial draft.' },
        { type: 'done', outcome: 'completed' },
      ];
    });

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
      adapters: [claude, codex, antigravity],
    });
    const client = new DaemonRpcClient({
      socketPath: daemon.socketPath,
      authToken: daemon.authToken,
    });

    try {
      await client.connect();
      const { recipes: initialRecipes } = await client.call('recipes.list', {});
      assert.ok(initialRecipes.some((r) => r.id === 'builtin-balanced'));

      const { recipe: custom } = await client.call('recipes.create', {
        name: 'Custom Bounded Team',
        description: 'Tests bounded retries + quota handoff',
        plannerModel: 'antigravity:gemini-4-neon:high',
        builderModel: 'codex:gpt-5.4:high',
        reviewerModel: 'claude:opus-4-6:high',
        fallbackModel: 'claude:sonnet-4-6:medium',
        maxReviewRetries: 2,
      });

      const updated = await client.call('recipes.update', {
        id: custom.id,
        maxReviewRetries: 2,
      });
      assert.equal(updated.recipe.maxReviewRetries, 2);

      const { project } = await client.call('projects.create', {
        rootPath: repoDir,
        name: 'Fusion Repo',
      });
      const { chat } = await client.call('chats.create', {
        projectId: project.id,
        title: 'Fusion Thread',
      });

      const started = await client.call('recipes.run', {
        recipeId: custom.id,
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        prompt: 'Build resilient rate limit fallback',
      });

      const completed = await waitForRecipeCompletion(client, started.recipeRun.id);
      assert.equal(completed.status, 'COMPLETED');
      assert.equal(completed.retryCount, 1);
      assert.ok(completed.branchName?.startsWith('agent/'));
      assert.equal(completed.handoffPath, '.orchdeck/handoff.md');
      assert.ok(completed.steps.some((s) => s.outcome === 'rate_limited'));
      assert.ok(completed.steps.some((s) => s.outcome === 'relayed'));
      assert.ok(completed.steps.some((s) => s.outcome === 'changes_requested'));
      assert.equal(completed.steps.at(-1)?.stage, 'reviewer');
      assert.equal(completed.steps.at(-1)?.outcome, 'completed');

      // Also verify 1-click manual handoff relay.
      const relay = await client.call('handoff.relay', {
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        targetModelHandle: 'antigravity:gemini-4-neon:high',
        goal: 'Finish docs update',
        decisions: ['Preserve zero API keys'],
        nextStep: 'Draft final CHANGELOG entry',
        sourceModelHandle: 'claude:opus-4-6:high',
        reason: 'Manual engine switch',
      });
      assert.equal(relay.handoffPath, '.orchdeck/handoff.md');
      assert.ok(relay.turnId.length > 0);
      assert.equal(relay.targetModelHandle, 'antigravity:gemini-4-neon:high');

      // Custom recipe deletion works cleanly while builtin cannot be deleted.
      const delCustom = await client.call('recipes.delete', { id: custom.id });
      assert.equal(delCustom.deleted, true);
      await assert.rejects(
        () => client.call('recipes.delete', { id: 'builtin-balanced' }),
        /Built-in recipes cannot be deleted/i,
      );
    } finally {
      client.close();
      await daemon.close();
    }
  });

  it('caps bounded review retries cleanly at maxReviewRetries with MockAdapter', async () => {
    const dataDir = makeTempDir('orchdeck-cap-data-');
    const repoDir = makeTempDir('orchdeck-cap-repo-');
    initGitRepo(repoDir);

    const alwaysRequestChanges = new ProgrammableAdapter('claude', (opts) => [
      {
        type: 'text_delta',
        text: opts.role === 'reviewer' ? 'NEEDS_FIX: still incomplete' : 'Builder patch',
      },
      { type: 'done', outcome: 'completed' },
    ]);

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
      adapters: [
        alwaysRequestChanges,
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
      const { recipe } = await client.call('recipes.create', {
        name: 'Tight Cap',
        description: 'Max 1 retry',
        plannerModel: 'claude:opus-4-6:high',
        builderModel: 'claude:opus-4-6:high',
        reviewerModel: 'claude:opus-4-6:high',
        maxReviewRetries: 1,
      });
      const { project } = await client.call('projects.create', { rootPath: repoDir, name: 'Cap' });
      const { chat } = await client.call('chats.create', { projectId: project.id, title: 'Cap' });
      const started = await client.call('recipes.run', {
        recipeId: recipe.id,
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        prompt: 'Verify retry cap',
      });

      const done = await waitForRecipeCompletion(client, started.recipeRun.id);
      assert.equal(done.status, 'COMPLETED');
      assert.equal(done.retryCount, 1);
      const reviewerSteps = done.steps.filter((s) => s.stage === 'reviewer');
      assert.equal(reviewerSteps.length, 2);
    } finally {
      client.close();
      await daemon.close();
    }
  });
});
