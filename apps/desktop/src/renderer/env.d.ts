/// <reference types="vite/client" />

import type {
  DaemonHealthResult,
  KvGetResult,
  KvSetResult,
  ProjectsListResult,
} from '@orchdeck/shared';

export interface OrchdeckApi {
  health(): Promise<DaemonHealthResult>;
  getKv(key: string): Promise<KvGetResult>;
  setKv(key: string, value: string): Promise<KvSetResult>;
  listProjects(): Promise<ProjectsListResult>;
}

declare global {
  interface Window {
    readonly orchdeck?: OrchdeckApi;
  }
}
