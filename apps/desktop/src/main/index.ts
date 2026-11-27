import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { DaemonSupervisor } from './daemon-supervisor.js';
import {
  PRODUCTION_CSP,
  createSecureWebPreferences,
  isAllowedExternalUrl,
} from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supervisor = new DaemonSupervisor({
  dataDir: path.join(app.getPath('userData'), 'daemon-data'),
});

function registerIpcHandlers(): void {
  ipcMain.handle('orchdeck:health', async () => {
    return supervisor.getClient().call('daemon.health', {});
  });

  ipcMain.handle('orchdeck:kv-get', async (_event, key: unknown) => {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('Invalid key argument for orchdeck:kv-get.');
    }
    return supervisor.getClient().call('kv.get', { key });
  });

  ipcMain.handle('orchdeck:kv-set', async (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || key.length === 0 || typeof value !== 'string') {
      throw new Error('Invalid key/value arguments for orchdeck:kv-set.');
    }
    return supervisor.getClient().call('kv.set', { key, value });
  });

  ipcMain.handle('orchdeck:projects-list', async () => {
    return supervisor.getClient().call('projects.list', {});
  });
}

function configureSecurityHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('file://')) {
      callback(details.responseHeaders ? { responseHeaders: details.responseHeaders } : {});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PRODUCTION_CSP],
      },
    });
  });
}

function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/index.cjs');
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 580,
    title: 'Orchdeck',
    backgroundColor: '#F6F4EE',
    webPreferences: createSecureWebPreferences(preloadPath),
  });

  win.webContents.setWindowOpenHandler((details) => {
    if (isAllowedExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const devServerUrl = process.env['ORCHDECK_DEV_SERVER_URL'];
    if (devServerUrl && targetUrl.startsWith(devServerUrl)) {
      return;
    }
    if (targetUrl.startsWith('file://')) {
      return;
    }
    event.preventDefault();
  });

  const devServerUrl = process.env['ORCHDECK_DEV_SERVER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  configureSecurityHeaders();
  await supervisor.start();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) {
    return;
  }
  quitting = true;
  event.preventDefault();
  void supervisor.stop().finally(() => {
    app.quit();
  });
});

void bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal startup error: ${message}\n`);
  app.exit(1);
});
