import { spawnSync } from 'node:child_process';

const BLOCKED_BILLING_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
]);

interface CliProbeEntry {
  readonly binary: 'claude' | 'codex' | 'agy';
  readonly installed: boolean;
  readonly version: string | null;
  readonly capabilities: {
    readonly streamJson: boolean;
    readonly modelFlag: boolean;
    readonly reasoningFlag: boolean;
    readonly readOnlyOrPlanFlag: boolean;
    readonly strictMcpConfig: boolean;
  };
}

function buildSanitizedEnv(sourceEnv: NodeJS.ProcessEnv): {
  readonly sanitizedEnv: NodeJS.ProcessEnv;
  readonly strippedKeys: readonly string[];
} {
  const sanitizedEnv: NodeJS.ProcessEnv = {};
  const strippedKeys: string[] = [];

  for (const [key, value] of Object.entries(sourceEnv)) {
    if (BLOCKED_BILLING_KEYS.has(key.toUpperCase())) {
      strippedKeys.push(key);
      continue;
    }
    if (value !== undefined) {
      sanitizedEnv[key] = value;
    }
  }

  return { sanitizedEnv, strippedKeys: strippedKeys.sort() };
}

function runProbeCommand(
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): { readonly ok: boolean; readonly output: string } {
  const res = spawnSync(binary, [...args], {
    env,
    shell: false,
    encoding: 'utf8',
    timeout: 4000,
    windowsHide: true,
  });

  const combined = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim();
  if (res.error || res.status !== 0) {
    return { ok: false, output: combined };
  }
  return { ok: true, output: combined };
}

function probeCli(binary: 'claude' | 'codex' | 'agy', env: NodeJS.ProcessEnv): CliProbeEntry {
  const versionRes = runProbeCommand(binary, ['--version'], env);
  if (!versionRes.ok) {
    return {
      binary,
      installed: false,
      version: null,
      capabilities: {
        streamJson: false,
        modelFlag: false,
        reasoningFlag: false,
        readOnlyOrPlanFlag: false,
        strictMcpConfig: false,
      },
    };
  }

  const helpRes = runProbeCommand(binary, ['--help'], env);
  const helpLower = helpRes.output.toLowerCase();

  return {
    binary,
    installed: true,
    version: versionRes.output.split(/\r?\n/)[0]?.trim() || null,
    capabilities: {
      streamJson: helpLower.includes('stream-json') || helpLower.includes('--json'),
      modelFlag: helpLower.includes('--model'),
      reasoningFlag:
        helpLower.includes('reasoning') || helpLower.includes('effort'),
      readOnlyOrPlanFlag:
        helpLower.includes('read-only') ||
        helpLower.includes('plan') ||
        helpLower.includes('sandbox'),
      strictMcpConfig: helpLower.includes('strict-mcp-config'),
    },
  };
}

const { sanitizedEnv, strippedKeys } = buildSanitizedEnv(process.env);
for (const key of Object.keys(sanitizedEnv)) {
  if (BLOCKED_BILLING_KEYS.has(key.toUpperCase())) {
    process.stderr.write(`Spike security invariant violated: ${key} remained in subprocess env.\n`);
    process.exit(1);
  }
}

const results: readonly CliProbeEntry[] = [
  probeCli('claude', sanitizedEnv),
  probeCli('codex', sanitizedEnv),
  probeCli('agy', sanitizedEnv),
];

process.stdout.write(
  `${JSON.stringify(
    {
      probedAt: new Date().toISOString(),
      strippedBillingKeys: strippedKeys,
      zeroApiKeysVerified: true,
      clis: results,
    },
    null,
    2,
  )}\n`,
);
