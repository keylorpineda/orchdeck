import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let targetDir = process.cwd();

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--target' && args[i + 1]) {
    targetDir = path.resolve(args[i + 1]);
    i += 1;
  }
}

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

const SKIP_CONTENT_FILES = new Set([
  'pnpm-lock.yaml',
  '.gitleaks.toml',
  'scripts/check-secrets.mjs',
  '.env.example',
]);

const FORBIDDEN_FILE_PATTERNS = [
  { name: 'dotenv-file', test: (name) => name === '.env' || (name.startsWith('.env.') && name !== '.env.example') },
  { name: 'private-key-or-cert', test: (name) => /\.(pem|key|p12|pfx|jks)$/i.test(name) || name === 'id_rsa' || name === 'id_ed25519' },
  { name: 'local-sqlite-db', test: (name) => /\.(db|db-wal|db-shm|sqlite|sqlite3)$/i.test(name) },
  { name: 'sensitive-credentials-file', test: (name) => /^(credentials\.json|secrets\.json|auth\.json|local\.settings\.json)$/i.test(name) || /^secrets\./i.test(name) || /\.secret$/i.test(name) },
];

const SECRET_PATTERNS = [
  { id: 'anthropic-api-key', regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai-api-key', regex: /\b(?:sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})/ },
  { id: 'google-gemini-api-key', regex: /\bAIza[0-9A-Za-z\-_]{35}/ },
  { id: 'github-token', regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { id: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'private-key-block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { id: 'credentialed-connection-url', regex: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:[^@\s]+@/i },
  { id: 'npm-auth-token', regex: /_authToken\s*=\s*\S+/ },
];

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.yml',
  '.yaml',
  '.json',
  '.mjs',
  '.cjs',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.txt',
  '.toml',
  '.sh',
  '.ps1',
  '.sql',
]);

const findings = [];

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');

    for (const rule of FORBIDDEN_FILE_PATTERNS) {
      if (rule.test(entry.name)) {
        findings.push(`Forbidden sensitive file (${rule.name}): ${relPath}`);
      }
    }

    if (SKIP_CONTENT_FILES.has(relPath)) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !entry.name.startsWith('.')) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (line.includes('orchdeck-secret-ignore')) {
        return;
      }
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          findings.push(`Potential secret detected (${pattern.id}) at ${relPath}:${index + 1}`);
        }
      }
    });
  }
}

walk(targetDir);

if (findings.length > 0) {
  process.stderr.write('Secret and sensitive-file scan failed:\n');
  for (const finding of findings) {
    process.stderr.write(`- ${finding}\n`);
  }
  process.exit(1);
}

process.stdout.write('Secret and sensitive-file scan passed (zero exposed credentials or sensitive files).\n');
