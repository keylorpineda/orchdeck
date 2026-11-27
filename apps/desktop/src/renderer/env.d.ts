/// <reference types="vite/client" />

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

export interface PickDirectoryResult {
  readonly canceled: boolean;
  readonly directoryPath: string | null;
}

export interface OrchdeckApi {
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

declare global {
  interface Window {
    readonly orchdeck?: OrchdeckApi;
  }
}
