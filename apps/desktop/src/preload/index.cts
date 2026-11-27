import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AdaptersListResult,
  ChangesApproveParams,
  ChangesApproveResult,
  ChangesDiscardResult,
  ChangesInspectResult,
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
  inspectChanges(projectId: string): Promise<ChangesInspectResult>;
  runProjectTests(projectId: string): Promise<ChangesRunTestsResult>;
  approveChanges(params: ChangesApproveParams): Promise<ChangesApproveResult>;
  discardChanges(projectId: string): Promise<ChangesDiscardResult>;
  startTaskRun(params: TaskRunStartParams): Promise<TaskRunStartResult>;
  approveTaskRunPlan(taskRunId: string): Promise<TaskRunActionResult>;
  rejectTaskRunPlan(taskRunId: string): Promise<TaskRunActionResult>;
  getUsageSummary(providerId?: ProviderId): Promise<UsageSummaryResult>;
  onTurnEvent(listener: (event: TurnEventNotificationParams) => void): () => void;
  onTaskRunUpdated(listener: (event: TaskRunUpdatedNotificationParams) => void): () => void;
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
  inspectChanges: (projectId: string) =>
    ipcRenderer.invoke('orchdeck:changes-inspect', projectId) as Promise<ChangesInspectResult>,
  runProjectTests: (projectId: string) =>
    ipcRenderer.invoke('orchdeck:changes-run-tests', projectId) as Promise<ChangesRunTestsResult>,
  approveChanges: (params: ChangesApproveParams) =>
    ipcRenderer.invoke('orchdeck:changes-approve', params) as Promise<ChangesApproveResult>,
  discardChanges: (projectId: string) =>
    ipcRenderer.invoke('orchdeck:changes-discard', projectId) as Promise<ChangesDiscardResult>,
  startTaskRun: (params: TaskRunStartParams) =>
    ipcRenderer.invoke('orchdeck:task-run-start', params) as Promise<TaskRunStartResult>,
  approveTaskRunPlan: (taskRunId: string) =>
    ipcRenderer.invoke('orchdeck:task-run-approve-plan', taskRunId) as Promise<TaskRunActionResult>,
  rejectTaskRunPlan: (taskRunId: string) =>
    ipcRenderer.invoke('orchdeck:task-run-reject-plan', taskRunId) as Promise<TaskRunActionResult>,
  getUsageSummary: (providerId?: ProviderId) =>
    ipcRenderer.invoke('orchdeck:usage-summary', providerId) as Promise<UsageSummaryResult>,
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
};

contextBridge.exposeInMainWorld('orchdeck', bridge);
