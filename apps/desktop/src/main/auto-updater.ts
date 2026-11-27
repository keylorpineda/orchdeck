import crypto from 'node:crypto';

export type UpdateChannel = 'stable' | 'dev';

export interface ReleaseManifest {
  readonly version: string;
  readonly channel: UpdateChannel;
  readonly publishedAt: string;
  readonly assetUrl: string;
  readonly sha512: string;
  readonly signatureBase64: string;
}

export interface UpdateEvaluationResult {
  readonly eligible: boolean;
  readonly reason: string;
  readonly manifest?: ReleaseManifest | undefined;
}

const ALLOWED_UPDATE_HOSTS = new Set(['github.com', 'objects.githubusercontent.com']);

export function resolveUpdateFeedUrl(channel: UpdateChannel): string {
  return channel === 'dev'
    ? 'https://github.com/keylorpineda/orchdeck/releases/download/dev-latest/manifest.json'
    : 'https://github.com/keylorpineda/orchdeck/releases/latest/download/manifest.json';
}

export function isAllowedUpdateAssetUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return ALLOWED_UPDATE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
}

function parseSemverStrict(raw: string): ParsedSemver | null {
  const clean = raw.trim().replace(/^v/i, '');
  const dashIdx = clean.indexOf('-');
  const core = dashIdx === -1 ? clean : clean.slice(0, dashIdx);
  const prerelease = dashIdx === -1 ? null : clean.slice(dashIdx + 1).trim() || null;

  const parts = core.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    !Number.isInteger(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0
  ) {
    return null;
  }
  return { major, minor, patch, prerelease };
}

export function compareSemver(aRaw: string, bRaw: string): number {
  const a = parseSemverStrict(aRaw);
  const b = parseSemverStrict(bRaw);
  if (!a || !b) {
    throw new Error(`Invalid semver comparison: "${aRaw}" vs "${bRaw}".`);
  }

  if (a.major !== b.major) {
    return a.major > b.major ? 1 : -1;
  }
  if (a.minor !== b.minor) {
    return a.minor > b.minor ? 1 : -1;
  }
  if (a.patch !== b.patch) {
    return a.patch > b.patch ? 1 : -1;
  }

  if (a.prerelease === b.prerelease) {
    return 0;
  }
  if (a.prerelease === null) {
    return 1;
  }
  if (b.prerelease === null) {
    return -1;
  }
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

export function isNewerRelease(currentVersion: string, candidateVersion: string): boolean {
  return compareSemver(candidateVersion, currentVersion) > 0;
}

export function canonicalizeManifestPayload(
  manifest: Omit<ReleaseManifest, 'signatureBase64'>,
): string {
  return `${manifest.version}|${manifest.channel}|${manifest.publishedAt}|${manifest.assetUrl}|${manifest.sha512}`;
}

export function verifyReleaseManifestSignature(
  manifest: ReleaseManifest,
  publicKeyPem: string,
): boolean {
  if (!manifest.signatureBase64 || manifest.signatureBase64.trim().length === 0) {
    return false;
  }
  try {
    const payload = Buffer.from(canonicalizeManifestPayload(manifest), 'utf8');
    const signature = Buffer.from(manifest.signatureBase64, 'base64');
    return crypto.verify(null, payload, publicKeyPem, signature);
  } catch {
    return false;
  }
}

export function verifyAssetSha512(data: Buffer | string, expectedHex: string): boolean {
  const normalizedExpected = expectedHex.trim().toLowerCase();
  if (normalizedExpected.length !== 128) {
    return false;
  }
  const actualHex = crypto.createHash('sha512').update(data).digest('hex');
  const expectedBuf = Buffer.from(normalizedExpected, 'utf8');
  const actualBuf = Buffer.from(actualHex, 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function evaluateUpdateCandidate(options: {
  readonly currentVersion: string;
  readonly channel: UpdateChannel;
  readonly manifest: ReleaseManifest;
  readonly publicKeyPem: string;
}): UpdateEvaluationResult {
  const { currentVersion, channel, manifest, publicKeyPem } = options;

  if (manifest.channel !== channel) {
    return {
      eligible: false,
      reason: `Channel mismatch: expected "${channel}", got "${manifest.channel}".`,
    };
  }

  if (!isAllowedUpdateAssetUrl(manifest.assetUrl)) {
    return {
      eligible: false,
      reason: 'Update asset URL rejected: must use HTTPS on an allowlisted GitHub host.',
    };
  }

  if (!verifyReleaseManifestSignature(manifest, publicKeyPem)) {
    return {
      eligible: false,
      reason: 'Update manifest Ed25519 signature verification failed.',
    };
  }

  try {
    if (!isNewerRelease(currentVersion, manifest.version)) {
      return {
        eligible: false,
        reason: `Installed version ${currentVersion} is already up to date.`,
      };
    }
  } catch (err) {
    return {
      eligible: false,
      reason: err instanceof Error ? err.message : 'Invalid release semver.',
    };
  }

  return {
    eligible: true,
    reason: `Signed ${channel} release ${manifest.version} verified and ready.`,
    manifest,
  };
}
