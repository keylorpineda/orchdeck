/// <reference types="vite/client" />

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

export interface OrchdeckApi {
  health(): Promise<DaemonHealthResult>;
  getKv(key: string): Promise<KvGetResult>;
  setKv(key: string, value: string): Promise<KvSetResult>;
  listProjects(): Promise<ProjectsListResult>;
  listAdapters(): Promise<AdaptersListResult>;
  startTurn(params: TurnStartParams): Promise<TurnStartResult>;
  cancelTurn(turnId: string): Promise<TurnCancelResult>;
  onTurnEvent(listener: (event: TurnEventNotificationParams) => void): () => void;
}

declare global {
  interface Window {
    readonly orchdeck?: OrchdeckApi;
  }
}
