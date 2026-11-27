import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AdaptersListResult,
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
  TurnCancelResult,
  TurnEventNotificationParams,
  TurnStartParams,
  TurnStartResult,
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
  onTurnEvent(listener: (event: TurnEventNotificationParams) => void): () => void;
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
  onTurnEvent: (listener: (event: TurnEventNotificationParams) => void) => {
    const handler = (_ipcEvent: IpcRendererEvent, payload: TurnEventNotificationParams): void => {
      listener(payload);
    };
    ipcRenderer.on('orchdeck:turn-event', handler);
    return () => {
      ipcRenderer.off('orchdeck:turn-event', handler);
    };
  },
};

contextBridge.exposeInMainWorld('orchdeck', bridge);
