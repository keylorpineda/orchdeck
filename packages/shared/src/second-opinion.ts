import type { ProviderId } from './adapter.js';

export type SecondOpinionColumnStatus = 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED';

export type SecondOpinionResolution = 'A' | 'B' | 'SYNTHESIZE';

export interface SecondOpinionColumn {
  readonly slot: 'A' | 'B';
  readonly modelHandle: string;
  readonly provider: ProviderId;
  readonly turnId: string | null;
  readonly status: SecondOpinionColumnStatus;
  readonly text: string;
  readonly errorMessage: string | null;
}

export interface SecondOpinionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly chatId: string;
  readonly cwd: string;
  readonly prompt: string;
  readonly columnA: SecondOpinionColumn;
  readonly columnB: SecondOpinionColumn;
  readonly resolution: SecondOpinionResolution | null;
  readonly collapsed: boolean;
  readonly roleViolationDetected: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SecondOpinionUpdatedNotificationParams {
  readonly secondOpinion: SecondOpinionRecord;
}
