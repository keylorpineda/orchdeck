import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TurnEventNotificationParams } from '@orchdeck/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon, type RunningDaemon } from '../daemon.js';
import { DaemonDatabase } from '../db/database.js';
import { DaemonRpcClient } from '../ipc/client.js';
import { resolveSocketPath } from '../ipc/socket-path.js';
import { runProviderAdapterContractTests } from './contract-suite.js';
import { MockAdapter } from './mock-adapter.js';

const tempDirs: string[] = [];
const daemons: RunningDaemon[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-adapter-test-'));
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

describe('ProviderAdapter contract suite on MockAdapter', () => {
  it('passes contract suite for claude MockAdapter', async () => {
    await runProviderAdapterContractTests(() => new MockAdapter({ id: 'claude', eventDelayMs: 2 }));
  });

  it('passes contract suite for codex MockAdapter', async () => {
    await runProviderAdapterContractTests(() => new MockAdapter({ id: 'codex', eventDelayMs: 2 }));
  });

  it('passes contract suite for antigravity MockAdapter', async () => {
    await runProviderAdapterContractTests(
      () => new MockAdapter({ id: 'antigravity', eventDelayMs: 2 }),
    );
  });
});

describe('Core Daemon end-to-end streaming over IPC with MockAdapter', () => {
  it('streams scrubbed turn events, records SQLite usage, and handles turn.cancel', async () => {
    const dataDir = createTempDir();
    const token = crypto.randomBytes(32).toString('hex');
    const socketPath = resolveSocketPath({ dataDir, instanceId: `stream-${Date.now()}` });

    const daemon = await startDaemon({
      dataDir,
      socketPath,
      authToken: token,
      adapters: [
        new MockAdapter({ id: 'claude', eventDelayMs: 5 }),
        new MockAdapter({ id: 'codex', eventDelayMs: 5 }),
        new MockAdapter({ id: 'antigravity', eventDelayMs: 5 }),
      ],
    });
    daemons.push(daemon);

    const client = new DaemonRpcClient({ socketPath, authToken: token });
    await client.connect();

    const adaptersResult = await client.call('adapters.list', {});
    expect(adaptersResult.adapters.map((a) => a.id)).toEqual(['claude', 'codex', 'antigravity']);

    const received: TurnEventNotificationParams[] = [];
    let resolveDone: (() => void) | undefined;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const unsub = client.onNotification((notification) => {
      if (notification.method === 'turn.event') {
        received.push(notification.params);
        if (notification.params.event.type === 'done') {
          resolveDone?.();
        }
      }
    });

    const started = await client.call('turn.start', {
      projectId: 'proj-1',
      chatId: 'chat-1',
      cwd: dataDir,
      modelHandle: 'antigravity:gemini-4-neon:high',
      prompt: '[tool-diff] Apply edit and emit redacted output',
      role: 'builder',
      approvalMode: 'architect',
    });
    expect(started.turnId.length).toBeGreaterThan(0);

    await donePromise;
    unsub();

    const turnEvents = received.filter((n) => n.turnId === started.turnId);
    expect(turnEvents.some((n) => n.event.type === 'tool_use')).toBe(true);
    const toolResult = turnEvents.find((n) => n.event.type === 'tool_result');
    expect(toolResult?.event.type).toBe('tool_result');
    if (toolResult?.event.type === 'tool_result') {
      expect(toolResult.event.outputSummary).toContain('[REDACTED:anthropic-key]');
    }
    expect(turnEvents.at(-1)?.event).toMatchObject({ type: 'done', outcome: 'completed' });

    // Cancel scenario
    const cancelReceived: TurnEventNotificationParams[] = [];
    let resolveCancelDone: (() => void) | undefined;
    const cancelDone = new Promise<void>((resolve) => {
      resolveCancelDone = resolve;
    });
    const unsubCancel = client.onNotification((notification) => {
      if (notification.method === 'turn.event') {
        cancelReceived.push(notification.params);
        if (notification.params.event.type === 'done') {
          resolveCancelDone?.();
        }
      }
    });

    const slowTurn = await client.call('turn.start', {
      projectId: 'proj-1',
      chatId: 'chat-1',
      cwd: dataDir,
      modelHandle: 'claude:opus-4-6:high',
      prompt: '[slow-cancel] Run slow output',
    });
    const cancelRes = await client.call('turn.cancel', { turnId: slowTurn.turnId });
    expect(cancelRes.cancelled).toBe(true);
    await cancelDone;
    unsubCancel();
    expect(cancelReceived.at(-1)?.event).toMatchObject({ type: 'done', outcome: 'cancelled' });

    client.close();
    await daemon.close();
    daemons.pop();

    // Verify usage_events recorded in SQLite
    const db = new DaemonDatabase(daemon.dbPath);
    const usage = db.listUsageEvents();
    expect(usage.length).toBeGreaterThanOrEqual(1);
    expect(usage.some((u) => u.providerId === 'antigravity' && u.modelId === 'gemini-4-neon')).toBe(
      true,
    );
    db.close();
  });
});
