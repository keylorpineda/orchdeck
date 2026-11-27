import type { ChatRecord } from '@orchdeck/shared';

export function sortChatsByActivity(chats: readonly ChatRecord[]): readonly ChatRecord[] {
  return [...chats].sort((a, b) => {
    const updatedCmp = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedCmp !== 0) {
      return updatedCmp;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function selectFallbackId<T extends { readonly id: string }>(
  remainingItems: readonly T[],
  currentSelectedId: string | null,
): string | null {
  if (currentSelectedId && remainingItems.some((item) => item.id === currentSelectedId)) {
    return currentSelectedId;
  }
  return remainingItems[0]?.id ?? null;
}

export function deriveChatTitleFromPrompt(prompt: string): string {
  const singleLine = prompt.trim().replace(/\s+/g, ' ');
  if (singleLine.length === 0) {
    return 'New chat';
  }
  if (singleLine.length <= 48) {
    return singleLine;
  }
  return `${singleLine.slice(0, 45).trimEnd()}...`;
}
