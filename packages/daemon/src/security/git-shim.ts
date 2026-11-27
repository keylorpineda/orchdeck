import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PROTECTED_BRANCHES: readonly string[] = ['main', 'master', 'release/*'];

export interface GitShimPolicyOptions {
  readonly protectedBranches?: readonly string[] | undefined;
  readonly currentBranch?: string | undefined;
  readonly allowCommit?: boolean | undefined;
}

export interface GitShimDecision {
  readonly allowed: boolean;
  readonly subcommand: string | null;
  readonly reason?: string | undefined;
}

const GLOBAL_VALUE_FLAGS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--exec-path',
  '--config-env',
]);

const GLOBAL_BOOL_FLAGS = new Set([
  '-p',
  '--paginate',
  '-P',
  '--no-pager',
  '--no-replace-objects',
  '--bare',
  '--literal-pathspecs',
  '--glob-pathspecs',
  '--noglob-pathspecs',
  '--icase-pathspecs',
  '--no-optional-locks',
  '--version',
  '-v',
  '--help',
  '-h',
]);

const WIN32_CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

const WIN32_GIT_SHIM_CS = `
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class Program {
  private static readonly HashSet<string> GlobalValueFlags = new HashSet<string>(StringComparer.Ordinal) {
    "-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--exec-path", "--config-env"
  };

  private static readonly HashSet<string> GlobalBoolFlags = new HashSet<string>(StringComparer.Ordinal) {
    "-p", "--paginate", "-P", "--no-pager", "--no-replace-objects", "--bare",
    "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs",
    "--no-optional-locks", "--version", "-v", "--help", "-h"
  };

  private static int Main(string[] args) {
    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
    string configPath = Path.Combine(baseDir, "git-shim-config.txt");
    if (!File.Exists(configPath)) {
      Console.Error.WriteLine("[orchdeck-git-shim] Missing git-shim-config.txt.");
      return 126;
    }

    string[] lines = File.ReadAllLines(configPath, Encoding.UTF8);
    if (lines.Length < 2) {
      Console.Error.WriteLine("[orchdeck-git-shim] Invalid git-shim-config.txt.");
      return 126;
    }

    string realGit = lines[0].Trim();
    string[] protectedPatterns = lines[1].Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
    bool allowCommit = lines.Length > 2 && string.Equals(lines[2].Trim(), "allowCommit=true", StringComparison.OrdinalIgnoreCase);

    string denialReason = Evaluate(args, protectedPatterns, allowCommit);
    if (denialReason != null) {
      Console.Error.WriteLine("[orchdeck-git-shim] Blocked: " + denialReason);
      return 126;
    }

    var psi = new ProcessStartInfo();
    psi.FileName = realGit;
    psi.Arguments = BuildArgString(args);
    psi.UseShellExecute = false;

    using (var proc = Process.Start(psi)) {
      if (proc == null) {
        Console.Error.WriteLine("[orchdeck-git-shim] Failed to invoke system git binary.");
        return 126;
      }
      proc.WaitForExit();
      return proc.ExitCode;
    }
  }

  private static bool MatchesProtected(string candidate, string[] patterns) {
    string clean = candidate.Trim();
    if (clean.StartsWith("origin/", StringComparison.Ordinal)) {
      clean = clean.Substring("origin/".Length);
    }
    foreach (string rawPattern in patterns) {
      string pattern = rawPattern.Trim();
      if (pattern.Length == 0) continue;
      if (pattern.EndsWith("/*", StringComparison.Ordinal)) {
        string prefix = pattern.Substring(0, pattern.Length - 1);
        if (clean.StartsWith(prefix, StringComparison.Ordinal)) return true;
      } else if (string.Equals(clean, pattern, StringComparison.Ordinal)) {
        return true;
      }
    }
    return false;
  }

  private static string Evaluate(string[] args, string[] protectedPatterns, bool allowCommit) {
    int i = 0;
    while (i < args.Length) {
      string arg = args[i];
      if (GlobalValueFlags.Contains(arg)) {
        i += 2;
        continue;
      }
      if (arg.StartsWith("-C", StringComparison.Ordinal) && arg.Length > 2) { i += 1; continue; }
      if (arg.StartsWith("-c", StringComparison.Ordinal) && arg.Length > 2) { i += 1; continue; }
      if (arg.Contains("=") && arg.StartsWith("--", StringComparison.Ordinal)) { i += 1; continue; }
      if (GlobalBoolFlags.Contains(arg)) { i += 1; continue; }
      if (arg.StartsWith("-", StringComparison.Ordinal)) { i += 1; continue; }
      break;
    }

    if (i >= args.Length) return null;

    string sub = args[i].ToLowerInvariant();
    var subArgs = new List<string>();
    for (int j = i + 1; j < args.Length; j++) subArgs.Add(args[j]);

    if (sub == "push") {
      return "git push is blocked inside Orchdeck agent subprocesses.";
    }
    if (sub == "commit" && !allowCommit) {
      return "Direct git commit is blocked; approve edits through an Orchdeck Change Card.";
    }
    if (sub == "checkout" || sub == "switch") {
      for (int k = 0; k < subArgs.Count; k++) {
        string a = subArgs[k];
        if (a == "--") break;
        if ((a == "-b" || a == "-B" || a == "-c" || a == "-C") && k + 1 < subArgs.Count) {
          if (MatchesProtected(subArgs[k + 1], protectedPatterns)) {
            return "Creating or switching to protected branch '" + subArgs[k + 1] + "' is blocked.";
          }
          k += 1;
          continue;
        }
        if (a.StartsWith("-", StringComparison.Ordinal)) continue;
        if (MatchesProtected(a, protectedPatterns)) {
          return "Checking out protected branch '" + a + "' is blocked.";
        }
      }
    }
    if (sub == "branch") {
      bool mutating = false;
      foreach (string a in subArgs) {
        if (a == "-f" || a == "-D" || a == "-d" || a == "-m" || a == "-M" ||
            a == "--delete" || a == "--force" || a == "--move" || a == "--copy") {
          mutating = true;
        }
      }
      if (mutating) {
        foreach (string a in subArgs) {
          if (a == "--") break;
          if (a.StartsWith("-", StringComparison.Ordinal)) continue;
          if (MatchesProtected(a, protectedPatterns)) {
            return "Mutating protected branch '" + a + "' is blocked.";
          }
        }
      }
    }
    if (sub == "config") {
      foreach (string a in subArgs) {
        string lower = a.ToLowerInvariant();
        if (lower.Contains("core.hookspath") || lower.StartsWith("alias.", StringComparison.Ordinal)) {
          return "Modifying hooksPath or git aliases from an agent subprocess is blocked.";
        }
      }
    }
    return null;
  }

  private static string BuildArgString(string[] args) {
    var sb = new StringBuilder();
    for (int i = 0; i < args.Length; i++) {
      if (i > 0) sb.Append(' ');
      sb.Append(QuoteWindowsArg(args[i]));
    }
    return sb.ToString();
  }

  private static string QuoteWindowsArg(string arg) {
    if (arg.Length == 0) return "\\"\\"";
    bool needsQuotes = false;
    foreach (char c in arg) {
      if (c == ' ' || c == '\\t' || c == '"') {
        needsQuotes = true;
        break;
      }
    }
    if (!needsQuotes) return arg;
    var sb = new StringBuilder();
    sb.Append('"');
    int backslashes = 0;
    foreach (char c in arg) {
      if (c == '\\\\') {
        backslashes++;
      } else if (c == '"') {
        sb.Append('\\\\', backslashes * 2 + 1);
        sb.Append('"');
        backslashes = 0;
      } else {
        if (backslashes > 0) {
          sb.Append('\\\\', backslashes);
          backslashes = 0;
        }
        sb.Append(c);
      }
    }
    if (backslashes > 0) sb.Append('\\\\', backslashes * 2);
    sb.Append('"');
    return sb.ToString();
  }
}
`;

