import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { WorktreeInfo } from '@orchdeck/shared';
import { ensureOrchdeckExcluded } from '../fusion/handoff-builder.js';
import { GitService, assertPathInsideRepo, tokenizeSafeCommand } from './git-service.js';
import { spawnManagedProcess } from '../process/process-tree.js';
import { sanitizeSubprocessEnv } from '../security/env-sanitizer.js';
import { resolveSystemGitPath } from '../security/git-shim.js';

function sanitizeSlug(raw: string): string {
  const lower = raw.trim().toLowerCase();
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

  return mapped.length > 0 ? mapped.slice(0, 32) : 'worktree';
}

export interface CreateWorktreeOptions {
  readonly chatId: string;
  readonly branchSlug?: string | undefined;
  readonly allowlist?: readonly string[] | undefined;
  readonly setupCommand?: string | null | undefined;
}

export interface CreatedWorktreeResult {
  readonly worktreePath: string;
  readonly branch: string;
}

export class WorktreeManager {
  private readonly gitBinary: string;
  private readonly gitService: GitService;

  constructor(gitService?: GitService) {
    this.gitBinary = resolveSystemGitPath();
    this.gitService = gitService ?? new GitService();
  }

  private execGit(cwd: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
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
            reject(new Error(`git ${args[0] ?? ''} failed: ${stderr.trim() || err.message}`));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }

  async createChatWorktree(
    repoRoot: string,
    options: CreateWorktreeOptions,
  ): Promise<CreatedWorktreeResult> {
    const valid = await this.gitService.isGitRepository(repoRoot);
    if (!valid) {
      throw new Error(`Directory "${repoRoot}" is not a valid Git repository.`);
    }

    await ensureOrchdeckExcluded(repoRoot);

    const shortId = options.chatId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'chat';
    const slug = sanitizeSlug(options.branchSlug ?? 'task');
    const branch = `agent/${slug}-${shortId}`;
    const relWorktreeDir = path.join('.orchdeck', 'worktrees', shortId);
    const worktreePath = assertPathInsideRepo(repoRoot, relWorktreeDir);

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    if (fs.existsSync(worktreePath)) {
      await this.removeChatWorktree(repoRoot, worktreePath);
    }

    await this.execGit(repoRoot, ['worktree', 'add', '-b', branch, worktreePath]);

    // Copy explicitly allowlisted ignored files cleanly (never staged/committed into Git).
    for (const relAllowPath of options.allowlist ?? []) {
      const trimmed = relAllowPath.trim();
      if (!trimmed) {
        continue;
      }
      const srcPath = assertPathInsideRepo(repoRoot, trimmed);
      const destPath = assertPathInsideRepo(worktreePath, trimmed);
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    }

    if (options.setupCommand && options.setupCommand.trim().length > 0) {
      const tokens = tokenizeSafeCommand(options.setupCommand);
      const child = spawnManagedProcess(tokens[0] ?? '', tokens.slice(1), {
        cwd: worktreePath,
      });
      const exit = await child.wait;
      if (exit.code !== 0) {
        throw new Error(`Worktree setup command exited with code ${String(exit.code)}.`);
      }
    }

    return {
      worktreePath,
      branch,
    };
  }

  async listWorktrees(
    repoRoot: string,
    activeWorktreePaths: ReadonlySet<string> = new Set(),
  ): Promise<readonly WorktreeInfo[]> {
    const raw = await this.execGit(repoRoot, ['worktree', 'list', '--porcelain']);
    const resolvedMain = fs.realpathSync(path.resolve(repoRoot));
    const managedPrefix = path.join(resolvedMain, '.orchdeck', 'worktrees').toLowerCase();
    const activeNormalized = new Set(
      [...activeWorktreePaths].map((p) => path.resolve(p).toLowerCase()),
    );

    const blocks = raw.trim().split(/\r?\n\r?\n/);
    const entries: WorktreeInfo[] = [];

    for (const block of blocks) {
      if (!block.trim()) {
        continue;
      }
      let wtPath = '';
      let headSha: string | null = null;
      let branch: string | null = null;

      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) {
          wtPath = path.resolve(line.slice('worktree '.length).trim());
        } else if (line.startsWith('HEAD ')) {
          headSha = line.slice('HEAD '.length).trim() || null;
        } else if (line.startsWith('branch ')) {
          const ref = line.slice('branch '.length).trim();
          branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
        }
      }

      if (!wtPath) {
        continue;
      }

      let realWt = wtPath;
      try {
        if (fs.existsSync(wtPath)) {
          realWt = fs.realpathSync(wtPath);
        }
      } catch {
        realWt = wtPath;
      }

      const isMain = realWt.toLowerCase() === resolvedMain.toLowerCase();
      const isManaged = realWt.toLowerCase().startsWith(managedPrefix.toLowerCase());
      const isOrphan =
        isManaged &&
        !activeNormalized.has(realWt.toLowerCase()) &&
        !activeNormalized.has(wtPath.toLowerCase());

      entries.push({
        worktreePath: wtPath,
        branch,
        headSha,
        isMain,
        isOrphan,
      });
    }

    return entries;
  }

  async removeChatWorktree(repoRoot: string, worktreePath: string): Promise<boolean> {
    const resolved = assertPathInsideRepo(repoRoot, worktreePath);
    let removed = false;
    try {
      await this.execGit(repoRoot, ['worktree', 'remove', '--force', resolved]);
      removed = true;
    } catch {
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true });
        removed = true;
      }
    }
    await this.execGit(repoRoot, ['worktree', 'prune']);
    return removed;
  }

  async pruneOrphanWorktrees(
    repoRoot: string,
    activeWorktreePaths: ReadonlySet<string>,
  ): Promise<{ readonly prunedCount: number; readonly prunedPaths: readonly string[] }> {
    const listed = await this.listWorktrees(repoRoot, activeWorktreePaths);
    const prunedPaths: string[] = [];

    for (const wt of listed) {
      if (wt.isOrphan && !wt.isMain) {
        const ok = await this.removeChatWorktree(repoRoot, wt.worktreePath);
        if (ok) {
          prunedPaths.push(wt.worktreePath);
        }
      }
    }

    await this.execGit(repoRoot, ['worktree', 'prune']);
    return {
      prunedCount: prunedPaths.length,
      prunedPaths,
    };
  }
}
