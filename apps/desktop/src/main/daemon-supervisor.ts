import { spawn, type ChildProcessByStdio } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { DaemonRpcClient, resolveSocketPath } from '@orchdeck/daemon';
import { redactSecrets } from '@orchdeck/shared';
import { sanitizeDaemonEnv } from './security.js';

const require = createRequire(import.meta.url);

export interface DaemonSupervisorOptions {
  readonly dataDir: string;
  readonly startTimeoutMs?: number | undefined;
}

interface ReadyLine {
  readonly ready: boolean;
  readonly pid: number;
  readonly socketPath: string;
  readonly dbPath: string;
}

export class DaemonSupervisor {
  private readonly dataDir: string;
  private readonly startTimeoutMs: number;
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private client: DaemonRpcClient | null = null;

  constructor(options: DaemonSupervisorOptions) {
    this.dataDir = path.resolve(options.dataDir);
    this.startTimeoutMs = options.startTimeoutMs ?? 10_000;
  }

  async start(): Promise<DaemonRpcClient> {
    if (this.client) {
      return this.client;
    }

    const daemonEntry = require.resolve('@orchdeck/daemon');
    const daemonCliPath = path.join(path.dirname(daemonEntry), 'cli.js');
    const authToken = crypto.randomBytes(32).toString('hex');
    const socketPath = resolveSocketPath({ dataDir: this.dataDir });

    const sanitizedBase = sanitizeDaemonEnv(process.env);
    const childEnv: NodeJS.ProcessEnv = {
      ...sanitizedBase,
      ELECTRON_RUN_AS_NODE: '1',
      ORCHDECK_DATA_DIR: this.dataDir,
      ORCHDECK_DAEMON_SOCKET: socketPath,
      ORCHDECK_DAEMON_TOKEN: authToken,
    };

    const child = spawn(process.execPath, [daemonCliPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    this.child = child;

    const readyInfo = await this.waitForReady(child);
    const client = new DaemonRpcClient({
      socketPath: readyInfo.socketPath,
      authToken,
    });
    await client.connect();
    this.client = client;
    return client;
  }

  getClient(): DaemonRpcClient {
    if (!this.client) {
      throw new Error('Core Daemon client is not started.');
    }
    return this.client;
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }

    const proc = this.child;
    this.child = null;
    if (!proc || proc.exitCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 3_000);

      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  private waitForReady(
    child: ChildProcessByStdio<null, Readable, Readable>,
  ): Promise<ReadyLine> {
    return new Promise<ReadyLine>((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const cleanup = (): void => {
        clearTimeout(timer);
        child.stdout.off('data', onStdout);
        child.stderr.off('data', onStderr);
        child.off('exit', onExit);
        child.off('error', onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Core Daemon timed out after ${this.startTimeoutMs}ms.`));
      }, this.startTimeoutMs);

      const onStdout = (chunk: Buffer): void => {
        stdoutBuffer += chunk.toString('utf8');
        const newline = stdoutBuffer.indexOf('\n');
        if (newline === -1) {
          return;
        }
        const firstLine = stdoutBuffer.slice(0, newline).trim();
        try {
          const parsed = JSON.parse(firstLine) as Partial<ReadyLine>;
          if (parsed.ready === true && typeof parsed.socketPath === 'string') {
            cleanup();
            resolve(parsed as ReadyLine);
          }
        } catch {
          // Ignore non-JSON lines prior to readiness announcement.
        }
      };

      const onStderr = (chunk: Buffer): void => {
        stderrBuffer += chunk.toString('utf8');
      };

      const onExit = (code: number | null): void => {
        cleanup();
        const details = redactSecrets(stderrBuffer.trim());
        reject(
          new Error(
            `Core Daemon exited prematurely with code ${String(code)}${details ? `: ${details}` : ''}`,
          ),
        );
      };

      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.once('exit', onExit);
      child.once('error', onError);
    });
  }
}
