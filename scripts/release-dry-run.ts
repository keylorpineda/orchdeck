import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors: string[] = [];

function assertFileExists(relPath: string): string {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    errors.push(`Missing required release artifact: ${relPath}`);
    return '';
  }
  return full;
}

const mainBundle = assertFileExists('apps/desktop/dist/main/index.js');
const preloadBundle = assertFileExists('apps/desktop/dist/preload/index.cjs');
const rendererIndex = assertFileExists('apps/desktop/dist/renderer/index.html');
const builderConfigPath = assertFileExists('apps/desktop/packaging/electron-builder.json');
const entitlementsPath = assertFileExists('apps/desktop/packaging/entitlements.mac.plist');
const releaseWorkflowPath = assertFileExists('.github/workflows/release.yml');

if (mainBundle && preloadBundle && rendererIndex) {
  process.stdout.write('Verified built Electron main, preload, and renderer bundles.\n');
}

if (builderConfigPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(builderConfigPath, 'utf8')) as Record<string, unknown>;
    if (parsed['appId'] !== 'com.orchdeck.desktop') {
      errors.push('electron-builder.json must declare appId "com.orchdeck.desktop".');
    }
    const win = parsed['win'] as Record<string, unknown> | undefined;
    const mac = parsed['mac'] as Record<string, unknown> | undefined;
    if (!win || win['verifyUpdateCodeSignature'] !== true) {
      errors.push('electron-builder.json win.verifyUpdateCodeSignature must be true.');
    }
    if (!mac || mac['hardenedRuntime'] !== true) {
      errors.push('electron-builder.json mac.hardenedRuntime must be true.');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Invalid JSON in electron-builder.json: ${msg}`);
  }
}

if (entitlementsPath) {
  const plist = fs.readFileSync(entitlementsPath, 'utf8');
  if (!plist.includes('com.apple.security.cs.allow-jit')) {
    errors.push('entitlements.mac.plist missing com.apple.security.cs.allow-jit.');
  }
}

if (releaseWorkflowPath) {
  const wf = fs.readFileSync(releaseWorkflowPath, 'utf8');
  if (!wf.includes('pnpm install --frozen-lockfile')) {
    errors.push('release.yml must install dependencies via pnpm --frozen-lockfile.');
  }
}

if (errors.length > 0) {
  process.stderr.write('Release dry-run check failed:\n');
  for (const e of errors) {
    process.stderr.write(`- ${e}\n`);
  }
  process.exit(1);
}

process.stdout.write('Release packaging dry-run passed.\n');
