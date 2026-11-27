import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CO_AUTHOR_TRAILER_REGEX,
  redactSecrets,
  type ChangeCardSnapshot,
  type ChangeFileStatus,
  type ChangedFileStat,
  type ChangesIntegrateBranchResult,
  type TestRunResult,
} from '@orchdeck/shared';
import { spawnManagedProcess } from '../process/process-tree.js';
import { sanitizeSubprocessEnv } from '../security/env-sanitizer.js';
import {
  DEFAULT_PROTECTED_BRANCHES,
  createGitShim,
  matchesProtectedBranch,
  resolveSystemGitPath,
} from '../security/git-shim.js';

export interface GitStatusSummary {
  readonly branch: string;
  readonly isClean: boolean;
  readonly staged: readonly string[];
  readonly unstaged: readonly string[];
  readonly untracked: readonly string[];
}

export interface WorkingTreeBaseline {
  readonly diffDigest: string;
  readonly statusFingerprint: string;
  readonly untrackedFiles: readonly string[];
}

export interface ReadOnlyGuardResult {
  readonly violated: boolean;
  readonly touchedFiles: readonly string[];
}

export interface GitServiceOptions {
  readonly gitBinary?: string | undefined;
  readonly protectedBranches?: readonly string[] | undefined;
}

export function assertPathInsideRepo(repoRoot: string, targetPath: string): string {
  const realRoot = fs.realpathSync(path.resolve(repoRoot));
  const candidate = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(realRoot, targetPath);

  let realCandidate: string;
  if (fs.existsSync(candidate)) {
    realCandidate = fs.realpathSync(candidate);
  } else {
    const missingSegments: string[] = [];
    let current = candidate;
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error(`No existing ancestor directory found for path "${targetPath}".`);
      }
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
    realCandidate = path.join(fs.realpathSync(current), ...missingSegments);
  }

  const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
  if (realCandidate !== realRoot && !realCandidate.startsWith(rootWithSep)) {
    throw new Error(`Path "${targetPath}" escapes repository root "${realRoot}".`);
  }
  return realCandidate;
}

function sanitizeBranchSlug(rawSlug: string): string {
  const lower = rawSlug.trim().toLowerCase();
  let mapped = '';
  let lastWasDash = true;

  for (const ch of lower) {
    const isAlphaNum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlphaNum) {
      mapped += ch;
      lastWasDash = false;
    } else if (!lastWasDash) {
      mapped += '-';
      lastWasDash = true;
    }
  }

  while (mapped.endsWith('-')) {
    mapped = mapped.slice(0, -1);
  }

  return mapped.length > 0 ? mapped : `task-${Date.now()}`;
}

const MAX_DIFF_SNAPSHOT_BYTES = 256 * 1024;
const MAX_TEST_OUTPUT_BYTES = 128 * 1024;
const DEFAULT_TEST_TIMEOUT_MS = 120_000;
const FORBIDDEN_SHELL_CHARS = new Set([';', '|', '&', '`', '$', '>', '<', '\r', '\n', '\0']);

export function tokenizeSafeCommand(commandText: string): readonly string[] {
  const trimmed = commandText.trim();
  if (trimmed.length === 0) {
    throw new Error('Test command must not be empty.');
  }

  for (const ch of trimmed) {
    if (FORBIDDEN_SHELL_CHARS.has(ch)) {
      throw new Error(`Test command contains disallowed shell control character "${ch}".`);
    }
  }

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] ?? '';
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      if (hasToken || current.length > 0) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }

    current += ch;
    hasToken = true;
  }

  if (quote !== null) {
    throw new Error('Test command contains an unmatched quote.');
  }

  if (hasToken || current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0 || (tokens[0]?.length ?? 0) === 0) {
    throw new Error('Test command executable must not be empty.');
  }

  return tokens;
}

interface ParsedNumstatEntry {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
  readonly isBinary: boolean;
}

