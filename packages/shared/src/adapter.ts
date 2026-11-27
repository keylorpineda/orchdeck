export type ProviderId = 'claude' | 'codex' | 'antigravity';

export const PROVIDER_IDS: readonly ProviderId[] = ['claude', 'codex', 'antigravity'];

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'max'];

export type AgentRole = 'planner' | 'builder' | 'reviewer';

export type ApprovalMode = 'plan' | 'architect' | 'express' | 'branch_pilot';

export interface CanonicalModelHandle {
  readonly provider: ProviderId;
  readonly modelId: string;
  readonly reasoningEffort?: ReasoningEffort | undefined;
}

export function isProviderId(value: string): value is ProviderId {
  return value === 'claude' || value === 'codex' || value === 'antigravity';
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'max';
}

export function parseModelHandle(handle: string): CanonicalModelHandle {
  const trimmed = handle.trim();
  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(
      `Invalid model handle "${handle}". Expected "<provider>:<model_id>[:<reasoning_effort>]".`,
    );
  }

  const providerRaw = parts[0] ?? '';
  const modelId = (parts[1] ?? '').trim();
  const effortRaw = parts[2]?.trim();

  if (!isProviderId(providerRaw)) {
    throw new Error(
      `Unknown provider "${providerRaw}" in model handle "${handle}". Expected one of: ${PROVIDER_IDS.join(', ')}.`,
    );
  }

  if (modelId.length === 0) {
    throw new Error(`Model identifier cannot be empty in model handle "${handle}".`);
  }

  if (effortRaw !== undefined) {
    if (!isReasoningEffort(effortRaw)) {
      throw new Error(
        `Invalid reasoning effort "${effortRaw}" in model handle "${handle}". Expected one of: ${REASONING_EFFORTS.join(', ')}.`,
      );
    }
    return { provider: providerRaw, modelId, reasoningEffort: effortRaw };
  }

  return { provider: providerRaw, modelId };
}

export function formatModelHandle(handle: CanonicalModelHandle): string {
  if (handle.reasoningEffort !== undefined) {
    return `${handle.provider}:${handle.modelId}:${handle.reasoningEffort}`;
  }
  return `${handle.provider}:${handle.modelId}`;
}

export interface ProviderCapabilities {
  readonly streamJson: boolean;
  readonly strictMcpConfig: boolean;
  readonly modelSelectionFlag: boolean;
  readonly readOnlyFlag: boolean;
  readonly supportsResume: boolean;
}

export interface ProviderHealthCheck {
  readonly installed: boolean;
  readonly version?: string | undefined;
  readonly authenticated: boolean;
  readonly capabilities: ProviderCapabilities;
}

export interface ModelDescriptor {
  readonly id: string;
  readonly provider: ProviderId;
  readonly displayName: string;
  readonly supportsReasoningEffort: boolean;
  readonly defaultReasoningEffort?: ReasoningEffort | undefined;
}

export interface SessionOptions {
  readonly cwd: string;
  readonly modelId: string;
  readonly reasoningEffort?: ReasoningEffort | undefined;
  readonly role: AgentRole;
  readonly approvalMode: ApprovalMode;
  readonly resumeSessionId?: string | undefined;
  readonly envOverrides?: Readonly<Record<string, string>> | undefined;
}

export interface AdapterSession {
  readonly sessionId: string;
  readonly provider: ProviderId;
  readonly modelId: string;
  readonly cwd: string;
  readonly role: AgentRole;
}

export interface TurnInput {
  readonly prompt: string;
  readonly attachmentPaths?: readonly string[] | undefined;
}

export type NormalizedEvent =
  | {
      readonly type: 'text_delta';
      readonly text: string;
    }
  | {
      readonly type: 'thinking_delta';
      readonly text: string;
    }
  | {
      readonly type: 'tool_use';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
    }
  | {
      readonly type: 'tool_result';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly ok: boolean;
      readonly outputSummary: string;
    }
  | {
      readonly type: 'usage';
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheReadTokens: number;
      readonly cacheWriteTokens: number;
      readonly durationMs: number;
    }
  | {
      readonly type: 'rate_limit';
      readonly message: string;
      readonly resetAt?: string | undefined;
      readonly retryAfterSeconds?: number | undefined;
    }
  | {
      readonly type: 'status';
      readonly phase: 'starting' | 'running' | 'verifying' | 'cancelled';
      readonly detail?: string | undefined;
    }
  | {
      readonly type: 'error';
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    }
  | {
      readonly type: 'done';
      readonly outcome: 'completed' | 'cancelled' | 'rate_limited' | 'error';
      readonly changedFiles?: readonly string[] | undefined;
    };

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange: string;

  healthCheck(): Promise<ProviderHealthCheck>;
  listModels(): Promise<readonly ModelDescriptor[]>;
  startSession(opts: SessionOptions): Promise<AdapterSession>;
  sendTurn(sessionId: string, input: TurnInput): AsyncIterable<NormalizedEvent>;
  cancel(sessionId: string): Promise<void>;
}

export interface AdapterSummary {
  readonly id: ProviderId;
  readonly pinnedCliVersionRange: string;
  readonly health: ProviderHealthCheck;
  readonly models: readonly ModelDescriptor[];
}

export interface TurnEventNotificationParams {
  readonly turnId: string;
  readonly sessionId: string;
  readonly provider: ProviderId;
  readonly event: NormalizedEvent;
}
