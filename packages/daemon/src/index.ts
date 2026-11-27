export { AdapterRegistry } from './adapters/adapter-registry.js';
export {
  AGY_MODELS,
  AntigravityAdapter,
  DEFAULT_AGY_CAPABILITIES,
  buildAgyArgs,
  detectAgyCapabilitiesFromHelp,
  parseAgyOutputLine,
  type AntigravityAdapterOptions,
} from './adapters/antigravity-adapter.js';
export {
  CLAUDE_CAPABILITIES,
  CLAUDE_MODELS,
  ClaudeAdapter,
  buildClaudeArgs,
  parseClaudeStreamLine,
  type ClaudeAdapterOptions,
} from './adapters/claude-adapter.js';
export {
  DefaultCliProcessLauncher,
  detectRateLimitMessage,
  isMinimumMajorVersion,
  parseSemverVersion,
  type CliProcessLauncher,
  type CliSpawnOptions,
  type RateLimitDetection,
  type VersionProbeResult,
} from './adapters/cli-base.js';
export {
  CODEX_CAPABILITIES,
  CODEX_MODELS,
  CodexAdapter,
  buildCodexArgs,
  parseCodexJsonlLine,
  type CodexAdapterOptions,
} from './adapters/codex-adapter.js';
export { MockAdapter, createDefaultMockAdapters, type MockAdapterOptions } from './adapters/mock-adapter.js';
export { TurnRunner, type TurnEventSink } from './adapters/turn-runner.js';
export {
  ALLOWED_TASK_RUN_TRANSITIONS,
  TaskRunOrchestrator,
  canTransitionTaskRun,
  type TaskRunOrchestratorOptions,
} from './approvals/task-run-machine.js';
export { startDaemon, type RunningDaemon, type StartDaemonOptions } from './daemon.js';
export {
  DaemonDatabase,
  type AppendMessageInput,
  type CreateProjectInput,
  type RecordUsageEventInput,
  type UpdateProjectInput,
  type UsageEventRecord,
} from './db/database.js';
export { INITIAL_MIGRATIONS, type Migration } from './db/migrations.js';
export {
  GitService,
  assertPathInsideRepo,
  tokenizeSafeCommand,
  type GitServiceOptions,
  type GitStatusSummary,
} from './git/git-service.js';
export {
  DaemonRpcClient,
  JsonRpcClientError,
  type DaemonRpcClientOptions,
  type NotificationListener,
} from './ipc/client.js';
export { DaemonRpcServer, type DaemonRpcServerOptions } from './ipc/server.js';
export { resolveDefaultDataDir, resolveSocketPath, type SocketPathOptions } from './ipc/socket-path.js';
export {
  spawnManagedProcess,
  type ManagedProcess,
  type ManagedProcessExit,
  type SpawnManagedProcessOptions,
} from './process/process-tree.js';
export { sanitizeSubprocessEnv, type SanitizeEnvOptions } from './security/env-sanitizer.js';
export {
  DEFAULT_PROTECTED_BRANCHES,
  createGitShim,
  evaluateGitShimCommand,
  matchesProtectedBranch,
  prependShimToPath,
  resolveSystemGitPath,
  type CreateGitShimOptions,
  type GitShimDecision,
  type GitShimHandle,
  type GitShimPolicyOptions,
} from './security/git-shim.js';
