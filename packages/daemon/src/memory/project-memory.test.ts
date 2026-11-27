import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonDatabase } from '../db/database.js';
import {
  assertNoSecretsInMemory,
  buildBudgetedMemoryInjection,
  importMemoryFromRepoDoc,
  proposeMemoryFromChangeCard,
  syncMemoryToRepoDoc,
} from './project-memory.js';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Shared Project Memory store, secret blocking, budget cap, and doc bridge', () => {
  it('persists entries, rejects credentials, and caps prompt injection length', () => {
    const tmpRoot = makeTempDir('orchdeck-memory-');
    const repoDir = path.join(tmpRoot, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });
    const db = new DaemonDatabase(path.join(tmpRoot, 'orchdeck.db'));

    try {
      const project = db.createProject({ name: 'MemRepo', rootPath: repoDir });
      const fakeKey = ['ghp', '1234567890abcdefghij1234567890abcd'].join('_');
      expect(() => assertNoSecretsInMemory('Auth note', `Use ${fakeKey}`)).toThrow();

      for (let i = 0; i < 12; i += 1) {
        db.upsertProjectMemory({
          projectId: project.id,
          category: i % 2 === 0 ? 'decision' : 'convention',
          title: `Rule ${i}`,
          content: 'Keep TypeScript strict across all workspace packages and enforce repo containment.',
        });
      }

      const entries = db.listProjectMemory(project.id);
      expect(entries).toHaveLength(12);

      const injected = buildBudgetedMemoryInjection(entries, 320);
      expect(injected.length).toBeLessThanOrEqual(320);
      expect(injected).toContain('Shared Project Memory');
      expect(injected).toContain('truncated');
    } finally {
      db.close();
    }
  });

  it('generates assisted proposals and performs lossless round-trip sync with AGENTS.md and CLAUDE.md', () => {
    const tmpRoot = makeTempDir('orchdeck-memory-sync-');
    const repoDir = path.join(tmpRoot, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });
    const db = new DaemonDatabase(path.join(tmpRoot, 'orchdeck.db'));

    try {
      const project = db.createProject({ name: 'SyncRepo', rootPath: repoDir });
      db.upsertProjectMemory({
        projectId: project.id,
        category: 'decision',
        title: 'IPC Transport',
        content: 'Bind local daemon strictly on 127.0.0.1 loopback.',
      });

      const proposal = proposeMemoryFromChangeCard(
        project.id,
        {
          branch: 'agent/mcp-hub',
          isClean: false,
          totalAdditions: 10,
          totalDeletions: 2,
          files: [
            {
              path: 'packages/daemon/src/mcp/local-mcp-hub.ts',
              status: 'modified',
              additions: 10,
              deletions: 2,
              isBinary: false,
              diff: '',
            },
          ],
          isTruncated: false,
        },
        'feat(mcp): bind hub on loopback',
      );
      expect(proposal.title).toContain('feat(mcp)');
      expect(proposal.content).toContain('agent/mcp-hub');

      const agentsPath = path.join(repoDir, 'AGENTS.md');
      fs.writeFileSync(agentsPath, '# Custom Intro\nKeep pnpm strict.\n', 'utf8');

      syncMemoryToRepoDoc(repoDir, 'AGENTS.md', db.listProjectMemory(project.id));
      const afterFirstSync = fs.readFileSync(agentsPath, 'utf8');
      expect(afterFirstSync).toContain('# Custom Intro');
      expect(afterFirstSync).toContain('ORCHDECK:MEMORY:START');
      expect(afterFirstSync).toContain('IPC Transport');

      // Re-sync CLAUDE.md and round-trip import into a second repository copy
      syncMemoryToRepoDoc(repoDir, 'CLAUDE.md', db.listProjectMemory(project.id));
      expect(fs.readFileSync(path.join(repoDir, 'CLAUDE.md'), 'utf8')).toContain('IPC Transport');

      const repoDir2 = path.join(tmpRoot, 'repo2');
      fs.mkdirSync(repoDir2, { recursive: true });
      fs.copyFileSync(agentsPath, path.join(repoDir2, 'AGENTS.md'));
      const project2 = db.createProject({ name: 'ImportRepo', rootPath: repoDir2 });
      const imported = importMemoryFromRepoDoc(db, project2.id, repoDir2, 'AGENTS.md');
      expect(imported.some((item) => item.title === 'IPC Transport')).toBe(true);
    } finally {
      db.close();
    }
  });
});
