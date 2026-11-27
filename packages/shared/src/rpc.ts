import type {
  AdapterSummary,
  AgentRole,
  ApprovalMode,
  ProviderId,
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
  readonly testCommand: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectWithGitStatus extends ProjectRecord {
  readonly currentBranch: string | null;
  readonly isClean: boolean | null;
  readonly isValidGitRepo: boolean;
  readonly changedFileCount: number;
}

export interface ChatRecord {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageRecord {
  readonly id: string;
  readonly chatId: string;
  readonly role: MessageRole;
  readonly providerId: ProviderId | null;
  readonly modelId: string | null;
  readonly content: string;
  readonly createdAt: string;
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
  readonly projects: readonly ProjectWithGitStatus[];
}

export interface ProjectsCreateParams {
  readonly name?: string | undefined;
  readonly rootPath: string;
  readonly defaultBranch?: string | undefined;
  readonly testCommand?: string | null | undefined;
}

export interface ProjectsCreateResult {
  readonly project: ProjectWithGitStatus;
}

export interface ProjectsUpdateParams {
  readonly id: string;
  readonly name?: string | undefined;
  readonly testCommand?: string | null | undefined;
}

export interface ProjectsUpdateResult {
  readonly project: ProjectWithGitStatus;
}

export interface ProjectsDeleteParams {
  readonly id: string;
}

export interface ProjectsDeleteResult {
  readonly deleted: boolean;
}

export interface ChatsListParams {
  readonly projectId: string;
  readonly includeArchived?: boolean | undefined;
}

export interface ChatsListResult {
  readonly chats: readonly ChatRecord[];
}

export interface ChatsCreateParams {
  readonly projectId: string;
  readonly title?: string | undefined;
}

export interface ChatsCreateResult {
  readonly chat: ChatRecord;
}

export interface ChatsRenameParams {
  readonly id: string;
  readonly title: string;
}

export interface ChatsRenameResult {
  readonly chat: ChatRecord;
}

export interface ChatsArchiveParams {
  readonly id: string;
  readonly archived: boolean;
}

export interface ChatsArchiveResult {
  readonly chat: ChatRecord;
}

export interface ChatsDeleteParams {
  readonly id: string;
}

export interface ChatsDeleteResult {
  readonly deleted: boolean;
}

export interface MessagesListParams {
  readonly chatId: string;
}

export interface MessagesListResult {
  readonly messages: readonly MessageRecord[];
}

export interface MessagesAppendParams {
  readonly chatId: string;
  readonly role: MessageRole;
  readonly providerId?: ProviderId | null | undefined;
  readonly modelId?: string | null | undefined;
  readonly content: string;
}

export interface MessagesAppendResult {
  readonly message: MessageRecord;
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

export type ChangeFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';

export interface ChangedFileStat {
  readonly path: string;
  readonly status: ChangeFileStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly isBinary: boolean;
  readonly diff: string;
}

export interface ChangeCardSnapshot {
  readonly branch: string;
  readonly isClean: boolean;
  readonly totalAdditions: number;
  readonly totalDeletions: number;
  readonly files: readonly ChangedFileStat[];
  readonly isTruncated: boolean;
}

export interface ChangesInspectParams {
  readonly projectId: string;
}

export interface ChangesInspectResult {
  readonly snapshot: ChangeCardSnapshot;
}

export interface ChangesRunTestsParams {
  readonly projectId: string;
}

export interface TestRunResult {
  readonly command: string;
  readonly exitCode: number | null;
  readonly passed: boolean;
  readonly timedOut: boolean;
  readonly durationMs: number;
  readonly output: string;
}

export interface ChangesRunTestsResult {
  readonly result: TestRunResult;
}

export interface ChangesApproveParams {
  readonly projectId: string;
  readonly commitMessage: string;
  readonly branchSlug?: string | undefined;
}

export interface ChangesApproveResult {
  readonly branch: string;
  readonly commitSha: string;
}

export interface ChangesDiscardParams {
  readonly projectId: string;
}

export interface ChangesDiscardResult {
  readonly discarded: boolean;
  readonly stashCreated: boolean;
  readonly stashRef: string | null;
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
  'projects.update': {
    params: ProjectsUpdateParams;
    result: ProjectsUpdateResult;
  };
  'projects.delete': {
    params: ProjectsDeleteParams;
    result: ProjectsDeleteResult;
  };
  'chats.list': {
    params: ChatsListParams;
    result: ChatsListResult;
  };
  'chats.create': {
    params: ChatsCreateParams;
    result: ChatsCreateResult;
  };
  'chats.rename': {
    params: ChatsRenameParams;
    result: ChatsRenameResult;
  };
  'chats.archive': {
    params: ChatsArchiveParams;
    result: ChatsArchiveResult;
  };
  'chats.delete': {
    params: ChatsDeleteParams;
    result: ChatsDeleteResult;
  };
  'messages.list': {
    params: MessagesListParams;
    result: MessagesListResult;
  };
  'messages.append': {
    params: MessagesAppendParams;
    result: MessagesAppendResult;
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
  'changes.inspect': {
    params: ChangesInspectParams;
    result: ChangesInspectResult;
  };
  'changes.runTests': {
    params: ChangesRunTestsParams;
    result: ChangesRunTestsResult;
  };
  'changes.approve': {
    params: ChangesApproveParams;
    result: ChangesApproveResult;
  };
  'changes.discard': {
    params: ChangesDiscardParams;
    result: ChangesDiscardResult;
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
