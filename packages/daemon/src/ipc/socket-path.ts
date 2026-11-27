import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SocketPathOptions {
  readonly dataDir?: string | undefined;
  readonly instanceId?: string | undefined;
}

export function resolveDefaultDataDir(): string {
  const envDir = process.env['ORCHDECK_DATA_DIR'];
  if (envDir && envDir.trim().length > 0) {
    return path.resolve(envDir.trim());
  }
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'Orchdeck');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Orchdeck');
  }
  const xdgState = process.env['XDG_STATE_HOME'] ?? path.join(os.homedir(), '.local', 'state');
  return path.join(xdgState, 'orchdeck');
}

export function resolveSocketPath(options: SocketPathOptions = {}): string {
  const instanceId =
    options.instanceId && options.instanceId.trim().length > 0
      ? options.instanceId.replace(/[^a-zA-Z0-9_-]/g, '')
      : `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

  if (process.platform === 'win32') {
    const rawUser = os.userInfo().username || 'user';
    const safeUser = rawUser.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `\\\\.\\pipe\\orchdeck-${safeUser}-${instanceId}`;
  }

  const baseDir = options.dataDir ? path.resolve(options.dataDir) : resolveDefaultDataDir();
  const runDir = path.join(baseDir, 'run');
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(runDir, 0o700);
  return path.join(runDir, `orchdeck-${instanceId}.sock`);
}
