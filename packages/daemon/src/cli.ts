import { redactSecrets } from '@orchdeck/shared';
import { parseAdapterLoaderMode, resolveDaemonAdapters } from './adapters/adapter-loader.js';
import { startDaemon } from './daemon.js';

async function main(): Promise<void> {
  const dataDir = process.env['ORCHDECK_DATA_DIR'];
  const socketPath = process.env['ORCHDECK_DAEMON_SOCKET'];
  const authToken = process.env['ORCHDECK_DAEMON_TOKEN'];
  const adapterMode = parseAdapterLoaderMode(process.env['ORCHDECK_ADAPTER_MODE']);
  const adapters = await resolveDaemonAdapters(adapterMode);

  const daemon = await startDaemon({
    dataDir: dataDir && dataDir.trim().length > 0 ? dataDir : undefined,
    socketPath: socketPath && socketPath.trim().length > 0 ? socketPath : undefined,
    authToken: authToken && authToken.trim().length > 0 ? authToken : undefined,
    adapters,
  });

  // Never emit authToken to stdout or logs.
  process.stdout.write(
    `${JSON.stringify({
      ready: true,
      pid: process.pid,
      socketPath: daemon.socketPath,
      dbPath: daemon.dbPath,
    })}\n`,
  );

  let closing = false;
  const shutdown = (): void => {
    if (closing) {
      return;
    }
    closing = true;
    void daemon
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${redactSecrets(message)}\n`);
  process.exit(1);
});
