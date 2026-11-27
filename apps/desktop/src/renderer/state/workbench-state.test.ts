import type { ChatRecord } from '@orchdeck/shared';
import { describe, expect, it } from 'vitest';
import {
  deriveChatTitleFromPrompt,
  selectFallbackId,
  sortChatsByActivity,
} from './workbench-state.js';

function makeChat(id: string, updatedAt: string, createdAt = updatedAt): ChatRecord {
  return {
    id,
    projectId: 'proj-1',
    title: `Chat ${id}`,
    archivedAt: null,
    createdAt,
    updatedAt,
  };
}

describe('Workbench state helpers', () => {
  it('sorts chats by descending updatedAt activity', () => {
    const sorted = sortChatsByActivity([
      makeChat('a', '2026-11-27T01:00:00.000Z'),
      makeChat('c', '2026-11-27T03:00:00.000Z'),
      makeChat('b', '2026-11-27T02:00:00.000Z'),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });

  it('selects fallback id when current item is removed', () => {
    const items = [{ id: 'x' }, { id: 'y' }];
    expect(selectFallbackId(items, 'y')).toBe('y');
    expect(selectFallbackId(items, 'deleted')).toBe('x');
    expect(selectFallbackId([], 'deleted')).toBeNull();
  });

  it('derives concise chat titles from initial prompts', () => {
    expect(deriveChatTitleFromPrompt('   Fix   daemon socket   cleanup  ')).toBe(
      'Fix daemon socket cleanup',
    );
    expect(deriveChatTitleFromPrompt('')).toBe('New chat');
    expect(
      deriveChatTitleFromPrompt(
        'Implement full repository sidebar with activity sorting and branch indicators across platforms',
      ).length,
    ).toBeLessThanOrEqual(48);
  });
});
