import { execFileSync, spawn, type ChildProcessByStdio } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { sanitizeSubprocessEnv } from '../security/env-sanitizer.js';
import type { GitShimHandle } from '../security/git-shim.js';

const WIN32_CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

const WIN32_JOB_RUNNER_CS = `
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Program {
  private const uint CREATE_SUSPENDED = 0x00000004;
  private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
  private const int JobObjectExtendedLimitInformation = 9;
  private const uint INFINITE = 0xFFFFFFFF;

  [StructLayout(LayoutKind.Sequential)]
  private struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX;
    public int dwY;
    public int dwXSize;
    public int dwYSize;
    public int dwXCountChars;
    public int dwYCountChars;
    public int dwFillAttribute;
    public int dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public int dwProcessId;
    public int dwThreadId;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct IO_COUNTERS {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetInformationJobObject(
    IntPtr hJob,
    int JobObjectInfoClass,
    ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION lpJobObjectInfo,
    int cbJobObjectInfoLength
  );

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CreateProcessW(
    string lpApplicationName,
    StringBuilder lpCommandLine,
    IntPtr lpProcessAttributes,
    IntPtr lpThreadAttributes,
    bool bInheritHandles,
    uint dwCreationFlags,
    IntPtr lpEnvironment,
    string lpCurrentDirectory,
    ref STARTUPINFO lpStartupInfo,
    out PROCESS_INFORMATION lpProcessInformation
  );

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern int ResumeThread(IntPtr hThread);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr hObject);

  private static int Main(string[] args) {
    if (args.Length < 1) {
      Console.Error.WriteLine("[orchdeck-job-runner] Missing target command.");
      return 126;
    }

    IntPtr hJob = CreateJobObjectW(IntPtr.Zero, null);
    if (hJob == IntPtr.Zero) {
      Console.Error.WriteLine("[orchdeck-job-runner] CreateJobObjectW failed: " + Marshal.GetLastWin32Error());
      return 126;
    }

    var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    int infoSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
    if (!SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, ref info, infoSize)) {
      Console.Error.WriteLine("[orchdeck-job-runner] SetInformationJobObject failed: " + Marshal.GetLastWin32Error());
      CloseHandle(hJob);
      return 126;
    }

    var cmdLine = new StringBuilder();
    for (int i = 0; i < args.Length; i++) {
      if (i > 0) cmdLine.Append(' ');
      cmdLine.Append(QuoteWindowsArg(args[i]));
    }

    var si = new STARTUPINFO();
    si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
    PROCESS_INFORMATION pi;

    bool created = CreateProcessW(
      null,
      cmdLine,
      IntPtr.Zero,
      IntPtr.Zero,
      true,
      CREATE_SUSPENDED,
      IntPtr.Zero,
      Directory.GetCurrentDirectory(),
      ref si,
      out pi
    );

    if (!created) {
      int err = Marshal.GetLastWin32Error();
      Console.Error.WriteLine("[orchdeck-job-runner] CreateProcessW failed: " + new Win32Exception(err).Message);
      CloseHandle(hJob);
      return 127;
    }

    if (!AssignProcessToJobObject(hJob, pi.hProcess)) {
      int err = Marshal.GetLastWin32Error();
      Console.Error.WriteLine("[orchdeck-job-runner] AssignProcessToJobObject failed: " + err);
    }

    ResumeThread(pi.hThread);
    CloseHandle(pi.hThread);

    WaitForSingleObject(pi.hProcess, INFINITE);
    uint exitCode;
    if (!GetExitCodeProcess(pi.hProcess, out exitCode)) {
      exitCode = 1;
    }

    CloseHandle(pi.hProcess);
    CloseHandle(hJob);
    return (int)exitCode;
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

export interface SpawnManagedProcessOptions {
  readonly cwd?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly extraBlockedKeys?: readonly string[] | undefined;
  readonly gitShim?: GitShimHandle | undefined;
  readonly cacheDir?: string | undefined;
}

export interface ManagedProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ManagedProcess {
  readonly pid: number | undefined;
  readonly usesWin32JobObject: boolean;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly wait: Promise<ManagedProcessExit>;
  readonly cancel: () => Promise<void>;
}

function ensureWin32JobRunner(cacheDir: string): string | null {
  if (process.platform !== 'win32' || !fs.existsSync(WIN32_CSC_PATH)) {
    return null;
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash('sha256').update(WIN32_JOB_RUNNER_CS).digest('hex').slice(0, 16);
  const exePath = path.join(cacheDir, `orchdeck-job-runner-${hash}.exe`);
  if (fs.existsSync(exePath)) {
    return exePath;
  }

  const csPath = path.join(cacheDir, `orchdeck-job-runner-${hash}.cs`);
  fs.writeFileSync(csPath, WIN32_JOB_RUNNER_CS, 'utf8');
  execFileSync(
    WIN32_CSC_PATH,
    ['/nologo', '/optimize+', `/out:${exePath}`, csPath],
    { stdio: 'pipe' },
  );
  return exePath;
}

export function spawnManagedProcess(
  command: string,
  args: readonly string[],
  options: SpawnManagedProcessOptions = {},
): ManagedProcess {
  const baseEnv = options.env ?? process.env;
  let env = sanitizeSubprocessEnv(baseEnv, {
    extraBlockedKeys: options.extraBlockedKeys,
  });
  if (options.gitShim) {
    env = options.gitShim.applyToEnv(env);
  }

  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const cacheDir = options.cacheDir ?? path.join(os.tmpdir(), 'orchdeck-win32-cache');
  const jobRunnerExe = ensureWin32JobRunner(cacheDir);

  let child: ChildProcessByStdio<null, Readable, Readable>;
  let usesWin32JobObject = false;

  if (process.platform === 'win32' && jobRunnerExe) {
    usesWin32JobObject = true;
    child = spawn(jobRunnerExe, [command, ...args], {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  let settled = false;
  const wait = new Promise<ManagedProcessExit>((resolve, reject) => {
    child.once('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.once('close', (code, signal) => {
      if (!settled) {
        settled = true;
        resolve({ code, signal });
      }
    });
  });

  const cancel = async (): Promise<void> => {
    if (settled) {
      return;
    }

    if (process.platform === 'win32') {
      if (usesWin32JobObject) {
        // Terminating the runner closes the Job Object handle (KILL_ON_JOB_CLOSE).
        child.kill();
      } else if (child.pid !== undefined) {
        try {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
          });
        } catch {
          child.kill();
        }
      }
    } else if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }

      const exited = await Promise.race([
        wait.then(() => true).catch(() => true),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 500);
        }),
      ]);

      if (!exited && !settled) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }

    await wait.catch(() => undefined);
  };

  return {
    pid: child.pid,
    usesWin32JobObject,
    stdout: child.stdout,
    stderr: child.stderr,
    wait,
    cancel,
  };
}
