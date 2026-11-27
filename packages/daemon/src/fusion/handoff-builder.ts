import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets, type HandoffPacketInput } from '@orchdeck/shared';
import { assertPathInsideRepo } from '../git/git-service.js';
import { sanitizeSubprocessEnv } from '../security/env-sanitizer.js';
import { resolveSystemGitPath } from '../security/git-shim.js';

function resolveGitCommonDir(repoPath: string): Promise<string | null> {
  const gitBinary = resolveSystemGitPath();
  return new Promise((resolve) => {
    execFile(
      gitBinary,
      ['rev-parse', '--git-common-dir'],
      {
        cwd: path.resolve(repoPath),
        env: sanitizeSubprocessEnv(process.env),
        shell: false,
      },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const raw = stdout.trim();
        if (!raw) {
          resolve(null);
          return;
        }
        resolve(path.isAbsolute(raw) ? raw : path.resolve(repoPath, raw));
      },
    );
  });
}

export async function ensureOrchdeckExcluded(repoPath: string): Promise<boolean> {
  const commonDir = await resolveGitCommonDir(repoPath);
  if (!commonDir) {
    return false;
  }

  const infoDir = path.join(commonDir, 'info');
  fs.mkdirSync(infoDir, { recursive: true });
  const excludeFile = path.join(infoDir, 'exclude');

  const existing = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : '';
  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes('.orchdeck/') || lines.includes('.orchdeck')) {
    return true;
  }

  const prefix = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(excludeFile, `${existing}${prefix}.orchdeck/\n`, 'utf8');
  return true;
}

export function buildHandoffMarkdown(input: HandoffPacketInput): string {
  const goal = redactSecrets(input.goal.trim()) || 'No goal specified.';
  const decisions =
    input.decisions.length > 0
      ? input.decisions.map((item) => `- ${redactSecrets(item.trim())}`).join('\n')
      : '- No prior architectural decisions recorded.';
  const diffStat = redactSecrets(input.diffStat.trim()) || '(clean working tree)';
  const testOutput = redactSecrets(input.latestTestOutput.trim()) || '(no test output recorded)';
  const nextStep = redactSecrets(input.nextStep.trim()) || 'Continue from current repository state.';

  const metaLines: string[] = [];
  if (input.sourceModelHandle) {
    metaLines.push(`- From: \`${redactSecrets(input.sourceModelHandle)}\``);
  }
  if (input.targetModelHandle) {
    metaLines.push(`- To: \`${redactSecrets(input.targetModelHandle)}\``);
  }
  if (input.reason) {
    metaLines.push(`- Reason: ${redactSecrets(input.reason)}`);
  }

  const sections = [
    '# Orchdeck Handoff Packet',
    metaLines.length > 0 ? metaLines.join('\n') : null,
    '## Goal',
    goal,
    '## Decisions',
    decisions,
    '## Working Tree (`git diff --stat`)',
    '```text',
    diffStat,
    '```',
    '## Latest Test Output',
    '```text',
    testOutput,
    '```',
    '## Immediate Next Step',
    nextStep,
  ].filter((part): part is string => part !== null);

  return `${sections.join('\n\n')}\n`;
}

export interface WrittenHandoffPacket {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly markdown: string;
}

export async function writeHandoffPacket(
  repoPath: string,
  input: HandoffPacketInput,
): Promise<WrittenHandoffPacket> {
  await ensureOrchdeckExcluded(repoPath);
  const relativePath = '.orchdeck/handoff.md';
  const absolutePath = assertPathInsideRepo(repoPath, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const markdown = buildHandoffMarkdown(input);
  fs.writeFileSync(absolutePath, markdown, 'utf8');
  return {
    relativePath,
    absolutePath,
    markdown,
  };
}
