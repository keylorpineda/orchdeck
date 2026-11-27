import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AdaptersListResult,
  ChangesApproveParams,
  ChangesApproveResult,
  ChangesDiscardResult,
  ChangesInspectResult,
  ChangesIntegrateBranchParams,
  ChangesIntegrateBranchResult,
  ChangesRunTestsResult,
  ChatsArchiveParams,
  ChatsArchiveResult,
  ChatsCreateParams,
  ChatsCreateResult,
  ChatsDeleteResult,
  ChatsListParams,
  ChatsListResult,
  ChatsRenameParams,
  ChatsRenameResult,
  DaemonHealthResult,
  HandoffRelayParams,
  HandoffRelayResult,
  KvGetResult,
  KvSetResult,
  McpApprovalRequiredNotificationParams,
  McpDecideApprovalParams,
  McpDecideApprovalResult,
  McpStatusParams,
  McpStatusResult,
  MemoryDeleteResult,
  MemoryImportDocParams,
  MemoryImportDocResult,
  MemoryListResult,
  MemoryProposeFromChangeParams,
  MemoryProposeFromChangeResult,
  MemorySyncDocParams,
  MemorySyncDocResult,
  MemoryUpsertParams,
  MemoryUpsertResult,
  MessagesAppendParams,
  MessagesAppendResult,
  MessagesListResult,
  PluginsInspectParams,
  PluginsInspectResult,
  PluginsToggleParams,
  PluginsToggleResult,
  ProjectsCreateParams,
  ProjectsCreateResult,
  ProjectsDeleteResult,
  ProjectsListResult,
  ProjectsUpdateParams,
  ProjectsUpdateResult,
  ProviderId,
  RecipeCreateParams,
  RecipeCreateResult,
  RecipeDeleteResult,
  RecipeRunStartParams,
  RecipeRunStartResult,
  RecipeRunUpdatedNotificationParams,
  RecipeUpdateParams,
  RecipeUpdateResult,
  RecipesListResult,
  SecondOpinionResolveParams,
  SecondOpinionResolveResult,
  SecondOpinionStartParams,
  SecondOpinionStartResult,
  SecondOpinionUpdatedNotificationParams,
  SkillsToggleParams,
  SkillsToggleResult,
  TaskRunActionResult,
  TaskRunStartParams,
  TaskRunStartResult,
  TaskRunUpdatedNotificationParams,
  TurnCancelResult,
  TurnEventNotificationParams,
  TurnStartParams,
  TurnStartResult,
  UsageSummaryParams,
  UsageSummaryResult,
  WorktreesCreateParams,
  WorktreesCreateResult,
  WorktreesListResult,
  WorktreesPruneResult,
  WorktreesRemoveParams,
  WorktreesRemoveResult,
} from '@orchdeck/shared';

interface PickDirectoryResult {
  readonly canceled: boolean;
  readonly directoryPath: string | null;
}

