import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSONRPC_ERROR_CODE } from '@orchdeck/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon, type RunningDaemon } from './daemon.js';
import { DaemonRpcClient } from './ipc/client.js';
import { resolveSocketPath } from './ipc/socket-path.js';
import { resolveSystemGitPath } from './security/git-shim.js';

const tempDirs: string[] = [];
const daemons: RunningDaemon[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function initGitRepo(dir: string, branch = 'main'): void {
  const gitBin = resolveSystemGitPath();
  execFileSync(gitBin, ['init', '-b', branch], { cwd: dir, stdio: 'pipe' });
  execFileSync(gitBin, ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'pipe' });
  execFileSync(gitBin, ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n', 'utf8');
  execFileSync(gitBin, ['add', '.'], { cwd: dir, stdio: 'pipe' });
  execFileSync(gitBin, ['commit', '-m', 'chore(repo): initial commit'], { cwd: dir, stdio: 'pipe' });
}

afterEach(async () => {
  while (daemons.length > 0) {
    await daemons.pop()?.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Projects, Chats, Messages CRUD and Live Git Enrichment', () => {
  it('validates Git repos, tracks live dirty status, and persists chats/messages across restarts', async () => {
    const dataDir = createTempDir('orchdeck-pc-data-');
    const nonGitDir = createTempDir('orchdeck-pc-nongit-');
    const repoDir = createTempDir('orchdeck-pc-repo-');
    initGitRepo(repoDir, 'dev');

    const token1 = crypto.randomBytes(32).toString('hex');
    const socket1 = resolveSocketPath({ dataDir, instanceId: `pc1-${Date.now()}` });
    const daemon1 = await startDaemon({ dataDir, socketPath: socket1, authToken: token1 });
    const client1 = new DaemonRpcClient({ socketPath: socket1, authToken: token1 });
    await client1.connect();

    // Reject non-Git folder
    await expect(
      client1.call('projects.create', { rootPath: nonGitDir }),
    ).rejects.toMatchObject({ code: JSONRPC_ERROR_CODE.INVALID_PARAMS });

    // Link valid Git folder
    const createdProj = await client1.call('projects.create', {
      rootPath: repoDir,
      testCommand: 'pnpm test',
    });
    expect(createdProj.project.name).toBe(path.basename(repoDir));
    expect(createdProj.project.currentBranch).toBe('dev');
    expect(createdProj.project.isClean).toBe(true);
    expect(createdProj.project.changedFileCount).toBe(0);
    expect(createdProj.project.testCommand).toBe('pnpm test');

    // Modify working tree and verify live status reflects dirty count
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'modified\n', 'utf8');
    fs.writeFileSync(path.join(repoDir, 'extra.ts'), 'export const x = 1;\n', 'utf8');
    const listDirty = await client1.call('projects.list', {});
    expect(listDirty.projects[0]?.isClean).toBe(false);
    expect(listDirty.projects[0]?.changedFileCount).toBe(2);

    // Update project testCommand
    const updatedProj = await client1.call('projects.update', {
      id: createdProj.project.id,
      name: 'Renamed Repo',
      testCommand: 'pnpm run test',
    });
    expect(updatedProj.project.name).toBe('Renamed Repo');
    expect(updatedProj.project.testCommand).toBe('pnpm run test');

    // Chat CRUD and activity sorting
    const chatA = await client1.call('chats.create', {
      projectId: createdProj.project.id,
      title: 'First chat',
    });
    await new Promise((r) => setTimeout(r, 15));
    const chatB = await client1.call('chats.create', {
      projectId: createdProj.project.id,
      title: 'Second chat',
    });

    const renamedA = await client1.call('chats.rename', {
      id: chatA.chat.id,
      title: 'Renamed First Chat',
    });
    expect(renamedA.chat.title).toBe('Renamed First Chat');

    // Appending message to chatA scrubs secrets and bumps chatA ahead in activity order
    const fakeSecret = 'sk-ant-' + 'api03-abcdefghijklmnop1234567890'; // orchdeck-secret-ignore
    const appended = await client1.call('messages.append', {
      chatId: chatA.chat.id,
      role: 'user',
      content: `Check token handling ${fakeSecret}`,
    });
    expect(appended.message.content).toContain('[REDACTED:anthropic-key]');
    expect(appended.message.content).not.toContain(fakeSecret);

    // Archive chatB
    await client1.call('chats.archive', { id: chatB.chat.id, archived: true });
    const activeChats = await client1.call('chats.list', {
      projectId: createdProj.project.id,
    });
    expect(activeChats.chats.map((c) => c.id)).toEqual([chatA.chat.id]);

    const allChats = await client1.call('chats.list', {
      projectId: createdProj.project.id,
      includeArchived: true,
    });
    expect(allChats.chats).toHaveLength(2);

    client1.close();
    await daemon1.close();

    // Restart daemon and verify persistence + live Git status
    const token2 = crypto.randomBytes(32).toString('hex');
    const socket2 = resolveSocketPath({ dataDir, instanceId: `pc2-${Date.now()}` });
    const daemon2 = await startDaemon({ dataDir, socketPath: socket2, authToken: token2 });
    daemons.push(daemon2);

    const client2 = new DaemonRpcClient({ socketPath: socket2, authToken: token2 });
    await client2.connect();

    const projectsAfter = await client2.call('projects.list', {});
    expect(projectsAfter.projects).toHaveLength(1);
    expect(projectsAfter.projects[0]?.name).toBe('Renamed Repo');
    expect(projectsAfter.projects[0]?.isClean).toBe(false);
    expect(projectsAfter.projects[0]?.changedFileCount).toBe(2);

    const messagesAfter = await client2.call('messages.list', { chatId: chatA.chat.id });
    expect(messagesAfter.messages).toHaveLength(1);
    expect(messagesAfter.messages[0]?.content).toContain('[REDACTED:anthropic-key]');

    // Delete chatB and project
    const delChat = await client2.call('chats.delete', { id: chatB.chat.id });
    expect(delChat.deleted).toBe(true);
    const delProj = await client2.call('projects.delete', { id: createdProj.project.id });
    expect(delProj.deleted).toBe(true);
    expect((await client2.call('projects.list', {})).projects).toHaveLength(0);

    client2.close();
  });
});
