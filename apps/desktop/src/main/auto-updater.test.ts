import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeManifestPayload,
  compareSemver,
  evaluateUpdateCandidate,
  resolveUpdateFeedUrl,
  verifyAssetSha512,
  type ReleaseManifest,
} from './auto-updater.js';

function signManifest(
  base: Omit<ReleaseManifest, 'signatureBase64'>,
  privateKeyPem: string,
): ReleaseManifest {
  const sig = crypto.sign(
    null,
    Buffer.from(canonicalizeManifestPayload(base), 'utf8'),
    privateKeyPem,
  );
  return {
    ...base,
    signatureBase64: sig.toString('base64'),
  };
}

describe('Signed cross-platform auto-updater verification', () => {
  it('verifies Ed25519 signature, host allowlist, semver order, and SHA-512 checksum', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const payloadBytes = Buffer.from('orchdeck-signed-installer-payload', 'utf8');
    const sha512 = crypto.createHash('sha512').update(payloadBytes).digest('hex');

    const manifest = signManifest(
      {
        version: '1.0.0',
        channel: 'stable',
        publishedAt: '2026-11-27T20:00:00Z',
        assetUrl: 'https://github.com/keylorpineda/orchdeck/releases/download/v1.0.0/Orchdeck-1.0.0.exe',
        sha512,
      },
      privateKeyPem,
    );

    const ok = evaluateUpdateCandidate({
      currentVersion: '0.3.0',
      channel: 'stable',
      manifest,
      publicKeyPem,
    });
    expect(ok.eligible).toBe(true);
    expect(verifyAssetSha512(payloadBytes, manifest.sha512)).toBe(true);
    expect(verifyAssetSha512(Buffer.from('tampered'), manifest.sha512)).toBe(false);

    // Tampered version breaks signature verification
    const tampered = evaluateUpdateCandidate({
      currentVersion: '0.3.0',
      channel: 'stable',
      manifest: { ...manifest, version: '9.9.9' },
      publicKeyPem,
    });
    expect(tampered.eligible).toBe(false);
    expect(tampered.reason).toContain('signature verification failed');

    // Untrusted HTTP or non-GitHub URL rejected cleanly
    const untrustedManifest = signManifest(
      {
        version: '1.0.1',
        channel: 'stable',
        publishedAt: '2026-11-27T20:00:00Z',
        assetUrl: 'http://evil.example/Orchdeck.exe',
        sha512,
      },
      privateKeyPem,
    );
    const untrusted = evaluateUpdateCandidate({
      currentVersion: '0.3.0',
      channel: 'stable',
      manifest: untrustedManifest,
      publicKeyPem,
    });
    expect(untrusted.eligible).toBe(false);
    expect(untrusted.reason).toContain('HTTPS');
  });

  it('separates stable and dev channels and compares semver prereleases accurately', () => {
    expect(resolveUpdateFeedUrl('stable')).toContain('/releases/latest/');
    expect(resolveUpdateFeedUrl('dev')).toContain('/dev-latest/');
    expect(compareSemver('1.0.0', '0.3.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0-dev.2')).toBe(1);
    expect(compareSemver('1.0.0-dev.3', '1.0.0-dev.2')).toBe(1);
  });
});
