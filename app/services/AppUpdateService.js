import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const APP_VERSION = require('../../package.json').version;

const DEFAULT_GITHUB_OWNER = 'heywood8';
const DEFAULT_GITHUB_REPO = 'money-tracker';

const GITHUB_API_VERSION = '2022-11-28';
const UPDATE_CHECK_TIMEOUT_MS = 8000;

// Only allow safe characters in filenames downloaded to the cache directory.
// Prevents path traversal attacks (e.g. "../../../data/data/com.pkg/databases/penny.db").
export const sanitizeFilename = (raw) => {
  if (!raw || typeof raw !== 'string') return 'penny-update.apk';
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.toLowerCase().endsWith('.apk') && safe.length > 4 ? safe : 'penny-update.apk';
};

const normalizeVersion = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Handles values like "v1.2.3", "penny-v1.2.3", or "release-1.2.3-beta.1"
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
};

export const parseVersionFromRelease = (release) => {
  if (!release) {
    return null;
  }
  return normalizeVersion(release.tag_name) || normalizeVersion(release.name);
};

export const compareVersions = (left, right) => {
  const parsedLeft = normalizeVersion(left);
  const parsedRight = normalizeVersion(right);

  if (!parsedLeft || !parsedRight) {
    return 0;
  }

  const leftParts = parsedLeft.split('.').map(Number);
  const rightParts = parsedRight.split('.').map(Number);

  for (let i = 0; i < 3; i += 1) {
    if (leftParts[i] > rightParts[i]) return 1;
    if (leftParts[i] < rightParts[i]) return -1;
  }

  return 0;
};

export const extractApkAsset = (assets = []) => {
  if (!Array.isArray(assets)) {
    return null;
  }

  return assets.find((asset) => {
    if (!asset || typeof asset.name !== 'string') {
      return false;
    }
    return asset.name.toLowerCase().endsWith('.apk') && !!asset.browser_download_url;
  }) || null;
};

