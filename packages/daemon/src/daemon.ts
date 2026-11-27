import crypto from 'node:crypto';
import path from 'node:path';
import type { ProviderAdapter } from '@orchdeck/shared';
import { AdapterRegistry } from './adapters/adapter-registry.js';
import { createDefaultMockAdapters } from './adapters/mock-adapter.js';
import { TurnRunner } from './adapters/turn-runner.js';
import { TaskRunOrchestrator } from './approvals/task-run-machine.js';
import { DaemonDatabase } from './db/database.js';
import { RecipeOrchestrator } from './fusion/recipe-orchestrator.js';
import { SecondOpinionOrchestrator } from './fusion/second-opinion-orchestrator.js';
import { GitService } from './git/git-service.js';
import { WorktreeManager } from './git/worktree-manager.js';
import { DaemonRpcServer } from './ipc/server.js';
import { resolveDefaultDataDir, resolveSocketPath } from './ipc/socket-path.js';
import { LocalMcpHub } from './mcp/local-mcp-hub.js';
import { buildBudgetedMemoryInjection } from './memory/project-memory.js';
import { PluginInspector } from './plugins/plugin-inspector.js';
import { ProviderCooldownTracker } from './usage/quota-radar.js';

export interface StartDaemonOptions {
  readonly dataDir?: string | undefined;
  readonly dbPath?: string | undefined;
  readonly socketPath?: string | undefined;
  readonly authToken?: string | undefined;
  readonly adapters?: readonly ProviderAdapter[] | undefined;
  readonly gitService?: GitService | undefined;
}

export interface RunningDaemon {
  readonly dataDir: string;
  readonly dbPath: string;
  readonly socketPath: string;
  readonly authToken: string;
  readonly close: () => Promise<void>;
}

export async function startDaemon(options: StartDaemonOptions = {}): Promise<RunningDaemon> {
  const dataDir = options.dataDir ? path.resolve(options.dataDir) : resolveDefaultDataDir();
  const dbPath = options.dbPath ? path.resolve(options.dbPath) : path.join(dataDir, 'orchdeck.db');
  const socketPath = options.socketPath ?? resolveSocketPath({ dataDir });
  const authToken = options.authToken ?? crypto.randomBytes(32).toString('hex');

  const db = new DaemonDatabase(dbPath);
  const registry = new AdapterRegistry(options.adapters ?? createDefaultMockAdapters());
  const gitService = options.gitService ?? new GitService();
  const pluginInspector = new PluginInspector({ db });

  let server: DaemonRpcServer | null = null;
  const mcpHub = new LocalMcpHub({
    onApprovalRequired: (approval) => {
      server?.broadcastNotification('mcp.approvalRequired', { approval });
    },
  });

  const turnRunner = new TurnRunner({
    registry,
    db,
    emitEvent: (notification) => {
      server?.broadcastNotification('turn.event', notification);
    },
    contextBuilder: (cwd) => {
      const matchedProject = db
        .listProjects()
        .find((proj) => cwd === proj.rootPath || cwd.startsWith(proj.rootPath));
      if (!matchedProject) {
        return '';
      }
      const memoryPrompt = buildBudgetedMemoryInjection(db.listProjectMemory(matchedProject.id));
      const skillPrompt = pluginInspector.buildSkillInjectionPrompt({
        projectId: matchedProject.id,
        repoPath: matchedProject.rootPath,
      });
      return [memoryPrompt, skillPrompt].filter((part) => part.length > 0).join('\n\n');
    },
  });

  const taskRunOrchestrator = new TaskRunOrchestrator({
    turnRunner,
    gitService,
    emitUpdated: (taskRun) => {
      server?.broadcastNotification('taskRun.updated', { taskRun });
    },
  });

  const recipeOrchestrator = new RecipeOrchestrator({
    db,
    turnRunner,
    gitService,
    emitUpdated: (recipeRun) => {
      server?.broadcastNotification('recipeRun.updated', { recipeRun });
    },
  });

  const secondOpinionOrchestrator = new SecondOpinionOrchestrator({
    turnRunner,
    gitService,
    emitUpdated: (secondOpinion) => {
      server?.broadcastNotification('secondOpinion.updated', { secondOpinion });
    },
  });

  const cooldownTracker = new ProviderCooldownTracker(turnRunner);
  const worktreeManager = new WorktreeManager(gitService);

  server = new DaemonRpcServer({
    db,
    socketPath,
    authToken,
    registry,
    turnRunner,
    taskRunOrchestrator,
    recipeOrchestrator,
    secondOpinionOrchestrator,
    cooldownTracker,
    pluginInspector,
    mcpHub,
    worktreeManager,
    gitService,
  });

  try {
    await mcpHub.start();
    await server.start();
  } catch (err) {
    await mcpHub.close();
    db.close();
    throw err;
  }

  return {
    dataDir,
    dbPath,
    socketPath,
    authToken,
    close: async () => {
      cooldownTracker.dispose();
      secondOpinionOrchestrator.dispose();
      recipeOrchestrator.dispose();
      taskRunOrchestrator.dispose();
      await server.stop();
      await mcpHub.close();
      db.close();
    },
  };
}
