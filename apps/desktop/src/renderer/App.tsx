import { useEffect, useState } from 'react';
import type { DaemonHealthResult } from '@orchdeck/shared';
import { ThemeProvider } from './components/ThemeProvider';
import { WorkbenchShell } from './components/WorkbenchShell';

function WorkbenchView() {
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
    <WorkbenchShell>
      <section className="surface-card p-5">
        <p className="tabular-mono m-0 text-[11.5px] uppercase tracking-[0.06em] text-ink-tertiary">
          Precision Editorial Workbench
        </p>
        <h1 className="mt-1 mb-2 font-[var(--font-editorial)] text-[22px] font-medium tracking-[-0.015em] text-ink">
          Orchdeck Command Deck
        </h1>
        {statusError ? (
          <p className="tabular-mono m-0 text-[11.5px] text-ink-secondary">{statusError}</p>
        ) : health ? (
          <div>
            <p className="tabular-mono m-0 text-[11.5px] text-ink-secondary">
              Daemon PID: {health.pid} · SQLite Mode: {health.sqliteJournalMode} · Schema v
              {health.schemaVersion}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleWriteCheck()}
                className="orch-transition rounded-[6px] border border-accent bg-accent px-3.5 py-1.5 text-[12.5px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover"
              >
                Verify SQLite WAL Persistence
              </button>
              {persistedNote ? (
                <span className="tabular-mono rounded-[4px] bg-pass-bg px-2 py-0.5 text-[11.5px] text-pass">
                  ✓ {persistedNote}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="tabular-mono m-0 text-[11.5px] text-ink-secondary">
            Connecting to local Core Daemon...
          </p>
        )}
      </section>
    </WorkbenchShell>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <WorkbenchView />
    </ThemeProvider>
  );
}
