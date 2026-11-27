export const ALLOWED_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

export const ALLOWED_SCOPES = [
  'repo',
  'ci',
  'deps',
  'docs',
  'desktop',
  'daemon',
  'shared',
  'ui',
  'design',
  'git',
  'security',
  'approvals',
  'fusion',
  'plugins',
  'mcp',
  'usage',
  'memory',
  'worktrees',
  'adapters',
  'adapter-claude',
  'adapter-codex',
  'adapter-antigravity',
  'spike',
  'release',
];

export const EMOJI_CHAR_REGEX = /\p{Extended_Pictographic}/u;
export const EMOJI_SHORTCODE_REGEX = /(?:^|\s):[a-z][a-z0-9_+-]{1,30}:(?=[\s.,;:!?)]|$)/m;
export const CO_AUTHOR_REGEX = /^\s*co-authored-by\s*:/im;
export const AI_ATTRIBUTION_REGEX =
  /\bgenerated\s+(?:with|by)\s+(?:claude|codex|gemini|antigravity|copilot|chatgpt|ai)\b/i;
