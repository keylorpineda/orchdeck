import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonDatabase } from '../db/database.js';
import { PluginInspector } from './plugin-inspector.js';

const tempPaths: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const target = tempPaths.pop();
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
});

describe('PluginInspector read-only discovery and SKILL.md portability', () => {
  it('scans Claude, Codex, Antigravity, and repo configs while stripping env secrets', () => {
    const tmpRoot = makeTempDir('orchdeck-plugins-');
    const homeDir = path.join(tmpRoot, 'home');
    const repoDir = path.join(tmpRoot, 'repo');
    const db = new DaemonDatabase(path.join(tmpRoot, 'orchdeck.db'));

    try {
      const project = db.createProject({ name: 'Demo', rootPath: repoDir });

      const fakeOpenAiKey = ['sk', 'live', 'secret-token-1234567890'].join('-');
      const fakeGhToken = ['ghp', '1234567890abcdefghij1234567890abcd'].join('_');

      fs.mkdirSync(path.join(homeDir, '.claude', 'skills', 'review-diff'), { recursive: true });
      fs.writeFileSync(
        path.join(homeDir, '.claude', 'settings.json'),
        JSON.stringify({
          enabledPlugins: { 'superpowers@claude': true, 'disabled-tool': false },
          mcpServers: {
            sqlite: {
              command: 'npx',
              args: ['-y', '@mcp/sqlite'],
              env: { DB_TOKEN: fakeOpenAiKey },
            },
          },
        }),
        'utf8',
      );
      fs.writeFileSync(
        path.join(homeDir, '.claude', 'skills', 'review-diff', 'SKILL.md'),
        `---\nname: review-diff\ndescription: Audit patch cleanly\n---\nCheck edge cases and never leak ${fakeGhToken}.`,
        'utf8',
      );

      fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
      fs.writeFileSync(
        path.join(homeDir, '.codex', 'config.toml'),
        '[mcp_servers.sqlite]\ncommand = "npx -y @mcp/sqlite"\n',
        'utf8',
      );

      fs.mkdirSync(path.join(homeDir, '.gemini', 'antigravity', 'plugins', 'custom-agy'), {
        recursive: true,
      });

      fs.mkdirSync(path.join(repoDir, '.orchdeck', 'skills', 'repo-checklist'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(repoDir, '.orchdeck', 'skills', 'repo-checklist', 'SKILL.md'),
        '# Repo Checklist\nRun pnpm run test before commit.',
        'utf8',
      );

      const inspector = new PluginInspector({ db, homeDir });
      const result = inspector.inspect({ projectId: project.id, repoPath: repoDir });

      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0]?.envKeys).toEqual(['DB_TOKEN']);
      expect(JSON.stringify(result)).not.toContain(fakeOpenAiKey);
      expect(result.mcpServers[0]?.sourceProviders).toEqual(['claude', 'codex']);
      expect(result.mcpServers[0]?.deduplicatedFor).toEqual(['claude', 'codex']);

      const agyPlugin = result.plugins.find((p) => p.id === 'antigravity:plugin:custom-agy');
      expect(agyPlugin?.toggleMode).toBe('native_only');
      expect(agyPlugin?.fallbackNotice).toBe('Managed natively by CLI');

      inspector.togglePlugin(project.id, 'claude:plugin:disabled-tool', true);
      inspector.toggleSkill(project.id, 'skill:global:claude:review-diff', true);

      const afterToggle = inspector.inspect({ projectId: project.id, repoPath: repoDir });
      expect(
        afterToggle.plugins.find((p) => p.id === 'claude:plugin:disabled-tool')?.activeInRepo,
      ).toBe(true);

      const injected = inspector.buildSkillInjectionPrompt(
        { projectId: project.id, repoPath: repoDir },
        240,
      );
      expect(injected).toContain('Active Portable Skills');
      expect(injected).not.toContain(fakeGhToken);
      expect(injected.length).toBeLessThanOrEqual(240);
    } finally {
      db.close();
    }
  });

  it('falls back gracefully when external JSON settings are malformed', () => {
    const tmpRoot = makeTempDir('orchdeck-plugins-malformed-');
    const homeDir = path.join(tmpRoot, 'home');
    const db = new DaemonDatabase(path.join(tmpRoot, 'orchdeck.db'));

    try {
      fs.mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(homeDir, '.claude', 'settings.json'), '{not-valid-json', 'utf8');

      const inspector = new PluginInspector({ db, homeDir });
      const result = inspector.inspect();
      const nativeFallback = result.plugins.find((p) => p.id === 'claude:native-settings');
      expect(nativeFallback?.toggleMode).toBe('native_only');
      expect(nativeFallback?.fallbackNotice).toBe('Managed natively by CLI');
    } finally {
      db.close();
    }
  });
});
