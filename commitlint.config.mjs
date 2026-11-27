import {
  AI_ATTRIBUTION_REGEX,
  ALLOWED_SCOPES,
  ALLOWED_TYPES,
  CO_AUTHOR_REGEX,
  EMOJI_CHAR_REGEX,
  EMOJI_SHORTCODE_REGEX,
} from './scripts/governance-constants.mjs';

const orchdeckCommitPlugin = {
  rules: {
    'orchdeck/no-emojis': ({ raw = '' }) => {
      if (EMOJI_CHAR_REGEX.test(raw)) {
        return [
          false,
          'Commit messages must not contain Unicode emojis.',
        ];
      }
      if (EMOJI_SHORTCODE_REGEX.test(raw)) {
        return [
          false,
          'Commit messages must not contain colon-delimited emoji shortcodes.',
        ];
      }
      return [true];
    },
    'orchdeck/no-co-authored-by': ({ raw = '' }) => {
      if (CO_AUTHOR_REGEX.test(raw)) {
        return [
          false,
          'Commit messages must not include Co-Authored-By trailers.',
        ];
      }
      if (AI_ATTRIBUTION_REGEX.test(raw)) {
        return [
          false,
          'Commit messages must not include AI generation or attribution footers.',
        ];
      }
      return [true];
    },
  },
};

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [orchdeckCommitPlugin],
  rules: {
    'type-enum': [2, 'always', ALLOWED_TYPES],
    'scope-empty': [2, 'never'],
    'scope-case': [2, 'always', 'kebab-case'],
    'scope-enum': [2, 'always', ALLOWED_SCOPES],
    'header-max-length': [2, 'always', 100],
    'subject-empty': [2, 'never'],
    'subject-min-length': [2, 'always', 12],
    'subject-case': [
      2,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    'subject-full-stop': [2, 'never', '.'],
    'body-empty': [2, 'never'],
    'body-min-length': [2, 'always', 30],
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],
    'orchdeck/no-emojis': [2, 'always'],
    'orchdeck/no-co-authored-by': [2, 'always'],
  },
};
