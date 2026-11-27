import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  DAEMON_PROTOCOL_VERSION,
  JSONRPC_ERROR_CODE,
  JSONRPC_VERSION,
  isJsonRpcRequest,
  isProviderId,
  redactSecrets,
  type AgentRole,
  type ApprovalMode,
  type DaemonMethod,
  type DaemonMethodMap,
  type DaemonNotificationMap,
  type DaemonNotificationMethod,
  type JsonRpcErrorResponse,
  type JsonRpcId,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcSuccessResponse,
  type MessageRole,
  type ProjectRecord,
  type ProjectWithGitStatus,
  type ProviderId,
} from '@orchdeck/shared';
import type { AdapterRegistry } from '../adapters/adapter-registry.js';
import type { TurnRunner } from '../adapters/turn-runner.js';
import type { TaskRunOrchestrator } from '../approvals/task-run-machine.js';
import type { DaemonDatabase } from '../db/database.js';
import type { RecipeOrchestrator } from '../fusion/recipe-orchestrator.js';
import type { SecondOpinionOrchestrator } from '../fusion/second-opinion-orchestrator.js';
import { GitService } from '../git/git-service.js';
import { WorktreeManager } from '../git/worktree-manager.js';
import { ProviderCooldownTracker, buildUsageSummaryWithRadar } from '../usage/quota-radar.js';

const MAX_LINE_BYTES = 1024 * 1024;

export interface DaemonRpcServerOptions {
  readonly db: DaemonDatabase;
  readonly socketPath: string;
  readonly authToken: string;
  readonly registry?: AdapterRegistry | undefined;
  readonly turnRunner?: TurnRunner | undefined;
  readonly taskRunOrchestrator?: TaskRunOrchestrator | undefined;
  readonly recipeOrchestrator?: RecipeOrchestrator | undefined;
  readonly secondOpinionOrchestrator?: SecondOpinionOrchestrator | undefined;
  readonly cooldownTracker?: ProviderCooldownTracker | undefined;
  readonly worktreeManager?: WorktreeManager | undefined;
  readonly gitService?: GitService | undefined;
  readonly startedAtMs?: number | undefined;
}

function makeErrorResponse(
  id: JsonRpcId | null,
  code: number,
  message: string,
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message: redactSecrets(message),
    },
  };
}

