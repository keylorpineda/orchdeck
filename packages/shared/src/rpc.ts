import type {
  AdapterSummary,
  AgentRole,
  ApprovalMode,
  TurnEventNotificationParams,
} from './adapter.js';

export const JSONRPC_VERSION = '2.0' as const;
export const DAEMON_PROTOCOL_VERSION = '0.1.0' as const;

export const JSONRPC_ERROR_CODE = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
} as const;

export type JsonRpcErrorCode =
  (typeof JSONRPC_ERROR_CODE)[keyof typeof JSONRPC_ERROR_CODE];

export type JsonRpcId = string | number;

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly defaultBranch: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DaemonHealthResult {
  readonly status: 'ok';
  readonly pid: number;
  readonly sqliteJournalMode: string;
  readonly schemaVersion: number;
  readonly uptimeMs: number;
}

export interface DaemonAuthenticateParams {
  readonly token: string;
}

export interface DaemonAuthenticateResult {
  readonly authenticated: true;
  readonly protocolVersion: string;
}

export interface DaemonPingParams {
  readonly nonce?: string | undefined;
}

export interface DaemonPingResult {
  readonly pong: true;
  readonly nonce?: string | undefined;
  readonly timestamp: string;
}

export interface KvSetParams {
  readonly key: string;
  readonly value: string;
}

export interface KvSetResult {
  readonly ok: true;
}

export interface KvGetParams {
  readonly key: string;
}

export interface KvGetResult {
  readonly value: string | null;
}

export interface ProjectsListResult {
  readonly projects: readonly ProjectRecord[];
}

export interface ProjectsCreateParams {
  readonly name: string;
  readonly rootPath: string;
  readonly defaultBranch?: string | undefined;
}

export interface ProjectsCreateResult {
  readonly project: ProjectRecord;
}

export interface AdaptersListResult {
  readonly adapters: readonly AdapterSummary[];
}

export interface TurnStartParams {
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly modelHandle: string;
  readonly prompt: string;
  readonly role?: AgentRole | undefined;
  readonly approvalMode?: ApprovalMode | undefined;
}

export interface TurnStartResult {
  readonly turnId: string;
  readonly sessionId: string;
}

export interface TurnCancelParams {
  readonly turnId: string;
}

export interface TurnCancelResult {
  readonly cancelled: boolean;
}

export type EmptyParams = Record<string, never>;

export interface DaemonMethodMap {
  'daemon.authenticate': {
    params: DaemonAuthenticateParams;
    result: DaemonAuthenticateResult;
  };
  'daemon.health': {
    params: EmptyParams;
    result: DaemonHealthResult;
  };
  'daemon.ping': {
    params: DaemonPingParams;
    result: DaemonPingResult;
  };
  'kv.set': {
    params: KvSetParams;
    result: KvSetResult;
  };
  'kv.get': {
    params: KvGetParams;
    result: KvGetResult;
  };
  'projects.list': {
    params: EmptyParams;
    result: ProjectsListResult;
  };
  'projects.create': {
    params: ProjectsCreateParams;
    result: ProjectsCreateResult;
  };
  'adapters.list': {
    params: EmptyParams;
    result: AdaptersListResult;
  };
  'turn.start': {
    params: TurnStartParams;
    result: TurnStartResult;
  };
  'turn.cancel': {
    params: TurnCancelParams;
    result: TurnCancelResult;
  };
}

export type DaemonMethod = keyof DaemonMethodMap;

export interface DaemonNotificationMap {
  'turn.event': TurnEventNotificationParams;
}

export type DaemonNotificationMethod = keyof DaemonNotificationMap;

export interface JsonRpcRequest<M extends DaemonMethod = DaemonMethod> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  readonly id: JsonRpcId;
  readonly method: M;
  readonly params: DaemonMethodMap[M]['params'];
}

export interface JsonRpcNotification<
  M extends DaemonNotificationMethod = DaemonNotificationMethod,
> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  readonly method: M;
  readonly params: DaemonNotificationMap[M];
}

export interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcSuccessResponse<M extends DaemonMethod = DaemonMethod> {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  readonly id: JsonRpcId;
  readonly result: DaemonMethodMap[M]['result'];
}

export interface JsonRpcErrorResponse {
  readonly jsonrpc: typeof JSONRPC_VERSION;
  readonly id: JsonRpcId | null;
  readonly error: JsonRpcErrorObject;
}

export type JsonRpcResponse<M extends DaemonMethod = DaemonMethod> =
  | JsonRpcSuccessResponse<M>
  | JsonRpcErrorResponse;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    value['jsonrpc'] === JSONRPC_VERSION &&
    isJsonRpcId(value['id']) &&
    typeof value['method'] === 'string' &&
    value['method'].length > 0 &&
    isPlainObject(value['params'])
  );
}

export function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    value['jsonrpc'] === JSONRPC_VERSION &&
    !('id' in value) &&
    typeof value['method'] === 'string' &&
    value['method'].length > 0 &&
    isPlainObject(value['params'])
  );
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value['jsonrpc'] !== JSONRPC_VERSION) {
    return false;
  }
  const id = value['id'];
  if (id !== null && !isJsonRpcId(id)) {
    return false;
  }
  const hasResult = 'result' in value;
  const hasError = 'error' in value;
  if (hasResult === hasError) {
    return false;
  }
  if (hasError) {
    const errorVal = value['error'];
    if (!isPlainObject(errorVal)) {
      return false;
    }
    return (
      typeof errorVal['code'] === 'number' &&
      Number.isInteger(errorVal['code']) &&
      typeof errorVal['message'] === 'string'
    );
  }
  return id !== null;
}

export function isJsonRpcErrorResponse(
  response: JsonRpcResponse,
): response is JsonRpcErrorResponse {
  return 'error' in response;
}
