import {
  AI_ATTRIBUTION_REGEX,
  ALLOWED_SCOPES,
  ALLOWED_TYPES,
  CO_AUTHOR_REGEX,
  EMOJI_CHAR_REGEX,
  EMOJI_SHORTCODE_REGEX,
} from './governance-constants.ts';

const prTitle = (process.env['PR_TITLE'] ?? '').trim();
const prBody = process.env['PR_BODY'] ?? '';
const baseRef = (process.env['PR_BASE_REF'] ?? '').trim();
const headRef = (process.env['PR_HEAD_REF'] ?? '').trim();

const errors: string[] = [];

const TITLE_REGEX = new RegExp(`^(${ALLOWED_TYPES.join('|')})\\(([a-z0-9-]+)\\): (.+)$`);

function stripHtmlComments(text: string): string {
  let result = '';
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('<!--', cursor);
    if (start === -1) {
      result += text.slice(cursor);
      break;
    }
    result += text.slice(cursor, start);
    const end = text.indexOf('-->', start + 4);
    if (end === -1) {
      break;
    }
    cursor = end + 3;
  }
  return result.trim();
}

if (!prTitle) {
  errors.push('PR title must not be empty.');
} else {
  if (prTitle.length > 100) {
    errors.push(`PR title exceeds 100 characters (${prTitle.length}).`);
  }
  if (EMOJI_CHAR_REGEX.test(prTitle) || EMOJI_SHORTCODE_REGEX.test(prTitle)) {
    errors.push('PR title must not contain emojis or emoji shortcodes.');
  }

  const match = TITLE_REGEX.exec(prTitle);
  if (!match) {
    errors.push(
      `PR title must follow "<type>(<scope>): <imperative lowercase summary>". Allowed types: ${ALLOWED_TYPES.join(', ')}.`,
    );
  } else {
    const scope = match[2] ?? '';
    const subject = match[3] ?? '';
    if (!ALLOWED_SCOPES.includes(scope)) {
      errors.push(
        `PR title scope "${scope}" is not allowed. Allowed scopes: ${ALLOWED_SCOPES.join(', ')}.`,
      );
    }
    if (subject.length < 12) {
      errors.push(`PR title subject must be at least 12 characters long (got ${subject.length}).`);
    }
    if (/^[A-Z]/.test(subject)) {
      errors.push('PR title subject must start with a lowercase letter.');
    }
    if (subject.endsWith('.')) {
      errors.push('PR title subject must not end with a period.');
    }
  }
}

const strippedBody = stripHtmlComments(prBody);

if (strippedBody.length < 80) {
  errors.push(
    `PR description is too short (${strippedBody.length} chars after stripping comments; minimum 80). Write a clear summary, detailed changes, and verification steps.`,
  );
}

const REQUIRED_HEADINGS = [
  '## Summary',
  '## Linked Issues',
  '## Detailed Changes',
  '## Verification and Testing',
];

for (const heading of REQUIRED_HEADINGS) {
  if (!prBody.includes(heading)) {
    errors.push(`PR description is missing required section heading: "${heading}".`);
  }
}

if (EMOJI_CHAR_REGEX.test(prBody) || EMOJI_SHORTCODE_REGEX.test(prBody)) {
  errors.push('PR description must not contain emojis or emoji shortcodes.');
}

if (CO_AUTHOR_REGEX.test(prBody) || AI_ATTRIBUTION_REGEX.test(prBody)) {
  errors.push('PR description must not contain Co-Authored-By trailers or AI attribution footers.');
}

if (baseRef === 'main') {
  const allowedToMain =
    headRef === 'dev' || headRef.startsWith('hotfix/') || headRef.startsWith('release/');
  if (!allowedToMain) {
    errors.push(
      `Pull Requests targeting "main" may only come from "dev", "hotfix/*", or "release/*" (got "${headRef}"). Target "dev" for regular integration.`,
    );
  }
}

if (errors.length > 0) {
  process.stderr.write('PR governance check failed:\n');
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exit(1);
}

process.stdout.write('PR governance check passed.\n');
