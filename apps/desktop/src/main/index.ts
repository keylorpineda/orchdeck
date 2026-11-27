import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProviderId,
  type AgentRole,
  type ApprovalMode,
  type MessageRole,
  type ProviderId,
} from '@orchdeck/shared';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
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

let mainWindow: BrowserWindow | null = null;

function isOptionalRole(value: unknown): value is AgentRole | undefined {
  return value === undefined || value === 'planner' || value === 'builder' || value === 'reviewer';
}

function isOptionalApprovalMode(value: unknown): value is ApprovalMode | undefined {
  return (
    value === undefined ||
    value === 'plan' ||
    value === 'architect' ||
    value === 'express' ||
    value === 'branch_pilot'
  );
}

function isMessageRole(value: unknown): value is MessageRole {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function isOptionalProviderOrNull(value: unknown): value is ProviderId | null | undefined {
  return value === undefined || value === null || (typeof value === 'string' && isProviderId(value));
}

function asObject(value: unknown, handlerName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid params object for ${handlerName}.`);
  }
  return value as Record<string, unknown>;
}

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

  ipcMain.handle('orchdeck:dialog-pick-directory', async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, directoryPath: null };
    }
    return { canceled: false, directoryPath: result.filePaths[0] ?? null };
  });

  ipcMain.handle('orchdeck:projects-list', async () => {
    return supervisor.getClient().call('projects.list', {});
  });

  ipcMain.handle('orchdeck:projects-create', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:projects-create');
    const rootPath = params['rootPath'];
    const name = params['name'];
    const defaultBranch = params['defaultBranch'];
    const testCommand = params['testCommand'];
    if (
      typeof rootPath !== 'string' ||
      rootPath.trim().length === 0 ||
      (name !== undefined && typeof name !== 'string') ||
      (defaultBranch !== undefined && typeof defaultBranch !== 'string') ||
      (testCommand !== undefined && testCommand !== null && typeof testCommand !== 'string')
    ) {
      throw new Error('Invalid params for orchdeck:projects-create.');
    }
    return supervisor.getClient().call('projects.create', {
      rootPath,
      name,
      defaultBranch,
      testCommand,
    });
  });

  ipcMain.handle('orchdeck:projects-update', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:projects-update');
    const id = params['id'];
    const name = params['name'];
    const testCommand = params['testCommand'];
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      (name !== undefined && typeof name !== 'string') ||
      (testCommand !== undefined && testCommand !== null && typeof testCommand !== 'string')
    ) {
      throw new Error('Invalid params for orchdeck:projects-update.');
    }
    return supervisor.getClient().call('projects.update', { id, name, testCommand });
  });

  ipcMain.handle('orchdeck:projects-delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid project id for orchdeck:projects-delete.');
    }
    return supervisor.getClient().call('projects.delete', { id });
  });

  ipcMain.handle('orchdeck:chats-list', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:chats-list');
    const projectId = params['projectId'];
    const includeArchived = params['includeArchived'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (includeArchived !== undefined && typeof includeArchived !== 'boolean')
    ) {
      throw new Error('Invalid params for orchdeck:chats-list.');
    }
    return supervisor.getClient().call('chats.list', { projectId, includeArchived });
  });

  ipcMain.handle('orchdeck:chats-create', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:chats-create');
    const projectId = params['projectId'];
    const title = params['title'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (title !== undefined && typeof title !== 'string')
    ) {
      throw new Error('Invalid params for orchdeck:chats-create.');
    }
    return supervisor.getClient().call('chats.create', { projectId, title });
  });

  ipcMain.handle('orchdeck:chats-rename', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:chats-rename');
    const id = params['id'];
    const title = params['title'];
    if (typeof id !== 'string' || id.length === 0 || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Invalid params for orchdeck:chats-rename.');
    }
    return supervisor.getClient().call('chats.rename', { id, title });
  });

  ipcMain.handle('orchdeck:chats-archive', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:chats-archive');
    const id = params['id'];
    const archived = params['archived'];
    if (typeof id !== 'string' || id.length === 0 || typeof archived !== 'boolean') {
      throw new Error('Invalid params for orchdeck:chats-archive.');
    }
    return supervisor.getClient().call('chats.archive', { id, archived });
  });

  ipcMain.handle('orchdeck:chats-delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid chat id for orchdeck:chats-delete.');
    }
    return supervisor.getClient().call('chats.delete', { id });
  });

  ipcMain.handle('orchdeck:messages-list', async (_event, chatId: unknown) => {
    if (typeof chatId !== 'string' || chatId.length === 0) {
      throw new Error('Invalid chatId for orchdeck:messages-list.');
    }
    return supervisor.getClient().call('messages.list', { chatId });
  });

  ipcMain.handle('orchdeck:messages-append', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:messages-append');
    const chatId = params['chatId'];
    const role = params['role'];
    const providerId = params['providerId'];
    const modelId = params['modelId'];
    const content = params['content'];
    if (
      typeof chatId !== 'string' ||
      chatId.length === 0 ||
      !isMessageRole(role) ||
      !isOptionalProviderOrNull(providerId) ||
      (modelId !== undefined && modelId !== null && typeof modelId !== 'string') ||
      typeof content !== 'string'
    ) {
      throw new Error('Invalid params for orchdeck:messages-append.');
    }
    return supervisor.getClient().call('messages.append', {
      chatId,
      role,
      providerId,
      modelId,
      content,
    });
  });

  ipcMain.handle('orchdeck:adapters-list', async () => {
    return supervisor.getClient().call('adapters.list', {});
  });

  ipcMain.handle('orchdeck:turn-start', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:turn-start');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const cwd = params['cwd'];
    const modelHandle = params['modelHandle'];
    const prompt = params['prompt'];
    const role = params['role'];
    const approvalMode = params['approvalMode'];

    if (
      typeof projectId !== 'string' ||
      typeof chatId !== 'string' ||
      typeof cwd !== 'string' ||
      typeof modelHandle !== 'string' ||
      typeof prompt !== 'string' ||
      !isOptionalRole(role) ||
      !isOptionalApprovalMode(approvalMode)
    ) {
      throw new Error('Invalid arguments for orchdeck:turn-start.');
    }

    return supervisor.getClient().call('turn.start', {
      projectId,
      chatId,
      cwd,
      modelHandle,
      prompt,
      role,
      approvalMode,
    });
  });

  ipcMain.handle('orchdeck:turn-cancel', async (_event, turnId: unknown) => {
    if (typeof turnId !== 'string' || turnId.length === 0) {
      throw new Error('Invalid turnId argument for orchdeck:turn-cancel.');
    }
    return supervisor.getClient().call('turn.cancel', { turnId });
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

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
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

  mainWindow = win;
  return win;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  configureSecurityHeaders();
  const client = await supervisor.start();
  client.onNotification((notification) => {
    if (notification.method === 'turn.event' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('orchdeck:turn-event', notification.params);
    }
  });
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
