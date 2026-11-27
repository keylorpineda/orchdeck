import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  redactSecrets,
  type ApprovalMode,
  type McpHubStatus,
  type McpPendingApproval,
  type McpServerDescriptor,
  type ProviderId,
} from '@orchdeck/shared';

export interface McpToolDefinition {
  readonly serverId: string;
  readonly name: string;
  readonly description: string;
  readonly mutating?: boolean | undefined;
  readonly handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface LocalMcpHubOptions {
  readonly approvalMode?: ApprovalMode | undefined;
  readonly onApprovalRequired?: ((approval: McpPendingApproval) => void) | undefined;
  readonly approvalTimeoutMs?: number | undefined;
}

interface PendingApprovalRecord {
  readonly approval: McpPendingApproval;
  readonly resolve: (decision: 'approve' | 'deny') => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

const MUTATING_PREFIXES = [
  'write',
  'edit',
  'delete',
  'remove',
  'exec',
  'run',
  'click',
  'fill',
  'commit',
  'push',
  'insert',
  'update',
  'drop',
  'create',
];

function constantTimeMatch(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function isMutatingMcpTool(toolName: string, explicitMutating?: boolean): boolean {
  if (explicitMutating !== undefined) {
    return explicitMutating;
  }
  const lower = toolName.toLowerCase();
  return MUTATING_PREFIXES.some((prefix) => lower.includes(prefix));
}

export function deduplicateMcpServersForProvider(
  servers: readonly McpServerDescriptor[],
  providerId: ProviderId,
): {
  readonly hubOwnedServers: readonly McpServerDescriptor[];
  readonly nativePassThroughServers: readonly McpServerDescriptor[];
  readonly cliArgs: readonly string[];
} {
  const activeServers = servers.filter((server) => server.activeInRepo);
  const hubOwnedServers: McpServerDescriptor[] = [];
  const nativePassThroughServers: McpServerDescriptor[] = [];

  for (const server of activeServers) {
    if (server.sourceProviders.length > 1 || server.deduplicatedFor.includes(providerId)) {
      hubOwnedServers.push(server);
    } else {
      nativePassThroughServers.push(server);
    }
  }

  const cliArgs: string[] = [];
  if (providerId === 'claude' && hubOwnedServers.length > 0) {
    // Prevent Claude CLI from double-registering shared native MCPs handled by Orchdeck Hub.
    cliArgs.push('--strict-mcp-config');
  }

  return {
    hubOwnedServers,
    nativePassThroughServers,
    cliArgs,
  };
}

export class LocalMcpHub {
  private readonly sessionToken: string;
  private readonly approvalTimeoutMs: number;
  private readonly onApprovalRequired?: ((approval: McpPendingApproval) => void) | undefined;
  private readonly tools = new Map<string, McpToolDefinition>();
  private readonly pendingApprovals = new Map<string, PendingApprovalRecord>();
  private approvalMode: ApprovalMode;
  private servers: readonly McpServerDescriptor[] = [];
  private httpServer: http.Server | null = null;
  private port: number | null = null;

  constructor(options: LocalMcpHubOptions = {}) {
    this.sessionToken = crypto.randomBytes(32).toString('hex');
    this.approvalMode = options.approvalMode ?? 'architect';
    this.onApprovalRequired = options.onApprovalRequired;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 30_000;
  }

  getBearerToken(): string {
    return this.sessionToken;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  setServers(servers: readonly McpServerDescriptor[]): void {
    this.servers = [...servers];
  }

  registerTool(tool: McpToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getStatus(): McpHubStatus {
    return {
      running: this.httpServer !== null && this.port !== null,
      url: this.port !== null ? `http://127.0.0.1:${this.port}/mcp` : null,
      port: this.port,
      servers: this.servers,
      pendingApprovals: Array.from(this.pendingApprovals.values(), (entry) => entry.approval),
    };
  }

  decideApproval(approvalId: string, decision: 'approve' | 'deny'): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pendingApprovals.delete(approvalId);
    pending.resolve(decision);
    return true;
  }

  async start(): Promise<{ readonly url: string; readonly port: number; readonly token: string }> {
    if (this.httpServer && this.port !== null) {
      return {
        url: `http://127.0.0.1:${this.port}/mcp`,
        port: this.port,
        token: this.sessionToken,
      };
    }

    const server = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address() as AddressInfo | null;
    if (!address) {
      server.close();
      throw new Error('Failed to bind Local MCP Hub socket on 127.0.0.1.');
    }

    this.httpServer = server;
    this.port = address.port;

    return {
      url: `http://127.0.0.1:${address.port}/mcp`,
      port: address.port,
      token: this.sessionToken,
    };
  }

  async close(): Promise<void> {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      clearTimeout(pending.timer);
      pending.resolve('deny');
      this.pendingApprovals.delete(id);
    }

    const server = this.httpServer;
    this.httpServer = null;
    this.port = null;
    if (!server) {
      return;
    }

    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const hostHeader = req.headers.host ?? '';
    const allowedHosts = new Set([`127.0.0.1:${this.port}`, `localhost:${this.port}`]);
    if (!allowedHosts.has(hostHeader)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden host header.' }));
      return;
    }

    if (typeof req.headers.origin === 'string' && req.headers.origin.length > 0) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Browser Origin header is forbidden on Local MCP Hub.' }));
      return;
    }

    const authHeader = req.headers.authorization ?? '';
    const candidateToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!candidateToken || !constantTimeMatch(this.sessionToken, candidateToken)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized MCP Hub bearer token.' }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
      totalBytes += buf.length;
      if (totalBytes > 256 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request payload too large.' }));
        return;
      }
      chunks.push(buf);
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Invalid JSON-RPC payload.');
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      return;
    }

    const id = (payload['id'] as string | number | null | undefined) ?? null;
    const method = payload['method'];
    const params =
      typeof payload['params'] === 'object' && payload['params'] !== null && !Array.isArray(payload['params'])
        ? (payload['params'] as Record<string, unknown>)
        : {};

    if (method === 'initialize') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { protocolVersion: '2024-11-05', serverInfo: { name: 'orchdeck-mcp-hub', version: '0.3.0' } },
        }),
      );
      return;
    }

    if (method === 'tools/list') {
      const list = Array.from(this.tools.values(), (tool) => ({
        name: tool.name,
        description: tool.description,
        serverId: tool.serverId,
        mutating: isMutatingMcpTool(tool.name, tool.mutating),
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: list } }));
      return;
    }

    if (method === 'tools/call') {
      const toolName = params['name'];
      const toolArgs =
        typeof params['arguments'] === 'object' &&
        params['arguments'] !== null &&
        !Array.isArray(params['arguments'])
          ? (params['arguments'] as Record<string, unknown>)
          : {};
      const providerIdRaw = params['providerId'];
      const providerId: ProviderId =
        providerIdRaw === 'claude' || providerIdRaw === 'codex' || providerIdRaw === 'antigravity'
          ? providerIdRaw
          : 'claude';

      if (typeof toolName !== 'string' || !this.tools.has(toolName)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown MCP tool: ${String(toolName)}` },
          }),
        );
        return;
      }

      const tool = this.tools.get(toolName);
      if (!tool) {
        return;
      }

      const mutating = isMutatingMcpTool(tool.name, tool.mutating);
      const requiresGate =
        this.approvalMode === 'plan' || (mutating && this.approvalMode !== 'branch_pilot');

      if (requiresGate) {
        const approvalId = crypto.randomUUID();
        const approval: McpPendingApproval = {
          id: approvalId,
          serverId: tool.serverId,
          toolName: tool.name,
          providerId,
          approvalMode: this.approvalMode,
          mutating,
          argsSummary: redactSecrets(JSON.stringify(toolArgs)).slice(0, 240),
          createdAt: new Date().toISOString(),
        };

        const decision = await new Promise<'approve' | 'deny'>((resolve) => {
          const timer = setTimeout(() => {
            this.pendingApprovals.delete(approvalId);
            resolve('deny');
          }, this.approvalTimeoutMs);
          this.pendingApprovals.set(approvalId, { approval, resolve, timer });
          this.onApprovalRequired?.(approval);
        });

        if (decision === 'deny') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32003,
                message: `Policy Gate denied MCP tool call: ${tool.name}`,
              },
            }),
          );
          return;
        }
      }

      try {
        const output = await tool.handler(toolArgs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: output }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: redactSecrets(message) },
          }),
        );
      }
      return;
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unsupported MCP method: ${String(method)}` },
      }),
    );
  }
}