export function matchesProtectedBranch(
  branchName: string,
  patterns: readonly string[] = DEFAULT_PROTECTED_BRANCHES,
): boolean {
  let clean = branchName.trim();
  if (clean.startsWith('origin/')) {
    clean = clean.slice('origin/'.length);
  }
  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (pattern.length === 0) {
      continue;
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      if (clean.startsWith(prefix)) {
        return true;
      }
    } else if (clean === pattern) {
      return true;
    }
  }
  return false;
}

export function evaluateGitShimCommand(
  args: readonly string[],
  options: GitShimPolicyOptions = {},
): GitShimDecision {
  const protectedBranches = options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES;
  const allowCommit = options.allowCommit ?? false;

  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? '';
    if (GLOBAL_VALUE_FLAGS.has(arg)) {
      index += 2;
      continue;
    }
    if (
      (arg.startsWith('-C') && arg.length > 2) ||
      (arg.startsWith('-c') && arg.length > 2) ||
      (arg.startsWith('--') && arg.includes('=')) ||
      GLOBAL_BOOL_FLAGS.has(arg) ||
      arg.startsWith('-')
    ) {
      index += 1;
      continue;
    }
    break;
  }

  if (index >= args.length) {
    return { allowed: true, subcommand: null };
  }

  const subcommand = (args[index] ?? '').toLowerCase();
  const subArgs = args.slice(index + 1);

  if (subcommand === 'push') {
    return {
      allowed: false,
      subcommand,
      reason: 'git push is blocked inside Orchdeck agent subprocesses.',
    };
  }

  if (subcommand === 'commit' && !allowCommit) {
    return {
      allowed: false,
      subcommand,
      reason: 'Direct git commit is blocked; approve edits through an Orchdeck Change Card.',
    };
  }

  if (subcommand === 'checkout' || subcommand === 'switch') {
    for (let k = 0; k < subArgs.length; k += 1) {
      const a = subArgs[k] ?? '';
      if (a === '--') {
        break;
      }
      if (a === '-b' || a === '-B' || a === '-c' || a === '-C') {
        const nextBranch = subArgs[k + 1] ?? '';
        if (nextBranch && matchesProtectedBranch(nextBranch, protectedBranches)) {
          return {
            allowed: false,
            subcommand,
            reason: `Creating or switching to protected branch "${nextBranch}" is blocked.`,
          };
        }
        k += 1;
        continue;
      }
      if (a.startsWith('-')) {
        continue;
      }
      if (matchesProtectedBranch(a, protectedBranches)) {
        return {
          allowed: false,
          subcommand,
          reason: `Checking out protected branch "${a}" is blocked.`,
        };
      }
    }
  }

  if (subcommand === 'branch') {
    const mutating = subArgs.some((a) =>
      [
        '-f',
        '-D',
        '-d',
        '-m',
        '-M',
        '--delete',
        '--force',
        '--move',
        '--copy',
      ].includes(a),
    );
    if (mutating) {
      for (const a of subArgs) {
        if (a === '--') {
          break;
        }
        if (a.startsWith('-')) {
          continue;
        }
        if (matchesProtectedBranch(a, protectedBranches)) {
          return {
            allowed: false,
            subcommand,
            reason: `Mutating protected branch "${a}" is blocked.`,
          };
        }
      }
    }
  }

  if (subcommand === 'reset' && subArgs.includes('--hard')) {
    if (options.currentBranch && matchesProtectedBranch(options.currentBranch, protectedBranches)) {
      return {
        allowed: false,
        subcommand,
        reason: `Hard reset on protected branch "${options.currentBranch}" is blocked.`,
      };
    }
  }

  if (subcommand === 'config') {
    for (const a of subArgs) {
      const lower = a.toLowerCase();
      if (lower.includes('core.hookspath') || lower.startsWith('alias.')) {
        return {
          allowed: false,
          subcommand,
          reason: 'Modifying core.hooksPath or git aliases from an agent subprocess is blocked.',
        };
      }
    }
  }

  return { allowed: true, subcommand };
}

