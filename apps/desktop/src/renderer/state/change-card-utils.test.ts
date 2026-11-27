import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  computeMicroBarSegments,
  detectShikiLang,
  parseDiffLines,
} from './change-card-utils.js';

describe('change-card-utils', () => {
  it('computes 5-segment micro-bars for zero, additions-only, and mixed changes', () => {
    assert.deepEqual(computeMicroBarSegments(0, 0), ['empty', 'empty', 'empty', 'empty', 'empty']);
    assert.deepEqual(computeMicroBarSegments(3, 0), ['add', 'add', 'empty', 'empty', 'empty']);
    assert.deepEqual(computeMicroBarSegments(25, 0), ['add', 'add', 'add', 'add', 'add']);

    const mixed = computeMicroBarSegments(8, 2);
    assert.equal(mixed.length, 5);
    assert.ok(mixed.includes('add'));
    assert.ok(mixed.includes('del'));
  });

  it('detects Shiki language identifiers from file paths', () => {
    assert.equal(detectShikiLang('src/app.tsx'), 'tsx');
    assert.equal(detectShikiLang('packages/shared/src/rpc.ts'), 'typescript');
    assert.equal(detectShikiLang('README.md'), 'markdown');
    assert.equal(detectShikiLang('Makefile'), 'text');
  });

  it('parses unified diff hunks and tracks old and new line numbers', () => {
    const sampleDiff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -10,3 +10,3 @@ export function demo() {',
      ' const keep = 1;',
      '-const oldVal = 2;',
      '+const newVal = 3;',
      ' return keep;',
    ].join('\n');

    const lines = parseDiffLines(sampleDiff);
    const addLine = lines.find((l) => l.kind === 'add');
    const delLine = lines.find((l) => l.kind === 'del');
    const ctxLine = lines.find((l) => l.kind === 'context');

    assert.equal(ctxLine?.oldLine, 10);
    assert.equal(ctxLine?.newLine, 10);
    assert.equal(delLine?.oldLine, 11);
    assert.equal(delLine?.newLine, null);
    assert.equal(delLine?.code, 'const oldVal = 2;');
    assert.equal(addLine?.oldLine, null);
    assert.equal(addLine?.newLine, 11);
    assert.equal(addLine?.code, 'const newVal = 3;');
  });
});
