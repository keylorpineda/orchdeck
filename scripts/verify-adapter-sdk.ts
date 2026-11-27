import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors: string[] = [];

const docPath = path.join(root, 'docs', 'ADAPTER_SDK.md');
const adapterContractPath = path.join(root, 'packages', 'shared', 'src', 'adapter.ts');
const mockAdapterPath = path.join(root, 'packages', 'daemon', 'src', 'adapters', 'mock-adapter.ts');

if (!fs.existsSync(docPath)) {
  errors.push('Missing docs/ADAPTER_SDK.md');
} else {
  const doc = fs.readFileSync(docPath, 'utf8');
  for (const requiredTerm of [
    'ProviderAdapter',
    'NormalizedEvent',
    'MockAdapter',
    'EnvSanitizer',
    'spawnManagedProcess',
  ]) {
    if (!doc.includes(requiredTerm)) {
      errors.push(`docs/ADAPTER_SDK.md must document ${requiredTerm}.`);
    }
  }
}

if (!fs.existsSync(adapterContractPath)) {
  errors.push('Missing packages/shared/src/adapter.ts');
} else {
  const contract = fs.readFileSync(adapterContractPath, 'utf8');
  if (!contract.includes('export interface ProviderAdapter')) {
    errors.push('packages/shared/src/adapter.ts missing ProviderAdapter interface.');
  }
}

if (!fs.existsSync(mockAdapterPath)) {
  errors.push('Missing packages/daemon/src/adapters/mock-adapter.ts');
}

if (errors.length > 0) {
  process.stderr.write('Adapter SDK verification failed:\n');
  for (const e of errors) {
    process.stderr.write(`- ${e}\n`);
  }
  process.exit(1);
}

process.stdout.write('Adapter SDK documentation and contract verification passed.\n');
