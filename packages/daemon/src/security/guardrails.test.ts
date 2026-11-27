import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnManagedProcess } from '../process/process-tree.js';
import { sanitizeSubprocessEnv } from './env-sanitizer.js';
import { createGitShim, evaluateGitShimCommand, type GitShimHandle } from './git-shim.js';

const tempDirs: string[] = [];
const shims: GitShimHandle[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  while (shims.length > 0) {
    shims.pop()?.dispose();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('EnvSanitizer', () => {
  it('strips billing API keys case-insensitively in real subprocesses', async () => {
    const proc = spawnManagedProcess(
      process.execPath,
      [
        '-e',
        'process.stdout.write(JSON.stringify({ ant: process.env.ANTHROPIC_API_KEY ?? null, oai: process.env.OPENAI_API_KEY ?? null, gem: process.env.GEMINI_API_KEY ?? null, goo: process.env.GOOGLE_API_KEY ?? null, custom: process.env.CUSTOM_BILLING_KEY ?? null, safe: process.env.ORCHDECK_SAFE ?? null }));',
      ],
      {
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: 'blocked-1',
          OPENAI_API_KEY: 'blocked-2',
          GEMINI_API_KEY: 'blocked-3',
          GOOGLE_API_KEY: 'blocked-4',
          CUSTOM_BILLING_KEY: 'blocked-5',
          ORCHDECK_SAFE: 'allowed-value',
        },
        extraBlockedKeys: ['custom_billing_key'],
      },
    );

    let out = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      out += chunk;
    });

    const exit = await proc.wait;
    expect(exit.code).toBe(0);
    expect(JSON.parse(out)).toEqual({
      ant: null,
      oai: null,
      gem: null,
      goo: null,
      custom: null,
      safe: 'allowed-value',
    });
  });

  it('prevents extraEnv from re-introducing blocked billing keys', () => {
    const cleaned = sanitizeSubprocessEnv(
      { PATH: '/usr/bin', SAFE_VAR: '1' },
      { extraEnv: { OPENAI_API_KEY: 'sneaky', SAFE_VAR: '2' } },
    );
    expect(cleaned['OPENAI_API_KEY']).toBeUndefined();
    expect(cleaned['SAFE_VAR']).toBe('2');
  });
});

describe('Subprocess git shim', () => {
  it('blocks dangerous git commands even with global git flags', () => {
    expect(evaluateGitShimCommand(['push', 'origin', 'dev']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['-c', 'foo=bar', '-C', '/repo', 'push']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['checkout', 'main']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['switch', 'release/1.0']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['checkout', '-b', 'main']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['branch', '-D', 'main']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['commit', '-m', 'direct']).allowed).toBe(false);
    expect(evaluateGitShimCommand(['config', 'core.hooksPath', '/tmp']).allowed).toBe(false);

    expect(evaluateGitShimCommand(['status', '--short']).allowed).toBe(true);
    expect(evaluateGitShimCommand(['checkout', '-b', 'agent/fix-1']).allowed).toBe(true);
    expect(evaluateGitShimCommand(['checkout', '--', 'main.ts']).allowed).toBe(true);
  });

  it('intercepts real git subprocesses in PATH while allowing safe git status', async () => {
    const runtimeDir = createTempDir('orchdeck-shim-rt-');
    const repoDir = createTempDir('orchdeck-shim-repo-');

    const shim = createGitShim({ runtimeDir });
    shims.push(shim);

    execFileSync(shim.realGitPath, ['init', '-b', 'main'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync(shim.realGitPath, ['config', 'user.name', 'Test User'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync(shim.realGitPath, ['config', 'user.email', 'test@example.com'], { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n', 'utf8');
    execFileSync(shim.realGitPath, ['add', '.'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync(shim.realGitPath, ['commit', '-m', 'init'], { cwd: repoDir, stdio: 'pipe' });

    const statusProc = spawnManagedProcess('git', ['status', '--short'], {
      cwd: repoDir,
      gitShim: shim,
    });
    const statusExit = await statusProc.wait;
    expect(statusExit.code).toBe(0);

    for (const blockedArgs of [
      ['push', 'origin', 'main'],
      ['-c', 'user.name=evil', 'push'],
      ['checkout', 'main'],
      ['switch', 'main'],
      ['commit', '-m', 'unauthorized'],
    ]) {
      const blockedProc = spawnManagedProcess('git', blockedArgs, {
        cwd: repoDir,
        gitShim: shim,
      });
      let errOut = '';
      blockedProc.stderr.setEncoding('utf8');
      blockedProc.stderr.on('data', (chunk: string) => {
        errOut += chunk;
      });
      const exit = await blockedProc.wait;
      expect(exit.code).toBe(126);
      expect(errOut).toContain('[orchdeck-git-shim]');
    }
  });
});

describe('Process-tree cleanup (Win32 Job Objects / POSIX killpg)', () => {
  it('terminates both child and spawned grandchild processes on cancel', async () => {
    const workDir = createTempDir('orchdeck-proctree-');
    const pidFile = path.join(workDir, 'grandchild.pid');

    const script = [
      'const { spawn } = require("node:child_process");',
      'const fs = require("node:fs");',
      'const grand = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { stdio: "ignore" });',
      'fs.writeFileSync(process.argv[1], String(grand.pid), "utf8");',
      'process.stdout.write("READY:" + grand.pid + "\\n");',
      'setInterval(() => {}, 1000);',
    ].join(' ');

    const proc = spawnManagedProcess(process.execPath, ['-e', script, pidFile], {
      cwd: workDir,
    });

    if (process.platform === 'win32') {
      expect(proc.usesWin32JobObject).toBe(true);
    }

    const grandchildPid = await new Promise<number>((resolve, reject) => {
      let stdoutBuf = '';
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for grandchild PID output.'));
      }, 5000);

      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk: string) => {
        stdoutBuf += chunk;
        const match = /READY:(\d+)/.exec(stdoutBuf);
        if (match && match[1]) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });

    expect(isPidAlive(grandchildPid)).toBe(true);

    await proc.cancel();

    // Give the kernel a short moment to reap the terminated grandchild handle.
    let alive = isPidAlive(grandchildPid);
    for (let attempt = 0; attempt < 20 && alive; attempt += 1) {
      await new Promise((r) => setTimeout(r, 50));
      alive = isPidAlive(grandchildPid);
    }
    expect(alive).toBe(false);
  });
});
