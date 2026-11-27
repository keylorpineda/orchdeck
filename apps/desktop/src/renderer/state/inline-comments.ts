export interface InlineDiffComment {
  readonly id: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly side: 'new' | 'old';
  readonly body: string;
}

export function formatInlineCommentsPrompt(comments: readonly InlineDiffComment[]): string {
  if (comments.length === 0) {
    return '';
  }

  const lines = ['Please address these inline code review comments:'];
  for (const item of comments) {
    lines.push(`- ${item.filePath}:${item.lineNumber} (${item.side}): ${item.body.trim()}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatCooldownCountdown(
  cooldownUntilIso: string | null,
  nowMs = Date.now(),
): string | null {
  if (!cooldownUntilIso) {
    return null;
  }
  const targetMs = Date.parse(cooldownUntilIso);
  if (!Number.isFinite(targetMs) || targetMs <= nowMs) {
    return null;
  }
  const remainingSec = Math.ceil((targetMs - nowMs) / 1000);
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;
}
