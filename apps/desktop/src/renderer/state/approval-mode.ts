import type { ApprovalMode } from '@orchdeck/shared';

export type V01ApprovalMode = ApprovalMode;

export const ALL_APPROVAL_MODES: readonly ApprovalMode[] = [
  'plan',
  'architect',
  'express',
  'branch_pilot',
];

export const V01_APPROVAL_MODES: readonly ApprovalMode[] = ALL_APPROVAL_MODES;

export interface ApprovalModeMeta {
  readonly mode: ApprovalMode;
  readonly label: string;
  readonly summary: string;
}

const APPROVAL_MODE_META: Readonly<Record<ApprovalMode, ApprovalModeMeta>> = {
  plan: {
    mode: 'plan',
    label: 'Plan',
    summary: 'Strictly read-only exploration and design; never modifies repository files.',
  },
  architect: {
    mode: 'architect',
    label: 'Architect',
    summary: 'Read-only plan on current branch; requires approval before branching and editing.',
  },
  express: {
    mode: 'express',
    label: 'Express',
    summary: 'Auto-creates agent/<slug> off main and executes writes immediately.',
  },
  branch_pilot: {
    mode: 'branch_pilot',
    label: 'Branch Pilot',
    summary: 'Executes and commits atomically on agent/<slug>; requires human sign-off for main.',
  },
};

export function cycleV01ApprovalMode(current: ApprovalMode): ApprovalMode {
  const idx = ALL_APPROVAL_MODES.indexOf(current);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % ALL_APPROVAL_MODES.length;
  return ALL_APPROVAL_MODES[nextIdx] ?? 'architect';
}

export function getApprovalModeMeta(mode: ApprovalMode): ApprovalModeMeta {
  return APPROVAL_MODE_META[mode];
}
