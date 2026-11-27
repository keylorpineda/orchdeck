import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { DaemonDatabase } from '../db/database.js';
import {
  ProviderCooldownTracker,
  buildUsageSummaryWithRadar,
  computeEmpiricalCalibration,
  scanLocalCliLogs,
} from './quota-radar.js';

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

describe('Honest Usage & Quota Radar', () => {
  it('returns pressureBlocks = 0 and null ceiling when no rate-limit history exists', () => {
    const cal = computeEmpiricalCalibration([], 5000);
    assert.equal(cal.label, 'Local Calibration');
    assert.equal(cal.sampleCount, 0);
    assert.equal(cal.observedCeilingTokens, null);
    assert.equal(cal.pressureBlocks, 0);
  });

  it('computes 1..4 discrete pressure blocks empirically from observed rate-limit ceilings', () => {
    const now = Date.now();
    const events = [
      {
        id: '1',
        providerId: 'claude',
        modelId: 'opus-4-6',
        inputTokens: 600,
        outputTokens: 200,
        cacheReadTokens: 0,
        durationMs: 100,
        rateLimited: false,
        createdAt: new Date(now - 3600_000).toISOString(),
      },
      {
        id: '2',
        providerId: 'claude',
        modelId: 'opus-4-6',
        inputTokens: 200,
        outputTokens: 0,
        cacheReadTokens: 0,
        durationMs: 50,
        rateLimited: true,
        createdAt: new Date(now - 1800_000).toISOString(),
      },
    ];

    const low = computeEmpiricalCalibration(events, 200);
    assert.equal(low.observedCeilingTokens, 1000);
    assert.equal(low.pressureBlocks, 1);

    const high = computeEmpiricalCalibration(events, 900);
    assert.equal(high.pressureBlocks, 4);
  });

  it('tracks live cooldown expiry, builds usage radar summary, and respects opt-in CLI logs', () => {
    const dataDir = makeTempDir('orchdeck-radar-data-');
    const fakeHome = makeTempDir('orchdeck-radar-home-');
    const claudeProjectDir = path.join(fakeHome, '.claude', 'projects', 'demo');
    fs.mkdirSync(claudeProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeProjectDir, 'session.jsonl'),
      '{"type":"assistant"}\n{"type":"user"}\n',
      'utf8',
    );

    assert.equal(scanLocalCliLogs(false, fakeHome).claude, 0);
    assert.equal(scanLocalCliLogs(true, fakeHome).claude, 2);

    const db = new DaemonDatabase(path.join(dataDir, 'radar.db'));
    const tracker = new ProviderCooldownTracker();
    try {
      db.recordUsageEvent({
        providerId: 'codex',
        modelId: 'gpt-5.4',
        inputTokens: 450,
        outputTokens: 150,
        cacheReadTokens: 0,
        durationMs: 200,
        rateLimited: true,
      });

      const now = Date.now();
      tracker.recordRateLimit('codex', 'Cooldown active', undefined, 60, now);
      assert.equal(tracker.getStatus('codex', now + 5000).status, 'cooldown');
      assert.equal(tracker.getStatus('codex', now + 65_000).status, 'available');

      tracker.recordRateLimit('codex', 'Cooldown active', undefined, 600);
      const summary = buildUsageSummaryWithRadar({
        db,
        tracker,
        includeLocalLogs: true,
        homeDir: fakeHome,
      });
      const codex = summary.providers.find((p) => p.providerId === 'codex');
      const claude = summary.providers.find((p) => p.providerId === 'claude');
      assert.equal(codex?.status, 'cooldown');
      assert.equal(codex?.calibration.label, 'Local Calibration');
      assert.equal(codex?.calibration.pressureBlocks, 4);
      assert.equal(claude?.status, 'available');
      assert.equal(claude?.calibration.localCliLogEvents, 2);
    } finally {
      tracker.dispose();
      db.close();
    }
  });
});
