import fs from 'node:fs';
import path from 'node:path';

interface DesignRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly message: string;
}

const args = process.argv.slice(2);
let targetDir = path.resolve(process.cwd(), 'apps/desktop/src/renderer');

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const nextArg = args[i + 1];
  if (arg === '--target' && nextArg) {
    targetDir = path.resolve(nextArg);
    i += 1;
  }
}

const BANNED_RULES: readonly DesignRule[] = [
  {
    id: 'raw-tailwind-palette',
    pattern:
      /\b(?:bg|text|border|from|to|via|ring|shadow|fill|stroke)-(?:indigo|purple|violet|fuchsia|pink|cyan|sky|blue|slate|zinc|gray|neutral|emerald|teal)-\d{2,3}\b/,
    message: 'Use semantic Design System tokens instead of raw Tailwind palette classes.',
  },
  {
    id: 'gradient-clip-text',
    pattern: /\bbg-clip-text\b/,
    message: 'Gradient clip-text is banned by docs/DESIGN_SYSTEM.md.',
  },
  {
    id: 'gratuitous-glassmorphism',
    pattern: /\bbackdrop-blur-(?:xl|2xl|3xl)\b/,
    message: 'Gratuitous backdrop-blur glassmorphism is banned by docs/DESIGN_SYSTEM.md.',
  },
  {
    id: 'rounded-full-pills',
    pattern: /\brounded-full\b/,
    message: 'Use architectural rectangular radii (4px/6px/8px/10px), never rounded-full.',
  },
  {
    id: 'blue-tinted-dark-bg',
    pattern: /#(?:0B0F19|0F172A|1E293B)\b/i,
    message: 'Blue-tinted dark backgrounds are banned; use Graphite & Vermilion tokens.',
  },
  {
    id: 'anxious-animation',
    pattern: /\banimate-(?:bounce|ping|pulse)\b/,
    message: 'Anxious animations (bounce, ping, pulse) are banned by docs/DESIGN_SYSTEM.md.',
  },
];

const UI_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.html']);
const violations: string[] = [];

function walk(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!UI_EXTENSIONS.has(ext) || entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      continue;
    }

    const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);

    lines.forEach((line, idx) => {
      for (const rule of BANNED_RULES) {
        if (rule.pattern.test(line)) {
          violations.push(`${relPath}:${idx + 1} [${rule.id}] ${rule.message}`);
        }
      }
    });
  }
}

walk(targetDir);

if (violations.length > 0) {
  process.stderr.write('Design System compliance check failed:\n');
  for (const violation of violations) {
    process.stderr.write(`- ${violation}\n`);
  }
  process.exit(1);
}

process.stdout.write('Design System compliance check passed (semantic tokens, zero banned tropes).\n');
