import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitService, assertPathInsideRepo } from './git-service.js';
import { resolveSystemGitPath } from '../security/git-shim.js';

const tempDirs: string[] = [];

function createTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-gitservice-'));
  tempDirs.push(dir);
  const gitBin = resolveSystemGitPath();
  execFileSync(gitBin, ['init', '-b', 'main'], { cwd: dir, stdio: 'pipe' });
  execFileSync(gitBin, ['config', 'user.name', 'Keylor Pineda'], { cwd: dir, stdio: 'pipe' });
  execFileSync(gitBin, ['config', 'user.email', 'keylor@example.com'], { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'README.md'), 'initial\n', 'utf8');
  execFileSync(gitBin, ['add', '.'], { cwd: dir, stdio: 'pipe' });
  execFileSync(gitBin, ['commit', '-m', 'chore(repo): initial commit'], { cwd: dir, stdio: 'pipe' });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('GitService and repository containment', () => {
  it('blocks path traversal outside repository root', () => {
    const repoDir = createTempRepo();
    const inside = assertPathInsideRepo(repoDir, 'src/nested/new-file.ts');
    expect(inside.startsWith(fs.realpathSync(repoDir))).toBe(true);
    expect(() => assertPathInsideRepo(repoDir, '../outside.txt')).toThrow();
    expect(() => assertPathInsideRepo(repoDir, 'src/../../outside.txt')).toThrow();
  });

  it('refuses direct commits on main, moves to agent/<slug>, and creates clean user commit', async () => {
    const repoDir = createTempRepo();
    const gitService = new GitService();

    expect(await gitService.isGitRepository(repoDir)).toBe(true);
    expect(await gitService.getCurrentBranch(repoDir)).toBe('main');

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'updated\n', 'utf8');
    const status = await gitService.getStatus(repoDir);
    expect(status.isClean).toBe(false);
    expect(status.unstaged).toContain('README.md');
    expect(await gitService.getDiffStat(repoDir)).toContain('README.md');
    expect(await gitService.getUnifiedDiff(repoDir)).toContain('+updated');

    // Direct commit on main must be rejected
    await expect(
      gitService.commitApprovedChanges(repoDir, 'feat(ui): direct commit attempt'),
    ).rejects.toThrow(/protected branch/);

    // Switch to isolated task branch
    const taskBranch = await gitService.ensureTaskBranch(repoDir, 'My Task 1');
    expect(taskBranch).toBe('agent/my-task-1');

    // Co-Authored-By trailers must be rejected
    await expect(
      gitService.commitApprovedChanges(
        repoDir,
        'feat(ui): valid message\n\nCo-Authored-By: Bot <bot@example.com>',
      ),
    ).rejects.toThrow(/Co-Authored-By/);

    // Clean user-authored commit succeeds
    const sha = await gitService.commitApprovedChanges(
      repoDir,
      'feat(ui): apply approved readme update\n\nVerified clean commit on isolated task branch.',
    );
    expect(sha.length).toBeGreaterThanOrEqual(7);

    const gitBin = resolveSystemGitPath();
    const logOut = execFileSync(gitBin, ['log', '-1', '--format=%an <%ae>%n%B'], {
      cwd: repoDir,
      encoding: 'utf8',
    });
    expect(logOut).toContain('Keylor Pineda <keylor@example.com>');
    expect(logOut).not.toContain('Co-Authored-By');
  });
});
