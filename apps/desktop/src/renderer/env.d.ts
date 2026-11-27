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
  MessagesAppendParams,
  MessagesAppendResult,
  MessagesListResult,
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
  TaskRunActionResult,
  TaskRunStartParams,
  TaskRunStartResult,
  TaskRunUpdatedNotificationParams,
  TurnCancelResult,
  TurnEventNotificationParams,
  TurnStartParams,
  TurnStartResult,
  UsageSummaryResult,
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
  inspectChanges(projectId: string): Promise<ChangesInspectResult>;
  runProjectTests(projectId: string): Promise<ChangesRunTestsResult>;
  approveChanges(params: ChangesApproveParams): Promise<ChangesApproveResult>;
  discardChanges(projectId: string): Promise<ChangesDiscardResult>;
  startTaskRun(params: TaskRunStartParams): Promise<TaskRunStartResult>;
  approveTaskRunPlan(taskRunId: string): Promise<TaskRunActionResult>;
  rejectTaskRunPlan(taskRunId: string): Promise<TaskRunActionResult>;
  getUsageSummary(providerId?: ProviderId): Promise<UsageSummaryResult>;
  listRecipes(): Promise<RecipesListResult>;
  createRecipe(params: RecipeCreateParams): Promise<RecipeCreateResult>;
  updateRecipe(params: RecipeUpdateParams): Promise<RecipeUpdateResult>;
  deleteRecipe(id: string): Promise<RecipeDeleteResult>;
  runRecipe(params: RecipeRunStartParams): Promise<RecipeRunStartResult>;
  relayHandoff(params: HandoffRelayParams): Promise<HandoffRelayResult>;
  integrateBranch(params: ChangesIntegrateBranchParams): Promise<ChangesIntegrateBranchResult>;
  startSecondOpinion(params: SecondOpinionStartParams): Promise<SecondOpinionStartResult>;
  resolveSecondOpinion(params: SecondOpinionResolveParams): Promise<SecondOpinionResolveResult>;
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
