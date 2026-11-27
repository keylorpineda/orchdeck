import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  ALL_APPROVAL_MODES,
  cycleV01ApprovalMode,
  getApprovalModeMeta,
} from './approval-mode.js';

describe('approval-mode state helpers', () => {
  it('exposes all 4 orthogonal approval modes and cycles cleanly', () => {
    assert.deepEqual(ALL_APPROVAL_MODES, ['plan', 'architect', 'express', 'branch_pilot']);
    assert.equal(cycleV01ApprovalMode('plan'), 'architect');
    assert.equal(cycleV01ApprovalMode('architect'), 'express');
    assert.equal(cycleV01ApprovalMode('express'), 'branch_pilot');
    assert.equal(cycleV01ApprovalMode('branch_pilot'), 'plan');
  });

  it('returns descriptive labels and summaries for each mode', () => {
    assert.equal(getApprovalModeMeta('plan').label, 'Plan');
    assert.equal(getApprovalModeMeta('architect').label, 'Architect');
    assert.equal(getApprovalModeMeta('express').label, 'Express');
    assert.equal(getApprovalModeMeta('branch_pilot').label, 'Branch Pilot');
  });
});