export function resolveSystemGitPath(excludeDir?: string): string {
  const pathValue = process.env['PATH'] ?? process.env['Path'] ?? '';
  const exeName = process.platform === 'win32' ? 'git.exe' : 'git';
  const normalizedExclude = excludeDir ? path.resolve(excludeDir).toLowerCase() : null;

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) {
      continue;
    }
    const resolvedDir = path.resolve(dir);
    if (normalizedExclude && resolvedDir.toLowerCase() === normalizedExclude) {
      continue;
    }
    const candidate = path.join(resolvedDir, exeName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform === 'win32') {
    const fallbacks = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
    ];
    for (const candidate of fallbacks) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error('Unable to locate the system git binary in PATH.');
}

export function prependShimToPath(env: NodeJS.ProcessEnv, shimDir: string): NodeJS.ProcessEnv {
  const existingPath = env['PATH'] ?? env['Path'] ?? '';
  const updated: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.toUpperCase() === 'PATH') {
      continue;
    }
    updated[key] = value;
  }

  updated['PATH'] = existingPath ? `${shimDir}${path.delimiter}${existingPath}` : shimDir;
  return updated;
}

export interface CreateGitShimOptions {
  readonly runtimeDir: string;
  readonly realGitPath?: string | undefined;
  readonly protectedBranches?: readonly string[] | undefined;
  readonly allowCommit?: boolean | undefined;
  readonly cacheDir?: string | undefined;
}

