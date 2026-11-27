import net from 'node:net';
import {
  JSONRPC_VERSION,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
  type DaemonMethod,
  type DaemonMethodMap,
  type DaemonNotification,
  type JsonRpcId,
  type JsonRpcRequest,
} from '@orchdeck/shared';

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface DaemonRpcClientOptions {
  readonly socketPath: string;
  readonly authToken: string;
  readonly timeoutMs?: number | undefined;
}

export type NotificationListener = (notification: DaemonNotification) => void;

export class JsonRpcClientError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'JsonRpcClientError';
    this.code = code;
  }
}

export class DaemonRpcClient {
  private readonly socketPath: string;
  private readonly authToken: string;
  private readonly timeoutMs: number;
  private readonly pending = new Map<JsonRpcId, PendingCall>();
  private readonly notificationListeners = new Set<NotificationListener>();
  private socket: net.Socket | null = null;
  private nextId = 1;
  private buffer = '';

  constructor(options: DaemonRpcClientOptions) {
    this.socketPath = options.socketPath;
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  async connect(authenticate = true): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection(this.socketPath);
      sock.setEncoding('utf8');

      const onError = (err: Error): void => {
        sock.destroy();
        reject(err);
      };

      sock.once('error', onError);
      sock.once('connect', () => {
        sock.off('error', onError);
        this.attachSocket(sock);
        resolve();
      });
    });

    if (authenticate) {
      await this.call('daemon.authenticate', { token: this.authToken });
    }
  }

  private attachSocket(sock: net.Socket): void {
    this.socket = sock;

    sock.on('data', (chunk: string) => {
      this.buffer += chunk;
      let newlineIndex = this.buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          this.handleMessageLine(line);
        }
        newlineIndex = this.buffer.indexOf('\n');
      }
    });

    sock.on('close', () => {
      this.rejectAllPending(new Error('Daemon IPC connection closed.'));
      this.socket = null;
    });

    sock.on('error', (err) => {
      this.rejectAllPending(err);
    });
  }

  private handleMessageLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      for (const listener of this.notificationListeners) {
        listener(parsed as DaemonNotification);
      }
      return;
    }

    if (!isJsonRpcResponse(parsed) || parsed.id === null) {
      return;
    }

    const entry = this.pending.get(parsed.id);
    if (!entry) {
      return;
    }

    this.pending.delete(parsed.id);
    clearTimeout(entry.timer);

    if (isJsonRpcErrorResponse(parsed)) {
      entry.reject(new JsonRpcClientError(parsed.error.code, parsed.error.message));
      return;
    }

    entry.resolve(parsed.result);
  }

  call<M extends DaemonMethod>(
    method: M,
    params: DaemonMethodMap[M]['params'],
  ): Promise<DaemonMethodMap[M]['result']> {
    const sock = this.socket;
    if (!sock || sock.destroyed) {
      return Promise.reject(new Error('DaemonRpcClient is not connected.'));
    }

    const id = this.nextId;
    this.nextId += 1;

    const request: JsonRpcRequest<M> = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      params,
    };

    return new Promise<DaemonMethodMap[M]['result']>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Daemon RPC call "${method}" timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as DaemonMethodMap[M]['result']),
        reject,
        timer,
      });

      sock.write(`${JSON.stringify(request)}\n`);
    });
  }

  close(): void {
    this.notificationListeners.clear();
    this.rejectAllPending(new Error('DaemonRpcClient closed by caller.'));
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
      this.socket.destroy();
    }
    this.socket = null;
  }

  private rejectAllPending(err: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
      this.pending.delete(id);
    }
  }
}
