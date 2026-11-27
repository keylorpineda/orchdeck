import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AdaptersListResult,
  DaemonHealthResult,
  KvGetResult,
  KvSetResult,
  ProjectsListResult,
  TurnCancelResult,
  TurnEventNotificationParams,
  TurnStartParams,
  TurnStartResult,
} from '@orchdeck/shared';

interface OrchdeckBridge {
  health(): Promise<DaemonHealthResult>;
  getKv(key: string): Promise<KvGetResult>;
  setKv(key: string, value: string): Promise<KvSetResult>;
  listProjects(): Promise<ProjectsListResult>;
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
  listProjects: () => ipcRenderer.invoke('orchdeck:projects-list') as Promise<ProjectsListResult>,
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
