import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CO_AUTHOR_TRAILER_REGEX } from '@orchdeck/shared';
import { sanitizeSubprocessEnv } from '../security/env-sanitizer.js';
import {
  DEFAULT_PROTECTED_BRANCHES,
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

  async getCurrentBranch(repoPath: string): Promise<string> {
    const out = await this.execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return out.trim();
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
}