function makeSuccessResponse<M extends DaemonMethod>(
  id: JsonRpcId,
  result: DaemonMethodMap[M]['result'],
): JsonRpcSuccessResponse<M> {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

function constantTimeTokenMatch(expected: string, candidate: string): boolean {
  const expectedBuf = Buffer.from(expected, 'utf8');
  const candidateBuf = Buffer.from(candidate, 'utf8');
  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}

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

function isOptionalProviderIdOrNull(value: unknown): value is ProviderId | null | undefined {
  return value === undefined || value === null || (typeof value === 'string' && isProviderId(value));
}

export class DaemonRpcServer {
  readonly socketPath: string;
  private readonly db: DaemonDatabase;
  private readonly authToken: string;
  private readonly registry: AdapterRegistry | undefined;
  private readonly turnRunner: TurnRunner | undefined;
  private readonly taskRunOrchestrator: TaskRunOrchestrator | undefined;
  private readonly recipeOrchestrator: RecipeOrchestrator | undefined;
  private readonly secondOpinionOrchestrator: SecondOpinionOrchestrator | undefined;
  private readonly cooldownTracker: ProviderCooldownTracker | undefined;
  private readonly worktreeManager: WorktreeManager;
  private readonly gitService: GitService;
  private readonly startedAtMs: number;
  private readonly server: net.Server;
  private readonly authenticatedSockets = new WeakSet<net.Socket>();
  private readonly activeSockets = new Set<net.Socket>();

  constructor(options: DaemonRpcServerOptions) {
    if (options.authToken.length < 32) {
      throw new Error('Daemon authToken must be at least 32 characters long.');
    }
    this.db = options.db;
    this.socketPath = options.socketPath;
    this.authToken = options.authToken;
    this.registry = options.registry;
    this.turnRunner = options.turnRunner;
    this.taskRunOrchestrator = options.taskRunOrchestrator;
    this.recipeOrchestrator = options.recipeOrchestrator;
    this.secondOpinionOrchestrator = options.secondOpinionOrchestrator;
    this.cooldownTracker = options.cooldownTracker;
    this.gitService = options.gitService ?? new GitService();
    this.worktreeManager = options.worktreeManager ?? new WorktreeManager(this.gitService);
    this.startedAtMs = options.startedAtMs ?? Date.now();
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });
  }

  async start(): Promise<void> {
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = (): void => {
        this.server.off('error', onError);
        if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
          fs.chmodSync(this.socketPath, 0o600);
        }
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this.socketPath);
    });
  }

  async stop(): Promise<void> {
    if (this.turnRunner) {
      await this.turnRunner.stopAll();
    }

    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    await new Promise<void>((resolve, reject) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
  }

  broadcastNotification<M extends DaemonNotificationMethod>(
    method: M,
    params: DaemonNotificationMap[M],
  ): void {
    const payload: JsonRpcNotification<M> = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    };
    const serialized = `${JSON.stringify(payload)}\n`;
    for (const socket of this.activeSockets) {
      if (!socket.destroyed && this.authenticatedSockets.has(socket)) {
        socket.write(serialized);
      }
    }
  }

  private resolveRepoWorkingDir(project: ProjectRecord, chatIdRaw: unknown): string {
    if (typeof chatIdRaw !== 'string' || chatIdRaw.length === 0) {
      return project.rootPath;
    }
    const chat = this.db.getChat(chatIdRaw);
    if (chat && chat.projectId === project.id && chat.worktreePath && fs.existsSync(chat.worktreePath)) {
      return chat.worktreePath;
    }
    return project.rootPath;
  }

  private async enrichProjectWithGitStatus(
    project: ProjectRecord,
  ): Promise<ProjectWithGitStatus> {
    if (!fs.existsSync(project.rootPath)) {
      return {
        ...project,
        currentBranch: null,
        isClean: null,
        isValidGitRepo: false,
        changedFileCount: 0,
      };
    }

    try {
      const valid = await this.gitService.isGitRepository(project.rootPath);
      if (!valid) {
        return {
          ...project,
          currentBranch: null,
          isClean: null,
          isValidGitRepo: false,
          changedFileCount: 0,
        };
      }
      const status = await this.gitService.getStatus(project.rootPath);
      const changedFiles = new Set([
        ...status.staged,
        ...status.unstaged,
        ...status.untracked,
      ]);
      return {
        ...project,
        currentBranch: status.branch,
        isClean: status.isClean,
        isValidGitRepo: true,
        changedFileCount: changedFiles.size,
      };
    } catch {
      return {
        ...project,
        currentBranch: null,
        isClean: null,
        isValidGitRepo: false,
        changedFileCount: 0,
      };
    }
  }

  private handleConnection(socket: net.Socket): void {
    this.activeSockets.add(socket);
    let buffer = '';

    socket.setEncoding('utf8');

    socket.on('close', () => {
      this.activeSockets.delete(socket);
    });

    socket.on('error', () => {
      this.activeSockets.delete(socket);
    });

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BYTES) {
        this.send(
          socket,
          makeErrorResponse(null, JSONRPC_ERROR_CODE.INVALID_REQUEST, 'Message exceeds max frame size.'),
        );
        socket.destroy();
        return;
      }

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          this.handleLine(socket, line);
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  }

  private handleLine(socket: net.Socket, rawLine: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      this.send(socket, makeErrorResponse(null, JSONRPC_ERROR_CODE.PARSE_ERROR, 'Invalid JSON payload.'));
      return;
    }

    if (!isJsonRpcRequest(parsed)) {
      this.send(
        socket,
        makeErrorResponse(null, JSONRPC_ERROR_CODE.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request.'),
      );
      return;
    }

    void this.dispatch(socket, parsed).then((response) => {
      this.send(socket, response);
    });
  }

  private async dispatch(
    socket: net.Socket,
    request: JsonRpcRequest,
  ): Promise<JsonRpcSuccessResponse | JsonRpcErrorResponse> {
    const params = request.params as unknown as Record<string, unknown>;

    if (request.method === 'daemon.authenticate') {
      const token = params['token'];
      if (typeof token !== 'string' || !constantTimeTokenMatch(this.authToken, token)) {
        return makeErrorResponse(request.id, JSONRPC_ERROR_CODE.UNAUTHORIZED, 'Invalid daemon bearer token.');
      }
      this.authenticatedSockets.add(socket);
      return makeSuccessResponse(request.id, {
        authenticated: true,
        protocolVersion: DAEMON_PROTOCOL_VERSION,
      });
    }

    if (!this.authenticatedSockets.has(socket)) {
      return makeErrorResponse(
        request.id,
        JSONRPC_ERROR_CODE.UNAUTHORIZED,
        'Authentication required before invoking daemon methods.',
      );
    }

    try {
      switch (request.method) {
        case 'daemon.health':
          return makeSuccessResponse(request.id, {
            status: 'ok',
            pid: process.pid,
            sqliteJournalMode: this.db.getJournalMode(),
            schemaVersion: this.db.getSchemaVersion(),
            uptimeMs: Math.max(0, Date.now() - this.startedAtMs),
          });

        case 'daemon.ping': {
          const nonce = params['nonce'];
          if (nonce !== undefined && typeof nonce !== 'string') {
            return makeErrorResponse(request.id, JSONRPC_ERROR_CODE.INVALID_PARAMS, 'nonce must be a string.');
          }
          return makeSuccessResponse(request.id, {
            pong: true,
            nonce,
            timestamp: new Date().toISOString(),
          });
        }

        case 'kv.set': {
          const key = params['key'];
          const value = params['value'];
          if (typeof key !== 'string' || key.length === 0 || typeof value !== 'string') {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'kv.set requires non-empty string key and string value.',
            );
          }
          this.db.setKv(key, value);
          return makeSuccessResponse(request.id, { ok: true });
        }

        case 'kv.get': {
          const key = params['key'];
          if (typeof key !== 'string' || key.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'kv.get requires non-empty string key.',
            );
          }
          return makeSuccessResponse(request.id, { value: this.db.getKv(key) });
        }

        case 'projects.list': {
          const records = this.db.listProjects();
          const enriched = await Promise.all(
            records.map((project) => this.enrichProjectWithGitStatus(project)),
          );
          return makeSuccessResponse(request.id, { projects: enriched });
        }

        case 'projects.create': {
          const name = params['name'];
          const rootPath = params['rootPath'];
          const defaultBranch = params['defaultBranch'];
          const testCommand = params['testCommand'];
          if (
            typeof rootPath !== 'string' ||
            rootPath.trim().length === 0 ||
            (name !== undefined && typeof name !== 'string') ||
            (defaultBranch !== undefined && typeof defaultBranch !== 'string') ||
            (testCommand !== undefined && testCommand !== null && typeof testCommand !== 'string')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'projects.create requires a valid rootPath directory string.',
            );
          }

          const resolvedInput = path.resolve(rootPath.trim());
          if (!fs.existsSync(resolvedInput) || !fs.statSync(resolvedInput).isDirectory()) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Directory does not exist: ${resolvedInput}`,
            );
          }

          const canonicalRoot = fs.realpathSync(resolvedInput);
          const validGit = await this.gitService.isGitRepository(canonicalRoot);
          if (!validGit) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Selected folder is not a Git repository: ${canonicalRoot}`,
            );
          }

          const liveBranch = await this.gitService.getCurrentBranch(canonicalRoot);
          const resolvedName =
            name && name.trim().length > 0 ? name.trim() : path.basename(canonicalRoot);

          const created = this.db.createProject({
            name: resolvedName,
            rootPath: canonicalRoot,
            defaultBranch: defaultBranch?.trim() || liveBranch,
            testCommand,
          });
          const enriched = await this.enrichProjectWithGitStatus(created);
          return makeSuccessResponse(request.id, { project: enriched });
        }

        case 'projects.update': {
          const id = params['id'];
          const name = params['name'];
          const testCommand = params['testCommand'];
          const allowlistRaw = params['worktreeAllowlist'];
          const setupCommandRaw = params['worktreeSetupCommand'];
          if (
            typeof id !== 'string' ||
            id.length === 0 ||
            (name !== undefined && typeof name !== 'string') ||
            (testCommand !== undefined && testCommand !== null && typeof testCommand !== 'string') ||
            (allowlistRaw !== undefined && !Array.isArray(allowlistRaw)) ||
            (setupCommandRaw !== undefined &&
              setupCommandRaw !== null &&
              typeof setupCommandRaw !== 'string')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'projects.update requires a valid project id.',
            );
          }
          const worktreeAllowlist = Array.isArray(allowlistRaw)
            ? allowlistRaw.filter((entry): entry is string => typeof entry === 'string')
            : undefined;
          const updated = this.db.updateProject(id, {
            name,
            testCommand,
            worktreeAllowlist,
            worktreeSetupCommand: setupCommandRaw,
          });
          const enriched = await this.enrichProjectWithGitStatus(updated);
          return makeSuccessResponse(request.id, { project: enriched });
        }

        case 'projects.delete': {
          const id = params['id'];
          if (typeof id !== 'string' || id.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'projects.delete requires a non-empty project id.',
            );
          }
          return makeSuccessResponse(request.id, { deleted: this.db.deleteProject(id) });
        }

        case 'chats.list': {
          const projectId = params['projectId'];
          const includeArchived = params['includeArchived'];
          if (
            typeof projectId !== 'string' ||
            projectId.length === 0 ||
            (includeArchived !== undefined && typeof includeArchived !== 'boolean')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'chats.list requires a valid projectId.',
            );
          }
          return makeSuccessResponse(request.id, {
            chats: this.db.listChats(projectId, includeArchived ?? false),
          });
        }

        case 'chats.create': {
          const projectId = params['projectId'];
          const title = params['title'];
          if (
            typeof projectId !== 'string' ||
            projectId.length === 0 ||
            (title !== undefined && typeof title !== 'string')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'chats.create requires a valid projectId.',
            );
          }
          const chat = this.db.createChat(projectId, title);
          return makeSuccessResponse(request.id, { chat });
        }

        case 'chats.rename': {
          const id = params['id'];
          const title = params['title'];
          if (
            typeof id !== 'string' ||
            id.length === 0 ||
            typeof title !== 'string' ||
            title.trim().length === 0
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'chats.rename requires non-empty id and title.',
            );
          }
          return makeSuccessResponse(request.id, { chat: this.db.renameChat(id, title) });
        }

        case 'chats.archive': {
          const id = params['id'];
          const archived = params['archived'];
          if (typeof id !== 'string' || id.length === 0 || typeof archived !== 'boolean') {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'chats.archive requires id and boolean archived flag.',
            );
          }
          return makeSuccessResponse(request.id, { chat: this.db.archiveChat(id, archived) });
        }

        case 'chats.delete': {
          const id = params['id'];
          if (typeof id !== 'string' || id.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'chats.delete requires a non-empty chat id.',
            );
          }
          return makeSuccessResponse(request.id, { deleted: this.db.deleteChat(id) });
        }

        case 'messages.list': {
          const chatId = params['chatId'];
          if (typeof chatId !== 'string' || chatId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'messages.list requires a valid chatId.',
            );
          }
          return makeSuccessResponse(request.id, { messages: this.db.listMessages(chatId) });
        }

        case 'messages.append': {
          const chatId = params['chatId'];
          const role = params['role'];
          const providerId = params['providerId'];
          const modelId = params['modelId'];
          const content = params['content'];

          if (
            typeof chatId !== 'string' ||
            chatId.length === 0 ||
            !isMessageRole(role) ||
            !isOptionalProviderIdOrNull(providerId) ||
            (modelId !== undefined && modelId !== null && typeof modelId !== 'string') ||
            typeof content !== 'string'
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'messages.append requires valid chatId, role, and content.',
            );
          }

          const message = this.db.appendMessage({
            chatId,
            role,
            providerId,
            modelId,
            content,
          });
          return makeSuccessResponse(request.id, { message });
        }

        case 'adapters.list': {
          if (!this.registry) {
            return makeSuccessResponse(request.id, { adapters: [] });
          }
          const adapters = await this.registry.listSummaries();
          return makeSuccessResponse(request.id, { adapters });
        }

        case 'turn.start': {
          if (!this.turnRunner) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'TurnRunner is not configured in this daemon instance.',
            );
          }
          const projectId = params['projectId'];
          const chatId = params['chatId'];
          const cwd = params['cwd'];
          const modelHandle = params['modelHandle'];
          const prompt = params['prompt'];
          const role = params['role'];
          const approvalMode = params['approvalMode'];

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
            !isOptionalRole(role) ||
            !isOptionalApprovalMode(approvalMode)
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'turn.start requires valid projectId, chatId, cwd, modelHandle, and prompt.',
            );
          }

          const started = await this.turnRunner.startTurn({
            projectId,
            chatId,
            cwd,
            modelHandle,
            prompt,
            role,
            approvalMode,
          });
          return makeSuccessResponse(request.id, started);
        }

        case 'turn.cancel': {
          if (!this.turnRunner) {
            return makeSuccessResponse(request.id, { cancelled: false });
          }
          const turnId = params['turnId'];
          if (typeof turnId !== 'string' || turnId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'turn.cancel requires non-empty turnId string.',
            );
          }
          const cancelled = await this.turnRunner.cancelTurn(turnId);
          return makeSuccessResponse(request.id, { cancelled });
        }

        case 'changes.inspect': {
          const projectId = params['projectId'];
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'changes.inspect requires non-empty projectId string.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          const targetDir = this.resolveRepoWorkingDir(project, params['chatId']);
          const snapshot = await this.gitService.getChangeCardSnapshot(targetDir);
          return makeSuccessResponse(request.id, { snapshot });
        }

        case 'changes.runTests': {
          const projectId = params['projectId'];
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'changes.runTests requires non-empty projectId string.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          if (!project.testCommand || project.testCommand.trim().length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project "${project.name}" does not have a configured test command.`,
            );
          }
          const targetDir = this.resolveRepoWorkingDir(project, params['chatId']);
          const result = await this.gitService.runProjectTests(targetDir, project.testCommand);
          return makeSuccessResponse(request.id, { result });
        }

        case 'changes.approve': {
          const projectId = params['projectId'];
          const commitMessage = params['commitMessage'];
          const branchSlug = params['branchSlug'];
          if (
            typeof projectId !== 'string' ||
            projectId.length === 0 ||
            typeof commitMessage !== 'string' ||
            commitMessage.trim().length === 0 ||
            (branchSlug !== undefined && typeof branchSlug !== 'string')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'changes.approve requires projectId and non-empty commitMessage.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          const targetDir = this.resolveRepoWorkingDir(project, params['chatId']);
          const branch = await this.gitService.ensureTaskBranch(
            targetDir,
            branchSlug?.trim() || `review-${Date.now()}`,
          );
          const commitSha = await this.gitService.commitApprovedChanges(
            targetDir,
            commitMessage,
          );
          return makeSuccessResponse(request.id, { branch, commitSha });
        }

        case 'changes.discard': {
          const projectId = params['projectId'];
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'changes.discard requires non-empty projectId string.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          const targetDir = this.resolveRepoWorkingDir(project, params['chatId']);
          const discardResult = await this.gitService.discardChangesWithBackup(targetDir);
          return makeSuccessResponse(request.id, discardResult);
        }

        case 'taskRun.start': {
          if (!this.taskRunOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'TaskRunOrchestrator is not configured in this daemon instance.',
            );
          }
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
            (mode !== 'plan' &&
              mode !== 'architect' &&
              mode !== 'express' &&
              mode !== 'branch_pilot')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'taskRun.start requires valid projectId, chatId, cwd, modelHandle, prompt, and mode.',
            );
          }

          const taskRun = await this.taskRunOrchestrator.startRun({
            projectId,
            chatId,
            cwd,
            modelHandle,
            prompt,
            mode,
          });
          return makeSuccessResponse(request.id, { taskRun });
        }

        case 'taskRun.approvePlan': {
          if (!this.taskRunOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'TaskRunOrchestrator is not configured in this daemon instance.',
            );
          }
          const taskRunId = params['taskRunId'];
          if (typeof taskRunId !== 'string' || taskRunId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'taskRun.approvePlan requires non-empty taskRunId.',
            );
          }
          const taskRun = await this.taskRunOrchestrator.approvePlan(taskRunId);
          return makeSuccessResponse(request.id, { taskRun });
        }

        case 'taskRun.rejectPlan': {
          if (!this.taskRunOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'TaskRunOrchestrator is not configured in this daemon instance.',
            );
          }
          const taskRunId = params['taskRunId'];
          if (typeof taskRunId !== 'string' || taskRunId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'taskRun.rejectPlan requires non-empty taskRunId.',
            );
          }
          const taskRun = await this.taskRunOrchestrator.rejectPlan(taskRunId);
          return makeSuccessResponse(request.id, { taskRun });
        }

        case 'taskRun.get': {
          if (!this.taskRunOrchestrator) {
            return makeSuccessResponse(request.id, { taskRun: null });
          }
          const taskRunId = params['taskRunId'];
          if (typeof taskRunId !== 'string' || taskRunId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'taskRun.get requires non-empty taskRunId.',
            );
          }
          const taskRun = this.taskRunOrchestrator.getRun(taskRunId);
          return makeSuccessResponse(request.id, { taskRun });
        }

        case 'usage.summary': {
          const providerId = params['providerId'];
          const includeLocalLogs = params['includeLocalLogs'];
          if (
            (providerId !== undefined && (typeof providerId !== 'string' || !isProviderId(providerId))) ||
            (includeLocalLogs !== undefined && typeof includeLocalLogs !== 'boolean')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'usage.summary providerId must be a valid ProviderId when specified.',
            );
          }
          return makeSuccessResponse(
            request.id,
            buildUsageSummaryWithRadar({
              db: this.db,
              tracker: this.cooldownTracker,
              providerFilter: providerId,
              includeLocalLogs,
            }),
          );
        }

        case 'recipes.list':
          return makeSuccessResponse(request.id, { recipes: this.db.listRecipes() });

        case 'recipes.create': {
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
            plannerModel.trim().length === 0 ||
            typeof builderModel !== 'string' ||
            builderModel.trim().length === 0 ||
            typeof reviewerModel !== 'string' ||
            reviewerModel.trim().length === 0 ||
            (fallbackModel !== undefined && fallbackModel !== null && typeof fallbackModel !== 'string') ||
            (maxReviewRetries !== undefined && typeof maxReviewRetries !== 'number')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'recipes.create requires valid name, description, plannerModel, builderModel, and reviewerModel.',
            );
          }
          const recipe = this.db.createRecipe({
            name,
            description,
            plannerModel,
            builderModel,
            reviewerModel,
            fallbackModel,
            maxReviewRetries,
          });
          return makeSuccessResponse(request.id, { recipe });
        }

        case 'recipes.update': {
          const id = params['id'];
          if (typeof id !== 'string' || id.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'recipes.update requires non-empty id.',
            );
          }
          const recipe = this.db.updateRecipe({
            id,
            name: typeof params['name'] === 'string' ? params['name'] : undefined,
            description: typeof params['description'] === 'string' ? params['description'] : undefined,
            plannerModel: typeof params['plannerModel'] === 'string' ? params['plannerModel'] : undefined,
            builderModel: typeof params['builderModel'] === 'string' ? params['builderModel'] : undefined,
            reviewerModel:
              typeof params['reviewerModel'] === 'string' ? params['reviewerModel'] : undefined,
            fallbackModel:
              params['fallbackModel'] === null || typeof params['fallbackModel'] === 'string'
                ? params['fallbackModel']
                : undefined,
            maxReviewRetries:
              typeof params['maxReviewRetries'] === 'number'
                ? params['maxReviewRetries']
                : undefined,
          });
          return makeSuccessResponse(request.id, { recipe });
        }

        case 'recipes.delete': {
          const id = params['id'];
          if (typeof id !== 'string' || id.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'recipes.delete requires non-empty id.',
            );
          }
          return makeSuccessResponse(request.id, { deleted: this.db.deleteRecipe(id) });
        }

        case 'recipes.run': {
          if (!this.recipeOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'RecipeOrchestrator is not configured in this daemon instance.',
            );
          }
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
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'recipes.run requires recipeId, projectId, chatId, cwd, and prompt.',
            );
          }
          const recipeRun = await this.recipeOrchestrator.runRecipe({
            recipeId,
            projectId,
            chatId,
            cwd,
            prompt,
          });
          return makeSuccessResponse(request.id, { recipeRun });
        }

        case 'recipes.getRun': {
          if (!this.recipeOrchestrator) {
            return makeSuccessResponse(request.id, { recipeRun: null });
          }
          const recipeRunId = params['recipeRunId'];
          if (typeof recipeRunId !== 'string' || recipeRunId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'recipes.getRun requires non-empty recipeRunId.',
            );
          }
          return makeSuccessResponse(request.id, {
            recipeRun: this.recipeOrchestrator.getRun(recipeRunId),
          });
        }

        case 'handoff.relay': {
          if (!this.recipeOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'RecipeOrchestrator is not configured in this daemon instance.',
            );
          }
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
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'handoff.relay requires projectId, chatId, cwd, targetModelHandle, goal, and nextStep.',
            );
          }
          const decisionsRaw = params['decisions'];
          const decisions = Array.isArray(decisionsRaw)
            ? decisionsRaw.filter((d): d is string => typeof d === 'string')
            : undefined;
          const relayed = await this.recipeOrchestrator.relayHandoff({
            projectId,
            chatId,
            cwd,
            targetModelHandle,
            goal,
            decisions,
            nextStep,
            sourceModelHandle:
              typeof params['sourceModelHandle'] === 'string'
                ? params['sourceModelHandle']
                : undefined,
            latestTestOutput:
              typeof params['latestTestOutput'] === 'string'
                ? params['latestTestOutput']
                : undefined,
            reason: typeof params['reason'] === 'string' ? params['reason'] : undefined,
          });
          return makeSuccessResponse(request.id, relayed);
        }

        case 'changes.integrateBranch': {
          const projectId = params['projectId'];
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'changes.integrateBranch requires non-empty projectId.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          const strategyRaw = params['strategy'];
          const strategy = strategyRaw === 'squash' || strategyRaw === 'merge' ? strategyRaw : undefined;
          const targetDir = this.resolveRepoWorkingDir(project, params['chatId']);
          const result = await this.gitService.integrateTaskBranch(targetDir, {
            targetBranch:
              typeof params['targetBranch'] === 'string'
                ? params['targetBranch']
                : project.defaultBranch,
            strategy,
            commitMessage:
              typeof params['commitMessage'] === 'string' ? params['commitMessage'] : undefined,
          });
          return makeSuccessResponse(request.id, result);
        }

        case 'secondOpinion.start': {
          if (!this.secondOpinionOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'SecondOpinionOrchestrator is not configured in this daemon instance.',
            );
          }
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
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'secondOpinion.start requires projectId, chatId, cwd, prompt, modelAHandle, and modelBHandle.',
            );
          }
          const secondOpinion = await this.secondOpinionOrchestrator.startSecondOpinion({
            projectId,
            chatId,
            cwd,
            prompt,
            modelAHandle,
            modelBHandle,
          });
          return makeSuccessResponse(request.id, { secondOpinion });
        }

        case 'secondOpinion.get': {
          if (!this.secondOpinionOrchestrator) {
            return makeSuccessResponse(request.id, { secondOpinion: null });
          }
          const secondOpinionId = params['secondOpinionId'];
          if (typeof secondOpinionId !== 'string' || secondOpinionId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'secondOpinion.get requires non-empty secondOpinionId.',
            );
          }
          return makeSuccessResponse(request.id, {
            secondOpinion: this.secondOpinionOrchestrator.getOpinion(secondOpinionId),
          });
        }

        case 'secondOpinion.resolve': {
          if (!this.secondOpinionOrchestrator) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INTERNAL_ERROR,
              'SecondOpinionOrchestrator is not configured in this daemon instance.',
            );
          }
          const secondOpinionId = params['secondOpinionId'];
          const resolution = params['resolution'];
          if (
            typeof secondOpinionId !== 'string' ||
            secondOpinionId.length === 0 ||
            (resolution !== 'A' && resolution !== 'B' && resolution !== 'SYNTHESIZE')
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'secondOpinion.resolve requires secondOpinionId and valid resolution (A | B | SYNTHESIZE).',
            );
          }
          const secondOpinion = this.secondOpinionOrchestrator.resolveOpinion({
            secondOpinionId,
            resolution,
          });
          return makeSuccessResponse(request.id, { secondOpinion });
        }

        case 'worktrees.create': {
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
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'worktrees.create requires projectId and chatId.',
            );
          }
          const project = this.db.getProject(projectId);
          const chat = this.db.getChat(chatId);
          if (!project || !chat || chat.projectId !== project.id) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'Project or chat not found for worktrees.create.',
            );
          }
          const created = await this.worktreeManager.createChatWorktree(project.rootPath, {
            chatId: chat.id,
            branchSlug: branchSlug?.trim() || chat.title,
            allowlist: project.worktreeAllowlist,
            setupCommand: project.worktreeSetupCommand,
          });
          const updatedChat = this.db.setChatWorktree(chat.id, created.worktreePath, created.branch);
          return makeSuccessResponse(request.id, {
            chat: updatedChat,
            worktreePath: created.worktreePath,
            branch: created.branch,
          });
        }

        case 'worktrees.list': {
          const projectId = params['projectId'];
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'worktrees.list requires non-empty projectId.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          const activeSet = new Set(this.db.listProjectChatWorktrees(project.id));
          const worktrees = await this.worktreeManager.listWorktrees(project.rootPath, activeSet);
          return makeSuccessResponse(request.id, { worktrees });
        }

        case 'worktrees.remove': {
          const projectId = params['projectId'];
          const chatId = params['chatId'];
          if (
            typeof projectId !== 'string' ||
            projectId.length === 0 ||
            typeof chatId !== 'string' ||
            chatId.length === 0
          ) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'worktrees.remove requires projectId and chatId.',
            );
          }
          const project = this.db.getProject(projectId);
          const chat = this.db.getChat(chatId);
          if (!project || !chat || chat.projectId !== project.id) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'Project or chat not found for worktrees.remove.',
            );
          }
          const removed = chat.worktreePath
            ? await this.worktreeManager.removeChatWorktree(project.rootPath, chat.worktreePath)
            : false;
          const updatedChat = this.db.setChatWorktree(chat.id, null, null);
          return makeSuccessResponse(request.id, { removed, chat: updatedChat });
        }

        case 'worktrees.prune': {
          const projectId = params['projectId'];
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              'worktrees.prune requires non-empty projectId.',
            );
          }
          const project = this.db.getProject(projectId);
          if (!project) {
            return makeErrorResponse(
              request.id,
              JSONRPC_ERROR_CODE.INVALID_PARAMS,
              `Project not found: ${projectId}`,
            );
          }
          const activeSet = new Set(this.db.listProjectChatWorktrees(project.id));
          const pruned = await this.worktreeManager.pruneOrphanWorktrees(project.rootPath, activeSet);
          return makeSuccessResponse(request.id, pruned);
        }

        default:
          return makeErrorResponse(
            request.id,
            JSONRPC_ERROR_CODE.METHOD_NOT_FOUND,
            `Method not found: ${String(request.method)}`,
          );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal daemon error.';
      return makeErrorResponse(request.id, JSONRPC_ERROR_CODE.INTERNAL_ERROR, message);
    }
  }

  private send(socket: net.Socket, payload: JsonRpcSuccessResponse | JsonRpcErrorResponse): void {
    if (!socket.destroyed) {
      socket.write(`${JSON.stringify(payload)}\n`);
    }
  }
}
