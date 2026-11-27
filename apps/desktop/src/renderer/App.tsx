import { useEffect, useState } from 'react';
import type { DaemonHealthResult } from '@orchdeck/shared';

export function App() {
  const [health, setHealth] = useState<DaemonHealthResult | null>(null);
  const [persistedNote, setPersistedNote] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.orchdeck;
    if (!api) {
      setStatusError('Preload bridge unavailable (browser preview mode).');
      return;
    }

    void Promise.all([api.health(), api.getKv('phase0_smoke_check')])
      .then(([healthResult, kvResult]) => {
        setHealth(healthResult);
        setPersistedNote(kvResult.value);
      })
      .catch((err: unknown) => {
        setStatusError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const handleWriteCheck = async (): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    const stamp = new Date().toISOString();
    await api.setKv('phase0_smoke_check', stamp);
    const verified = await api.getKv('phase0_smoke_check');
    setPersistedNote(verified.value);
  };

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="brand">Orchdeck</span>
        <span className="marks" aria-label="Engine marks">
          <span>●</span>
          <span>■</span>
          <span>◆</span>
        </span>
      </header>
      <main className="workbench">
        <section className="card">
          <h1 className="card-title">Phase 0 Core Daemon Foundation</h1>
          {statusError ? (
            <p className="meta">{statusError}</p>
          ) : health ? (
            <div>
              <p className="meta">
                Daemon PID: {health.pid} · SQLite Mode: {health.sqliteJournalMode} · Schema v
                {health.schemaVersion}
              </p>
              <div className="actions">
                <button className="btn" type="button" onClick={() => void handleWriteCheck()}>
                  Verify SQLite WAL Persistence
                </button>
                {persistedNote ? <span className="badge-pass">✓ {persistedNote}</span> : null}
              </div>
            </div>
          ) : (
            <p className="meta">Connecting to local Core Daemon...</p>
          )}
        </section>
      </main>
    </div>
  );
}
