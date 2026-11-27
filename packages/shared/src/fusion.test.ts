import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseInlineMention } from './fusion.js';

describe('parseInlineMention', () => {
  it('resolves @neon, @codex, @opus, and @sonnet aliases cleanly', () => {
    assert.deepEqual(parseInlineMention('@neon audit the database schema'), {
      alias: 'neon',
      overrideHandle: 'antigravity:gemini-4-neon:high',
      cleanedPrompt: 'audit the database schema',
    });
    assert.deepEqual(parseInlineMention('  @codex fix pagination edge case'), {
      alias: 'codex',
      overrideHandle: 'codex:gpt-5.4:high',
      cleanedPrompt: 'fix pagination edge case',
    });
    assert.deepEqual(parseInlineMention('@opus review thread safety'), {
      alias: 'opus',
      overrideHandle: 'claude:opus-4-6:high',
      cleanedPrompt: 'review thread safety',
    });
    assert.deepEqual(parseInlineMention('@sonnet draft release notes'), {
      alias: 'sonnet',
      overrideHandle: 'claude:sonnet-4-6:medium',
      cleanedPrompt: 'draft release notes',
    });
  });

  it('ignores unknown mentions and leaves prompt untouched', () => {
    assert.deepEqual(parseInlineMention('@unknown hello world'), {
      alias: null,
      overrideHandle: null,
      cleanedPrompt: '@unknown hello world',
    });
    assert.deepEqual(parseInlineMention('regular prompt without mention'), {
      alias: null,
      overrideHandle: null,
      cleanedPrompt: 'regular prompt without mention',
    });
  });
});
