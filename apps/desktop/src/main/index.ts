import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProviderId,
  type AgentRole,
  type ApprovalMode,
  type MessageRole,
  type ProviderId,
} from '@orchdeck/shared';
import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron';
import { DaemonSupervisor } from './daemon-supervisor.js';
import {
  PRODUCTION_CSP,
  createSecureWebPreferences,
  isAllowedExternalUrl,
} from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

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
    const allowlistRaw = params['worktreeAllowlist'];
    const setupRaw = params['worktreeSetupCommand'];
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      (name !== undefined && typeof name !== 'string') ||
      (testCommand !== undefined && testCommand !== null && typeof testCommand !== 'string') ||
      (allowlistRaw !== undefined && !Array.isArray(allowlistRaw)) ||
      (setupRaw !== undefined && setupRaw !== null && typeof setupRaw !== 'string')
    ) {
      throw new Error('Invalid params for orchdeck:projects-update.');
    }
    const worktreeAllowlist = Array.isArray(allowlistRaw)
      ? allowlistRaw.filter((entry): entry is string => typeof entry === 'string')
      : undefined;
    return supervisor.getClient().call('projects.update', {
      id,
      name,
      testCommand,
      worktreeAllowlist,
      worktreeSetupCommand: setupRaw,
    });
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

  ipcMain.handle('orchdeck:changes-inspect', async (_event, rawArg: unknown) => {
    if (typeof rawArg === 'string' && rawArg.length > 0) {
      return supervisor.getClient().call('changes.inspect', { projectId: rawArg });
    }
    const params = asObject(rawArg, 'orchdeck:changes-inspect');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId argument for orchdeck:changes-inspect.');
    }
    return supervisor.getClient().call('changes.inspect', {
      projectId,
      chatId: typeof chatId === 'string' ? chatId : undefined,
    });
  });

  ipcMain.handle('orchdeck:changes-run-tests', async (_event, rawArg: unknown) => {
    if (typeof rawArg === 'string' && rawArg.length > 0) {
      return supervisor.getClient().call('changes.runTests', { projectId: rawArg });
    }
    const params = asObject(rawArg, 'orchdeck:changes-run-tests');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId argument for orchdeck:changes-run-tests.');
    }
    return supervisor.getClient().call('changes.runTests', {
      projectId,
      chatId: typeof chatId === 'string' ? chatId : undefined,
    });
  });

  ipcMain.handle('orchdeck:changes-approve', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:changes-approve');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const commitMessage = params['commitMessage'];
    const branchSlug = params['branchSlug'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof commitMessage !== 'string' ||
      commitMessage.trim().length === 0 ||
      (branchSlug !== undefined && typeof branchSlug !== 'string')
    ) {
      throw new Error('Invalid params for orchdeck:changes-approve.');
    }
    return supervisor.getClient().call('changes.approve', {
      projectId,
      chatId: typeof chatId === 'string' ? chatId : undefined,
      commitMessage,
      branchSlug,
    });
  });

  ipcMain.handle('orchdeck:changes-discard', async (_event, rawArg: unknown) => {
    if (typeof rawArg === 'string' && rawArg.length > 0) {
      return supervisor.getClient().call('changes.discard', { projectId: rawArg });
    }
    const params = asObject(rawArg, 'orchdeck:changes-discard');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId argument for orchdeck:changes-discard.');
    }
    return supervisor.getClient().call('changes.discard', {
      projectId,
      chatId: typeof chatId === 'string' ? chatId : undefined,
    });
  });

  ipcMain.handle('orchdeck:task-run-start', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:task-run-start');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const cwd = params['cwd'];
    const modelHandle = params['modelHandle'];
    const prompt = params['prompt'];
    const mode = params['mode'];

    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof chatId !== 'string' ||
      chatId.length === 0 ||
      typeof cwd !== 'string' ||
      cwd.length === 0 ||
      typeof modelHandle !== 'string' ||
      modelHandle.length === 0 ||
      typeof prompt !== 'string' ||
      prompt.length === 0 ||
      (mode !== 'plan' && mode !== 'architect' && mode !== 'express' && mode !== 'branch_pilot')
    ) {
      throw new Error('Invalid params for orchdeck:task-run-start.');
    }

    return supervisor.getClient().call('taskRun.start', {
      projectId,
      chatId,
      cwd,
      modelHandle,
      prompt,
      mode,
    });
  });

  ipcMain.handle('orchdeck:task-run-approve-plan', async (_event, taskRunId: unknown) => {
    if (typeof taskRunId !== 'string' || taskRunId.length === 0) {
      throw new Error('Invalid taskRunId for orchdeck:task-run-approve-plan.');
    }
    return supervisor.getClient().call('taskRun.approvePlan', { taskRunId });
  });

  ipcMain.handle('orchdeck:task-run-reject-plan', async (_event, taskRunId: unknown) => {
    if (typeof taskRunId !== 'string' || taskRunId.length === 0) {
      throw new Error('Invalid taskRunId for orchdeck:task-run-reject-plan.');
    }
    return supervisor.getClient().call('taskRun.rejectPlan', { taskRunId });
  });

  ipcMain.handle('orchdeck:usage-summary', async (_event, rawArg: unknown) => {
    if (rawArg === undefined) {
      return supervisor.getClient().call('usage.summary', {});
    }
    if (rawArg === 'claude' || rawArg === 'codex' || rawArg === 'antigravity') {
      return supervisor.getClient().call('usage.summary', { providerId: rawArg });
    }
    const params = asObject(rawArg, 'orchdeck:usage-summary');
    const providerId = params['providerId'];
    const includeLocalLogs = params['includeLocalLogs'];
    if (
      providerId !== undefined &&
      providerId !== 'claude' &&
      providerId !== 'codex' &&
      providerId !== 'antigravity'
    ) {
      throw new Error('Invalid providerId for orchdeck:usage-summary.');
    }
    return supervisor.getClient().call('usage.summary', {
      providerId,
      includeLocalLogs: typeof includeLocalLogs === 'boolean' ? includeLocalLogs : undefined,
    });
  });

  ipcMain.handle('orchdeck:recipes-list', async () => {
    return supervisor.getClient().call('recipes.list', {});
  });

  ipcMain.handle('orchdeck:recipes-create', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:recipes-create');
    const name = params['name'];
    const description = params['description'];
    const plannerModel = params['plannerModel'];
    const builderModel = params['builderModel'];
    const reviewerModel = params['reviewerModel'];
    const fallbackModel = params['fallbackModel'];
    const maxReviewRetries = params['maxReviewRetries'];
    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      typeof description !== 'string' ||
      typeof plannerModel !== 'string' ||
      typeof builderModel !== 'string' ||
      typeof reviewerModel !== 'string' ||
      (fallbackModel !== undefined && fallbackModel !== null && typeof fallbackModel !== 'string') ||
      (maxReviewRetries !== undefined && typeof maxReviewRetries !== 'number')
    ) {
      throw new Error('Invalid params for orchdeck:recipes-create.');
    }
    return supervisor.getClient().call('recipes.create', {
      name,
      description,
      plannerModel,
      builderModel,
      reviewerModel,
      fallbackModel,
      maxReviewRetries,
    });
  });

  ipcMain.handle('orchdeck:recipes-update', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:recipes-update');
    const id = params['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid id for orchdeck:recipes-update.');
    }
    return supervisor.getClient().call('recipes.update', {
      id,
      name: typeof params['name'] === 'string' ? params['name'] : undefined,
      description: typeof params['description'] === 'string' ? params['description'] : undefined,
      plannerModel: typeof params['plannerModel'] === 'string' ? params['plannerModel'] : undefined,
      builderModel: typeof params['builderModel'] === 'string' ? params['builderModel'] : undefined,
      reviewerModel: typeof params['reviewerModel'] === 'string' ? params['reviewerModel'] : undefined,
      fallbackModel:
        params['fallbackModel'] === null || typeof params['fallbackModel'] === 'string'
          ? params['fallbackModel']
          : undefined,
      maxReviewRetries:
        typeof params['maxReviewRetries'] === 'number' ? params['maxReviewRetries'] : undefined,
    });
  });

  ipcMain.handle('orchdeck:recipes-delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid id for orchdeck:recipes-delete.');
    }
    return supervisor.getClient().call('recipes.delete', { id });
  });

  ipcMain.handle('orchdeck:recipes-run', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:recipes-run');
    const recipeId = params['recipeId'];
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const cwd = params['cwd'];
    const prompt = params['prompt'];
    if (
      typeof recipeId !== 'string' ||
      recipeId.length === 0 ||
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof chatId !== 'string' ||
      chatId.length === 0 ||
      typeof cwd !== 'string' ||
      cwd.length === 0 ||
      typeof prompt !== 'string' ||
      prompt.trim().length === 0
    ) {
      throw new Error('Invalid params for orchdeck:recipes-run.');
    }
    return supervisor.getClient().call('recipes.run', {
      recipeId,
      projectId,
      chatId,
      cwd,
      prompt,
    });
  });

  ipcMain.handle('orchdeck:handoff-relay', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:handoff-relay');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const cwd = params['cwd'];
    const targetModelHandle = params['targetModelHandle'];
    const goal = params['goal'];
    const nextStep = params['nextStep'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof chatId !== 'string' ||
      chatId.length === 0 ||
      typeof cwd !== 'string' ||
      cwd.length === 0 ||
      typeof targetModelHandle !== 'string' ||
      targetModelHandle.length === 0 ||
      typeof goal !== 'string' ||
      goal.trim().length === 0 ||
      typeof nextStep !== 'string' ||
      nextStep.trim().length === 0
    ) {
      throw new Error('Invalid params for orchdeck:handoff-relay.');
    }
    const decisionsRaw = params['decisions'];
    const decisions = Array.isArray(decisionsRaw)
      ? decisionsRaw.filter((d): d is string => typeof d === 'string')
      : undefined;
    return supervisor.getClient().call('handoff.relay', {
      projectId,
      chatId,
      cwd,
      targetModelHandle,
      goal,
      decisions,
      nextStep,
      sourceModelHandle:
        typeof params['sourceModelHandle'] === 'string' ? params['sourceModelHandle'] : undefined,
      latestTestOutput:
        typeof params['latestTestOutput'] === 'string' ? params['latestTestOutput'] : undefined,
      reason: typeof params['reason'] === 'string' ? params['reason'] : undefined,
    });
  });

  ipcMain.handle('orchdeck:changes-integrate-branch', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:changes-integrate-branch');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId for orchdeck:changes-integrate-branch.');
    }
    const strategyRaw = params['strategy'];
    const strategy = strategyRaw === 'merge' || strategyRaw === 'squash' ? strategyRaw : undefined;
    return supervisor.getClient().call('changes.integrateBranch', {
      projectId,
      chatId: typeof chatId === 'string' ? chatId : undefined,
      targetBranch:
        typeof params['targetBranch'] === 'string' ? params['targetBranch'] : undefined,
      strategy,
      commitMessage:
        typeof params['commitMessage'] === 'string' ? params['commitMessage'] : undefined,
    });
  });

  ipcMain.handle('orchdeck:second-opinion-start', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:second-opinion-start');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const cwd = params['cwd'];
    const prompt = params['prompt'];
    const modelAHandle = params['modelAHandle'];
    const modelBHandle = params['modelBHandle'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof chatId !== 'string' ||
      chatId.length === 0 ||
      typeof cwd !== 'string' ||
      cwd.length === 0 ||
      typeof prompt !== 'string' ||
      prompt.trim().length === 0 ||
      typeof modelAHandle !== 'string' ||
      modelAHandle.length === 0 ||
      typeof modelBHandle !== 'string' ||
      modelBHandle.length === 0
    ) {
      throw new Error('Invalid params for orchdeck:second-opinion-start.');
    }
    return supervisor.getClient().call('secondOpinion.start', {
      projectId,
      chatId,
      cwd,
      prompt,
      modelAHandle,
      modelBHandle,
    });
  });

  ipcMain.handle('orchdeck:second-opinion-resolve', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:second-opinion-resolve');
    const secondOpinionId = params['secondOpinionId'];
    const resolution = params['resolution'];
    if (
      typeof secondOpinionId !== 'string' ||
      secondOpinionId.length === 0 ||
      (resolution !== 'A' && resolution !== 'B' && resolution !== 'SYNTHESIZE')
    ) {
      throw new Error('Invalid params for orchdeck:second-opinion-resolve.');
    }
    return supervisor.getClient().call('secondOpinion.resolve', {
      secondOpinionId,
      resolution,
    });
  });

  ipcMain.handle('orchdeck:worktrees-create', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:worktrees-create');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const branchSlug = params['branchSlug'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof chatId !== 'string' ||
      chatId.length === 0 ||
      (branchSlug !== undefined && typeof branchSlug !== 'string')
    ) {
      throw new Error('Invalid params for orchdeck:worktrees-create.');
    }
    return supervisor.getClient().call('worktrees.create', {
      projectId,
      chatId,
      branchSlug,
    });
  });

  ipcMain.handle('orchdeck:worktrees-list', async (_event, projectId: unknown) => {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId for orchdeck:worktrees-list.');
    }
    return supervisor.getClient().call('worktrees.list', { projectId });
  });

  ipcMain.handle('orchdeck:worktrees-remove', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:worktrees-remove');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof chatId !== 'string' ||
      chatId.length === 0
    ) {
      throw new Error('Invalid params for orchdeck:worktrees-remove.');
    }
    return supervisor.getClient().call('worktrees.remove', { projectId, chatId });
  });

  ipcMain.handle('orchdeck:worktrees-prune', async (_event, projectId: unknown) => {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId for orchdeck:worktrees-prune.');
    }
    return supervisor.getClient().call('worktrees.prune', { projectId });
  });

  ipcMain.handle('orchdeck:plugins-inspect', async (_event, rawParams: unknown) => {
    const params = rawParams !== undefined ? asObject(rawParams, 'orchdeck:plugins-inspect') : {};
    const projectId = params['projectId'];
    const repoPath = params['repoPath'];
    return supervisor.getClient().call('plugins.inspect', {
      projectId: typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined,
      repoPath: typeof repoPath === 'string' && repoPath.length > 0 ? repoPath : undefined,
    });
  });

  ipcMain.handle('orchdeck:plugins-toggle', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:plugins-toggle');
    const projectId = params['projectId'];
    const pluginId = params['pluginId'];
    const enabled = params['enabled'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof pluginId !== 'string' ||
      pluginId.length === 0 ||
      typeof enabled !== 'boolean'
    ) {
      throw new Error('Invalid params for orchdeck:plugins-toggle.');
    }
    return supervisor.getClient().call('plugins.toggle', { projectId, pluginId, enabled });
  });

  ipcMain.handle('orchdeck:skills-toggle', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:skills-toggle');
    const projectId = params['projectId'];
    const skillId = params['skillId'];
    const enabled = params['enabled'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      typeof skillId !== 'string' ||
      skillId.length === 0 ||
      typeof enabled !== 'boolean'
    ) {
      throw new Error('Invalid params for orchdeck:skills-toggle.');
    }
    return supervisor.getClient().call('skills.toggle', { projectId, skillId, enabled });
  });

  ipcMain.handle('orchdeck:mcp-status', async (_event, rawParams: unknown) => {
    const params = rawParams !== undefined ? asObject(rawParams, 'orchdeck:mcp-status') : {};
    const projectId = params['projectId'];
    return supervisor.getClient().call('mcp.status', {
      projectId: typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined,
    });
  });

  ipcMain.handle('orchdeck:mcp-decide-approval', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:mcp-decide-approval');
    const approvalId = params['approvalId'];
    const decision = params['decision'];
    if (
      typeof approvalId !== 'string' ||
      approvalId.length === 0 ||
      (decision !== 'approve' && decision !== 'deny')
    ) {
      throw new Error('Invalid params for orchdeck:mcp-decide-approval.');
    }
    return supervisor.getClient().call('mcp.decideApproval', { approvalId, decision });
  });

  ipcMain.handle('orchdeck:memory-list', async (_event, projectId: unknown) => {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId for orchdeck:memory-list.');
    }
    return supervisor.getClient().call('memory.list', { projectId });
  });

  ipcMain.handle('orchdeck:memory-upsert', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:memory-upsert');
    const projectId = params['projectId'];
    const id = params['id'];
    const category = params['category'];
    const title = params['title'];
    const content = params['content'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (id !== undefined && typeof id !== 'string') ||
      (category !== 'decision' && category !== 'convention' && category !== 'open_item') ||
      typeof title !== 'string' ||
      typeof content !== 'string'
    ) {
      throw new Error('Invalid params for orchdeck:memory-upsert.');
    }
    return supervisor.getClient().call('memory.upsert', {
      projectId,
      id,
      category,
      title,
      content,
    });
  });

  ipcMain.handle('orchdeck:memory-delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Invalid id for orchdeck:memory-delete.');
    }
    return supervisor.getClient().call('memory.delete', { id });
  });

  ipcMain.handle('orchdeck:memory-propose-from-change', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:memory-propose-from-change');
    const projectId = params['projectId'];
    const chatId = params['chatId'];
    const commitMessage = params['commitMessage'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (chatId !== undefined && typeof chatId !== 'string') ||
      typeof commitMessage !== 'string'
    ) {
      throw new Error('Invalid params for orchdeck:memory-propose-from-change.');
    }
    return supervisor.getClient().call('memory.proposeFromChange', {
      projectId,
      chatId,
      commitMessage,
    });
  });

  ipcMain.handle('orchdeck:memory-sync-doc', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:memory-sync-doc');
    const projectId = params['projectId'];
    const target = params['target'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (target !== 'AGENTS.md' && target !== 'CLAUDE.md')
    ) {
      throw new Error('Invalid params for orchdeck:memory-sync-doc.');
    }
    return supervisor.getClient().call('memory.syncDoc', { projectId, target });
  });

  ipcMain.handle('orchdeck:memory-import-doc', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:memory-import-doc');
    const projectId = params['projectId'];
    const target = params['target'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (target !== 'AGENTS.md' && target !== 'CLAUDE.md')
    ) {
      throw new Error('Invalid params for orchdeck:memory-import-doc.');
    }
    return supervisor.getClient().call('memory.importDoc', { projectId, target });
  });

  ipcMain.handle('orchdeck:metrics-record-task', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:metrics-record-task');
    const projectId = params['projectId'];
    const tag = params['tag'];
    const modelHandle = params['modelHandle'];
    const recipeId = params['recipeId'];
    const approvedFirstPass = params['approvedFirstPass'];
    const iterations = params['iterations'];
    const durationMs = params['durationMs'];
    if (
      typeof projectId !== 'string' ||
      projectId.length === 0 ||
      (tag !== 'feature' &&
        tag !== 'bugfix' &&
        tag !== 'refactor' &&
        tag !== 'test' &&
        tag !== 'docs') ||
      typeof modelHandle !== 'string' ||
      modelHandle.length === 0 ||
      typeof approvedFirstPass !== 'boolean'
    ) {
      throw new Error('Invalid params for orchdeck:metrics-record-task.');
    }
    return supervisor.getClient().call('metrics.recordTask', {
      projectId,
      tag,
      modelHandle,
      recipeId: typeof recipeId === 'string' ? recipeId : null,
      approvedFirstPass,
      iterations: typeof iterations === 'number' ? iterations : undefined,
      durationMs: typeof durationMs === 'number' ? durationMs : undefined,
    });
  });

  ipcMain.handle('orchdeck:metrics-recommend', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:metrics-recommend');
    const projectId = params['projectId'];
    const tag = params['tag'];
    const prompt = params['prompt'];
    const availableHandles = params['availableHandles'];
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId for orchdeck:metrics-recommend.');
    }
    return supervisor.getClient().call('metrics.recommend', {
      projectId,
      tag:
        tag === 'feature' ||
        tag === 'bugfix' ||
        tag === 'refactor' ||
        tag === 'test' ||
        tag === 'docs'
          ? tag
          : undefined,
      prompt: typeof prompt === 'string' ? prompt : undefined,
      availableHandles: Array.isArray(availableHandles)
        ? availableHandles.filter((h): h is string => typeof h === 'string')
        : undefined,
    });
  });

  ipcMain.handle('orchdeck:metrics-get-heuristics', async () => {
    return supervisor.getClient().call('metrics.getHeuristics', {});
  });

  ipcMain.handle('orchdeck:metrics-set-heuristics', async (_event, rawParams: unknown) => {
    const params = asObject(rawParams, 'orchdeck:metrics-set-heuristics');
    const heuristics = params['heuristics'];
    if (!Array.isArray(heuristics)) {
      throw new Error('Invalid params for orchdeck:metrics-set-heuristics.');
    }
    return supervisor.getClient().call('metrics.setHeuristics', { heuristics });
  });
}

