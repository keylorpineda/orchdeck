import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { startDaemon } from '../daemon.js';
import { DaemonRpcClient } from '../ipc/client.js';
import { resolveSocketPath } from '../ipc/socket-path.js';
import { GitService, tokenizeSafeCommand } from './git-service.js';

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
  fs.writeFileSync(path.join(dir, 'README.md'), '# Sample Repo\nline 2\n', 'utf8');
  runGitSync(dir, ['add', 'README.md']);
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

describe('tokenizeSafeCommand', () => {
  it('splits quoted arguments without shell execution', () => {
    const tokens = tokenizeSafeCommand('node -e "console.log(\'ok\')" --flag');
    assert.deepEqual(tokens, ['node', '-e', "console.log('ok')", '--flag']);
  });

  it('rejects shell metacharacters and chaining operators', () => {
    assert.throws(() => tokenizeSafeCommand('node -v; rm -rf /'), /disallowed shell/i);
    assert.throws(() => tokenizeSafeCommand('node -v && whoami'), /disallowed shell/i);
    assert.throws(() => tokenizeSafeCommand('echo $(whoami)'), /disallowed shell/i);
    assert.throws(() => tokenizeSafeCommand('node -e "console.log(1)'), /unmatched quote/i);
  });
});

describe('Change Card RPC and Git operations', () => {
  it('inspects tracked and untracked diffs with secret redaction, runs tests, approves onto task branch, and discards with stash backup', async () => {
    const dataDir = makeTempDir('orchdeck-cc-data-');
    const repoDir = makeTempDir('orchdeck-cc-repo-');
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

      const fakeSecretPrefix = 'sk-ant-';
      const syntheticSecret = `${fakeSecretPrefix}api03-abcdefghijklmnopqrstuvwxyz0123456789`; // orchdeck-secret-ignore
      const testScript = `"${process.execPath}" -e "process.stdout.write('PASS ok')"`;

      const { project } = await client.call('projects.create', {
        rootPath: repoDir,
        name: 'Sample Repo',
        testCommand: testScript,
      });

      // Modify tracked file and add untracked file containing a synthetic secret.
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Sample Repo\nline 2 updated\nline 3\n', 'utf8');
      fs.writeFileSync(
        path.join(repoDir, 'new-note.ts'),
        `export const note = ${JSON.stringify(syntheticSecret)};\n`,
        'utf8',
      );

      const inspected = await client.call('changes.inspect', { projectId: project.id });
      assert.equal(inspected.snapshot.isClean, false);
      assert.equal(inspected.snapshot.branch, 'main');
      assert.equal(inspected.snapshot.files.length, 2);

      const untrackedFile = inspected.snapshot.files.find((f) => f.path === 'new-note.ts');
      assert.ok(untrackedFile);
      assert.equal(untrackedFile.status, 'untracked');
      assert.equal(untrackedFile.additions, 1);
      assert.equal(untrackedFile.diff.includes(syntheticSecret), false);
      assert.ok(untrackedFile.diff.includes('[REDACTED:anthropic-key]'));

      const testRun = await client.call('changes.runTests', { projectId: project.id });
      assert.equal(testRun.result.passed, true);
      assert.equal(testRun.result.exitCode, 0);
      assert.ok(testRun.result.output.includes('PASS ok'));

      // Approve from main -> auto-creates isolated task branch and commits cleanly with zero Co-Authored-By.
      const approved = await client.call('changes.approve', {
        projectId: project.id,
        commitMessage: 'feat(demo): add sample note and update readme',
        branchSlug: 'sample-note',
      });
      assert.equal(approved.branch, 'agent/sample-note');
      assert.ok(approved.commitSha.length >= 7);

      const commitBody = runGitSync(repoDir, ['log', '-1', '--format=%B']);
      assert.equal(commitBody.includes('Co-Authored-By'), false);
      assert.ok(commitBody.includes('feat(demo): add sample note and update readme'));

      const afterCommit = await client.call('changes.inspect', { projectId: project.id });
      assert.equal(afterCommit.snapshot.isClean, true);

      // Make another edit and verify Discard creates a git stash safety backup.
      fs.writeFileSync(path.join(repoDir, 'scratch-edit.txt'), 'temp\n', 'utf8');
      const discarded = await client.call('changes.discard', { projectId: project.id });
      assert.equal(discarded.discarded, true);
      assert.equal(discarded.stashCreated, true);
      assert.ok(discarded.stashRef);

      const gitService = new GitService();
      const finalStatus = await gitService.getStatus(repoDir);
      assert.equal(finalStatus.isClean, true);

      const stashList = runGitSync(repoDir, ['stash', 'list']);
      assert.ok(stashList.includes('orchdeck-discard-backup'));
    } finally {
      client.close();
      await daemon.close();
    }
  });
});