export interface GitShimHandle {
  readonly shimDir: string;
  readonly realGitPath: string;
  readonly applyToEnv: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  readonly dispose: () => void;
}

function ensureCompiledWin32Shim(cacheDir: string): string {
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash('sha256').update(WIN32_GIT_SHIM_CS).digest('hex').slice(0, 16);
  const exePath = path.join(cacheDir, `orchdeck-git-shim-${hash}.exe`);
  if (fs.existsSync(exePath)) {
    return exePath;
  }

  if (!fs.existsSync(WIN32_CSC_PATH)) {
    throw new Error(`Windows C# compiler not found at ${WIN32_CSC_PATH}.`);
  }

  const csPath = path.join(cacheDir, `orchdeck-git-shim-${hash}.cs`);
  fs.writeFileSync(csPath, WIN32_GIT_SHIM_CS, 'utf8');
  execFileSync(
    WIN32_CSC_PATH,
    ['/nologo', '/optimize+', `/out:${exePath}`, csPath],
    { stdio: 'pipe' },
  );
  return exePath;
}

export function createGitShim(options: CreateGitShimOptions): GitShimHandle {
  const shimDir = path.join(path.resolve(options.runtimeDir), 'git-shim');
  fs.mkdirSync(shimDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    fs.chmodSync(shimDir, 0o700);
  }

  const realGitPath = options.realGitPath ?? resolveSystemGitPath(shimDir);
  const protectedBranches = options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES;
  const allowCommit = options.allowCommit ?? false;

  if (process.platform === 'win32') {
    const cacheDir = options.cacheDir ?? path.join(os.tmpdir(), 'orchdeck-win32-cache');
    const cachedExe = ensureCompiledWin32Shim(cacheDir);
    fs.copyFileSync(cachedExe, path.join(shimDir, 'git.exe'));
    fs.writeFileSync(
      path.join(shimDir, 'git-shim-config.txt'),
      [
        realGitPath,
        protectedBranches.join(','),
        allowCommit ? 'allowCommit=true' : 'allowCommit=false',
      ].join('\n') + '\n',
      'utf8',
    );
  } else {
    const policyScriptPath = path.join(shimDir, 'git-policy.ts');
    const policyScript = `
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(shimDir, 'git-shim-config.json'))}, 'utf8'));
const args = process.argv.slice(2);
const GLOBAL_VALUE_FLAGS = new Set(['-C','-c','--git-dir','--work-tree','--namespace','--super-prefix','--exec-path','--config-env']);
const GLOBAL_BOOL_FLAGS = new Set(['-p','--paginate','-P','--no-pager','--no-replace-objects','--bare','--literal-pathspecs','--glob-pathspecs','--noglob-pathspecs','--icase-pathspecs','--no-optional-locks','--version','-v','--help','-h']);

function matchesProtected(candidate) {
  let clean = candidate.trim();
  if (clean.startsWith('origin/')) clean = clean.slice('origin/'.length);
  for (const rawPattern of config.protectedBranches) {
    const pattern = rawPattern.trim();
    if (!pattern) continue;
    if (pattern.endsWith('/*')) {
      if (clean.startsWith(pattern.slice(0, -1))) return true;
    } else if (clean === pattern) {
      return true;
    }
  }
  return false;
}

function check() {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (GLOBAL_VALUE_FLAGS.has(a)) { i += 2; continue; }
    if ((a.startsWith('-C') && a.length > 2) || (a.startsWith('-c') && a.length > 2) || (a.startsWith('--') && a.includes('=')) || GLOBAL_BOOL_FLAGS.has(a) || a.startsWith('-')) { i += 1; continue; }
    break;
  }
  if (i >= args.length) return null;
  const sub = args[i].toLowerCase();
  const subArgs = args.slice(i + 1);
  if (sub === 'push') return 'git push is blocked inside Orchdeck agent subprocesses.';
  if (sub === 'commit' && !config.allowCommit) return 'Direct git commit is blocked; approve edits through an Orchdeck Change Card.';
  if (sub === 'checkout' || sub === 'switch') {
    for (let k = 0; k < subArgs.length; k += 1) {
      const a = subArgs[k];
      if (a === '--') break;
      if (a === '-b' || a === '-B' || a === '-c' || a === '-C') {
        const next = subArgs[k + 1] ?? '';
        if (next && matchesProtected(next)) return 'Creating or switching to protected branch "' + next + '" is blocked.';
        k += 1;
        continue;
      }
      if (a.startsWith('-')) continue;
      if (matchesProtected(a)) return 'Checking out protected branch "' + a + '" is blocked.';
    }
  }
  if (sub === 'branch') {
    const mut = subArgs.some((a) => ['-f','-D','-d','-m','-M','--delete','--force','--move','--copy'].includes(a));
    if (mut) {
      for (const a of subArgs) {
        if (a === '--') break;
        if (a.startsWith('-')) continue;
        if (matchesProtected(a)) return 'Mutating protected branch "' + a + '" is blocked.';
      }
    }
  }
  if (sub === 'config') {
    for (const a of subArgs) {
      const lower = a.toLowerCase();
      if (lower.includes('core.hookspath') || lower.startsWith('alias.')) {
        return 'Modifying core.hooksPath or git aliases from an agent subprocess is blocked.';
      }
    }
  }
  return null;
}

const reason = check();
if (reason) {
  process.stderr.write('[orchdeck-git-shim] Blocked: ' + reason + '\\n');
  process.exit(126);
}

try {
  execFileSync(config.realGitPath, args, { stdio: 'inherit', shell: false });
} catch (err) {
  process.exit(typeof err.status === 'number' ? err.status : 1);
}
`;
    fs.writeFileSync(
      path.join(shimDir, 'git-shim-config.json'),
      JSON.stringify({ realGitPath, protectedBranches, allowCommit }),
      'utf8',
    );
    fs.writeFileSync(policyScriptPath, policyScript, 'utf8');

    const wrapperPath = path.join(shimDir, 'git');
    const wrapper = `#!/bin/sh\nexec env ELECTRON_RUN_AS_NODE=1 ${JSON.stringify(process.execPath)} ${JSON.stringify(policyScriptPath)} "$@"\n`;
    fs.writeFileSync(wrapperPath, wrapper, { encoding: 'utf8', mode: 0o700 });
    fs.chmodSync(wrapperPath, 0o700);
  }

  return {
    shimDir,
    realGitPath,
    applyToEnv: (env) => prependShimToPath(env, shimDir),
    dispose: () => {
      if (fs.existsSync(shimDir)) {
        fs.rmSync(shimDir, { recursive: true, force: true });
      }
    },
  };
}