// Finds a SHA-256 checksum asset matching the APK filename.
// The release pipeline uploads "<apkName>.sha256" produced by sha256sum.
export const extractChecksumAsset = (assets = [], apkFilename) => {
  if (!Array.isArray(assets) || !apkFilename) {
    return null;
  }
  const expected = `${apkFilename}.sha256`;
  return assets.find((asset) => {
    if (!asset || typeof asset.name !== 'string') return false;
    return asset.name === expected && !!asset.browser_download_url;
  }) || null;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = UPDATE_CHECK_TIMEOUT_MS, fetchImpl = fetch) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    return await fetchImpl(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const MAX_RELEASES_TO_CHECK = 20;
const MAX_CHANGELOG_ENTRIES = 10;

export const checkForAppUpdate = async ({
  currentVersion = APP_VERSION,
  owner = DEFAULT_GITHUB_OWNER,
  repo = DEFAULT_GITHUB_REPO,
  fetchImpl = fetch,
} = {}) => {
  const currentNormalized = normalizeVersion(currentVersion);
  if (!currentNormalized) {
    return {
      success: false,
      isUpdateAvailable: false,
      currentVersion,
      errorCode: 'invalid_current_version',
    };
  }

  const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${MAX_RELEASES_TO_CHECK}`;

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Penny/${currentNormalized}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
      },
      UPDATE_CHECK_TIMEOUT_MS,
      fetchImpl,
    );

    if (!response.ok) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        errorCode: response.status === 403 ? 'rate_limited' : 'http_error',
        httpStatus: response.status,
      };
    }

    const releases = await response.json();
    if (!Array.isArray(releases) || releases.length === 0) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        errorCode: 'invalid_release_data',
      };
    }

    // Collect all releases newer than current. GitHub orders by publication date, not version,
    // so we scan all fetched releases rather than stopping at the first non-newer one.
    let bestRelease = null; // highest-version release with a downloadable APK
    let foundReleasesWithoutApk = false;
    const newerReleases = []; // all releases with version > current, for changelog
    const recentReleasesWithApk = []; // up to MAX_CHANGELOG_ENTRIES recent releases with APKs (any version)

    for (const release of releases) {
      const releaseVersion = parseVersionFromRelease(release);
      if (!releaseVersion) {
        continue;
      }

      const apkAsset = extractApkAsset(release.assets);

      // Collect recent releases with APKs for changelog display regardless of version
      if (apkAsset && release.body && recentReleasesWithApk.length < MAX_CHANGELOG_ENTRIES) {
        recentReleasesWithApk.push({ version: releaseVersion, notes: release.body });
      }

      if (compareVersions(releaseVersion, currentNormalized) <= 0) {
        continue; // not newer than current — skip
      }

      newerReleases.push({ version: releaseVersion, notes: release.body || null, hasApk: !!apkAsset });

      if (apkAsset && (!bestRelease || compareVersions(releaseVersion, bestRelease.version) > 0)) {
        const checksumAsset = extractChecksumAsset(release.assets, apkAsset.name);
        bestRelease = {
          version: releaseVersion,
          downloadUrl: apkAsset.browser_download_url,
          checksumUrl: checksumAsset ? checksumAsset.browser_download_url : null,
          releaseUrl: release.html_url || apkAsset.browser_download_url,
          publishedAt: release.published_at || null,
          releaseName: release.name || release.tag_name || null,
        };
      } else if (!apkAsset) {
        foundReleasesWithoutApk = true;
      }
    }

    const releasesUrl = `https://github.com/${owner}/${repo}/releases`;
    const recentReleaseNotes = recentReleasesWithApk.length > 0 ? recentReleasesWithApk : null;

    if (newerReleases.length === 0) {
      // Nothing newer found at all — either up to date or all releases lacked versions
      return {
        success: true,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        releasesUrl,
        recentReleaseNotes,
      };
    }

    if (!bestRelease) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        errorCode: foundReleasesWithoutApk ? 'releases_without_apks' : 'invalid_release_data',
      };
    }

    const releaseNotes = newerReleases
      .filter((r) => r.notes && r.hasApk)
      .map((r) => ({ version: r.version, notes: r.notes }));

    return {
      success: true,
      isUpdateAvailable: true,
      currentVersion: currentNormalized,
      latestVersion: bestRelease.version,
      downloadUrl: bestRelease.downloadUrl,
      checksumUrl: bestRelease.checksumUrl,
      releaseUrl: bestRelease.releaseUrl,
      publishedAt: bestRelease.publishedAt,
      releaseName: bestRelease.releaseName,
      releaseNotes: releaseNotes.length > 0 ? releaseNotes : null,
      releasesUrl,
      recentReleaseNotes,
    };

  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return {
      success: false,
      isUpdateAvailable: false,
      currentVersion: currentNormalized,
      errorCode: isTimeout ? 'timeout' : 'network_error',
    };
  }
};

const APK_KEEP_COUNT = 3;