function parseNumstatZ(raw: string): Map<string, ParsedNumstatEntry> {
  const result = new Map<string, ParsedNumstatEntry>();
  const parts = raw.split('\0');
  let i = 0;

  while (i < parts.length) {
    const record = parts[i] ?? '';
    i += 1;
    if (record.length === 0) {
      continue;
    }

    const tab1 = record.indexOf('\t');
    const tab2 = tab1 === -1 ? -1 : record.indexOf('\t', tab1 + 1);
    if (tab1 === -1 || tab2 === -1) {
      continue;
    }

    const addText = record.slice(0, tab1);
    const delText = record.slice(tab1 + 1, tab2);
    let filePath = record.slice(tab2 + 1);

    if (filePath.length === 0) {
      // For renamed entries under -z, old and new paths follow in the next two NUL fields.
      const _oldPath = parts[i] ?? '';
      const newPath = parts[i + 1] ?? '';
      i += 2;
      filePath = newPath || _oldPath;
    }

    if (filePath.length === 0) {
      continue;
    }

    const isBinary = addText === '-' || delText === '-';
    result.set(filePath, {
      path: filePath,
      additions: isBinary ? 0 : Number.parseInt(addText, 10) || 0,
      deletions: isBinary ? 0 : Number.parseInt(delText, 10) || 0,
      isBinary,
    });
  }

  return result;
}

function mapGitStatusLetter(code: string): ChangeFileStatus {
  if (code.startsWith('A')) {
    return 'added';
  }
  if (code.startsWith('D')) {
    return 'deleted';
  }
  if (code.startsWith('R') || code.startsWith('C')) {
    return 'renamed';
  }
  return 'modified';
}

function parseNameStatusZ(raw: string): Map<string, ChangeFileStatus> {
  const result = new Map<string, ChangeFileStatus>();
  const parts = raw.split('\0');
  let i = 0;

  while (i < parts.length) {
    const code = parts[i] ?? '';
    i += 1;
    if (code.length === 0) {
      continue;
    }

    if (code.startsWith('R') || code.startsWith('C')) {
      const _oldPath = parts[i] ?? '';
      const newPath = parts[i + 1] ?? '';
      i += 2;
      if (newPath.length > 0) {
        result.set(newPath, 'renamed');
      }
      continue;
    }

    const filePath = parts[i] ?? '';
    i += 1;
    if (filePath.length > 0) {
      result.set(filePath, mapGitStatusLetter(code));
    }
  }

  return result;
}

export class GitService {
  private readonly gitBinary: string;
  private readonly protectedBranches: readonly string[];

  constructor(options: GitServiceOptions = {}) {
    this.gitBinary = options.gitBinary ?? resolveSystemGitPath();
    this.protectedBranches = options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES;
  }

