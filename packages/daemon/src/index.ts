export { AdapterRegistry } from './adapters/adapter-registry.js';
export { MockAdapter, createDefaultMockAdapters, type MockAdapterOptions } from './adapters/mock-adapter.js';
export { TurnRunner, type TurnEventSink } from './adapters/turn-runner.js';
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
export { GitService, assertPathInsideRepo, type GitServiceOptions, type GitStatusSummary } from './git/git-service.js';
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
