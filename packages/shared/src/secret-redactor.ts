interface RedactionRule {
  readonly category: string;
  readonly pattern: RegExp;
  readonly replace: (match: string) => string;
}

const REDACTION_RULES: readonly RedactionRule[] = [
  {
    category: 'private-key',
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    replace: () => '[REDACTED:private-key]',
  },
  {
    category: 'anthropic-key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    replace: () => '[REDACTED:anthropic-key]',
  },
  {
    category: 'openai-key',
    pattern: /\b(?:sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})/g,
    replace: () => '[REDACTED:openai-key]',
  },
  {
    category: 'google-key',
    pattern: /\bAIza[0-9A-Za-z\-_]{35,}/g,
    replace: () => '[REDACTED:google-key]',
  },
  {
    category: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    replace: () => '[REDACTED:github-token]',
  },
  {
    category: 'aws-key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: () => '[REDACTED:aws-key]',
  },
  {
    category: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replace: () => 'Bearer [REDACTED:bearer-token]',
  },
  {
    category: 'credentialed-url',
    pattern:
      /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|https?):\/\/)([^:\s/]+):([^@\s]+)@/gi,
    replace: (match) => {
      const schemeSep = match.indexOf('://');
      const scheme = schemeSep >= 0 ? match.slice(0, schemeSep + 3) : '';
      return `${scheme}[REDACTED:credentialed-url]@`;
    },
  },
];

/**
 * Redacts known API keys, tokens, private keys, and credentialed URLs
 * before persisting or rendering untrusted logs and transcripts.
 */
export function redactSecrets(input: string): string {
  let sanitized = input;
  for (const rule of REDACTION_RULES) {
    sanitized = sanitized.replace(rule.pattern, rule.replace);
  }
  return sanitized;
}
