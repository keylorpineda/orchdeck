import { contextBridge, ipcRenderer } from 'electron';
import type {
  DaemonHealthResult,
  KvGetResult,
  KvSetResult,
  ProjectsListResult,
} from '@orchdeck/shared';

interface OrchdeckBridge {
  health(): Promise<DaemonHealthResult>;
  getKv(key: string): Promise<KvGetResult>;
  setKv(key: string, value: string): Promise<KvSetResult>;
  listProjects(): Promise<ProjectsListResult>;
}

const bridge: OrchdeckBridge = {
  health: () => ipcRenderer.invoke('orchdeck:health') as Promise<DaemonHealthResult>,
  getKv: (key: string) => ipcRenderer.invoke('orchdeck:kv-get', key) as Promise<KvGetResult>,
  setKv: (key: string, value: string) =>
    ipcRenderer.invoke('orchdeck:kv-set', key, value) as Promise<KvSetResult>,
  listProjects: () => ipcRenderer.invoke('orchdeck:projects-list') as Promise<ProjectsListResult>,
};

contextBridge.exposeInMainWorld('orchdeck', bridge);
