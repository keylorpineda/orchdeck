import fs from 'node:fs';
import path from 'node:path';
import {
  redactSecrets,
  type ChangeCardSnapshot,
  type MemoryCategory,
  type MemoryDocTarget,
  type MemoryProposal,
  type ProjectMemoryEntry,
} from '@orchdeck/shared';
import type { DaemonDatabase } from '../db/database.js';
import { assertPathInsideRepo } from '../git/git-service.js';

export const DEFAULT_MEMORY_CHAR_BUDGET = 1800;
export const MEMORY_BLOCK_START = '<!-- ORCHDECK:MEMORY:START -->';
export const MEMORY_BLOCK_END = '<!-- ORCHDECK:MEMORY:END -->';

const CATEGORY_ORDER: readonly MemoryCategory[] = ['decision', 'convention', 'open_item'];
const CATEGORY_LABELS: Readonly<Record<MemoryCategory, string>> = {
  decision: 'Decisions',
  convention: 'Conventions',
  open_item: 'Open Items',
};

export function assertNoSecretsInMemory(title: string, content: string): void {
  const cleanTitle = title.trim();
  const cleanContent = content.trim();
  if (cleanTitle.length === 0 || cleanContent.length === 0) {
    throw new Error('Memory entry requires non-empty title and content.');
  }
  if (redactSecrets(cleanTitle) !== cleanTitle || redactSecrets(cleanContent) !== cleanContent) {
    throw new Error(
      'Credentials and API secrets cannot be stored in Shared Project Memory.',
    );
  }
}

export function buildBudgetedMemoryInjection(
  entries: readonly ProjectMemoryEntry[],
  maxChars = DEFAULT_MEMORY_CHAR_BUDGET,
): string {
  if (entries.length === 0 || maxChars < 60) {
    return '';
  }

  const header = '### Shared Project Memory\n';
  const lines: string[] = [header];
  let used = header.length;
  let truncated = false;

  for (const category of CATEGORY_ORDER) {
    const group = entries.filter((entry) => entry.category === category);
    if (group.length === 0) {
      continue;
    }
    const sectionHeader = `\n#### ${CATEGORY_LABELS[category]}\n`;
    if (used + sectionHeader.length >= maxChars) {
      truncated = true;
      break;
    }
    lines.push(sectionHeader);
    used += sectionHeader.length;

    for (const entry of group) {
      const bullet = `- **${entry.title}**: ${entry.content}\n`;
      if (used + bullet.length <= maxChars - 36) {
        lines.push(bullet);
        used += bullet.length;
      } else {
        const remaining = maxChars - used - 40;
        if (remaining > 18) {
          lines.push(`${bullet.slice(0, remaining)}...\n`);
          used += remaining + 4;
        }
        truncated = true;
        break;
      }
    }
    if (truncated) {
      break;
    }
  }

  const truncationFooter = '\n_(Memory truncated to fit prompt budget)_\n';
  if (truncated) {
    lines.push(truncationFooter);
  }

  const assembled = lines.join('').trim();
  if (assembled.length > maxChars) {
    const reserve = truncationFooter.trim().length + 4;
    const head = assembled.slice(0, Math.max(0, maxChars - reserve)).trimEnd();
    return `${head}\n${truncationFooter.trim()}`.slice(0, maxChars);
  }
  return assembled;
}

export function proposeMemoryFromChangeCard(
  projectId: string,
  snapshot: ChangeCardSnapshot | null,
  commitMessage: string,
): MemoryProposal {
  const safeCommit = redactSecrets(commitMessage).trim() || 'Repository change';
  const branch = snapshot?.branch ?? 'agent/task';
  const touchedFiles = (snapshot?.files ?? [])
    .slice(0, 4)
    .map((f) => f.path)
    .join(', ');
  const fileNote = touchedFiles ? ` Files touched: ${touchedFiles}.` : '';

  return {
    projectId,
    category: 'decision',
    title: safeCommit.slice(0, 72),
    content: `Committed on branch ${branch}.${fileNote}`,
  };
}

function validateDocTarget(target: string): MemoryDocTarget {
  if (target !== 'AGENTS.md' && target !== 'CLAUDE.md') {
    throw new Error(`Unsupported memory document target: ${target}`);
  }
  return target;
}

