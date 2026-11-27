import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface ProbeReport {
  readonly zeroApiKeysVerified: boolean;
  readonly strippedBillingKeys: readonly string[];
  readonly clis: ReadonlyArray<{
    readonly binary: string;
    readonly installed: boolean;
  }>;
}

describe('CLI spike probe security and capability matrix script', () => {
  it('strips all billing API keys before probing claude, codex, and agy', () => {
    const repoRoot = path.resolve(process.cwd(), '../..');
    const scriptPath = path.join(repoRoot, 'scripts', 'spike-cli-probe.ts');

    const fakeAnthropic = ['sk', 'ant', 'test12345678901234567890'].join('-');
    const fakeOpenAi = ['sk', 'test12345678901234567890'].join('-');
    const fakeGoogle = ['AIza', 'Test12345678901234567890'].join('');

    const res = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: fakeAnthropic,
        OPENAI_API_KEY: fakeOpenAi,
        GEMINI_API_KEY: fakeGoogle,
        GOOGLE_API_KEY: fakeGoogle,
      },
    });

    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout) as ProbeReport;
    expect(parsed.zeroApiKeysVerified).toBe(true);
    expect(parsed.strippedBillingKeys).toEqual([
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'OPENAI_API_KEY',
    ]);
    expect(parsed.clis.map((c) => c.binary)).toEqual(['claude', 'codex', 'agy']);
  });
});
