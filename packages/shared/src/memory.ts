export type MemoryCategory = 'decision' | 'convention' | 'open_item';

export type MemoryDocTarget = 'AGENTS.md' | 'CLAUDE.md';

export interface ProjectMemoryEntry {
  readonly id: string;
  readonly projectId: string;
  readonly category: MemoryCategory;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryProposal {
  readonly projectId: string;
  readonly category: MemoryCategory;
  readonly title: string;
  readonly content: string;
}

export interface MemoryListParams {
  readonly projectId: string;
}

export interface MemoryListResult {
  readonly entries: readonly ProjectMemoryEntry[];
  readonly promptPreview: string;
  readonly maxChars: number;
}

export interface MemoryUpsertParams {
  readonly projectId: string;
  readonly id?: string | undefined;
  readonly category: MemoryCategory;
  readonly title: string;
  readonly content: string;
}

export interface MemoryUpsertResult {
  readonly entry: ProjectMemoryEntry;
}

export interface MemoryDeleteParams {
  readonly id: string;
}

export interface MemoryDeleteResult {
  readonly deleted: boolean;
}

export interface MemoryProposeFromChangeParams {
  readonly projectId: string;
  readonly chatId?: string | undefined;
  readonly commitMessage: string;
}

export interface MemoryProposeFromChangeResult {
  readonly proposal: MemoryProposal;
}

export interface MemorySyncDocParams {
  readonly projectId: string;
  readonly target: MemoryDocTarget;
}

export interface MemorySyncDocResult {
  readonly target: MemoryDocTarget;
  readonly filePath: string;
  readonly entryCount: number;
}

export interface MemoryImportDocParams {
  readonly projectId: string;
  readonly target: MemoryDocTarget;
}

export interface MemoryImportDocResult {
  readonly target: MemoryDocTarget;
  readonly importedCount: number;
  readonly entries: readonly ProjectMemoryEntry[];
}