  private execGit(cwd: string, args: readonly string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      execFile(
        this.gitBinary,
        args,
        {
          cwd: path.resolve(cwd),
          env: sanitizeSubprocessEnv(process.env),
          shell: false,
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err) {
            const detail = stderr.trim() || err.message;
            reject(new Error(`git ${args[0] ?? ''} failed: ${detail}`));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }

  private execGitWithStdin(cwd: string, args: readonly string[], stdinText: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.gitBinary, args, {
        cwd: path.resolve(cwd),
        env: sanitizeSubprocessEnv(process.env),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`git ${args[0] ?? ''} failed (${String(code)}): ${stderr.trim()}`));
          return;
        }
        resolve(stdout);
      });

      child.stdin.write(stdinText, 'utf8');
      child.stdin.end();
    });
  }

  async isGitRepository(dirPath: string): Promise<boolean> {
    try {
      const out = await this.execGit(dirPath, ['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true';
    } catch {
      return false;
    }
  }

  private async hasHeadCommit(repoPath: string): Promise<boolean> {
    try {
      await this.execGit(repoPath, ['rev-parse', '--verify', 'HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const out = await this.execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      return out.trim();
    } catch {
      const unborn = await this.execGit(repoPath, ['symbolic-ref', '--short', 'HEAD']);
      return unborn.trim();
    }
  }

  async getStatus(repoPath: string): Promise<GitStatusSummary> {
    const [branch, porcelain] = await Promise.all([
      this.getCurrentBranch(repoPath),
      this.execGit(repoPath, ['status', '--porcelain=v1']),
    ]);

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of porcelain.split(/\r?\n/)) {
      if (line.length < 4) {
        continue;
      }
      const indexStatus = line[0] ?? ' ';
      const workTreeStatus = line[1] ?? ' ';
      const filePath = line.slice(3);

      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(filePath);
        continue;
      }
      if (indexStatus !== ' ') {
        staged.push(filePath);
      }
      if (workTreeStatus !== ' ') {
        unstaged.push(filePath);
      }
    }

    return {
      branch,
      isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
      staged,
      unstaged,
      untracked,
    };
  }

  async getDiffStat(repoPath: string): Promise<string> {
    const out = await this.execGit(repoPath, ['diff', '--stat', 'HEAD']);
    return out.trim();
  }

  async getUnifiedDiff(repoPath: string): Promise<string> {
    const out = await this.execGit(repoPath, ['diff', 'HEAD']);
    return out;
  }

  async ensureTaskBranch(repoPath: string, slug: string): Promise<string> {
    const current = await this.getCurrentBranch(repoPath);
    if (!matchesProtectedBranch(current, this.protectedBranches)) {
      return current;
    }
    const targetBranch = `agent/${sanitizeBranchSlug(slug)}`;
    await this.execGit(repoPath, ['checkout', '-b', targetBranch]);
    return targetBranch;
  }

  async commitApprovedChanges(repoPath: string, commitMessage: string): Promise<string> {
    const trimmedMessage = commitMessage.trim();
    if (trimmedMessage.length === 0) {
      throw new Error('Commit message must not be empty.');
    }
    if (CO_AUTHOR_TRAILER_REGEX.test(trimmedMessage)) {
      throw new Error('Approved commits must not include Co-Authored-By trailers.');
    }

    const current = await this.getCurrentBranch(repoPath);
    if (matchesProtectedBranch(current, this.protectedBranches)) {
      throw new Error(
        `Refusing to commit directly on protected branch "${current}". Switch to an isolated task branch first.`,
      );
    }

    await this.execGit(repoPath, ['add', '-A']);
    await this.execGitWithStdin(repoPath, ['commit', '-F', '-'], `${trimmedMessage}\n`);
    const sha = await this.execGit(repoPath, ['rev-parse', 'HEAD']);
    return sha.trim();
  }

  async getChangeCardSnapshot(repoPath: string): Promise<ChangeCardSnapshot> {
    const status = await this.getStatus(repoPath);
    if (status.isClean) {
      return {
        branch: status.branch,
        isClean: true,
        totalAdditions: 0,
        totalDeletions: 0,
        files: [],
        isTruncated: false,
      };
    }

    const hasHead = await this.hasHeadCommit(repoPath);
    const numstatArgs = hasHead
      ? ['diff', '--numstat', '-M', '-z', 'HEAD']
      : ['diff', '--cached', '--numstat', '-M', '-z'];
    const nameStatusArgs = hasHead
      ? ['diff', '--name-status', '-M', '-z', 'HEAD']
      : ['diff', '--cached', '--name-status', '-M', '-z'];

    const [rawNumstat, rawNameStatus] = await Promise.all([
      this.execGit(repoPath, numstatArgs),
      this.execGit(repoPath, nameStatusArgs),
    ]);

    const numstatMap = parseNumstatZ(rawNumstat);
    const statusMap = parseNameStatusZ(rawNameStatus);

    const trackedPaths = new Set<string>([
      ...statusMap.keys(),
      ...numstatMap.keys(),
      ...status.staged,
      ...status.unstaged,
    ]);

    let remainingBytes = MAX_DIFF_SNAPSHOT_BYTES;
    let isTruncated = false;
    const files: ChangedFileStat[] = [];

    const takeDiffWithinBudget = (rawDiff: string): string => {
      if (isTruncated) {
        return '';
      }
      const redacted = redactSecrets(rawDiff);
      const byteLen = Buffer.byteLength(redacted, 'utf8');
      if (byteLen <= remainingBytes) {
        remainingBytes -= byteLen;
        return redacted;
      }
      isTruncated = true;
      const sliced = redacted.slice(0, Math.max(0, remainingBytes));
      remainingBytes = 0;
      return `${sliced}\n... [diff truncated at 256 KB limit]`;
    };

    for (const filePath of [...trackedPaths].sort()) {
      const stat = numstatMap.get(filePath);
      const fileStatus = statusMap.get(filePath) ?? 'modified';
      let diff = '';
      if (!stat?.isBinary && !isTruncated) {
        const diffArgs = hasHead
          ? ['diff', 'HEAD', '--', filePath]
          : ['diff', '--cached', '--', filePath];
        diff = takeDiffWithinBudget(await this.execGit(repoPath, diffArgs));
      }
      files.push({
        path: filePath,
        status: fileStatus,
        additions: stat?.additions ?? 0,
        deletions: stat?.deletions ?? 0,
        isBinary: stat?.isBinary ?? false,
        diff,
      });
    }

    for (const untrackedPath of [...status.untracked].sort()) {
      const safePath = assertPathInsideRepo(repoPath, untrackedPath);
      const fileStat = fs.existsSync(safePath) ? fs.statSync(safePath) : null;
      if (!fileStat || !fileStat.isFile()) {
        continue;
      }

      const rawBuffer = fs.readFileSync(safePath);
      const isBinary = rawBuffer.includes(0);
      if (isBinary) {
        files.push({
          path: untrackedPath,
          status: 'untracked',
          additions: 0,
          deletions: 0,
          isBinary: true,
          diff: '',
        });
        continue;
      }

      const text = rawBuffer.toString('utf8');
      const rawLines = text.length === 0 ? [] : text.split(/\r?\n/);
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
        rawLines.pop();
      }
      const additions = rawLines.length;
      let diff = '';
      if (!isTruncated) {
        const header = [
          `diff --git a/${untrackedPath} b/${untrackedPath}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${untrackedPath}`,
          `@@ -0,0 +1,${Math.max(1, additions)} @@`,
        ];
        const body = rawLines.map((line) => `+${line}`);
        diff = takeDiffWithinBudget([...header, ...body].join('\n'));
      }

      files.push({
        path: untrackedPath,
        status: 'untracked',
        additions,
        deletions: 0,
        isBinary: false,
        diff,
      });
    }

    const totalAdditions = files.reduce((sum, item) => sum + item.additions, 0);
    const totalDeletions = files.reduce((sum, item) => sum + item.deletions, 0);

    return {
      branch: status.branch,
      isClean: files.length === 0,
      totalAdditions,
      totalDeletions,
      files,
      isTruncated,
    };
  }

  async discardChangesWithBackup(repoPath: string): Promise<{
    readonly discarded: boolean;
    readonly stashCreated: boolean;
    readonly stashRef: string | null;
  }> {
    const status = await this.getStatus(repoPath);
    if (status.isClean) {
      return {
        discarded: false,
        stashCreated: false,
        stashRef: null,
      };
    }

    const hasHead = await this.hasHeadCommit(repoPath);
    if (!hasHead) {
      throw new Error('Cannot discard changes with git stash backup before the initial commit.');
    }

    const message = `orchdeck-discard-backup-${new Date().toISOString()}`;
    await this.execGit(repoPath, ['stash', 'push', '--include-untracked', '-m', message]);

    let stashRef: string | null = null;
    try {
      const sha = await this.execGit(repoPath, ['rev-parse', '--verify', '--quiet', 'stash@{0}']);
      const trimmed = sha.trim();
      stashRef = trimmed.length > 0 ? trimmed : null;
    } catch {
      stashRef = null;
    }

    return {
      discarded: true,
      stashCreated: stashRef !== null,
      stashRef,
    };
  }

  async runProjectTests(
    repoPath: string,
    commandText: string,
    options: { readonly timeoutMs?: number | undefined } = {},
  ): Promise<TestRunResult> {
    const tokens = tokenizeSafeCommand(commandText);
    const executable = tokens[0] ?? '';
    const args = tokens.slice(1);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
    const resolvedRepo = path.resolve(repoPath);
    const startedAt = Date.now();

    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-test-shim-'));
    const gitShim = createGitShim({
      runtimeDir,
      protectedBranches: this.protectedBranches,
      allowCommit: false,
    });

    let timedOut = false;
    let combinedOutput = '';
    let outputTruncated = false;

    const appendOutput = (chunk: string): void => {
      if (outputTruncated) {
        return;
      }
      combinedOutput += chunk;
      if (Buffer.byteLength(combinedOutput, 'utf8') > MAX_TEST_OUTPUT_BYTES) {
        combinedOutput = `${combinedOutput.slice(0, MAX_TEST_OUTPUT_BYTES)}\n... [test output truncated at 128 KB]`;
        outputTruncated = true;
      }
    };

    try {
      const child = spawnManagedProcess(executable, args, {
        cwd: resolvedRepo,
        gitShim,
      });

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => appendOutput(chunk));
      child.stderr.on('data', (chunk: string) => appendOutput(chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        void child.cancel();
      }, timeoutMs);

      try {
        const exit = await child.wait;
        const durationMs = Date.now() - startedAt;
        return {
          command: commandText.trim(),
          exitCode: exit.code,
          passed: !timedOut && exit.code === 0,
          timedOut,
          durationMs,
          output: redactSecrets(combinedOutput).trim(),
        };
      } finally {
        clearTimeout(timer);
      }
    } finally {
      gitShim.dispose();
      if (fs.existsSync(runtimeDir)) {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    }
  }

  async captureWorkingTreeBaseline(repoPath: string): Promise<WorkingTreeBaseline> {
    const [status, porcelain, diffText] = await Promise.all([
      this.getStatus(repoPath),
      this.execGit(repoPath, ['status', '--porcelain=v1']),
      this.hasHeadCommit(repoPath).then((hasHead) =>
        hasHead ? this.execGit(repoPath, ['diff', 'HEAD']) : this.execGit(repoPath, ['diff', '--cached']),
      ),
    ]);
    return {
      diffDigest: diffText,
      statusFingerprint: porcelain,
      untrackedFiles: status.untracked,
    };
  }

  async verifyAndRevertReadOnlyTurn(
    repoPath: string,
    baseline: WorkingTreeBaseline,
  ): Promise<ReadOnlyGuardResult> {
    const [status, porcelain, diffText] = await Promise.all([
      this.getStatus(repoPath),
      this.execGit(repoPath, ['status', '--porcelain=v1']),
      this.hasHeadCommit(repoPath).then((hasHead) =>
        hasHead ? this.execGit(repoPath, ['diff', 'HEAD']) : this.execGit(repoPath, ['diff', '--cached']),
      ),
    ]);

    if (porcelain === baseline.statusFingerprint && diffText === baseline.diffDigest) {
      return { violated: false, touchedFiles: [] };
    }

    const baselineUntracked = new Set(baseline.untrackedFiles);
    const newUntracked = status.untracked.filter((item) => !baselineUntracked.has(item));
    const touchedFiles = new Set<string>([
      ...status.staged,
      ...status.unstaged,
      ...newUntracked,
    ]);

    const hasHead = await this.hasHeadCommit(repoPath);
    if (hasHead) {
      await this.execGit(repoPath, ['reset', '--quiet', 'HEAD']);
      await this.execGit(repoPath, ['checkout', '--', '.']);
    }

    for (const relPath of newUntracked) {
      const safePath = assertPathInsideRepo(repoPath, relPath);
      if (fs.existsSync(safePath)) {
        fs.rmSync(safePath, { recursive: true, force: true });
      }
    }

    return {
      violated: true,
      touchedFiles: [...touchedFiles].sort(),
    };
  }

  async integrateTaskBranch(
    repoPath: string,
    options: {
      readonly targetBranch?: string | undefined;
      readonly strategy?: 'merge' | 'squash' | undefined;
      readonly commitMessage?: string | undefined;
    } = {},
  ): Promise<ChangesIntegrateBranchResult> {
    const status = await this.getStatus(repoPath);
    const sourceBranch = status.branch;
    const targetBranch = options.targetBranch?.trim() || 'main';
    const strategy = options.strategy ?? 'merge';

    if (matchesProtectedBranch(sourceBranch, this.protectedBranches)) {
      throw new Error(
        `Already on protected branch "${sourceBranch}". Switch to an isolated task branch before integrating.`,
      );
    }

    if (!status.isClean) {
      throw new Error(
        'Working tree has uncommitted changes. Approve & Commit or Discard changes before integrating into main.',
      );
    }

    if (options.commitMessage && CO_AUTHOR_TRAILER_REGEX.test(options.commitMessage)) {
      throw new Error('Integration commits must not include Co-Authored-By trailers.');
    }

    await this.execGit(repoPath, ['checkout', targetBranch]);

    try {
      if (strategy === 'squash') {
        await this.execGit(repoPath, ['merge', '--squash', sourceBranch]);
        const msg =
          options.commitMessage?.trim() || `feat(integrate): squash integrate ${sourceBranch}`;
        await this.execGitWithStdin(repoPath, ['commit', '-F', '-'], `${msg}\n`);
      } else {
        const msg =
          options.commitMessage?.trim() || `feat(integrate): merge ${sourceBranch} into ${targetBranch}`;
        await this.execGit(repoPath, ['merge', '--no-ff', '-m', msg, sourceBranch]);
      }

      const sha = (await this.execGit(repoPath, ['rev-parse', 'HEAD'])).trim();
      return {
        integrated: true,
        targetBranch,
        sourceBranch,
        commitSha: sha,
        conflictDetected: false,
        message: `Integrated ${sourceBranch} cleanly into ${targetBranch} (${sha.slice(0, 7)}).`,
      };
    } catch {
      try {
        await this.execGit(repoPath, ['merge', '--abort']);
      } catch {
        await this.execGit(repoPath, ['reset', '--hard', 'HEAD']);
      }
      await this.execGit(repoPath, ['checkout', sourceBranch]);
      return {
        integrated: false,
        targetBranch,
        sourceBranch,
        commitSha: null,
        conflictDetected: true,
        message: `Merge conflict integrating ${sourceBranch} into ${targetBranch}; aborted cleanly with task branch preserved.`,
      };
    }
  }
}
