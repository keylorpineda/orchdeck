import type {
  DiscoveredPlugin,
  DiscoveredSkill,
  McpHubStatus,
} from '@orchdeck/shared';
import { ArrowsClockwise, PlugsConnected, ShieldCheck } from '@phosphor-icons/react';
import { useState } from 'react';
import {
  filterDiscoveredPlugins,
  filterDiscoveredSkills,
  type PluginsFilterTab,
} from '../state/plugins-drawer';
import { useLanguage } from './LanguageProvider';

export interface PluginsDrawerProps {
  readonly projectId: string | null;
  readonly plugins: readonly DiscoveredPlugin[];
  readonly skills: readonly DiscoveredSkill[];
  readonly mcpStatus: McpHubStatus | null;
  readonly loading?: boolean | undefined;
  readonly onRefresh: () => void;
  readonly onTogglePlugin: (pluginId: string, enabled: boolean) => void;
  readonly onToggleSkill: (skillId: string, enabled: boolean) => void;
  readonly onDecideMcpApproval: (approvalId: string, decision: 'approve' | 'deny') => void;
}

const FILTER_TABS: ReadonlyArray<{ readonly id: PluginsFilterTab; readonly label?: string }> = [
  { id: 'all' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'mcp', label: 'MCP' },
];

export function PluginsDrawer({
  projectId,
  plugins,
  skills,
  mcpStatus,
  loading = false,
  onRefresh,
  onTogglePlugin,
  onToggleSkill,
  onDecideMcpApproval,
}: PluginsDrawerProps) {
  const { dict } = useLanguage();
  const [filter, setFilter] = useState<PluginsFilterTab>('all');

  const { activeInRepo, installedCatalog } = filterDiscoveredPlugins(plugins, filter);
  const visibleSkills = filterDiscoveredSkills(skills, filter);

  const renderPluginCard = (plugin: DiscoveredPlugin) => {
    const canToggle = Boolean(projectId) && plugin.toggleMode === 'cli_flag';
    return (
      <div
        key={plugin.id}
        className="surface-card flex flex-col gap-1.5 px-2.5 py-2 text-[11.5px]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">{plugin.name}</span>
              <span className="tabular-mono rounded-[4px] border border-border-subtle bg-inset px-1 py-0.5 text-[10px] uppercase text-ink-secondary">
                {plugin.provider}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-ink-tertiary">{plugin.description}</p>
          </div>

          {plugin.toggleMode === 'native_only' ? (
            <span className="shrink-0 rounded-[4px] bg-warn-bg px-1.5 py-0.5 text-[10px] font-medium text-warn">
              {plugin.fallbackNotice ?? dict.managedNativelyCli}
            </span>
          ) : (
            <button
              type="button"
              disabled={!canToggle}
              onClick={() => onTogglePlugin(plugin.id, !plugin.activeInRepo)}
              className={`orch-transition shrink-0 rounded-[4px] border px-2 py-0.5 text-[10.5px] font-medium ${
                plugin.activeInRepo
                  ? 'border-pass bg-pass-bg text-pass'
                  : 'border-border-subtle bg-inset text-ink-secondary hover:text-ink'
              } disabled:opacity-50`}
            >
              {plugin.activeInRepo ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="tabular-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-tertiary">
          {dict.pluginsTab}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh plugins"
          className="orch-transition inline-flex items-center gap-1 rounded-[4px] border border-border-subtle bg-inset px-2 py-0.5 text-[11px] text-ink-secondary hover:text-ink disabled:opacity-50"
        >
          <ArrowsClockwise size={12} weight="regular" />
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Plugins provider filter">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={`orch-transition rounded-[4px] border px-2 py-0.5 text-[11px] ${
                active
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-border-subtle bg-canvas text-ink-secondary hover:text-ink'
              }`}
            >
              {tab.label ?? dict.pluginsFilterAll}
            </button>
          );
        })}
      </div>

      {/* Local MCP Hub status & Policy Gate */}
      <section className="surface-card flex flex-col gap-2 px-2.5 py-2 text-[11.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <PlugsConnected size={13} weight="regular" />
            {dict.mcpHubTitle}
          </span>
          <span
            className={`tabular-mono rounded-[4px] px-1.5 py-0.5 text-[10px] ${
              mcpStatus?.running ? 'bg-pass-bg text-pass' : 'bg-inset text-ink-tertiary'
            }`}
          >
            {mcpStatus?.running && mcpStatus.port ? `127.0.0.1:${mcpStatus.port}` : 'OFF'}
          </span>
        </div>

        {mcpStatus && mcpStatus.pendingApprovals.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
            {mcpStatus.pendingApprovals.map((approval) => (
              <div
                key={approval.id}
                className="flex flex-col gap-1.5 rounded-[4px] border border-warn bg-warn-bg p-2"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 font-medium text-warn">
                    <ShieldCheck size={12} weight="regular" />
                    {approval.toolName}
                  </span>
                  <span className="tabular-mono text-[10px] text-ink-secondary">
                    {approval.providerId}
                  </span>
                </div>
                <p className="tabular-mono truncate text-[10.5px] text-ink-secondary">
                  {approval.argsSummary}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDecideMcpApproval(approval.id, 'approve')}
                    className="rounded-[4px] bg-accent px-2 py-0.5 text-[10.5px] font-medium text-surface"
                  >
                    {dict.mcpApproveCall}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecideMcpApproval(approval.id, 'deny')}
                    className="rounded-[4px] border border-border-strong bg-surface px-2 py-0.5 text-[10.5px] text-ink-secondary"
                  >
                    {dict.mcpDenyCall}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Active in this repo vs Installed separation */}
      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          {dict.activeInRepo} ({activeInRepo.length})
        </h3>
        {activeInRepo.length === 0 ? (
          <p className="m-0 text-[11.5px] text-ink-tertiary">{dict.noPluginsFound}</p>
        ) : (
          activeInRepo.map(renderPluginCard)
        )}
      </section>

      <div className="pixel-rule" />

      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          {dict.installedCatalog} ({installedCatalog.length})
        </h3>
        {installedCatalog.length === 0 ? (
          <p className="m-0 text-[11.5px] text-ink-tertiary">{dict.noPluginsFound}</p>
        ) : (
          installedCatalog.map(renderPluginCard)
        )}
      </section>

      <div className="pixel-rule" />

      {/* Portable Markdown Skills (SKILL.md) */}
      <section className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">
          {dict.portableSkills} ({visibleSkills.length})
        </h3>
        {visibleSkills.map((skill) => (
          <div
            key={skill.id}
            className="surface-card flex items-start justify-between gap-2 px-2.5 py-2 text-[11.5px]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-ink">{skill.name}</span>
                <span className="tabular-mono text-[10px] text-ink-tertiary">
                  {skill.charCount}ch
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-ink-tertiary">{skill.description}</p>
            </div>
            <button
              type="button"
              disabled={!projectId}
              onClick={() => onToggleSkill(skill.id, !skill.activeInRepo)}
              className={`orch-transition shrink-0 rounded-[4px] border px-2 py-0.5 text-[10.5px] font-medium ${
                skill.activeInRepo
                  ? 'border-pass bg-pass-bg text-pass'
                  : 'border-border-subtle bg-inset text-ink-secondary hover:text-ink'
              } disabled:opacity-50`}
            >
              {skill.activeInRepo ? 'ON' : 'OFF'}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
