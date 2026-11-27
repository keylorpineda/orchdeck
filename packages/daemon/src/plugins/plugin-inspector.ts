import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  redactSecrets,
  type DiscoveredPlugin,
  type DiscoveredSkill,
  type McpServerDescriptor,
  type PluginConfigScope,
  type PluginProviderScope,
  type ProviderId,
} from '@orchdeck/shared';
import type { DaemonDatabase } from '../db/database.js';
import { assertPathInsideRepo } from '../git/git-service.js';

const MAX_READ_BYTES = 128 * 1024;
const NATIVE_FALLBACK_NOTICE = 'Managed natively by CLI';

export interface PluginInspectorOptions {
  readonly db: DaemonDatabase;
  readonly homeDir?: string | undefined;
}

interface StoredToggleMap {
  readonly [id: string]: boolean;
}

interface ParsedSkillDoc {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

function readTextSafe(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_READ_BYTES) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseJsonSafe(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseSkillMarkdown(raw: string, fallbackName: string): ParsedSkillDoc {
  const normalized = raw.replace(/\r\n/g, '\n');
  let name = fallbackName;
  let description = '';
  let body = normalized.trim();

  if (normalized.startsWith('---\n')) {
    const endMarker = normalized.indexOf('\n---', 4);
    if (endMarker !== -1) {
      const header = normalized.slice(4, endMarker);
      body = normalized.slice(endMarker + 4).trim();
      for (const line of header.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx <= 0) {
          continue;
        }
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        if (key === 'name' && val.length > 0) {
          name = redactSecrets(val);
        } else if (key === 'description' && val.length > 0) {
          description = redactSecrets(val);
        }
      }
    }
  }

  if (description.length === 0) {
    const firstNonEmpty = body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    description = redactSecrets((firstNonEmpty ?? 'Portable Markdown workflow skill.').slice(0, 140));
  }

  return {
    name,
    description,
    body: redactSecrets(body),
  };
}

function extractEnvKeys(rawEnv: unknown): string[] {
  if (typeof rawEnv !== 'object' || rawEnv === null || Array.isArray(rawEnv)) {
    return [];
  }
  return Object.keys(rawEnv as Record<string, unknown>).sort();
}

function scanMcpRecord(
  rawServers: unknown,
  sourceProvider: ProviderId,
  scope: PluginConfigScope,
  activeById: Readonly<Record<string, boolean>>,
  registry: Map<string, McpServerDescriptor>,
): void {
  if (typeof rawServers !== 'object' || rawServers === null || Array.isArray(rawServers)) {
    return;
  }

  for (const [name, entry] of Object.entries(rawServers as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }
    const obj = entry as Record<string, unknown>;
    const command = typeof obj['command'] === 'string' ? obj['command'] : null;
    const args = Array.isArray(obj['args'])
      ? obj['args'].filter((v): v is string => typeof v === 'string')
      : [];
    const url = typeof obj['url'] === 'string' ? obj['url'] : null;
    const transport: 'stdio' | 'http' = url ? 'http' : 'stdio';
    const commandOrUrl = redactSecrets(
      url ?? (command ? [command, ...args].join(' ') : 'configured'),
    );
    const envKeys = extractEnvKeys(obj['env']);
    const id = `mcp:${name}`;

    const existing = registry.get(id);
    if (existing) {
      const mergedProviders: readonly ProviderId[] = existing.sourceProviders.includes(sourceProvider)
        ? existing.sourceProviders
        : [...existing.sourceProviders, sourceProvider];
      const mergedEnvKeys = Array.from(new Set([...existing.envKeys, ...envKeys])).sort();
      registry.set(id, {
        ...existing,
        envKeys: mergedEnvKeys,
        sourceProviders: mergedProviders,
        deduplicatedFor: mergedProviders.length > 1 ? mergedProviders : existing.deduplicatedFor,
      });
    } else {
      registry.set(id, {
        id,
        name,
        transport,
        commandOrUrl,
        envKeys,
        sourceProviders: [sourceProvider],
        deduplicatedFor: [],
        activeInRepo: activeById[id] ?? scope === 'repo',
      });
    }
  }
}

function parseCodexTomlMcp(
  raw: string,
  activeById: Readonly<Record<string, boolean>>,
  registry: Map<string, McpServerDescriptor>,
  plugins: DiscoveredPlugin[],
  sourcePath: string,
): void {
  let currentServer: string | null = null;
  let command = '';
  let url = '';
  const envKeys = new Set<string>();

  const flush = (): void => {
    if (!currentServer) {
      return;
    }
    const name = currentServer;
    const id = `mcp:${name}`;
    const transport: 'stdio' | 'http' = url ? 'http' : 'stdio';
    const commandOrUrl = redactSecrets(url || command || 'configured');
    const existing = registry.get(id);
    if (existing) {
      const providers: readonly ProviderId[] = existing.sourceProviders.includes('codex')
        ? existing.sourceProviders
        : [...existing.sourceProviders, 'codex'];
      registry.set(id, {
        ...existing,
        envKeys: Array.from(new Set([...existing.envKeys, ...envKeys])).sort(),
        sourceProviders: providers,
        deduplicatedFor: providers.length > 1 ? providers : existing.deduplicatedFor,
      });
    } else {
      registry.set(id, {
        id,
        name,
        transport,
        commandOrUrl,
        envKeys: Array.from(envKeys).sort(),
        sourceProviders: ['codex'],
        deduplicatedFor: [],
        activeInRepo: activeById[id] ?? false,
      });
    }
    currentServer = null;
    command = '';
    url = '';
    envKeys.clear();
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();
      if (section.startsWith('mcp_servers.')) {
        const rest = section.slice('mcp_servers.'.length);
        const dotIdx = rest.indexOf('.');
        const serverName = (dotIdx === -1 ? rest : rest.slice(0, dotIdx)).replace(/["']/g, '').trim();
        if (currentServer !== serverName) {
          flush();
          currentServer = serverName;
        }
        continue;
      }
      flush();
      continue;
    }

    if (currentServer) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key === 'command') {
          command = value;
        } else if (key === 'url') {
          url = value;
        } else if (line.includes('env')) {
          envKeys.add(key);
        }
      }
    } else if (line.startsWith('model_providers') || line.startsWith('experimental_')) {
      plugins.push({
        id: `codex:config:${line.split('=')[0]?.trim() ?? 'setting'}`,
        name: line.split('=')[0]?.trim() ?? 'codex-setting',
        provider: 'codex',
        scope: 'global',
        sourcePath,
        installed: true,
        activeInRepo: true,
        toggleMode: 'native_only',
        cliFlagHint: null,
        fallbackNotice: NATIVE_FALLBACK_NOTICE,
        description: 'Codex native TOML setting',
      });
    }
  }
  flush();
}