export const cleanupOldApks = async (cacheDir = FileSystem.cacheDirectory, keep = APK_KEEP_COUNT) => {
  const files = await FileSystem.readDirectoryAsync(cacheDir);
  const apkFiles = files.filter((f) => f.toLowerCase().endsWith('.apk'));

  if (apkFiles.length <= keep) {
    console.log(`[AppUpdate] apk cleanup: ${apkFiles.length} apk(s) found, none deleted (limit: ${keep})`);
    return;
  }

  const withInfo = await Promise.all(
    apkFiles.map(async (name) => {
      const uri = `${cacheDir}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      return { uri, modificationTime: info.modificationTime || 0 };
    }),
  );

  withInfo.sort((a, b) => b.modificationTime - a.modificationTime);

  const toDelete = withInfo.slice(keep);
  await Promise.all(toDelete.map(({ uri }) => FileSystem.deleteAsync(uri, { idempotent: true })));
  console.log(`[AppUpdate] apk cleanup: ${apkFiles.length} apk(s) found, ${toDelete.length} deleted (limit: ${keep})`);
};

export const listDownloadedApks = async (cacheDir = FileSystem.cacheDirectory) => {
  try {
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    const apkFiles = files.filter((f) => f.toLowerCase().endsWith('.apk'));

    const withInfo = await Promise.all(
      apkFiles.map(async (name) => {
        const uri = `${cacheDir}${name}`;
        const info = await FileSystem.getInfoAsync(uri);
        const match = name.match(/(\d+)\.(\d+)\.(\d+)/);
        const version = match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null;
        return {
          uri,
          filename: name,
          version,
          modificationTime: info.modificationTime || 0,
        };
      }),
    );

    return withInfo.sort((a, b) => b.modificationTime - a.modificationTime);
  } catch {
    return [];
  }
};

export const checkAlreadyDownloaded = async (downloadUrl, cacheDir = FileSystem.cacheDirectory) => {
  const raw = (downloadUrl.split('/').pop().split('?')[0]) || null;
  const filename = sanitizeFilename(raw);
  if (filename === 'penny-update.apk' && raw && !raw.toLowerCase().endsWith('.apk')) return null;
  const localUri = `${cacheDir}${filename}`;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    return (info.exists && info.size > 0) ? localUri : null;
  } catch {
    return null;
  }
};

// SHA-256 round constants (first 32 bits of cube roots of primes 2–311).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// Initial hash values (first 32 bits of square roots of primes 2–19).
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

// Incremental SHA-256 — lets us hash a file in chunks without loading it fully into memory.
export class IncrementalSha256 {
  constructor() {
    this._h = new Uint32Array(SHA256_H0);
    this._buf = new Uint8Array(64);
    this._bufLen = 0;
    this._totalLen = 0;
    this._w = new Uint32Array(64);
  }

  _rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  _compress(block) {
    const h = this._h;
    const w = this._w;
    for (let i = 0; i < 16; i++) {
      w[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) |
              (block[i * 4 + 2] << 8)  |  block[i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = this._rotr(w[i - 15], 7) ^ this._rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = this._rotr(w[i - 2], 17) ^ this._rotr(w[i - 2],  19) ^ (w[i - 2]  >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1   = this._rotr(e, 6) ^ this._rotr(e, 11) ^ this._rotr(e, 25);
      const ch   = (e & f) ^ (~e & g);
      const t1   = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0   = this._rotr(a, 2) ^ this._rotr(a, 13) ^ this._rotr(a, 22);
      const maj  = (a & b) ^ (a & c) ^ (b & c);
      const t2   = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d  = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a)  >>> 0; h[1] = (h[1] + b)  >>> 0;
    h[2] = (h[2] + c)  >>> 0; h[3] = (h[3] + d)  >>> 0;
    h[4] = (h[4] + e)  >>> 0; h[5] = (h[5] + f)  >>> 0;
    h[6] = (h[6] + g)  >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  update(data) {
    let offset = 0;
    this._totalLen += data.length;
    if (this._bufLen > 0) {
      const take = Math.min(64 - this._bufLen, data.length);
      this._buf.set(data.subarray(0, take), this._bufLen);
      this._bufLen += take;
      offset = take;
      if (this._bufLen === 64) { this._compress(this._buf); this._bufLen = 0; }
    }
    while (offset + 64 <= data.length) {
      this._compress(data.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < data.length) {
      const rem = data.length - offset;
      this._buf.set(data.subarray(offset), 0);
      this._bufLen = rem;
    }
    return this;
  }

  digest() {
    // Append 0x80, zero-pad to 56 mod 64, then 64-bit big-endian bit-length.
    const padLen = this._bufLen < 56 ? 64 : 128;
    const pad = new Uint8Array(padLen);
    pad.set(this._buf.subarray(0, this._bufLen));
    pad[this._bufLen] = 0x80;
    const bits = this._totalLen * 8;
    const dv = new DataView(pad.buffer);
    dv.setUint32(padLen - 8, Math.floor(bits / 0x100000000) >>> 0);
    dv.setUint32(padLen - 4, bits >>> 0);
    for (let i = 0; i < padLen; i += 64) { this._compress(pad.subarray(i, i + 64)); }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) { odv.setUint32(i * 4, this._h[i]); }
    return out;
  }
}

// Pre-built lookup table for base64 → 6-bit value. Avoids atob() + charCodeAt loop.
const BASE64_LOOKUP = (() => {
  const t = new Uint8Array(256);
  const s = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 64; i++) t[s.charCodeAt(i)] = i;
  return t;
})();

// Decode a base64 string directly into a Uint8Array without an intermediate binary string.
const base64ToBytes = (b64) => {
  const len = b64.length;
  const padding = (b64[len - 1] === '=') + (b64[len - 2] === '=');
  const byteLen = (len >>> 2) * 3 - padding;
  const out = new Uint8Array(byteLen);
  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const v = (BASE64_LOOKUP[b64.charCodeAt(i    )] << 18) |
              (BASE64_LOOKUP[b64.charCodeAt(i + 1)] << 12) |
              (BASE64_LOOKUP[b64.charCodeAt(i + 2)] <<  6) |
               BASE64_LOOKUP[b64.charCodeAt(i + 3)];
    if (j < byteLen) out[j++] = v >>> 16;
    if (j < byteLen) out[j++] = (v >>> 8) & 0xff;
    if (j < byteLen) out[j++] = v & 0xff;
  }
  return out;
};

// 4 MB chunks: ~4× fewer I/O round-trips vs 1 MB while staying well within heap limits.
const SHA256_CHUNK_BYTES = 4 * 1024 * 1024;

export const computeSha256 = async (fileUri, onProgress) => {
  const info = await FileSystem.getInfoAsync(fileUri);
  const fileSize = info.size || 0;
  const hasher = new IncrementalSha256();
  for (let pos = 0; pos < fileSize; pos += SHA256_CHUNK_BYTES) {
    const length = Math.min(SHA256_CHUNK_BYTES, fileSize - pos);
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: pos,
      length,
    });
    hasher.update(base64ToBytes(b64));
    onProgress?.((pos + length) / fileSize);
    // Yield to the event loop so the UI stays responsive between chunks.
    await new Promise(r => setImmediate(r));
  }
  return Array.from(hasher.digest()).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Downloads the sha256sum-format checksum file and returns the expected hex hash for apkFilename.
// Returns null if the checksum cannot be fetched or parsed.
export const fetchExpectedChecksum = async (checksumUrl, apkFilename, fetchImpl = fetch) => {
  try {
    const response = await fetchImpl(checksumUrl);
    if (!response.ok) return null;
    const text = await response.text();
    for (const line of text.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const hash = parts[0];
      const name = parts[parts.length - 1].replace(/^\*/, ''); // strip binary-mode indicator
      if ((name === apkFilename || name.endsWith(`/${apkFilename}`)) && /^[0-9a-f]{64}$/i.test(hash)) {
        return hash.toLowerCase();
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const installApk = async (localUri) => {
  const contentUri = await FileSystem.getContentUriAsync(localUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    type: 'application/vnd.android.package-archive',
  });
};

export const downloadAndInstallApk = async (downloadUrl, onProgress, { checksumUrl = null, fetchImpl = fetch } = {}) => {
  const raw = (downloadUrl.split('/').pop().split('?')[0]) || null;
  const filename = sanitizeFilename(raw);
  const localUri = `${FileSystem.cacheDirectory}${filename}`;

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localUri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (onProgress && totalBytesExpectedToWrite > 0) {
        onProgress(totalBytesWritten / totalBytesExpectedToWrite);
      }
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) {
    throw new Error('Download failed');
  }

  if (checksumUrl) {
    const expectedHash = await fetchExpectedChecksum(checksumUrl, filename, fetchImpl);
    if (expectedHash) {
      try {
        const actualHash = await computeSha256(result.uri, onProgress ? (p) => onProgress(1 + p) : undefined);
        if (actualHash !== expectedHash) {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
          throw new Error('APK checksum mismatch — file deleted');
        }
      } catch (e) {
        if (e.message === 'APK checksum mismatch — file deleted') throw e;
        // computeSha256 can OOM on large APKs (reads entire file into JS heap).
        // Treat computation failures as "unable to verify" rather than download failure.
        console.warn('[AppUpdate] checksum computation failed; skipping verification', e.message);
      }
    } else {
      console.warn('[AppUpdate] checksum file unavailable; skipping verification');
    }
  }

  await cleanupOldApks();

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    type: 'application/vnd.android.package-archive',
  });
};
