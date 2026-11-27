import { execFile } from 'node:child_process';
import type { Readable } from 'node:stream';
import {
  spawnManagedProcess,
  type ManagedProcess,
} from '../process/process-tree.js';
import { sanitizeSubprocessEnv } from '../security/env-sanitizer.js';
import type { GitShimHandle } from '../security/git-shim.js';

export interface VersionProbeResult {
  readonly installed: boolean;
  readonly version?: string | undefined;
  readonly helpText?: string | undefined;
}

export interface CliSpawnOptions {
  readonly cwd: string;
  readonly envOverrides?: Readonly<Record<string, string>> | undefined;
  readonly gitShim?: GitShimHandle | undefined;
}

export interface CliProcessLauncher {
  execVersion(binary: string): Promise<VersionProbeResult>;
  spawnCli(binary: string, args: readonly string[], options: CliSpawnOptions): ManagedProcess;
}

export interface RateLimitDetection {
  readonly message: string;
  readonly resetAt?: string | undefined;
  readonly retryAfterSeconds?: number | undefined;
}

export function parseSemverVersion(rawOutput: string): string | undefined {
  const match = /\b(\d{1,4}\.\d{1,4}\.\d{1,4})\b/.exec(rawOutput);
  return match?.[1];
}

export function isMinimumMajorVersion(version: string | undefined, minMajor: number): boolean {
  if (!version) {
    return false;
  }
  const majorText = version.split('.')[0] ?? '';
  const major = Number.parseInt(majorText, 10);
  return Number.isFinite(major) && major >= minMajor;
}

export function detectRateLimitMessage(rawText: string): RateLimitDetection | null {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const isRateLimited =
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('quota exceeded') ||
    lower.includes('usage limit') ||
    lower.includes('too many requests') ||
    lower.includes('cooldown') ||
    /\b429\b/.test(lower);

  if (!isRateLimited) {
    return null;
  }

  const retryMatch = /retry[- ]after[:\s]+(\d{1,6})/i.exec(trimmed);
  const retryAfterSeconds = retryMatch?.[1] ? Number.parseInt(retryMatch[1], 10) : undefined;
  const isoMatch = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/.exec(trimmed);
  const resetAt = isoMatch?.[0];

  return {
    message: trimmed,
    retryAfterSeconds,
    resetAt,
  };
}

export async function* readLines(stream: Readable): AsyncIterable<string> {
  let buffer = '';
  stream.setEncoding('utf8');

  for await (const chunk of stream as AsyncIterable<string>) {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        yield line;
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  const trailing = buffer.trim();
  if (trailing.length > 0) {
    yield trailing;
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function execText(binary: string, args: readonly string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        env: sanitizeSubprocessEnv(process.env),
        shell: false,
        timeout: 5_000,
        maxBuffer: 512 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(`${stdout}\n${stderr}`.trim());
      },
    );
  });
}

export class DefaultCliProcessLauncher implements CliProcessLauncher {
  async execVersion(binary: string): Promise<VersionProbeResult> {
    try {
      const versionOut = await execText(binary, ['--version']);
      let helpText: string | undefined;
      try {
        helpText = await execText(binary, ['--help']);
      } catch {
        helpText = undefined;
      }
      return {
        installed: true,
        version: parseSemverVersion(versionOut),
        helpText,
      };
    } catch {
      return { installed: false };
    }
  }

  spawnCli(binary: string, args: readonly string[], options: CliSpawnOptions): ManagedProcess {
    const env = sanitizeSubprocessEnv(process.env, {
      extraEnv: options.envOverrides,
    });
    return spawnManagedProcess(binary, args, {
      cwd: options.cwd,
      env,
      gitShim: options.gitShim,
    });
  }
}
