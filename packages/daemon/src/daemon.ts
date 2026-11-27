import crypto from 'node:crypto';
import path from 'node:path';
import type { ProviderAdapter } from '@orchdeck/shared';
import { AdapterRegistry } from './adapters/adapter-registry.js';
import { createDefaultMockAdapters } from './adapters/mock-adapter.js';
import { TurnRunner } from './adapters/turn-runner.js';
import { DaemonDatabase } from './db/database.js';
import { DaemonRpcServer } from './ipc/server.js';
import { resolveDefaultDataDir, resolveSocketPath } from './ipc/socket-path.js';

export interface StartDaemonOptions {
  readonly dataDir?: string | undefined;
  readonly dbPath?: string | undefined;
  readonly socketPath?: string | undefined;
  readonly authToken?: string | undefined;
  readonly adapters?: readonly ProviderAdapter[] | undefined;
}

export interface RunningDaemon {
  readonly dataDir: string;
  readonly dbPath: string;
  readonly socketPath: string;
  readonly authToken: string;
  readonly close: () => Promise<void>;
}

export async function startDaemon(options: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const dataDir = options.dataDir ? path.resolve(options.dataDir) : resolveDefaultDataDir();
  const dbPath = options.dbPath ? path.resolve(options.dbPath) : path.join(dataDir, 'orchdeck.db');
  const socketPath = options.socketPath ?? resolveSocketPath({ dataDir });
  const authToken = options.authToken ?? crypto.randomBytes(32).toString('hex');

  const db = new DaemonDatabase(dbPath);
  const registry = new AdapterRegistry(options.adapters ?? createDefaultMockAdapters());

  let server: DaemonRpcServer | null = null;
  const turnRunner = new TurnRunner({
    registry,
    db,
    emitEvent: (notification) => {
      server?.broadcastNotification('turn.event', notification);
    },
  });

  server = new DaemonRpcServer({
    db,
    socketPath,
    authToken,
    registry,
    turnRunner,
  });

  try {
    await server.start();
  } catch (err) {
    db.close();
    throw err;
  }

  return {
    dataDir,
    dbPath,
    socketPath,
    authToken,
    close: async () => {
      await server.stop();
      db.close();
    },
  };
}