export class PluginInspector {
  private readonly db: DaemonDatabase;
  private readonly homeDir: string;

  constructor(options: PluginInspectorOptions) {
    this.db = options.db;
    this.homeDir = options.homeDir ?? os.homedir();
  }

  private getToggleMap(kind: 'plugins' | 'skills', projectId?: string): StoredToggleMap {
    if (!projectId) {
      return {};
    }
    const raw = this.db.getKv(`${kind}:repo:${projectId}`);
    if (!raw) {
      return {};
    }
    const parsed = parseJsonSafe(raw);
    if (!parsed) {
      return {};
    }
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') {
        result[k] = v;
      }
    }
    return result;
  }

  togglePlugin(projectId: string, pluginId: string, enabled: boolean): boolean {
    const current = { ...this.getToggleMap('plugins', projectId), [pluginId]: enabled };
    this.db.setKv(`plugins:repo:${projectId}`, JSON.stringify(current));
    return enabled;
  }

  toggleSkill(projectId: string, skillId: string, enabled: boolean): boolean {
    const current = { ...this.getToggleMap('skills', projectId), [skillId]: enabled };
    this.db.setKv(`skills:repo:${projectId}`, JSON.stringify(current));
    return enabled;
  }

  private scanSkillDir(
    dirPath: string,
    provider: PluginProviderScope | 'portable',
    scope: PluginConfigScope,
    skillToggles: StoredToggleMap,
    repoRoot: string | null,
    results: DiscoveredSkill[],
  ): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const candidate = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const skillFile = path.join(candidate, 'SKILL.md');
        if (repoRoot) {
          try {
            assertPathInsideRepo(repoRoot, skillFile);
          } catch {
            continue;
          }
        }
        const raw = readTextSafe(skillFile);
        if (raw !== null) {
          const parsed = parseSkillMarkdown(raw, entry.name);
          const id = `skill:${scope}:${provider}:${entry.name}`;
          results.push({
            id,
            name: parsed.name,
            description: parsed.description,
            sourcePath: skillFile,
            scope,
            provider,
            activeInRepo: skillToggles[id] ?? scope === 'repo',
            charCount: parsed.body.length,
          });
        }
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        if (repoRoot) {
          try {
            assertPathInsideRepo(repoRoot, candidate);
          } catch {
            continue;
          }
        }
        const raw = readTextSafe(candidate);
        if (raw !== null) {
          const folderName = path.basename(dirPath) || 'skill';
          const parsed = parseSkillMarkdown(raw, folderName);
          const id = `skill:${scope}:${provider}:${folderName}`;
          results.push({
            id,
            name: parsed.name,
            description: parsed.description,
            sourcePath: candidate,
            scope,
            provider,
            activeInRepo: skillToggles[id] ?? scope === 'repo',
            charCount: parsed.body.length,
          });
        }
      }
    }
  }

  inspect(options: { readonly projectId?: string | undefined; readonly repoPath?: string | undefined } = {}): {
    readonly plugins: DiscoveredPlugin[];
    readonly skills: DiscoveredSkill[];
    readonly mcpServers: McpServerDescriptor[];
  } {
    const project = options.projectId ? this.db.getProject(options.projectId) : null;
    const repoRoot = options.repoPath ?? project?.rootPath ?? null;
    const pluginToggles = this.getToggleMap('plugins', options.projectId);
    const skillToggles = this.getToggleMap('skills', options.projectId);

    const plugins: DiscoveredPlugin[] = [];
    const skills: DiscoveredSkill[] = [];
    const mcpMap = new Map<string, McpServerDescriptor>();

    // 1. Claude global (~/.claude/)
    const claudeDir = path.join(this.homeDir, '.claude');
    const claudeSettingsPath = path.join(claudeDir, 'settings.json');
    const claudeSettingsRaw = readTextSafe(claudeSettingsPath);
    if (claudeSettingsRaw !== null) {
      const parsed = parseJsonSafe(claudeSettingsRaw);
      if (parsed) {
        scanMcpRecord(parsed['mcpServers'], 'claude', 'global', pluginToggles, mcpMap);
        const enabledPlugins = parsed['enabledPlugins'];
        if (typeof enabledPlugins === 'object' && enabledPlugins !== null && !Array.isArray(enabledPlugins)) {
          for (const [name, active] of Object.entries(enabledPlugins as Record<string, unknown>)) {
            const id = `claude:plugin:${name}`;
            plugins.push({
              id,
              name,
              provider: 'claude',
              scope: 'global',
              sourcePath: claudeSettingsPath,
              installed: true,
              activeInRepo: pluginToggles[id] ?? active === true,
              toggleMode: 'cli_flag',
              cliFlagHint: '--plugin-dir',
              fallbackNotice: null,
              description: 'Claude enabledPlugin entry from settings.json',
            });
          }
        } else if (!('mcpServers' in parsed)) {
          const id = 'claude:native-settings';
          plugins.push({
            id,
            name: 'Claude Native Settings',
            provider: 'claude',
            scope: 'global',
            sourcePath: claudeSettingsPath,
            installed: true,
            activeInRepo: true,
            toggleMode: 'native_only',
            cliFlagHint: null,
            fallbackNotice: NATIVE_FALLBACK_NOTICE,
            description: 'Custom Claude settings schema detected',
          });
        }
      } else {
        plugins.push({
          id: 'claude:native-settings',
          name: 'Claude Native Settings',
          provider: 'claude',
          scope: 'global',
          sourcePath: claudeSettingsPath,
          installed: true,
          activeInRepo: true,
          toggleMode: 'native_only',
          cliFlagHint: null,
          fallbackNotice: NATIVE_FALLBACK_NOTICE,
          description: 'Unrecognized schema in ~/.claude/settings.json',
        });
      }
    }
    this.scanSkillDir(path.join(claudeDir, 'skills'), 'claude', 'global', skillToggles, null, skills);

    // 2. Codex global (~/.codex/)
    const codexDir = path.join(this.homeDir, '.codex');
    const codexTomlPath = path.join(codexDir, 'config.toml');
    const codexTomlRaw = readTextSafe(codexTomlPath);
    if (codexTomlRaw !== null) {
      parseCodexTomlMcp(codexTomlRaw, pluginToggles, mcpMap, plugins, codexTomlPath);
    }
    const codexJsonPath = path.join(codexDir, 'config.json');
    const codexJsonRaw = readTextSafe(codexJsonPath);
    if (codexJsonRaw !== null) {
      const parsed = parseJsonSafe(codexJsonRaw);
      if (parsed) {
        scanMcpRecord(parsed['mcpServers'], 'codex', 'global', pluginToggles, mcpMap);
      }
    }
    this.scanSkillDir(path.join(codexDir, 'skills'), 'codex', 'global', skillToggles, null, skills);

    // 3. Antigravity global (~/.gemini/antigravity/)
    const agyDir = path.join(this.homeDir, '.gemini', 'antigravity');
    const agyConfigPath = path.join(agyDir, 'mcp_config.json');
    const agyConfigRaw = readTextSafe(agyConfigPath);
    if (agyConfigRaw !== null) {
      const parsed = parseJsonSafe(agyConfigRaw);
      if (parsed) {
        scanMcpRecord(parsed['mcpServers'], 'antigravity', 'global', pluginToggles, mcpMap);
      }
    }
    this.scanSkillDir(
      path.join(agyDir, 'skills'),
      'antigravity',
      'global',
      skillToggles,
      null,
      skills,
    );

    try {
      const pluginFolders = fs.readdirSync(path.join(agyDir, 'plugins'), { withFileTypes: true });
      for (const folder of pluginFolders) {
        if (!folder.isDirectory()) {
          continue;
        }
        const id = `antigravity:plugin:${folder.name}`;
        plugins.push({
          id,
          name: folder.name,
          provider: 'antigravity',
          scope: 'global',
          sourcePath: path.join(agyDir, 'plugins', folder.name),
          installed: true,
          activeInRepo: pluginToggles[id] ?? true,
          toggleMode: 'native_only',
          cliFlagHint: null,
          fallbackNotice: NATIVE_FALLBACK_NOTICE,
          description: 'Antigravity installed plugin bundle',
        });
      }
    } catch {
      // Directory absent — passive noop.
    }

    // 4. Repository-local configurations & portable skills
    if (repoRoot) {
      const repoMcpCandidates: ReadonlyArray<{ readonly relPath: string; readonly provider: ProviderId }> = [
        { relPath: '.mcp.json', provider: 'claude' },
        { relPath: path.join('.claude', 'settings.json'), provider: 'claude' },
        { relPath: path.join('.gemini', 'mcp_config.json'), provider: 'antigravity' },
      ];

      for (const candidate of repoMcpCandidates) {
        const fullPath = path.join(repoRoot, candidate.relPath);
        try {
          assertPathInsideRepo(repoRoot, fullPath);
        } catch {
          continue;
        }
        const raw = readTextSafe(fullPath);
        if (raw === null) {
          continue;
        }
        const parsed = parseJsonSafe(raw);
        if (parsed) {
          scanMcpRecord(parsed['mcpServers'], candidate.provider, 'repo', pluginToggles, mcpMap);
        }
      }

      const repoSkillDirs: ReadonlyArray<{
        readonly relPath: string;
        readonly provider: PluginProviderScope | 'portable';
      }> = [
        { relPath: path.join('.claude', 'skills'), provider: 'claude' },
        { relPath: path.join('.codex', 'skills'), provider: 'codex' },
        { relPath: path.join('.gemini', 'skills'), provider: 'antigravity' },
        { relPath: path.join('.orchdeck', 'skills'), provider: 'portable' },
      ];

      for (const dirSpec of repoSkillDirs) {
        this.scanSkillDir(
          path.join(repoRoot, dirSpec.relPath),
          dirSpec.provider,
          'repo',
          skillToggles,
          repoRoot,
          skills,
        );
      }
    }

    // Surface discovered MCP servers in the plugins list too so the unified switchboard renders them cleanly.
    const mcpServers = Array.from(mcpMap.values());
    for (const server of mcpServers) {
      plugins.push({
        id: server.id,
        name: server.name,
        provider: 'mcp',
        scope: 'global',
        sourcePath: server.commandOrUrl,
        installed: true,
        activeInRepo: server.activeInRepo,
        toggleMode: 'cli_flag',
        cliFlagHint: '--strict-mcp-config',
        fallbackNotice: null,
        description: `MCP (${server.transport}) · Sources: ${server.sourceProviders.join(', ')}`,
      });
    }

    return {
      plugins,
      skills,
      mcpServers,
    };
  }

  buildSkillInjectionPrompt(
    options: { readonly projectId?: string | undefined; readonly repoPath?: string | undefined },
    maxChars = 2400,
  ): string {
    const { skills } = this.inspect(options);
    const activeSkills = skills.filter((skill) => skill.activeInRepo);
    if (activeSkills.length === 0) {
      return '';
    }

    const sections: string[] = ['### Active Portable Skills (SKILL.md)'];
    let used = sections[0]?.length ?? 0;

    for (const skill of activeSkills) {
      const raw = readTextSafe(skill.sourcePath);
      if (raw === null) {
        continue;
      }
      const parsed = parseSkillMarkdown(raw, skill.name);
      const header = `\n#### Skill: ${parsed.name}\n`;
      const remaining = maxChars - used - header.length;
      if (remaining <= 40) {
        break;
      }
      const clipped =
        parsed.body.length > remaining ? `${parsed.body.slice(0, remaining - 3)}...` : parsed.body;
      const chunk = `${header}${clipped}`;
      sections.push(chunk);
      used += chunk.length;
    }

    return sections.length > 1 ? sections.join('\n') : '';
  }
}
