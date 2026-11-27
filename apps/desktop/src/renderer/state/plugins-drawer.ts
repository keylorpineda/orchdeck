import type { DiscoveredPlugin, DiscoveredSkill, PluginProviderScope } from '@orchdeck/shared';

export type PluginsFilterTab = 'all' | PluginProviderScope;

export function filterDiscoveredPlugins(
  plugins: readonly DiscoveredPlugin[],
  filter: PluginsFilterTab,
): {
  readonly activeInRepo: readonly DiscoveredPlugin[];
  readonly installedCatalog: readonly DiscoveredPlugin[];
} {
  const scoped = filter === 'all' ? plugins : plugins.filter((item) => item.provider === filter);
  return {
    activeInRepo: scoped.filter((item) => item.activeInRepo),
    installedCatalog: scoped.filter((item) => !item.activeInRepo),
  };
}

export function filterDiscoveredSkills(
  skills: readonly DiscoveredSkill[],
  filter: PluginsFilterTab,
): readonly DiscoveredSkill[] {
  if (filter === 'all') {
    return skills;
  }
  if (filter === 'mcp') {
    return skills.filter((item) => item.provider === 'portable');
  }
  return skills.filter((item) => item.provider === filter || item.provider === 'portable');
}
