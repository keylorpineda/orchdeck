import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import type { TaskRunRecord } from '@orchdeck/shared';
import { startDaemon } from '../daemon.js';
import { DaemonDatabase } from '../db/database.js';
import { DaemonRpcClient } from '../ipc/client.js';
import { resolveSocketPath } from '../ipc/socket-path.js';
import { canTransitionTaskRun } from './task-run-machine.js';

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

async function waitForTaskRunState(
  client: DaemonRpcClient,
  taskRunId: string,
  expectedStates: readonly TaskRunRecord['state'][],
): Promise<TaskRunRecord> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { taskRun } = await client.call('taskRun.get', { taskRunId });
    if (taskRun && expectedStates.includes(taskRun.state)) {
      return taskRun;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for TaskRun ${taskRunId} to reach ${expectedStates.join(', ')}`);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('TaskRun state machine and approval modes', () => {
  it('validates legal and illegal state transitions', () => {
    assert.equal(canTransitionTaskRun('IDLE', 'PLANNING'), true);
    assert.equal(canTransitionTaskRun('IDLE', 'PREPARING_BRANCH'), true);
    assert.equal(canTransitionTaskRun('IDLE', 'EXECUTING'), false);
    assert.equal(canTransitionTaskRun('AWAITING_PLAN_APPROVAL', 'PREPARING_BRANCH'), true);
    assert.equal(canTransitionTaskRun('COMMITTED_ON_BRANCH', 'EXECUTING'), false);
  });

  it('enforces Architect read-only planning on main and isolated task branch creation on approval', async () => {
    const dataDir = makeTempDir('orchdeck-arch-data-');
    const repoDir = makeTempDir('orchdeck-arch-repo-');
    initGitRepo(repoDir);

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
    });
    const client = new DaemonRpcClient({
      socketPath: daemon.socketPath,
      authToken: daemon.authToken,
    });

    try {
      await client.connect();
      const { project } = await client.call('projects.create', { rootPath: repoDir, name: 'Arch' });
      const { chat } = await client.call('chats.create', { projectId: project.id, title: 'Arch' });

      const started = await client.call('taskRun.start', {
        projectId: project.id,
        chatId: chat.id,
        cwd: repoDir,
        modelHandle: 'claude:opus-4-6:high',
        prompt: 'Add feature flags config',
        mode: 'architect',
      });

      const awaiting = await waitForTaskRunState(client, started.taskRun.id, [
        'AWAITING_PLAN_APPROVAL',
      ]);
      assert.ok(awaiting.planText && awaiting.planText.length > 0);
      assert.equal(runGitSync(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');

      await client.call('taskRun.approvePlan', { taskRunId: started.taskRun.id });
      const finalReview = await waitForTaskRunState(client, started.taskRun.id, [
        'AWAITING_FINAL_REVIEW',
      ]);
      assert.ok(finalReview.branchName?.startsWith('agent/'));
      assert.equal(
        runGitSync(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
        finalReview.branchName,
      );

      const summary = await client.call('usage.summary', { providerId: 'claude' });
      assert.equal(summary.providers.length, 1);
      assert.ok((summary.providers[0]?.last5Hours.totalTurns ?? 0) >= 2);
      assert.ok((summary.providers[0]?.last5Hours.inputTokens ?? 0) > 0);
    } finally {
      client.close();
      await daemon.close();
    }
  });

  it('auto-creates agent/<slug> before Express execution and handles rejectPlan cleanly', async () => {
    const dataDir = makeTempDir('orchdeck-exp-data-');
    const repoExpress = makeTempDir('orchdeck-exp-repo-');
    const repoReject = makeTempDir('orchdeck-rej-repo-');
    initGitRepo(repoExpress);
    initGitRepo(repoReject);

    const daemon = await startDaemon({
      dataDir,
      socketPath: resolveSocketPath({ dataDir }),
    });
    const client = new DaemonRpcClient({
      socketPath: daemon.socketPath,
      authToken: daemon.authToken,
    });

    try {
      await client.connect();

      const { project: projExp } = await client.call('projects.create', {
        rootPath: repoExpress,
        name: 'Express Repo',
      });
      const { chat: chatExp } = await client.call('chats.create', {
        projectId: projExp.id,
        title: 'Express',
      });

      const expStarted = await client.call('taskRun.start', {
        projectId: projExp.id,
        chatId: chatExp.id,
        cwd: repoExpress,
        modelHandle: 'codex:gpt-5.4:high',
        prompt: 'Refactor logger helpers',
        mode: 'express',
      });
      const expDone = await waitForTaskRunState(client, expStarted.taskRun.id, [
        'AWAITING_FINAL_REVIEW',
      ]);
      assert.ok(expDone.branchName?.startsWith('agent/'));
      assert.equal(
        runGitSync(repoExpress, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
        expDone.branchName,
      );

      const { project: projRej } = await client.call('projects.create', {
        rootPath: repoReject,
        name: 'Reject Repo',
      });
      const { chat: chatRej } = await client.call('chats.create', {
        projectId: projRej.id,
        title: 'Reject',
      });
      const rejStarted = await client.call('taskRun.start', {
        projectId: projRej.id,
        chatId: chatRej.id,
        cwd: repoReject,
        modelHandle: 'claude:sonnet-4-6:medium',
        prompt: 'Draft schema cleanup',
        mode: 'architect',
      });
      await waitForTaskRunState(client, rejStarted.taskRun.id, ['AWAITING_PLAN_APPROVAL']);
      const rejected = await client.call('taskRun.rejectPlan', { taskRunId: rejStarted.taskRun.id });
      assert.equal(rejected.taskRun.state, 'DISCARDED');
      assert.equal(runGitSync(repoReject, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');
    } finally {
      client.close();
      await daemon.close();
    }
  });

  it('aggregates rolling 5h and 7d usage windows accurately', () => {
    const dataDir = makeTempDir('orchdeck-usage-db-');
    const db = new DaemonDatabase(path.join(dataDir, 'usage.db'));

    try {
      const now = Date.now();
      db.recordUsageEvent({
        providerId: 'claude',
        modelId: 'opus-4-6',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 20,
        durationMs: 400,
        rateLimited: false,
        createdAt: new Date(now - 2 * 3600_000).toISOString(),
      });
      db.recordUsageEvent({
        providerId: 'claude',
        modelId: 'opus-4-6',
        inputTokens: 300,
        outputTokens: 150,
        cacheReadTokens: 0,
        durationMs: 900,
        rateLimited: true,
        createdAt: new Date(now - 48 * 3600_000).toISOString(),
      });
      db.recordUsageEvent({
        providerId: 'claude',
        modelId: 'opus-4-6',
        inputTokens: 999,
        outputTokens: 999,
        cacheReadTokens: 0,
        durationMs: 999,
        rateLimited: false,
        createdAt: new Date(now - 10 * 24 * 3600_000).toISOString(),
      });

      const summary = db.getUsageSummary('claude');
      const claude = summary.providers[0];
      assert.ok(claude);
      assert.equal(claude.last5Hours.totalTurns, 1);
      assert.equal(claude.last5Hours.inputTokens, 100);
      assert.equal(claude.last5Hours.rateLimitCount, 0);

      assert.equal(claude.last7Days.totalTurns, 2);
      assert.equal(claude.last7Days.inputTokens, 400);
      assert.equal(claude.last7Days.outputTokens, 200);
      assert.equal(claude.last7Days.rateLimitCount, 1);
    } finally {
      db.close();
    }
  });
});
