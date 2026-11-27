import { describe, expect, it } from 'vitest';
import type { DiscoveredPlugin, DiscoveredSkill } from '@orchdeck/shared';
import { filterDiscoveredPlugins, filterDiscoveredSkills } from './plugins-drawer.js';

describe('Plugins drawer filters and active/installed separation', () => {
  const samplePlugins: readonly DiscoveredPlugin[] = [
    {
      id: 'claude:plugin:a',
      name: 'Plugin A',
      provider: 'claude',
      scope: 'global',
      sourcePath: '~/.claude/settings.json',
      installed: true,
      activeInRepo: true,
      toggleMode: 'cli_flag',
      cliFlagHint: '--plugin-dir',
      fallbackNotice: null,
      description: 'Active claude plugin',
    },
    {
      id: 'codex:plugin:b',
      name: 'Plugin B',
      provider: 'codex',
      scope: 'global',
      sourcePath: '~/.codex/config.toml',
      installed: true,
      activeInRepo: false,
      toggleMode: 'native_only',
      cliFlagHint: null,
      fallbackNotice: 'Managed natively by CLI',
      description: 'Installed codex setting',
    },
  ];

  const sampleSkills: readonly DiscoveredSkill[] = [
    {
      id: 'skill:repo:portable:check',
      name: 'check',
      description: 'Repo checklist',
      sourcePath: '.orchdeck/skills/check/SKILL.md',
      scope: 'repo',
      provider: 'portable',
      activeInRepo: true,
      charCount: 120,
    },
    {
      id: 'skill:global:claude:audit',
      name: 'audit',
      description: 'Claude audit skill',
      sourcePath: '~/.claude/skills/audit/SKILL.md',
      scope: 'global',
      provider: 'claude',
      activeInRepo: false,
      charCount: 200,
    },
  ];

  it('partitions plugins into activeInRepo and installedCatalog by provider tab', () => {
    const all = filterDiscoveredPlugins(samplePlugins, 'all');
    expect(all.activeInRepo).toHaveLength(1);
    expect(all.installedCatalog).toHaveLength(1);

    const claudeOnly = filterDiscoveredPlugins(samplePlugins, 'claude');
    expect(claudeOnly.activeInRepo.map((p) => p.id)).toEqual(['claude:plugin:a']);
    expect(claudeOnly.installedCatalog).toHaveLength(0);
  });

  it('keeps portable skills visible under provider tabs', () => {
    const codexSkills = filterDiscoveredSkills(sampleSkills, 'codex');
    expect(codexSkills.map((s) => s.name)).toEqual(['check']);
  });
});
