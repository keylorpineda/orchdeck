import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DaemonDatabase } from '../db/database.js';
import { ProviderCooldownTracker } from '../usage/quota-radar.js';
import {
  getRecommenderHeuristics,
  inferTaskTag,
  recommendModelForTask,
  setRecommenderHeuristics,
} from './recommender.js';

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

describe('Task metrics persistence and hybrid cooldown-aware recommender', () => {
  it('infers task tags and supports editable cold-start heuristics', () => {
    const tmpRoot = makeTempDir('orchdeck-recommender-');
    const db = new DaemonDatabase(path.join(tmpRoot, 'orchdeck.db'));

    try {
      expect(inferTaskTag('Fix login crash when token expires')).toBe('bugfix');
      expect(inferTaskTag('Add vitest unit tests for parser')).toBe('test');
      expect(inferTaskTag('Refactor daemon rpc handlers')).toBe('refactor');
      expect(inferTaskTag('Update contributor guide README')).toBe('docs');
      expect(inferTaskTag('Build dark mode palette toggle')).toBe('feature');

      const project = db.createProject({ name: 'RecRepo', rootPath: tmpRoot });

      // Cold start uses editable heuristics
      const cold = recommendModelForTask({ db, projectId: project.id, tag: 'bugfix' });
      expect(cold.source).toBe('heuristic');
      expect(cold.recommendedHandle).toBe('codex:gpt-5-codex');

      setRecommenderHeuristics(db, [
        { tag: 'bugfix', modelHandle: 'claude:sonnet-4-6', recipeId: 'rec-fix' },
      ]);
      expect(getRecommenderHeuristics(db).find((h) => h.tag === 'bugfix')?.modelHandle).toBe(
        'claude:sonnet-4-6',
      );

      const updatedCold = recommendModelForTask({ db, projectId: project.id, tag: 'bugfix' });
      expect(updatedCold.recommendedHandle).toBe('claude:sonnet-4-6');
      expect(updatedCold.recommendedRecipeId).toBe('rec-fix');
    } finally {
      db.close();
    }
  });

  it('switches to statistical scoring after threshold samples and skips cooled-down providers', () => {
    const tmpRoot = makeTempDir('orchdeck-recommender-stats-');
    const db = new DaemonDatabase(path.join(tmpRoot, 'orchdeck.db'));
    const cooldownTracker = new ProviderCooldownTracker();

    try {
      const project = db.createProject({ name: 'StatsRepo', rootPath: tmpRoot });

      // 3 samples for codex with 100% 1st-pass approval and fast duration
      for (let i = 0; i < 3; i += 1) {
        db.recordTaskMetric({
          projectId: project.id,
          tag: 'feature',
          providerId: 'codex',
          modelHandle: 'codex:gpt-5-codex',
          recipeId: null,
          approvedFirstPass: true,
          iterations: 1,
          durationMs: 8000,
        });
      }

      // 3 samples for antigravity with lower 1st-pass approval
      for (let i = 0; i < 3; i += 1) {
        db.recordTaskMetric({
          projectId: project.id,
          tag: 'feature',
          providerId: 'antigravity',
          modelHandle: 'antigravity:gemini-4-neon',
          recipeId: null,
          approvedFirstPass: i === 0,
          iterations: 2,
          durationMs: 22000,
        });
      }

      const topPick = recommendModelForTask({
        db,
        projectId: project.id,
        tag: 'feature',
        cooldownTracker,
      });
      expect(topPick.source).toBe('local_history');
      expect(topPick.recommendedHandle).toBe('codex:gpt-5-codex');
      expect(topPick.firstPassApprovalRate).toBe(1);
      expect(topPick.reason).toContain('100% 1st-pass approval');

      // Put codex on live cooldown -> must fall back cleanly to antigravity
      cooldownTracker.recordRateLimit('codex', 'Rate limit hit', undefined, 60);
      const fallbackPick = recommendModelForTask({
        db,
        projectId: project.id,
        tag: 'feature',
        cooldownTracker,
      });
      expect(fallbackPick.source).toBe('cooldown_fallback');
      expect(fallbackPick.recommendedHandle).toBe('antigravity:gemini-4-neon');
      expect(fallbackPick.cooldownSkippedProviders).toContain('codex');
    } finally {
      cooldownTracker.dispose();
      db.close();
    }
  });
});
