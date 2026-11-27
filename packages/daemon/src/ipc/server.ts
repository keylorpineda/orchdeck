import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import {
  DAEMON_PROTOCOL_VERSION,
  JSONRPC_ERROR_CODE,
  JSONRPC_VERSION,
  isJsonRpcRequest,
  redactSecrets,
  type DaemonMethod,
  type DaemonMethodMap,
  type JsonRpcErrorResponse,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcSuccessResponse,
} from '@orchdeck/shared';
import type { DaemonDatabase } from '../db/database.js';

const MAX_LINE_BYTES = 1024 * 1024;

export interface DaemonRpcServerOptions {
  readonly db: DaemonDatabase;
  readonly socketPath: string;
  readonly authToken: string;
  readonly startedAtMs?: number | undefined;
}

function makeErrorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message: redactSecrets(message),
    },
  };
}

function makeSuccessResponse<M extends DaemonMethod>(
  id: JsonRpcId,
  result: DaemonMethodMap[M]['result'],
): JsonRpcSuccessResponse<M> {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

function constantTimeTokenMatch(expected: string, candidate: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const candidateBuf = Buffer.from(candidate, 'utf8');
  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

export class DaemonRpcServer {
  readonly socketPath: string;
  private readonly db: DaemonDatabase;
  private readonly authToken: string;
  private readonly startedAtMs: number;
  private readonly server: net.Server;
  private readonly authenticatedSockets = new WeakSet<net.Socket>();
  private readonly activeSockets = new Set<net.Socket>();

  constructor(options: DaemonRpcServerOptions) {
    if (options.authToken.length < 32) {
      throw new Error('Daemon authToken must be at least 32 characters long.');
    }
    this.db = options.db;
    this.socketPath = options.socketPath;
    this.authToken = options.authToken;
    this.startedAtMs = options.startedAtMs ?? Date.now();
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });
  }

  async start(): Promise<void> {
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = (): void => {
        this.server.off('error', onError);
        if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
          fs.chmodSync(this.socketPath, 0o600);
        }
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this.socketPath);
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    await new Promise<void>((resolve, reject) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
  }

  private handleConnection(socket: net.Socket): void {
    this.activeSockets.add(socket);
    let buffer = '';

    socket.setEncoding('utf8');

    socket.on('close', () => {
      this.activeSockets.delete(socket);
    });

    socket.on('error', () => {
      this.activeSockets.delete(socket);
    });

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
        this.send(
          socket,
          makeErrorResponse(null, JSONRPC_ERROR_CODE.INVALID_REQUEST, 'Message exceeds max frame size.'),
        );
        socket.destroy();
        return;
      }

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          this.handleLine(socket, line);
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  }

  private handleLine(socket: net.Socket, rawLine: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      this.send(socket, makeErrorResponse(null, JSONRPC_ERROR_CODE.PARSE_ERROR, 'Invalid JSON payload.'));
      return;
    }

    if (!isJsonRpcRequest(parsed)) {
      this.send(
        socket,
        makeErrorResponse(null, JSONRPC_ERROR_CODE.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request.'),
      );
      return;
    }

    const response = this.dispatch(socket, parsed);
    this.send(socket, response);
  }

  private dispatch(
    socket: net.Socket,
    request: JsonRpcRequest,
  ): JsonRpcSuccessResponse | JsonRpcErrorResponse {
    const params = request.params as unknown as Record<string, unknown>;

    if (request.method === 'daemon.authenticate') {
      const token = params['token'];
      if (typeof token !== 'string' || !constantTimeTokenMatch(this.authToken, token)) {
        return makeErrorResponse(request.id, JSONRPC_ERROR_CODE.UNAUTHORIZED, 'Invalid daemon bearer token.');
      }
      this.authenticatedSockets.add(socket);
      return makeSuccessResponse(request.id, {
        authenticated: true,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
      });
    }

    if (!this.authenticatedSockets.has(socket)) {
      return makeErrorResponse(
        request.id,
        JSONRPC_ERROR_CODE.UNAUTHORIZED,
        'Authentication required before invoking daemon methods.',
      );
    }

    try {
      switch (request.method) {
        case 'daemon.health':
          return makeSuccessResponse(request.id, {
            status: 'ok',
            pid: process.pid,
            sqliteJournalMode: this.db.getJournalMode(),
            schemaVersion: this.db.getSchemaVersion(),
            uptimeMs: Math.max(0, Date.now() - this.startedAtMs),
          });

        case 'daemon.ping': {
          const nonce = params['nonce'];
          if (nonce !== undefined && typeof nonce !== 'string') {
            return makeErrorResponse(request.id, JSONRPC_ERROR_CODE.INVALID_PARAMS, 'nonce must be a string.');
          }
          return makeSuccessResponse(request.id, {
            pong: true,
            nonce,
            timestamp: new Date().toISOString(),
          });
        }

        case 'kv.set': {
          const key = params['key'];
          const value = params['value'];
          if (typeof key !== 'string' || key.length === 0 || typeof value !== 'string') {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'kv.set requires non-empty string key and string value.',
            );
          }
          this.db.setKv(key, value);
          return makeSuccessResponse(request.id, { ok: true });
        }

        case 'kv.get': {
          const key = params['key'];
          if (typeof key !== 'string' || key.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'kv.get requires non-empty string key.',
            );
          }
          return makeSuccessResponse(request.id, { value: this.db.getKv(key) });
        }

        case 'projects.list':
          return makeSuccessResponse(request.id, { projects: this.db.listProjects() });

        case 'projects.create': {
          const name = params['name'];
          const rootPath = params['rootPath'];
          const defaultBranch = params['defaultBranch'];
          if (
            typeof name !== 'string' ||
            name.trim().length === 0 ||
            typeof rootPath !== 'string' ||
            rootPath.trim().length === 0 ||
            (defaultBranch !== undefined && typeof defaultBranch !== 'string')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'projects.create requires non-empty name and rootPath strings.',
            );
          }
          const project = this.db.createProject({
            name: name.trim(),
            rootPath: rootPath.trim(),
            defaultBranch: defaultBranch?.trim(),
          });
          return makeSuccessResponse(request.id, { project });
        }

        default:
          return makeErrorResponse(
            request.id,
            JSONRPC_ERROR_CODE.METHOD_NOT_FOUND,
            `Method not found: ${String(request.method)}`,
          );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal daemon error.';
      return makeErrorResponse(request.id, JSONRPC_ERROR_CODE.INTERNAL_ERROR, message);
    }
  }

  private send(socket: net.Socket, payload: JsonRpcSuccessResponse | JsonRpcErrorResponse): void {
    if (!socket.destroyed) {
      socket.write(`${JSON.stringify(payload)}\n`);
    }
  }
}
