export type MicroBarSegment = 'add' | 'del' | 'empty';

export interface ParsedDiffLine {
  readonly kind: 'meta' | 'hunk' | 'add' | 'del' | 'context';
  readonly oldLine: number | null;
  readonly newLine: number | null;
  readonly prefix: string;
  readonly code: string;
}

const HUNK_HEADER_RE = /^@@ -(\d{1,7})(?:,\d{1,7})? \+(\d{1,7})(?:,\d{1,7})? @@/;

export function computeMicroBarSegments(
  additions: number,
  deletions: number,
  totalSegments = 5,
): readonly MicroBarSegment[] {
  const safeAdd = Math.max(0, additions);
  const safeDel = Math.max(0, deletions);
  const total = safeAdd + safeDel;

  if (total === 0) {
    return Array.from({ length: totalSegments }, () => 'empty');
  }

  let filled = total >= 20 ? 5 : total >= 10 ? 4 : total >= 5 ? 3 : total >= 2 ? 2 : 1;
  filled = Math.min(totalSegments, filled);
  if (safeAdd > 0 && safeDel > 0 && totalSegments >= 2) {
    filled = Math.max(2, filled);
  }

  let addCount = 0;
  if (safeAdd > 0) {
    addCount =
      safeDel === 0
        ? filled
        : Math.max(1, Math.min(filled - 1, Math.round((safeAdd / total) * filled)));
  }
  const delCount = safeDel === 0 ? 0 : filled - addCount;

  const segments: MicroBarSegment[] = [];
  for (let i = 0; i < addCount; i += 1) {
    segments.push('add');
  }
  for (let i = 0; i < delCount; i += 1) {
    segments.push('del');
  }
  while (segments.length < totalSegments) {
    segments.push('empty');
  }
  return segments;
}

export function detectShikiLang(filePath: string): string {
  const lower = filePath.trim().toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  if (dotIndex === -1) {
    return 'text';
  }
  const ext = lower.slice(dotIndex + 1);
  switch (ext) {
    case 'ts':
    case 'cts':
    case 'mts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
    case 'cjs':
    case 'mjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'json':
    case 'jsonc':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sh':
    case 'bash':
      return 'bash';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    case 'sql':
      return 'sql';
    default:
      return 'text';
  }
}

export function parseDiffLines(rawDiff: string): readonly ParsedDiffLine[] {
  if (rawDiff.trim().length === 0) {
    return [];
  }

  const rawLines = rawDiff.split(/\r?\n/);
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of rawLines) {
    if (
      line.startsWith('diff --git ') ||
      line.startsWith('index ') ||
      line.startsWith('new file mode ') ||
      line.startsWith('deleted file mode ') ||
      line.startsWith('rename from ') ||
      line.startsWith('rename to ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('\\ No newline')
    ) {
      inHunk = false;
      result.push({
        kind: 'meta',
        oldLine: null,
        newLine: null,
        prefix: '',
        code: line,
      });
      continue;
    }

    const hunkMatch = HUNK_HEADER_RE.exec(line);
    if (hunkMatch) {
      oldLine = Number.parseInt(hunkMatch[1] ?? '1', 10);
      newLine = Number.parseInt(hunkMatch[2] ?? '1', 10);
      inHunk = true;
      result.push({
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        prefix: '',
        code: line,
      });
      continue;
    }

    if (!inHunk) {
      if (line.length > 0) {
        result.push({
          kind: 'meta',
          oldLine: null,
          newLine: null,
          prefix: '',
          code: line,
        });
      }
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        kind: 'add',
        oldLine: null,
        newLine,
        prefix: '+',
        code: line.slice(1),
      });
      newLine += 1;
    } else if (line.startsWith('-')) {
      result.push({
        kind: 'del',
        oldLine,
        newLine: null,
        prefix: '-',
        code: line.slice(1),
      });
      oldLine += 1;
    } else {
      result.push({
        kind: 'context',
        oldLine,
        newLine,
        prefix: line.startsWith(' ') ? ' ' : '',
        code: line.startsWith(' ') ? line.slice(1) : line,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  return result;
}
