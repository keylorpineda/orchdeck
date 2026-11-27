import type {
  AdapterSummary,
  AgentRole,
  ApprovalMode,
  ProviderId,
  TurnEventNotificationParams,
} from './adapter.js';
import type {
  RecipeRecord,
  RecipeRunRecord,
  RecipeRunUpdatedNotificationParams,
} from './fusion.js';
import type {
  McpApprovalRequiredNotificationParams,
  McpDecideApprovalParams,
  McpDecideApprovalResult,
  McpStatusParams,
  McpStatusResult,
  PluginsInspectParams,
  PluginsInspectResult,
  PluginsToggleParams,
  PluginsToggleResult,
  SkillsToggleParams,
  SkillsToggleResult,
} from './plugins-mcp.js';
import type {
  SecondOpinionRecord,
  SecondOpinionResolution,
  SecondOpinionUpdatedNotificationParams,
} from './second-opinion.js';
import type {
  TaskRunRecord,
  TaskRunUpdatedNotificationParams,
  UsageSummaryResult,
} from './task-run.js';

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
  readonly worktreeAllowlist?: readonly string[] | undefined;
  readonly worktreeSetupCommand?: string | null | undefined;
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
  readonly worktreePath?: string | null | undefined;
  readonly worktreeBranch?: string | null | undefined;
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
  readonly worktreeAllowlist?: readonly string[] | undefined;
  readonly worktreeSetupCommand?: string | null | undefined;
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
  readonly chatId?: string | undefined;
}

export interface ChangesInspectResult {
  readonly snapshot: ChangeCardSnapshot;
}

export interface ChangesRunTestsParams {
  readonly projectId: string;
  readonly chatId?: string | undefined;
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
  readonly chatId?: string | undefined;
  readonly commitMessage: string;
  readonly branchSlug?: string | undefined;
}

export interface ChangesApproveResult {
  readonly branch: string;
  readonly commitSha: string;
}

export interface ChangesDiscardParams {
  readonly projectId: string;
  readonly chatId?: string | undefined;
}

export interface ChangesDiscardResult {
  readonly discarded: boolean;
  readonly stashCreated: boolean;
  readonly stashRef: string | null;
}

export interface TaskRunStartParams {
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly modelHandle: string;
  readonly prompt: string;
  readonly mode: ApprovalMode;
}

export interface TaskRunStartResult {
  readonly taskRun: TaskRunRecord;
}

export interface TaskRunActionParams {
  readonly taskRunId: string;
}

export interface TaskRunActionResult {
  readonly taskRun: TaskRunRecord;
}

export interface TaskRunGetResult {
  readonly taskRun: TaskRunRecord | null;
}

export interface UsageSummaryParams {
  readonly providerId?: ProviderId | undefined;
  readonly includeLocalLogs?: boolean | undefined;
}

export interface RecipesListResult {
  readonly recipes: readonly RecipeRecord[];
}

export interface RecipeCreateParams {
  readonly name: string;
  readonly description: string;
  readonly plannerModel: string;
  readonly builderModel: string;
  readonly reviewerModel: string;
  readonly fallbackModel?: string | null | undefined;
  readonly maxReviewRetries?: number | undefined;
}

export interface RecipeCreateResult {
  readonly recipe: RecipeRecord;
}

export interface RecipeUpdateParams {
  readonly id: string;
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly plannerModel?: string | undefined;
  readonly builderModel?: string | undefined;
  readonly reviewerModel?: string | undefined;
  readonly fallbackModel?: string | null | undefined;
  readonly maxReviewRetries?: number | undefined;
}

export interface RecipeUpdateResult {
  readonly recipe: RecipeRecord;
}

export interface RecipeDeleteParams {
  readonly id: string;
}

export interface RecipeDeleteResult {
  readonly deleted: boolean;
}

export interface RecipeRunStartParams {
  readonly recipeId: string;
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly prompt: string;
}

export interface RecipeRunStartResult {
  readonly recipeRun: RecipeRunRecord;
}

export interface RecipeRunGetParams {
  readonly recipeRunId: string;
}

export interface RecipeRunGetResult {
  readonly recipeRun: RecipeRunRecord | null;
}

export interface HandoffRelayParams {
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly targetModelHandle: string;
  readonly goal: string;
  readonly decisions?: readonly string[] | undefined;
  readonly nextStep: string;
  readonly sourceModelHandle?: string | undefined;
  readonly latestTestOutput?: string | undefined;
  readonly reason?: string | undefined;
}

export interface HandoffRelayResult {
  readonly handoffPath: string;
  readonly turnId: string;
  readonly sessionId: string;
  readonly targetModelHandle: string;
}

export interface ChangesIntegrateBranchParams {
  readonly projectId: string;
  readonly chatId?: string | undefined;
  readonly targetBranch?: string | undefined;
  readonly strategy?: 'merge' | 'squash' | undefined;
  readonly commitMessage?: string | undefined;
}

export interface ChangesIntegrateBranchResult {
  readonly integrated: boolean;
  readonly targetBranch: string;
  readonly sourceBranch: string;
  readonly commitSha: string | null;
  readonly conflictDetected: boolean;
  readonly message: string;
}

