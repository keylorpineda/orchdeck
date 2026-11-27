import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
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
  fs.writeFileSync(path.join(dir, 'README.md'), '# Worktree Demo\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env.local\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.env.local'), 'LOCAL_PORT=4321\n', 'utf8');
  runGitSync(dir, ['add', 'README.md', '.gitignore']);
  runGitSync(dir, ['commit', '-m', 'chore: initial commit']);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('WorktreeManager concurrent isolation, allowlist bootstrap, and orphan GC', () => {
  it('isolates two concurrent chat worktrees, copies allowlisted ignored files, inspects per-chat diffs, and prunes orphans', async () => {
    const dataDir = makeTempDir('orchdeck-wt-data-');
    const repoDir = makeTempDir('orchdeck-wt-repo-');
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
      const { project } = await client.call('projects.create', {
        rootPath: repoDir,
        name: 'Worktree Repo',
      });
      await client.call('projects.update', {
        id: project.id,
        worktreeAllowlist: ['.env.local'],
      });

      const { chat: chatA } = await client.call('chats.create', {
        projectId: project.id,
        title: 'Task Alpha',
      });
      const { chat: chatB } = await client.call('chats.create', {
        projectId: project.id,
        title: 'Task Beta',
      });

      const wtA = await client.call('worktrees.create', {
        projectId: project.id,
        chatId: chatA.id,
        branchSlug: 'alpha',
      });
      const wtB = await client.call('worktrees.create', {
        projectId: project.id,
        chatId: chatB.id,
        branchSlug: 'beta',
      });

      assert.notEqual(wtA.worktreePath, wtB.worktreePath);
      assert.ok(fs.existsSync(path.join(wtA.worktreePath, '.env.local')));
      assert.equal(
        fs.readFileSync(path.join(wtA.worktreePath, '.env.local'), 'utf8'),
        'LOCAL_PORT=4321\n',
      );
      // Allowlisted .env.local stays untracked / ignored by git
      assert.equal(runGitSync(wtA.worktreePath, ['status', '--porcelain=v1']).trim(), '');

      // Concurrent edits inside separate worktrees remain strictly isolated.
      fs.writeFileSync(path.join(wtA.worktreePath, 'alpha.ts'), 'export const a = 1;\n', 'utf8');
      fs.writeFileSync(path.join(wtB.worktreePath, 'beta.ts'), 'export const b = 2;\n', 'utf8');

      const snapA = await client.call('changes.inspect', {
        projectId: project.id,
        chatId: chatA.id,
      });
      const snapB = await client.call('changes.inspect', {
        projectId: project.id,
        chatId: chatB.id,
      });
      assert.deepEqual(
        snapA.snapshot.files.map((f) => f.path),
        ['alpha.ts'],
      );
      assert.deepEqual(
        snapB.snapshot.files.map((f) => f.path),
        ['beta.ts'],
      );

      // Clean commit inside wtA without touching main or wtB.
      const approvedA = await client.call('changes.approve', {
        projectId: project.id,
        chatId: chatA.id,
        commitMessage: 'feat(alpha): add alpha module in isolated worktree',
      });
      assert.equal(approvedA.branch, wtA.branch);
      assert.equal(runGitSync(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');

      // Delete chatB directly from DB -> leaves orphan worktree -> pruneOrphans cleans it up!
      await client.call('chats.delete', { id: chatB.id });
      const listedBeforePrune = await client.call('worktrees.list', { projectId: project.id });
      assert.ok(listedBeforePrune.worktrees.some((w) => w.isOrphan));

      const pruned = await client.call('worktrees.prune', { projectId: project.id });
      assert.equal(pruned.prunedCount, 1);

      const removedA = await client.call('worktrees.remove', {
        projectId: project.id,
        chatId: chatA.id,
      });
      assert.equal(removedA.removed, true);
      assert.equal(removedA.chat.worktreePath, null);
    } finally {
      client.close();
      await daemon.close();
    }
  });
});
