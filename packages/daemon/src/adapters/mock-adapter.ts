import crypto from 'node:crypto';
import type {
  AdapterSession,
  ModelDescriptor,
  NormalizedEvent,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderHealthCheck,
  ProviderId,
  SessionOptions,
  TurnInput,
} from '@orchdeck/shared';
import {
  buildMockScenarioEvents,
  getDefaultMockModels,
  selectScenarioFromPrompt,
} from './fixtures/mock-fixtures.js';

export interface MockAdapterOptions {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange?: string | undefined;
  readonly version?: string | undefined;
  readonly installed?: boolean | undefined;
  readonly authenticated?: boolean | undefined;
  readonly eventDelayMs?: number | undefined;
  readonly capabilities?: Partial<ProviderCapabilities> | undefined;
  readonly models?: readonly ModelDescriptor[] | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class MockAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange: string;
  private readonly version: string;
  private readonly installed: boolean;
  private readonly authenticated: boolean;
  private readonly eventDelayMs: number;
  private readonly capabilities: ProviderCapabilities;
  private readonly models: readonly ModelDescriptor[];
  private readonly sessions = new Map<string, AdapterSession>();
  private readonly activeAbortControllers = new Map<string, AbortController>();

  constructor(options: MockAdapterOptions) {
    this.id = options.id;
    this.pinnedCliVersionRange = options.pinnedCliVersionRange ?? '^1.0.0';
    this.version = options.version ?? '1.0.0-mock';
    this.installed = options.installed ?? true;
    this.authenticated = options.authenticated ?? true;
    this.eventDelayMs = options.eventDelayMs ?? 15;
    this.capabilities = {
      streamJson: options.capabilities?.streamJson ?? true,
      strictMcpConfig: options.capabilities?.strictMcpConfig ?? true,
      modelSelectionFlag: options.capabilities?.modelSelectionFlag ?? true,
      readOnlyFlag: options.capabilities?.readOnlyFlag ?? true,
      supportsResume: options.capabilities?.supportsResume ?? true,
    };
    this.models = options.models ?? getDefaultMockModels(options.id);
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    return {
      installed: this.installed,
      version: this.installed ? this.version : undefined,
      authenticated: this.authenticated,
      capabilities: this.capabilities,
    };
  }

  async listModels(): Promise<readonly ModelDescriptor[]> {
    return [...this.models];
  }

  async startSession(opts: SessionOptions): Promise<AdapterSession> {
    const sessionId = crypto.randomUUID();
    const session: AdapterSession = {
      sessionId,
      provider: this.id,
      modelId: opts.modelId,
      cwd: opts.cwd,
      role: opts.role,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async *sendTurn(sessionId: string, input: TurnInput): AsyncIterable<NormalizedEvent> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown MockAdapter session "${sessionId}".`);
    }

    const controller = new AbortController();
    this.activeAbortControllers.set(sessionId, controller);

    const scenario = selectScenarioFromPrompt(input.prompt);
    const events = buildMockScenarioEvents(this.id, scenario);

    try {
      for (const event of events) {
        if (controller.signal.aborted) {
          yield { type: 'status', phase: 'cancelled', detail: 'Turn cancelled by caller.' };
          yield { type: 'done', outcome: 'cancelled' };
          return;
        }

        if (this.eventDelayMs > 0) {
          await sleep(scenario === 'slow-cancel' ? Math.max(this.eventDelayMs, 25) : this.eventDelayMs);
        }

        if (controller.signal.aborted) {
          yield { type: 'status', phase: 'cancelled', detail: 'Turn cancelled by caller.' };
          yield { type: 'done', outcome: 'cancelled' };
          return;
        }

        yield event;
      }
    } finally {
      this.activeAbortControllers.delete(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.activeAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }
  }
}

export function createDefaultMockAdapters(): readonly ProviderAdapter[] {
  return [
    new MockAdapter({ id: 'claude' }),
    new MockAdapter({ id: 'codex' }),
    new MockAdapter({ id: 'antigravity' }),
  ];
}
