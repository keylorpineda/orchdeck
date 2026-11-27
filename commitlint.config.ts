import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';
import {
  AI_ATTRIBUTION_REGEX,
  ALLOWED_SCOPES,
  ALLOWED_TYPES,
  CO_AUTHOR_REGEX,
  EMOJI_CHAR_REGEX,
  EMOJI_SHORTCODE_REGEX,
} from './scripts/governance-constants.ts';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'orchdeck/no-emojis': (parsed) => {
          const raw = typeof parsed['raw'] === 'string' ? parsed['raw'] : '';
          if (EMOJI_CHAR_REGEX.test(raw)) {
            return [false, 'Commit messages must not contain Unicode emojis.'];
          }
          if (EMOJI_SHORTCODE_REGEX.test(raw)) {
            return [
              false,
              'Commit messages must not contain colon-delimited emoji shortcodes.',
            ];
          }
          return [true];
        },
        'orchdeck/no-co-authored-by': (parsed) => {
          const raw = typeof parsed['raw'] === 'string' ? parsed['raw'] : '';
          if (CO_AUTHOR_REGEX.test(raw)) {
            return [false, 'Commit messages must not include Co-Authored-By trailers.'];
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
    },
  ],
  rules: {
    'type-enum': [RuleConfigSeverity.Error, 'always', [...ALLOWED_TYPES]],
    'scope-empty': [RuleConfigSeverity.Error, 'never'],
    'scope-case': [RuleConfigSeverity.Error, 'always', 'kebab-case'],
    'scope-enum': [RuleConfigSeverity.Error, 'always', [...ALLOWED_SCOPES]],
    'header-max-length': [RuleConfigSeverity.Error, 'always', 100],
    'subject-empty': [RuleConfigSeverity.Error, 'never'],
    'subject-min-length': [RuleConfigSeverity.Error, 'always', 12],
    'subject-case': [
      RuleConfigSeverity.Error,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    'subject-full-stop': [RuleConfigSeverity.Error, 'never', '.'],
    'body-empty': [RuleConfigSeverity.Error, 'never'],
    'body-min-length': [RuleConfigSeverity.Error, 'always', 30],
    'body-leading-blank': [RuleConfigSeverity.Error, 'always'],
    'body-max-line-length': [RuleConfigSeverity.Error, 'always', 100],
    'footer-leading-blank': [RuleConfigSeverity.Error, 'always'],
    'footer-max-line-length': [RuleConfigSeverity.Error, 'always', 100],
    'orchdeck/no-emojis': [RuleConfigSeverity.Error, 'always'],
    'orchdeck/no-co-authored-by': [RuleConfigSeverity.Error, 'always'],
  },
};

export default config;