interface OrchdeckBridge {
  health(): Promise<DaemonHealthResult>;
  getKv(key: string): Promise<KvGetResult>;
  setKv(key: string, value: string): Promise<KvSetResult>;
  pickDirectory(): Promise<PickDirectoryResult>;
  listProjects(): Promise<ProjectsListResult>;
  createProject(params: ProjectsCreateParams): Promise<ProjectsCreateResult>;
  updateProject(params: ProjectsUpdateParams): Promise<ProjectsUpdateResult>;
  deleteProject(id: string): Promise<ProjectsDeleteResult>;
  listChats(params: ChatsListParams): Promise<ChatsListResult>;
  createChat(params: ChatsCreateParams): Promise<ChatsCreateResult>;
  renameChat(params: ChatsRenameParams): Promise<ChatsRenameResult>;
  archiveChat(params: ChatsArchiveParams): Promise<ChatsArchiveResult>;
  deleteChat(id: string): Promise<ChatsDeleteResult>;
  listMessages(chatId: string): Promise<MessagesListResult>;
  appendMessage(params: MessagesAppendParams): Promise<MessagesAppendResult>;
  listAdapters(): Promise<AdaptersListResult>;
  startTurn(params: TurnStartParams): Promise<TurnStartResult>;
  cancelTurn(turnId: string): Promise<TurnCancelResult>;
  inspectChanges(projectId: string, chatId?: string): Promise<ChangesInspectResult>;
  runProjectTests(projectId: string, chatId?: string): Promise<ChangesRunTestsResult>;
  approveChanges(params: ChangesApproveParams): Promise<ChangesApproveResult>;
  discardChanges(projectId: string, chatId?: string): Promise<ChangesDiscardResult>;
  startTaskRun(params: TaskRunStartParams): Promise<TaskRunStartResult>;
  approveTaskRunPlan(taskRunId: string): Promise<TaskRunActionResult>;
  rejectTaskRunPlan(taskRunId: string): Promise<TaskRunActionResult>;
  getUsageSummary(params?: UsageSummaryParams): Promise<UsageSummaryResult>;
  listRecipes(): Promise<RecipesListResult>;
  createRecipe(params: RecipeCreateParams): Promise<RecipeCreateResult>;
  updateRecipe(params: RecipeUpdateParams): Promise<RecipeUpdateResult>;
  deleteRecipe(id: string): Promise<RecipeDeleteResult>;
  runRecipe(params: RecipeRunStartParams): Promise<RecipeRunStartResult>;
  relayHandoff(params: HandoffRelayParams): Promise<HandoffRelayResult>;
  integrateBranch(params: ChangesIntegrateBranchParams): Promise<ChangesIntegrateBranchResult>;
  startSecondOpinion(params: SecondOpinionStartParams): Promise<SecondOpinionStartResult>;
  resolveSecondOpinion(params: SecondOpinionResolveParams): Promise<SecondOpinionResolveResult>;
  createWorktree(params: WorktreesCreateParams): Promise<WorktreesCreateResult>;
  listWorktrees(projectId: string): Promise<WorktreesListResult>;
  removeWorktree(params: WorktreesRemoveParams): Promise<WorktreesRemoveResult>;
  pruneWorktrees(projectId: string): Promise<WorktreesPruneResult>;
  inspectPlugins(params?: PluginsInspectParams): Promise<PluginsInspectResult>;
  togglePlugin(params: PluginsToggleParams): Promise<PluginsToggleResult>;
  toggleSkill(params: SkillsToggleParams): Promise<SkillsToggleResult>;
  getMcpStatus(params?: McpStatusParams): Promise<McpStatusResult>;
  decideMcpApproval(params: McpDecideApprovalParams): Promise<McpDecideApprovalResult>;
  listProjectMemory(projectId: string): Promise<MemoryListResult>;
  upsertProjectMemory(params: MemoryUpsertParams): Promise<MemoryUpsertResult>;
  deleteProjectMemory(id: string): Promise<MemoryDeleteResult>;
  proposeMemoryFromChange(
    params: MemoryProposeFromChangeParams,
  ): Promise<MemoryProposeFromChangeResult>;
  syncMemoryDoc(params: MemorySyncDocParams): Promise<MemorySyncDocResult>;
  importMemoryDoc(params: MemoryImportDocParams): Promise<MemoryImportDocResult>;
  onMcpApprovalRequired(listener: (event: McpApprovalRequiredNotificationParams) => void): () => void;
  onTurnEvent(listener: (event: TurnEventNotificationParams) => void): () => void;
  onTaskRunUpdated(listener: (event: TaskRunUpdatedNotificationParams) => void): () => void;
  onRecipeRunUpdated(listener: (event: RecipeRunUpdatedNotificationParams) => void): () => void;
  onSecondOpinionUpdated(listener: (event: SecondOpinionUpdatedNotificationParams) => void): () => void;
}

