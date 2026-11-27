import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  formatCooldownCountdown,
  formatInlineCommentsPrompt,
} from './inline-comments.js';

describe('inline diff comments and radar countdown formatting', () => {
  it('bundles line-anchored comments cleanly for Request Changes (N)', () => {
    assert.equal(formatInlineCommentsPrompt([]), '');
    const prompt = formatInlineCommentsPrompt([
      {
        id: 'c1',
        filePath: 'src/app.ts',
        lineNumber: 42,
        side: 'new',
        body: 'Handle empty array case',
      },
      {
        id: 'c2',
        filePath: 'src/db.ts',
        lineNumber: 19,
        side: 'old',
        body: 'Keep index creation idempotent',
      },
    ]);
    assert.ok(prompt.includes('src/app.ts:42 (new): Handle empty array case'));
    assert.ok(prompt.includes('src/db.ts:19 (old): Keep index creation idempotent'));
  });

  it('formats live cooldown countdowns and clears expired timestamps', () => {
    const baseNow = Date.UTC(2026, 10, 27, 12, 0, 0);
    assert.equal(
      formatCooldownCountdown(new Date(baseNow + 125_000).toISOString(), baseNow),
      '2m 05s',
    );
    assert.equal(
      formatCooldownCountdown(new Date(baseNow + 9000).toISOString(), baseNow),
      '9s',
    );
    assert.equal(
      formatCooldownCountdown(new Date(baseNow - 1000).toISOString(), baseNow),
      null,
    );
  });
});
