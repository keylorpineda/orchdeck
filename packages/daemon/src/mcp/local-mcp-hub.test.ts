import { afterEach, describe, expect, it } from 'vitest';
import { LocalMcpHub, deduplicateMcpServersForProvider } from './local-mcp-hub.js';

const hubs: LocalMcpHub[] = [];

afterEach(async () => {
  while (hubs.length > 0) {
    const hub = hubs.pop();
    if (hub) {
      await hub.close();
    }
  }
});

describe('LocalMcpHub loopback security, deduplication, and Policy Gate', () => {
  it('binds strictly on 127.0.0.1, validates Host/Origin and 256-bit bearer token', async () => {
    const hub = new LocalMcpHub({ approvalMode: 'architect' });
    hubs.push(hub);

    hub.registerTool({
      serverId: 'mcp:sqlite',
      name: 'sqlite_read_tables',
      description: 'List tables',
      mutating: false,
      handler: () => ({ tables: ['projects', 'chats'] }),
    });

    const { url, token } = await hub.start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(token.length).toBe(64);

    // Missing token -> 401
    const unauthRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(unauthRes.status).toBe(401);

    // Non-empty Origin (DNS rebinding guard) -> 403
    const originRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(originRes.status).toBe(403);

    // Authorized read-only call -> 200
    const okRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'sqlite_read_tables', arguments: {} },
      }),
    });
    expect(okRes.status).toBe(200);
    const body = (await okRes.json()) as { result: { tables: string[] } };
    expect(body.result.tables).toEqual(['projects', 'chats']);
  });

  it('pauses mutating tools behind Policy Gate and resumes or denies on decision', async () => {
    const pendingQueue: string[] = [];
    const waiters: Array<(id: string) => void> = [];
    const waitForApproval = (): Promise<string> => {
      const queued = pendingQueue.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    };

    const hub = new LocalMcpHub({
      approvalMode: 'architect',
      approvalTimeoutMs: 5_000,
      onApprovalRequired: (approval) => {
        const waiter = waiters.shift();
        if (waiter) {
          waiter(approval.id);
        } else {
          pendingQueue.push(approval.id);
        }
      },
    });
    hubs.push(hub);

    hub.registerTool({
      serverId: 'mcp:sqlite',
      name: 'sqlite_write_row',
      description: 'Insert row',
      mutating: true,
      handler: (args) => ({ written: true, args }),
    });

    const { url, token } = await hub.start();

    const approvedPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'sqlite_write_row', arguments: { table: 'notes' }, providerId: 'codex' },
      }),
    });

    const firstApprovalId = await waitForApproval();
    expect(hub.decideApproval(firstApprovalId, 'approve')).toBe(true);

    const approvedRes = await approvedPromise;
    expect(approvedRes.status).toBe(200);

    const deniedPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'sqlite_write_row', arguments: { table: 'notes' }, providerId: 'claude' },
      }),
    });

    const secondApprovalId = await waitForApproval();
    expect(hub.decideApproval(secondApprovalId, 'deny')).toBe(true);

    const deniedRes = await deniedPromise;
    expect(deniedRes.status).toBe(403);
  });

  it('deduplicates shared MCPs and emits --strict-mcp-config for Claude when hub owns servers', () => {
    const result = deduplicateMcpServersForProvider(
      [
        {
          id: 'mcp:chrome-devtools',
          name: 'chrome-devtools',
          transport: 'stdio',
          commandOrUrl: 'npx chrome-devtools-mcp',
          envKeys: [],
          sourceProviders: ['claude', 'codex'],
          deduplicatedFor: ['claude', 'codex'],
          activeInRepo: true,
        },
        {
          id: 'mcp:local-only',
          name: 'local-only',
          transport: 'stdio',
          commandOrUrl: 'npx local-only',
          envKeys: [],
          sourceProviders: ['claude'],
          deduplicatedFor: [],
          activeInRepo: true,
        },
      ],
      'claude',
    );

    expect(result.hubOwnedServers.map((s) => s.name)).toEqual(['chrome-devtools']);
    expect(result.nativePassThroughServers.map((s) => s.name)).toEqual(['local-only']);
    expect(result.cliArgs).toContain('--strict-mcp-config');
  });
});
