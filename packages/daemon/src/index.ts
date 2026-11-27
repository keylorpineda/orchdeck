export { startDaemon, type RunningDaemon, type StartDaemonOptions } from './daemon.js';
export { DaemonDatabase, type CreateProjectInput } from './db/database.js';
export { INITIAL_MIGRATIONS, type Migration } from './db/migrations.js';
export { DaemonRpcClient, JsonRpcClientError, type DaemonRpcClientOptions } from './ipc/client.js';
export { DaemonRpcServer, type DaemonRpcServerOptions } from './ipc/server.js';
export { resolveDefaultDataDir, resolveSocketPath, type SocketPathOptions } from './ipc/socket-path.js';