const RENDERER_MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function registerRendererProtocol(): void {
  const rendererRoot = path.resolve(__dirname, '../renderer');

  protocol.handle('app', async (request) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(request.url);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (parsedUrl.hostname !== 'orchdeck') {
      return new Response('Forbidden', { status: 403 });
    }

    const rawPath = decodeURIComponent(parsedUrl.pathname);
    const relativePath = rawPath === '/' || rawPath === '' ? 'index.html' : rawPath.replace(/^\/+/, '');
    const candidatePath = path.resolve(rendererRoot, relativePath);

    if (candidatePath !== rendererRoot && !candidatePath.startsWith(`${rendererRoot}${path.sep}`)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) {
      return new Response('Not Found', { status: 404 });
    }

    const body = await fs.promises.readFile(candidatePath);
    const ext = path.extname(candidatePath).toLowerCase();
    const contentType = RENDERER_MIME_TYPES[ext] ?? 'application/octet-stream';
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Security-Policy': PRODUCTION_CSP,
      },
    });
  });
}

function configureSecurityHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('app://orchdeck/') && !details.url.startsWith('file://')) {
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
    show: false,
    title: 'Orchdeck',
    backgroundColor: '#F6F4EE',
    webPreferences: createSecureWebPreferences(preloadPath),
  });

  win.once('ready-to-show', () => {
    win.show();
    win.moveTop();
    win.focus();
  });

  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 1500);

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    process.stderr.write(
      `Renderer failed to load (${String(errorCode)}): ${errorDescription} [${validatedUrl}]\n`,
    );
  });

  win.webContents.on('console-message', (event) => {
    if (event.level === 'warning' || event.level === 'error') {
      process.stderr.write(
        `[renderer:${event.level}] ${event.message} (${event.sourceId}:${String(event.lineNumber)})\n`,
      );
    }
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
    if (targetUrl.startsWith('app://orchdeck/')) {
      return;
    }
    event.preventDefault();
  });

  const devServerUrl = process.env['ORCHDECK_DEV_SERVER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadURL('app://orchdeck/index.html');
  }

  mainWindow = win;
  return win;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  registerRendererProtocol();
  configureSecurityHeaders();
  const client = await supervisor.start();
  client.onNotification((notification) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (notification.method === 'turn.event') {
      mainWindow.webContents.send('orchdeck:turn-event', notification.params);
    } else if (notification.method === 'taskRun.updated') {
      mainWindow.webContents.send('orchdeck:task-run-updated', notification.params);
    } else if (notification.method === 'recipeRun.updated') {
      mainWindow.webContents.send('orchdeck:recipe-run-updated', notification.params);
    } else if (notification.method === 'secondOpinion.updated') {
      mainWindow.webContents.send('orchdeck:second-opinion-updated', notification.params);
    } else if (notification.method === 'mcp.approvalRequired') {
      mainWindow.webContents.send('orchdeck:mcp-approval-required', notification.params);
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