const bridge: OrchdeckBridge = {
  health: () => ipcRenderer.invoke('orchdeck:health') as Promise<DaemonHealthResult>,
  getKv: (key: string) => ipcRenderer.invoke('orchdeck:kv-get', key) as Promise<KvGetResult>,
  setKv: (key: string, value: string) =>
    ipcRenderer.invoke('orchdeck:kv-set', key, value) as Promise<KvSetResult>,
  pickDirectory: () => ipcRenderer.invoke('orchdeck:dialog-pick-directory') as Promise<PickDirectoryResult>,
  listProjects: () => ipcRenderer.invoke('orchdeck:projects-list') as Promise<ProjectsListResult>,
  createProject: (params: ProjectsCreateParams) =>
    ipcRenderer.invoke('orchdeck:projects-create', params) as Promise<ProjectsCreateResult>,
  updateProject: (params: ProjectsUpdateParams) =>
    ipcRenderer.invoke('orchdeck:projects-update', params) as Promise<ProjectsUpdateResult>,
  deleteProject: (id: string) =>
    ipcRenderer.invoke('orchdeck:projects-delete', id) as Promise<ProjectsDeleteResult>,
  listChats: (params: ChatsListParams) =>
    ipcRenderer.invoke('orchdeck:chats-list', params) as Promise<ChatsListResult>,
  createChat: (params: ChatsCreateParams) =>
    ipcRenderer.invoke('orchdeck:chats-create', params) as Promise<ChatsCreateResult>,
  renameChat: (params: ChatsRenameParams) =>
    ipcRenderer.invoke('orchdeck:chats-rename', params) as Promise<ChatsRenameResult>,
  archiveChat: (params: ChatsArchiveParams) =>
    ipcRenderer.invoke('orchdeck:chats-archive', params) as Promise<ChatsArchiveResult>,
  deleteChat: (id: string) =>
    ipcRenderer.invoke('orchdeck:chats-delete', id) as Promise<ChatsDeleteResult>,
  listMessages: (chatId: string) =>
    ipcRenderer.invoke('orchdeck:messages-list', chatId) as Promise<MessagesListResult>,
  appendMessage: (params: MessagesAppendParams) =>
    ipcRenderer.invoke('orchdeck:messages-append', params) as Promise<MessagesAppendResult>,
  listAdapters: () => ipcRenderer.invoke('orchdeck:adapters-list') as Promise<AdaptersListResult>,
  startTurn: (params: TurnStartParams) =>
    ipcRenderer.invoke('orchdeck:turn-start', params) as Promise<TurnStartResult>,
  cancelTurn: (turnId: string) =>
    ipcRenderer.invoke('orchdeck:turn-cancel', turnId) as Promise<TurnCancelResult>,
  inspectChanges: (projectId: string, chatId?: string) =>
    ipcRenderer.invoke('orchdeck:changes-inspect', { projectId, chatId }) as Promise<ChangesInspectResult>,
  runProjectTests: (projectId: string, chatId?: string) =>
    ipcRenderer.invoke('orchdeck:changes-run-tests', { projectId, chatId }) as Promise<ChangesRunTestsResult>,
  approveChanges: (params: ChangesApproveParams) =>
    ipcRenderer.invoke('orchdeck:changes-approve', params) as Promise<ChangesApproveResult>,
  discardChanges: (projectId: string, chatId?: string) =>
    ipcRenderer.invoke('orchdeck:changes-discard', { projectId, chatId }) as Promise<ChangesDiscardResult>,
  startTaskRun: (params: TaskRunStartParams) =>
    ipcRenderer.invoke('orchdeck:task-run-start', params) as Promise<TaskRunStartResult>,
  approveTaskRunPlan: (taskRunId: string) =>
    ipcRenderer.invoke('orchdeck:task-run-approve-plan', taskRunId) as Promise<TaskRunActionResult>,
  rejectTaskRunPlan: (taskRunId: string) =>
    ipcRenderer.invoke('orchdeck:task-run-reject-plan', taskRunId) as Promise<TaskRunActionResult>,
  getUsageSummary: (params?: UsageSummaryParams) =>
    ipcRenderer.invoke('orchdeck:usage-summary', params ?? {}) as Promise<UsageSummaryResult>,
  listRecipes: () => ipcRenderer.invoke('orchdeck:recipes-list') as Promise<RecipesListResult>,
  createRecipe: (params: RecipeCreateParams) =>
    ipcRenderer.invoke('orchdeck:recipes-create', params) as Promise<RecipeCreateResult>,
  updateRecipe: (params: RecipeUpdateParams) =>
    ipcRenderer.invoke('orchdeck:recipes-update', params) as Promise<RecipeUpdateResult>,
  deleteRecipe: (id: string) =>
    ipcRenderer.invoke('orchdeck:recipes-delete', id) as Promise<RecipeDeleteResult>,
  runRecipe: (params: RecipeRunStartParams) =>
    ipcRenderer.invoke('orchdeck:recipes-run', params) as Promise<RecipeRunStartResult>,
  relayHandoff: (params: HandoffRelayParams) =>
    ipcRenderer.invoke('orchdeck:handoff-relay', params) as Promise<HandoffRelayResult>,
  integrateBranch: (params: ChangesIntegrateBranchParams) =>
    ipcRenderer.invoke(
      'orchdeck:changes-integrate-branch',
      params,
    ) as Promise<ChangesIntegrateBranchResult>,
  startSecondOpinion: (params: SecondOpinionStartParams) =>
    ipcRenderer.invoke('orchdeck:second-opinion-start', params) as Promise<SecondOpinionStartResult>,
  resolveSecondOpinion: (params: SecondOpinionResolveParams) =>
    ipcRenderer.invoke(
      'orchdeck:second-opinion-resolve',
      params,
    ) as Promise<SecondOpinionResolveResult>,
  createWorktree: (params: WorktreesCreateParams) =>
    ipcRenderer.invoke('orchdeck:worktrees-create', params) as Promise<WorktreesCreateResult>,
  listWorktrees: (projectId: string) =>
    ipcRenderer.invoke('orchdeck:worktrees-list', projectId) as Promise<WorktreesListResult>,
  removeWorktree: (params: WorktreesRemoveParams) =>
    ipcRenderer.invoke('orchdeck:worktrees-remove', params) as Promise<WorktreesRemoveResult>,
  pruneWorktrees: (projectId: string) =>
    ipcRenderer.invoke('orchdeck:worktrees-prune', projectId) as Promise<WorktreesPruneResult>,
  inspectPlugins: (params?: PluginsInspectParams) =>
    ipcRenderer.invoke('orchdeck:plugins-inspect', params ?? {}) as Promise<PluginsInspectResult>,
  togglePlugin: (params: PluginsToggleParams) =>
    ipcRenderer.invoke('orchdeck:plugins-toggle', params) as Promise<PluginsToggleResult>,
  toggleSkill: (params: SkillsToggleParams) =>
    ipcRenderer.invoke('orchdeck:skills-toggle', params) as Promise<SkillsToggleResult>,
  getMcpStatus: (params?: McpStatusParams) =>
    ipcRenderer.invoke('orchdeck:mcp-status', params ?? {}) as Promise<McpStatusResult>,
  decideMcpApproval: (params: McpDecideApprovalParams) =>
    ipcRenderer.invoke(
      'orchdeck:mcp-decide-approval',
      params,
    ) as Promise<McpDecideApprovalResult>,
  listProjectMemory: (projectId: string) =>
    ipcRenderer.invoke('orchdeck:memory-list', projectId) as Promise<MemoryListResult>,
  upsertProjectMemory: (params: MemoryUpsertParams) =>
    ipcRenderer.invoke('orchdeck:memory-upsert', params) as Promise<MemoryUpsertResult>,
  deleteProjectMemory: (id: string) =>
    ipcRenderer.invoke('orchdeck:memory-delete', id) as Promise<MemoryDeleteResult>,
  proposeMemoryFromChange: (params: MemoryProposeFromChangeParams) =>
    ipcRenderer.invoke(
      'orchdeck:memory-propose-from-change',
      params,
    ) as Promise<MemoryProposeFromChangeResult>,
  syncMemoryDoc: (params: MemorySyncDocParams) =>
    ipcRenderer.invoke('orchdeck:memory-sync-doc', params) as Promise<MemorySyncDocResult>,
  importMemoryDoc: (params: MemoryImportDocParams) =>
    ipcRenderer.invoke('orchdeck:memory-import-doc', params) as Promise<MemoryImportDocResult>,
  onMcpApprovalRequired: (listener: (event: McpApprovalRequiredNotificationParams) => void) => {
    const handler = (
      _ipcEvent: IpcRendererEvent,
      payload: McpApprovalRequiredNotificationParams,
    ): void => {
      listener(payload);
    };
    ipcRenderer.on('orchdeck:mcp-approval-required', handler);
    return () => {
      ipcRenderer.off('orchdeck:mcp-approval-required', handler);
    };
  },
  onTurnEvent: (listener: (event: TurnEventNotificationParams) => void) => {
    const handler = (_ipcEvent: IpcRendererEvent, payload: TurnEventNotificationParams): void => {
      listener(payload);
    };
    ipcRenderer.on('orchdeck:turn-event', handler);
    return () => {
      ipcRenderer.off('orchdeck:turn-event', handler);
    };
  },
  onTaskRunUpdated: (listener: (event: TaskRunUpdatedNotificationParams) => void) => {
    const handler = (
      _ipcEvent: IpcRendererEvent,
      payload: TaskRunUpdatedNotificationParams,
    ): void => {
      listener(payload);
    };
    ipcRenderer.on('orchdeck:task-run-updated', handler);
    return () => {
      ipcRenderer.off('orchdeck:task-run-updated', handler);
    };
  },
  onRecipeRunUpdated: (listener: (event: RecipeRunUpdatedNotificationParams) => void) => {
    const handler = (
      _ipcEvent: IpcRendererEvent,
      payload: RecipeRunUpdatedNotificationParams,
    ): void => {
      listener(payload);
    };
    ipcRenderer.on('orchdeck:recipe-run-updated', handler);
    return () => {
      ipcRenderer.off('orchdeck:recipe-run-updated', handler);
    };
  },
  onSecondOpinionUpdated: (listener: (event: SecondOpinionUpdatedNotificationParams) => void) => {
    const handler = (
      _ipcEvent: IpcRendererEvent,
      payload: SecondOpinionUpdatedNotificationParams,
    ): void => {
      listener(payload);
    };
    ipcRenderer.on('orchdeck:second-opinion-updated', handler);
    return () => {
      ipcRenderer.off('orchdeck:second-opinion-updated', handler);
    };
  },
};

contextBridge.exposeInMainWorld('orchdeck', bridge);