export interface SecondOpinionStartParams {
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly prompt: string;
  readonly modelAHandle: string;
  readonly modelBHandle: string;
}

export interface SecondOpinionStartResult {
  readonly secondOpinion: SecondOpinionRecord;
}

export interface SecondOpinionGetParams {
  readonly secondOpinionId: string;
}

export interface SecondOpinionGetResult {
  readonly secondOpinion: SecondOpinionRecord | null;
}

export interface SecondOpinionResolveParams {
  readonly secondOpinionId: string;
  readonly resolution: SecondOpinionResolution;
}

export interface SecondOpinionResolveResult {
  readonly secondOpinion: SecondOpinionRecord;
}

export interface WorktreeInfo {
  readonly worktreePath: string;
  readonly branch: string | null;
  readonly headSha: string | null;
  readonly isMain: boolean;
  readonly isOrphan: boolean;
}

export interface WorktreesCreateParams {
  readonly projectId: string;
  readonly chatId: string;
  readonly branchSlug?: string | undefined;
}

export interface WorktreesCreateResult {
  readonly chat: ChatRecord;
  readonly worktreePath: string;
  readonly branch: string;
}

export interface WorktreesListParams {
  readonly projectId: string;
}

export interface WorktreesListResult {
  readonly worktrees: readonly WorktreeInfo[];
}

export interface WorktreesRemoveParams {
  readonly projectId: string;
  readonly chatId: string;
}

export interface WorktreesRemoveResult {
  readonly removed: boolean;
  readonly chat: ChatRecord;
}

export interface WorktreesPruneParams {
  readonly projectId: string;
}

export interface WorktreesPruneResult {
  readonly prunedCount: number;
  readonly prunedPaths: readonly string[];
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
  'taskRun.start': {
    params: TaskRunStartParams;
    result: TaskRunStartResult;
  };
  'taskRun.approvePlan': {
    params: TaskRunActionParams;
    result: TaskRunActionResult;
  };
  'taskRun.rejectPlan': {
    params: TaskRunActionParams;
    result: TaskRunActionResult;
  };
  'taskRun.get': {
    params: TaskRunActionParams;
    result: TaskRunGetResult;
  };
  'usage.summary': {
    params: UsageSummaryParams;
    result: UsageSummaryResult;
  };
  'recipes.list': {
    params: EmptyParams;
    result: RecipesListResult;
  };
  'recipes.create': {
    params: RecipeCreateParams;
    result: RecipeCreateResult;
  };
  'recipes.update': {
    params: RecipeUpdateParams;
    result: RecipeUpdateResult;
  };
  'recipes.delete': {
    params: RecipeDeleteParams;
    result: RecipeDeleteResult;
  };
  'recipes.run': {
    params: RecipeRunStartParams;
    result: RecipeRunStartResult;
  };
  'recipes.getRun': {
    params: RecipeRunGetParams;
    result: RecipeRunGetResult;
  };
  'handoff.relay': {
    params: HandoffRelayParams;
    result: HandoffRelayResult;
  };
  'changes.integrateBranch': {
    params: ChangesIntegrateBranchParams;
    result: ChangesIntegrateBranchResult;
  };
  'secondOpinion.start': {
    params: SecondOpinionStartParams;
    result: SecondOpinionStartResult;
  };
  'secondOpinion.get': {
    params: SecondOpinionGetParams;
    result: SecondOpinionGetResult;
  };
  'secondOpinion.resolve': {
    params: SecondOpinionResolveParams;
    result: SecondOpinionResolveResult;
  };
  'worktrees.create': {
    params: WorktreesCreateParams;
    result: WorktreesCreateResult;
  };
  'worktrees.list': {
    params: WorktreesListParams;
    result: WorktreesListResult;
  };
  'worktrees.remove': {
    params: WorktreesRemoveParams;
    result: WorktreesRemoveResult;
  };
  'worktrees.prune': {
    params: WorktreesPruneParams;
    result: WorktreesPruneResult;
  };
  'plugins.inspect': {
    params: PluginsInspectParams;
    result: PluginsInspectResult;
  };
  'plugins.toggle': {
    params: PluginsToggleParams;
    result: PluginsToggleResult;
  };
  'skills.toggle': {
    params: SkillsToggleParams;
    result: SkillsToggleResult;
  };
  'mcp.status': {
    params: McpStatusParams;
    result: McpStatusResult;
  };
  'mcp.decideApproval': {
    params: McpDecideApprovalParams;
    result: McpDecideApprovalResult;
  };
}

export type DaemonMethod = keyof DaemonMethodMap;

export interface DaemonNotificationMap {
  'turn.event': TurnEventNotificationParams;
  'taskRun.updated': TaskRunUpdatedNotificationParams;
  'recipeRun.updated': RecipeRunUpdatedNotificationParams;
  'secondOpinion.updated': SecondOpinionUpdatedNotificationParams;
  'mcp.approvalRequired': McpApprovalRequiredNotificationParams;
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

export type DaemonNotification = {
  readonly [M in DaemonNotificationMethod]: JsonRpcNotification<M>;
}[DaemonNotificationMethod];

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
