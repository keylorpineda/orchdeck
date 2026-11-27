import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInitialTheme } from './components/theme.js';

describe('Design System tokens and theme resolution', () => {
  it('resolves stored and system-preferred themes cleanly', () => {
    expect(resolveInitialTheme('light', true)).toBe('light');
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
    expect(resolveInitialTheme('invalid', true)).toBe('dark');
  });

  it('defines exact Paper & Ink and Graphite & Vermilion palette tokens', () => {
    const tokensPath = path.resolve(process.cwd(), 'src/renderer/styles/tokens.css');
    const tokens = fs.readFileSync(tokensPath, 'utf8');

    expect(tokens).toContain('#F6F4EE');
    expect(tokens).toContain('#C4492D');
    expect(tokens).toContain('#151412');
    expect(tokens).toContain('#DF684B');
    expect(tokens).toContain('#C46B48');
    expect(tokens).toContain('#3F7D68');
    expect(tokens).toContain('#55698F');
  });

  it('rejects banned raw Tailwind palette classes and AI-slop tropes', () => {
    const repoRoot = path.resolve(process.cwd(), '../..');
    const scriptPath = path.join(repoRoot, 'scripts/check-design-system.ts');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchdeck-design-lint-'));
    try {
      const badClass = ['bg', 'indigo', '500'].join('-');
      const badHex = '#0F' + '172A';
      const badBlur = ['backdrop', 'blur', 'xl'].join('-');
      const badRadius = ['rounded', 'full'].join('-');

      fs.writeFileSync(
        path.join(tmpDir, 'BadComponent.tsx'),
        `export const Bad = () => <div className="${badClass} ${badBlur} ${badRadius}" style={{ background: '${badHex}' }} />;\n`,
        'utf8',
      );

      const res = spawnSync(process.execPath, [scriptPath, '--target', tmpDir], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('raw-tailwind-palette');
      expect(res.stderr).toContain('gratuitous-glassmorphism');
      expect(res.stderr).toContain('rounded-full-pills');
      expect(res.stderr).toContain('blue-tinted-dark-bg');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