function renderManagedBlock(entries: readonly ProjectMemoryEntry[]): string {
  const sections: string[] = [MEMORY_BLOCK_START, '## Orchdeck Shared Project Memory'];
  for (const category of CATEGORY_ORDER) {
    const group = entries.filter((entry) => entry.category === category);
    if (group.length === 0) {
      continue;
    }
    sections.push(`\n### ${CATEGORY_LABELS[category]}`);
    for (const entry of group) {
      sections.push(`- **${entry.title}**: ${entry.content}`);
    }
  }
  sections.push(MEMORY_BLOCK_END);
  return sections.join('\n');
}

export function syncMemoryToRepoDoc(
  repoRoot: string,
  target: MemoryDocTarget,
  entries: readonly ProjectMemoryEntry[],
): { readonly target: MemoryDocTarget; readonly filePath: string; readonly entryCount: number } {
  const safeTarget = validateDocTarget(target);
  const fullPath = path.join(repoRoot, safeTarget);
  assertPathInsideRepo(repoRoot, fullPath);

  const block = renderManagedBlock(entries);
  const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';

  let nextContent: string;
  const startIdx = existing.indexOf(MEMORY_BLOCK_START);
  const endIdx = existing.indexOf(MEMORY_BLOCK_END, startIdx === -1 ? 0 : startIdx);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + MEMORY_BLOCK_END.length).trimStart();
    const parts = [before, block, after].filter((segment) => segment.length > 0);
    nextContent = `${parts.join('\n\n')}\n`;
  } else if (existing.trim().length > 0) {
    nextContent = `${existing.trimEnd()}\n\n${block}\n`;
  } else {
    nextContent = `${block}\n`;
  }

  fs.writeFileSync(fullPath, nextContent, 'utf8');
  return {
    target: safeTarget,
    filePath: fullPath,
    entryCount: entries.length,
  };
}

export function importMemoryFromRepoDoc(
  db: DaemonDatabase,
  projectId: string,
  repoRoot: string,
  target: MemoryDocTarget,
): readonly ProjectMemoryEntry[] {
  const safeTarget = validateDocTarget(target);
  const fullPath = path.join(repoRoot, safeTarget);
  assertPathInsideRepo(repoRoot, fullPath);

  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const raw = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
  const startIdx = raw.indexOf(MEMORY_BLOCK_START);
  const endIdx = raw.indexOf(MEMORY_BLOCK_END, startIdx === -1 ? 0 : startIdx);
  const region =
    startIdx !== -1 && endIdx !== -1 && endIdx > startIdx
      ? raw.slice(startIdx + MEMORY_BLOCK_START.length, endIdx)
      : raw;

  let activeCategory: MemoryCategory = 'convention';
  const imported: ProjectMemoryEntry[] = [];

  for (const rawLine of region.split('\n')) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith('### decisions') || lower.startsWith('## decisions')) {
      activeCategory = 'decision';
      continue;
    }
    if (lower.startsWith('### open items') || lower.startsWith('## open items')) {
      activeCategory = 'open_item';
      continue;
    }
    if (lower.startsWith('### conventions') || lower.startsWith('## conventions')) {
      activeCategory = 'convention';
      continue;
    }

    if (!line.startsWith('- ')) {
      continue;
    }
    const itemText = line.slice(2).trim();
    if (itemText.length === 0) {
      continue;
    }

    let title = itemText.slice(0, 48);
    let content = itemText;
    if (itemText.startsWith('**')) {
      const closingBold = itemText.indexOf('**:', 2);
      if (closingBold > 2) {
        title = itemText.slice(2, closingBold).trim();
        content = itemText.slice(closingBold + 3).trim();
      }
    } else {
      const colonIdx = itemText.indexOf(':');
      if (colonIdx > 0 && colonIdx < 60) {
        title = itemText.slice(0, colonIdx).trim();
        content = itemText.slice(colonIdx + 1).trim();
      }
    }

    if (title.length > 0 && content.length > 0) {
      assertNoSecretsInMemory(title, content);
      const saved = db.upsertProjectMemory({
        projectId,
        category: activeCategory,
        title,
        content,
      });
      imported.push(saved);
    }
  }

  return imported;
}
