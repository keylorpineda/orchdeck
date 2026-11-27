import crypto from 'node:crypto';
import {
  redactSecrets,
  type NormalizedEvent,
  type ProviderAdapter,
  type TurnEventNotificationParams,
  type TurnStartParams,
  type TurnStartResult,
} from '@orchdeck/shared';
import type { DaemonDatabase } from '../db/database.js';
import type { AdapterRegistry } from './adapter-registry.js';

interface ActiveTurn {
  readonly turnId: string;
  readonly sessionId: string;
  readonly adapter: ProviderAdapter;
  readonly completion: Promise<void>;
}

export type TurnEventSink = (notification: TurnEventNotificationParams) => void;

function scrubEvent(event: NormalizedEvent): NormalizedEvent {
  switch (event.type) {
    case 'text_delta':
      return { type: 'text_delta', text: redactSecrets(event.text) };
    case 'thinking_delta':
      return { type: 'thinking_delta', text: redactSecrets(event.text) };
    case 'tool_use':
      return {
        ...event,
        summary: redactSecrets(event.summary),
      };
    case 'tool_result':
      return {
        ...event,
        outputSummary: redactSecrets(event.outputSummary),
      };
    case 'rate_limit':
      return {
        ...event,
        message: redactSecrets(event.message),
      };
    case 'status':
      return {
        ...event,
        detail: event.detail !== undefined ? redactSecrets(event.detail) : undefined,
      };
    case 'error':
      return {
        ...event,
        message: redactSecrets(event.message),
      };
    case 'usage':
    case 'done':
      return event;
  }
}

export class TurnRunner {
  private readonly registry: AdapterRegistry;
  private readonly db: DaemonDatabase;
  private readonly emitEvent: TurnEventSink;
  private readonly activeTurns = new Map<string, ActiveTurn>();

  constructor(options: {
    readonly registry: AdapterRegistry;
    readonly db: DaemonDatabase;
    readonly emitEvent: TurnEventSink;
  }) {
    this.registry = options.registry;
    this.db = options.db;
    this.emitEvent = options.emitEvent;
  }

  async startTurn(params: TurnStartParams): Promise<TurnStartResult> {
    const { parsed, adapter } = this.registry.resolveModelHandle(params.modelHandle);
    const session = await adapter.startSession({
      cwd: params.cwd,
      modelId: parsed.modelId,
      reasoningEffort: parsed.reasoningEffort,
      role: params.role ?? 'builder',
      approvalMode: params.approvalMode ?? 'architect',
    });

    const turnId = crypto.randomUUID();
    const completion = this.runStream(turnId, session.sessionId, parsed.modelId, adapter, params.prompt);

    this.activeTurns.set(turnId, {
      turnId,
      sessionId: session.sessionId,
      adapter,
      completion,
    });

    return { turnId, sessionId: session.sessionId };
  }

  async cancelTurn(turnId: string): Promise<boolean> {
    const active = this.activeTurns.get(turnId);
    if (!active) {
      return false;
    }
    await active.adapter.cancel(active.sessionId);
    await active.completion;
    return true;
  }

  async stopAll(): Promise<void> {
    const pending = [...this.activeTurns.values()].map(async (turn) => {
      await turn.adapter.cancel(turn.sessionId);
      await turn.completion;
    });
    await Promise.allSettled(pending);
  }

  private async runStream(
    turnId: string,
    sessionId: string,
    modelId: string,
    adapter: ProviderAdapter,
    prompt: string,
  ): Promise<void> {
    try {
      for await (const rawEvent of adapter.sendTurn(sessionId, { prompt })) {
        const event = scrubEvent(rawEvent);

        if (event.type === 'usage') {
          this.db.recordUsageEvent({
            providerId: adapter.id,
            modelId,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            cacheReadTokens: event.cacheReadTokens,
            durationMs: event.durationMs,
            rateLimited: false,
          });
        } else if (event.type === 'rate_limit') {
          this.db.recordUsageEvent({
            providerId: adapter.id,
            modelId,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            durationMs: 0,
            rateLimited: true,
          });
        }

        this.emitEvent({
          turnId,
          sessionId,
          provider: adapter.id,
          event,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emitEvent({
        turnId,
        sessionId,
        provider: adapter.id,
        event: {
          type: 'error',
          code: 'TURN_STREAM_FAILED',
          message: redactSecrets(message),
          recoverable: false,
        },
      });
      this.emitEvent({
        turnId,
        sessionId,
        provider: adapter.id,
        event: {
          type: 'done',
          outcome: 'error',
        },
      });
    } finally {
      this.activeTurns.delete(turnId);
    }
  }
}
