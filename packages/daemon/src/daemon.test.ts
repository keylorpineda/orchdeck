import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSONRPC_ERROR_CODE } from '@orchdeck/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon, type RunningDaemon } from './daemon.js';
import { DaemonRpcClient, JsonRpcClientError } from './ipc/client.js';
import { resolveSocketPath } from './ipc/socket-path.js';

const tempDirs: string[] = [];
const daemons: RunningDaemon[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-daemon-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (daemons.length > 0) {
    const d = daemons.pop();
    if (d) {
      await d.close();
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Core Daemon IPC and SQLite WAL', () => {
  it('enforces bearer token authentication and exposes WAL health', async () => {
    const dataDir = createTempDir();
    const token = crypto.randomBytes(32).toString('hex');
    const socketPath = resolveSocketPath({ dataDir, instanceId: `auth-${Date.now()}` });

    const daemon = await startDaemon({ dataDir, socketPath, authToken: token });
    daemons.push(daemon);

    // Unauthenticated call must fail with UNAUTHORIZED
    const unauthClient = new DaemonRpcClient({ socketPath, authToken: token });
    await unauthClient.connect(false);
    await expect(unauthClient.call('daemon.health', {})).rejects.toMatchObject({
      code: JSONRPC_ERROR_CODE.UNAUTHORIZED,
    });
    await expect(
      unauthClient.call('daemon.authenticate', { token: 'wrong-token-012345678901234567890123' }),
    ).rejects.toBeInstanceOf(JsonRpcClientError);
    unauthClient.close();

    // Authenticated client succeeds
    const client = new DaemonRpcClient({ socketPath, authToken: token });
    await client.connect();
    const health = await client.call('daemon.health', {});
    expect(health.status).toBe('ok');
    expect(health.sqliteJournalMode).toBe('wal');
    expect(health.schemaVersion).toBe(1);

    const ping = await client.call('daemon.ping', { nonce: 'abc' });
    expect(ping.pong).toBe(true);
    expect(ping.nonce).toBe('abc');
    client.close();
  });

  it('persists kv_store and projects across full daemon restarts', async () => {
    const dataDir = createTempDir();
    const token1 = crypto.randomBytes(32).toString('hex');
    const socket1 = resolveSocketPath({ dataDir, instanceId: `p1-${Date.now()}` });

    const daemon1 = await startDaemon({ dataDir, socketPath: socket1, authToken: token1 });
    const client1 = new DaemonRpcClient({ socketPath: socket1, authToken: token1 });
    await client1.connect();

    await client1.call('kv.set', { key: 'boot_check', value: 'persisted-value-1' });
    const created = await client1.call('projects.create', {
      name: 'orchdeck-sample',
      rootPath: dataDir,
      defaultBranch: 'dev',
    });
    expect(created.project.name).toBe('orchdeck-sample');

    client1.close();
    await daemon1.close();

    // Restart a new daemon instance against the same SQLite database
    const token2 = crypto.randomBytes(32).toString('hex');
    const socket2 = resolveSocketPath({ dataDir, instanceId: `p2-${Date.now()}` });
    const daemon2 = await startDaemon({ dataDir, socketPath: socket2, authToken: token2 });
    daemons.push(daemon2);

    const client2 = new DaemonRpcClient({ socketPath: socket2, authToken: token2 });
    await client2.connect();

    const kvResult = await client2.call('kv.get', { key: 'boot_check' });
    expect(kvResult.value).toBe('persisted-value-1');

    const listed = await client2.call('projects.list', {});
    expect(listed.projects).toHaveLength(1);
    expect(listed.projects[0]?.name).toBe('orchdeck-sample');
    expect(listed.projects[0]?.defaultBranch).toBe('dev');

    client2.close();
  });
});
