import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  V01_APPROVAL_MODES,
  cycleV01ApprovalMode,
  getApprovalModeMeta,
} from './approval-mode.js';

describe('approval-mode state helpers', () => {
  it('exposes Architect and Express in v0.1 and cycles cleanly', () => {
    assert.deepEqual(V01_APPROVAL_MODES, ['architect', 'express']);
    assert.equal(cycleV01ApprovalMode('architect'), 'express');
    assert.equal(cycleV01ApprovalMode('express'), 'architect');
  });

  it('returns descriptive labels and summaries for each v0.1 mode', () => {
    const architect = getApprovalModeMeta('architect');
    const express = getApprovalModeMeta('express');
    assert.equal(architect.label, 'Architect');
    assert.ok(architect.summary.toLowerCase().includes('approval'));
    assert.equal(express.label, 'Express');
    assert.ok(express.summary.toLowerCase().includes('agent/'));
  });
});
