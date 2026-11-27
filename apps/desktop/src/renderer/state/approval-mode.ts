import type { ApprovalMode } from '@orchdeck/shared';

export type V01ApprovalMode = Extract<ApprovalMode, 'architect' | 'express'>;

export const V01_APPROVAL_MODES: readonly V01ApprovalMode[] = ['architect', 'express'];

export interface ApprovalModeMeta {
  readonly mode: V01ApprovalMode;
  readonly label: string;
  readonly summary: string;
}

const APPROVAL_MODE_META: Readonly<Record<V01ApprovalMode, ApprovalModeMeta>> = {
  architect: {
    mode: 'architect',
    label: 'Architect',
    summary: 'Read-only plan on current branch; requires approval before branching and editing.',
  },
  express: {
    mode: 'express',
    label: 'Express',
    summary: 'Auto-creates agent/<slug> off main and executes immediately.',
  },
};

export function cycleV01ApprovalMode(current: V01ApprovalMode): V01ApprovalMode {
  return current === 'architect' ? 'express' : 'architect';
}

export function getApprovalModeMeta(mode: V01ApprovalMode): ApprovalModeMeta {
  return APPROVAL_MODE_META[mode];
}
