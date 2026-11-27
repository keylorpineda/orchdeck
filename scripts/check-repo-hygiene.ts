import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  CO_AUTHOR_REGEX,
  EMOJI_CHAR_REGEX,
  EMOJI_SHORTCODE_REGEX,
} from './governance-constants.ts';

const ROOT_DIR = process.cwd();
const FORBIDDEN_LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
]);
const FORBIDDEN_JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx']);
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  'dist',
  'out',
  'release',
  '.vite',
  'coverage',
]);

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.yml',
  '.yaml',
  '.json',
  '.ts',
  '.tsx',
  '.css',
  '.html',
  '.txt',
]);

const EXPLICIT_TEXT_FILES = new Set([
  '.gitmessage',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'CODEOWNERS',
]);

const errors: string[] = [];

function walk(dirPath: string, visitor: (fullPath: string, fileName: string) => void): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visitor);
    } else if (entry.isFile()) {
      visitor(fullPath, entry.name);
    }
  }
}

function checkRootPackageJson(): void {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    errors.push('Missing root package.json.');
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { packageManager?: unknown };
  if (typeof pkg.packageManager !== 'string' || !pkg.packageManager.startsWith('pnpm@')) {
    errors.push('Root package.json must declare "packageManager" starting with "pnpm@".');
  }
}

function shouldInspectTextFile(fullPath: string, fileName: string): boolean {
  const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
  if (relPath === 'pnpm-lock.yaml') {
    return false;
  }
  if (EXPLICIT_TEXT_FILES.has(fileName)) {
    return true;
  }
  if (relPath.startsWith('.husky/') && !relPath.startsWith('.husky/_/')) {
    return true;
  }
  return TEXT_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function inspectFile(fullPath: string, fileName: string): void {
  const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
  const ext = path.extname(fileName).toLowerCase();

  if (FORBIDDEN_LOCKFILES.has(fileName)) {
    errors.push(`Forbidden package manager lockfile found: ${relPath} (use pnpm-lock.yaml exclusively).`);
    return;
  }

  if (FORBIDDEN_JS_EXTENSIONS.has(ext)) {
    errors.push(`Forbidden JavaScript source file found: ${relPath} (this repository is 100% TypeScript).`);
    return;
  }

  if (!shouldInspectTextFile(fullPath, fileName)) {
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    if (EMOJI_CHAR_REGEX.test(line)) {
      errors.push(`Emoji character found in ${relPath}:${lineNum}`);
    }
    if (EMOJI_SHORTCODE_REGEX.test(line)) {
      errors.push(`Emoji shortcode found in ${relPath}:${lineNum}`);
    }
    if (CO_AUTHOR_REGEX.test(line)) {
      errors.push(`Co-Authored-By trailer found in ${relPath}:${lineNum}`);
    }
  });

  if (relPath.startsWith('.github/') && (relPath.endsWith('.yml') || relPath.endsWith('.yaml'))) {
    try {
      parseYaml(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Invalid YAML syntax in ${relPath}: ${message}`);
    }
  }
}

checkRootPackageJson();
walk(ROOT_DIR, inspectFile);

if (errors.length > 0) {
  process.stderr.write('Repository hygiene check failed:\n');
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  'Repository hygiene check passed (100% TypeScript, pnpm-only, valid YAML, zero emojis, zero co-authors).\n',
);
