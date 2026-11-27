import {
  GearSix,
  Moon,
  PuzzlePiece,
  SidebarSimple,
  SlidersHorizontal,
  Stack,
  Sun,
} from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import { EngineMark } from './EngineMark';
import { useTheme } from './ThemeProvider';

export interface WorkbenchShellProps {
  readonly projectName?: string | undefined;
  readonly branchName?: string | undefined;
  readonly sidebarContent?: ReactNode | undefined;
  readonly drawerContent?: ReactNode | undefined;
  readonly children: ReactNode;
}

export function WorkbenchShell({
  projectName,
  branchName,
  sidebarContent,
  drawerContent,
  children,
}: WorkbenchShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setDrawerOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <header className="flex h-[40px] shrink-0 items-center justify-between border-b border-border-subtle bg-sidebar px-3 text-[12.5px] leading-[1.35]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            title="Toggle sidebar (Ctrl+\)"
            aria-label="Toggle sidebar"
            className="orch-transition flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-secondary hover:bg-inset hover:text-ink"
          >
            <SidebarSimple size={16} weight="regular" />
          </button>
          <span className="font-semibold tracking-[-0.01em] text-ink">Orchdeck</span>
          {projectName ? (
            <div className="flex items-center gap-1.5 text-ink-secondary">
              <span className="text-ink-tertiary">/</span>
              <span className="font-medium text-ink">{projectName}</span>
              {branchName ? (
                <span className="tabular-mono rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-secondary">
                  {branchName}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-[4px] border border-border-subtle bg-surface px-2 py-1"
            aria-label="Engine availability marks"
            title="Claude, Codex, Antigravity"
          >
            <EngineMark provider="claude" muted />
            <EngineMark provider="codex" muted />
            <EngineMark provider="antigravity" muted />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Graphite & Vermilion (Dark)' : 'Switch to Paper & Ink (Light)'}
            aria-label="Toggle color theme"
            className="orch-transition flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-secondary hover:bg-inset hover:text-ink"
          >
            {theme === 'light' ? <Moon size={15} weight="regular" /> : <Sun size={15} weight="regular" />}
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            title="Toggle Inspector drawer (Ctrl+Shift+P)"
            aria-label="Toggle Inspector drawer"
            className={`orch-transition flex h-7 w-7 items-center justify-center rounded-[6px] ${
              drawerOpen
                ? 'bg-accent-soft text-accent'
                : 'text-ink-secondary hover:bg-inset hover:text-ink'
            }`}
          >
            <SlidersHorizontal size={15} weight="regular" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
          <aside
            aria-label="Workspace sidebar"
            className="flex w-[236px] shrink-0 flex-col border-r border-border-subtle bg-sidebar text-[12.5px] leading-[1.35]"
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {sidebarContent ?? (
                <p className="px-2 py-3 text-ink-tertiary">No linked repositories yet.</p>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-between border-t border-border-subtle px-2.5 py-2 text-ink-secondary">
              <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px]">
                <Stack size={14} weight="regular" />
                Recipes
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px]">
                <PuzzlePiece size={14} weight="regular" />
                Plugins
              </span>
              <span
                className="inline-flex items-center justify-center rounded-[6px] p-1"
                title="Settings"
                aria-label="Settings"
              >
                <GearSix size={14} weight="regular" />
              </span>
            </footer>
          </aside>
        ) : null}

        <main className="min-w-0 flex-1 overflow-y-auto bg-canvas">
          <div className="mx-auto w-full max-w-[740px] px-6 py-8">{children}</div>
        </main>

        {drawerOpen ? (
          <aside
            aria-label="Inspector drawer"
            className="w-[340px] shrink-0 overflow-y-auto border-l border-border-subtle bg-surface p-4 text-[12.5px] leading-[1.35]"
          >
            {drawerContent ?? (
              <div>
                <h2 className="m-0 text-[13px] font-semibold text-ink">Inspector</h2>
                <p className="mt-2 text-ink-secondary">
                  Plugin Switchboard and Local MCP Hub activate in v0.2-v0.3.
                </p>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
