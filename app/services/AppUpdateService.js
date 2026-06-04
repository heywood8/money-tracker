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

// Uses the native Web Crypto API (crypto.subtle) available in Hermes (RN 0.71+).
// Single I/O read + native C++ SHA-256 is 10-50x faster than the chunked pure-JS approach.
export const computeSha256 = async (fileUri) => {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

export const downloadAndInstallApk = async (downloadUrl, onProgress, { checksumUrl = null, fetchImpl = fetch, onPhaseChange = null } = {}) => {
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
        onPhaseChange?.('verifying');
        const actualHash = await computeSha256(result.uri);
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

  try {
    onPhaseChange?.('backing_up');
    const { createBackup } = await import('./BackupRestore');
    const snapshot = await createBackup();
    const snapshotTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const snapshotUri = `${FileSystem.documentDirectory}pre_update_${snapshotTimestamp}.json`;
    await FileSystem.writeAsStringAsync(snapshotUri, JSON.stringify(snapshot, null, 2));
    console.log('[AppUpdate] Pre-update backup saved:', snapshotUri);

    try {
      const allFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      const snapshots = allFiles
        .filter((name) => name.startsWith('pre_update_') && name.endsWith('.json'))
        .sort();
      const excess = snapshots.slice(0, Math.max(0, snapshots.length - 3));
      for (const name of excess) {
        await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${name}`, { idempotent: true });
        console.log('[AppUpdate] Deleted old pre-update snapshot:', name);
      }
    } catch (cleanupError) {
      console.warn('[AppUpdate] Failed to clean up old pre-update snapshots:', cleanupError);
    }
  } catch (backupError) {
    console.warn('[AppUpdate] Pre-update backup failed; proceeding with install:', backupError.message);
  }

  await cleanupOldApks();

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    type: 'application/vnd.android.package-archive',
  });
};
