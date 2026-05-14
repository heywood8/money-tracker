import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const APP_VERSION = require('../../package.json').version;

const DEFAULT_GITHUB_OWNER = 'heywood8';
const DEFAULT_GITHUB_REPO = 'money-tracker';

const GITHUB_API_VERSION = '2022-11-28';
const UPDATE_CHECK_TIMEOUT_MS = 8000;

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

    for (const release of releases) {
      const releaseVersion = parseVersionFromRelease(release);
      if (!releaseVersion) {
        continue;
      }

      if (compareVersions(releaseVersion, currentNormalized) <= 0) {
        continue; // not newer than current — skip
      }

      const apkAsset = extractApkAsset(release.assets);
      newerReleases.push({ version: releaseVersion, notes: release.body || null, hasApk: !!apkAsset });

      if (apkAsset && (!bestRelease || compareVersions(releaseVersion, bestRelease.version) > 0)) {
        bestRelease = {
          version: releaseVersion,
          downloadUrl: apkAsset.browser_download_url,
          releaseUrl: release.html_url || apkAsset.browser_download_url,
          publishedAt: release.published_at || null,
          releaseName: release.name || release.tag_name || null,
        };
      } else if (!apkAsset) {
        foundReleasesWithoutApk = true;
      }
    }

    if (newerReleases.length === 0) {
      // Nothing newer found at all — either up to date or all releases lacked versions
      return {
        success: true,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
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
      releaseUrl: bestRelease.releaseUrl,
      publishedAt: bestRelease.publishedAt,
      releaseName: bestRelease.releaseName,
      releaseNotes: releaseNotes.length > 0 ? releaseNotes : null,
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

export const installApk = async (localUri) => {
  const contentUri = await FileSystem.getContentUriAsync(localUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    type: 'application/vnd.android.package-archive',
  });
};

export const downloadAndInstallApk = async (downloadUrl, onProgress) => {
  const filename = (downloadUrl.split('/').pop().split('?')[0]) || 'penny-update.apk';
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

  await cleanupOldApks();

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1 | 268435456, // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    type: 'application/vnd.android.package-archive',
  });
};
