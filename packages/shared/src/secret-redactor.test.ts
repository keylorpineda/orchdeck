import { describe, expect, it } from 'vitest';
import { redactSecrets } from './secret-redactor.js';

describe('redactSecrets', () => {
  it('redacts Anthropic, OpenAI, Google, GitHub, and AWS credentials', () => {
    const ant = 'sk-ant-' + 'api03-abcdefghijklmnop1234567890'; // orchdeck-secret-ignore
    const oai = 'sk-proj-' + 'abcdefghijklmnop1234567890'; // orchdeck-secret-ignore
    const goog = 'AIza' + 'SyD4TestExampleKey12345678901234567'; // orchdeck-secret-ignore
    const gh = 'ghp_' + '1234567890abcdefghijklmnop'; // orchdeck-secret-ignore
    const aws = 'AKIA' + '1234567890ABCDEF'; // orchdeck-secret-ignore

    const input = `ant=${ant} oai=${oai} goog=${goog} gh=${gh} aws=${aws}`;
    const output = redactSecrets(input);

    expect(output).toContain('[REDACTED:anthropic-key]');
    expect(output).toContain('[REDACTED:openai-key]');
    expect(output).toContain('[REDACTED:google-key]');
    expect(output).toContain('[REDACTED:github-token]');
    expect(output).toContain('[REDACTED:aws-key]');
    expect(output).not.toContain(ant);
    expect(output).not.toContain(oai);
    expect(output).not.toContain(goog);
    expect(output).not.toContain(gh);
    expect(output).not.toContain(aws);
  });

  it('redacts bearer headers, PEM private keys, and credentialed URLs', () => {
    const pemHeader = '-----BEGIN ' + 'PRIVATE KEY-----'; // orchdeck-secret-ignore
    const pemFooter = '-----END ' + 'PRIVATE KEY-----'; // orchdeck-secret-ignore
    const dbUrl = 'postgres://' + 'admin:supersecret@localhost:5432/orchdeck'; // orchdeck-secret-ignore
    const bearer = 'Authorization: Bearer ' + 'eyJhbGciOiJIUzI1NiJ9.payload.sig'; // orchdeck-secret-ignore

    const input = `${bearer}\n${dbUrl}\n${pemHeader}\nabc123\n${pemFooter}`;
    const output = redactSecrets(input);

    expect(output).toContain('Bearer [REDACTED:bearer-token]');
    expect(output).toContain('postgres://[REDACTED:credentialed-url]@localhost:5432/orchdeck'); // orchdeck-secret-ignore
    expect(output).toContain('[REDACTED:private-key]');
    expect(output).not.toContain('supersecret');
    expect(output).not.toContain('abc123');
  });

  it('leaves non-secret text unchanged', () => {
    const clean = 'Model handle claude:opus-4-6:max completed turn in 120ms.';
    expect(redactSecrets(clean)).toBe(clean);
  });
});
