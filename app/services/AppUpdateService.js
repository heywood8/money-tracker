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

  const apkAssets = assets.filter((asset) => {
    if (!asset || typeof asset.name !== 'string') {
      return false;
    }
    return asset.name.toLowerCase().endsWith('.apk') && !!asset.browser_download_url;
  });

  // A release may carry more than one ABI (e.g. an arm64 build plus a parallel
  // "*_x86_64.apk"). Real devices are arm64, so resolve in priority order; asset
  // order in the GitHub API is not guaranteed, so we must not just take the first
  // .apk. This already anticipates the planned "<tag>_arm64.apk" rename: it is
  // preferred now, with the current unsuffixed arm64 APK as the fallback, so the
  // rename ships without a matching app-side change.
  const isX86 = (name) => /x86/i.test(name);
  const isArm64 = (name) => /arm64/i.test(name);
  return (
    // 1. Explicit arm64 asset (future "<tag>_arm64.apk").
    apkAssets.find((asset) => isArm64(asset.name)) ||
    // 2. Current unsuffixed arm64 APK — any non-x86 .apk.
    apkAssets.find((asset) => !isX86(asset.name)) ||
    // 3. Last resort: an x86_64-only release.
    apkAssets[0] ||
    null
  );
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

// The workflow that builds and attaches the release APK. When a release tag exists but no APK
// is attached yet, this build is usually still running on CI.
const BUILD_WORKFLOW_FILE = 'build-release-apk.yml';
// A full APK build takes ~17 minutes on the GitHub Actions runner; we treat that as 100%.
const BUILD_DURATION_MINUTES = 17;

// Tag pushes (penny-v*) drive the build workflow, so a run's head_branch is the tag that
// triggered it. We use that — falling back to the run's display title — to tie a build run to
// the release version whose APK it is producing.
const versionFromRun = (run) =>
  normalizeVersion(run?.head_branch) || normalizeVersion(run?.display_title) || null;

// Derives a rough completion percentage for a single active workflow run from how long it has
// been running. Returns null when the run has no usable start time.
const computeRunProgress = (run, now, expectedDurationMinutes) => {
  if (!run) {
    return null;
  }

  const startMs = new Date(run.run_started_at || run.created_at || 0).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) {
    return null;
  }

  const elapsedMinutes = (now - startMs) / 60000;
  if (elapsedMinutes < 0) {
    return null;
  }

  // Cap below 100%: the build is by definition not finished (no APK yet), so never show 100%.
  const rawPercent = Math.round((elapsedMinutes / expectedDurationMinutes) * 100);
  const percent = Math.min(99, Math.max(0, rawPercent));

  return {
    percent,
    elapsedMinutes: Math.floor(elapsedMinutes),
    status: run.status,
    startedAt: run.run_started_at || run.created_at || null,
    htmlUrl: run.html_url || null,
    version: versionFromRun(run),
  };
};

// A run is "active" until GitHub marks it completed (queued / in_progress / waiting / etc.).
const isActiveRun = (run) => !!run && !!run.status && run.status !== 'completed';

// A completed run that did not succeed will never attach an APK — the release stays empty until
// someone re-runs the build. We test for "not success" rather than for a list of failure
// conclusions so that cancelled, timed-out and startup-failure runs all count without having to
// track GitHub's conclusion vocabulary.
const isFailedRun = (run) => !!run && run.status === 'completed' && run.conclusion !== 'success';

const runStartedMs = (run) => new Date(run?.run_started_at || run?.created_at || 0).getTime();

// The user-facing facts about a build that finished without producing an APK.
const describeFailedRun = (run) => ({
  conclusion: run.conclusion || 'failure',
  completedAt: run.updated_at || null,
  htmlUrl: run.html_url || null,
  version: versionFromRun(run),
});

// Fetches the APK build workflow's recent runs, newest-first. Build status is supplementary
// information, so every failure mode — unreachable API, rate limit, unexpected payload — comes
// back as an empty list rather than as an error: not knowing how a build is doing must never
// turn a working update check into a failed one.
const fetchBuildWorkflowRuns = async ({
  owner = DEFAULT_GITHUB_OWNER,
  repo = DEFAULT_GITHUB_REPO,
  fetchImpl = fetch,
} = {}) => {
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${BUILD_WORKFLOW_FILE}/runs?per_page=20`;

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Penny/${APP_VERSION}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
      },
      UPDATE_CHECK_TIMEOUT_MS,
      fetchImpl,
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    return runs.filter(Boolean).sort((a, b) => runStartedMs(b) - runStartedMs(a));
  } catch {
    return [];
  }
};

// All currently active runs of the APK build workflow, each mapped to a rough completion
// percentage. Returned newest-first so the most recently started run is first. Returns an empty
// array when the API is unreachable, when there are no active runs, or when timing data is
// unusable.
export const fetchActiveBuildRuns = async ({
  owner = DEFAULT_GITHUB_OWNER,
  repo = DEFAULT_GITHUB_REPO,
  fetchImpl = fetch,
  now = Date.now(),
  expectedDurationMinutes = BUILD_DURATION_MINUTES,
} = {}) => {
  const runs = await fetchBuildWorkflowRuns({ owner, repo, fetchImpl });
  return runs
    .filter(isActiveRun)
    .map((run) => computeRunProgress(run, now, expectedDurationMinutes))
    .filter(Boolean);
};

// Reduces the build workflow's runs to one state per release version, so a release still missing
// its APK can say *why*. The newest run for a version wins — a re-run supersedes the attempt
// before it, and a re-run that succeeded must not leave the earlier failure on display.
//
// Each version maps to `{ progress, failure }` with exactly one side filled in: `progress` while
// the build is still going, `failure` once it has finished without an APK. Versions whose newest
// run succeeded are absent entirely — that build attached its APK, so there is nothing to report.
export const fetchBuildStateByVersion = async ({
  owner = DEFAULT_GITHUB_OWNER,
  repo = DEFAULT_GITHUB_REPO,
  fetchImpl = fetch,
  now = Date.now(),
  expectedDurationMinutes = BUILD_DURATION_MINUTES,
} = {}) => {
  const runs = await fetchBuildWorkflowRuns({ owner, repo, fetchImpl });
  const byVersion = {};
  const seen = new Set();

  for (const run of runs) {
    const version = versionFromRun(run);
    // Runs arrive newest-first, so the first one we see for a version is the one that counts.
    // Mark it seen even when it yields no state (an active run with unusable timing, or a
    // successful one) — otherwise an older, superseded run would speak for the version.
    if (!version || seen.has(version)) {
      continue;
    }
    seen.add(version);

    if (isActiveRun(run)) {
      const progress = computeRunProgress(run, now, expectedDurationMinutes);
      if (progress) {
        byVersion[version] = { progress, failure: null };
      }
    } else if (isFailedRun(run)) {
      byVersion[version] = { progress: null, failure: describeFailedRun(run) };
    }
  }

  return byVersion;
};

// Returns a rough completion percentage for the most recently started active APK build run.
// Used to show the user that a release's APK is on its way when the tag exists but the asset is
// not uploaded yet.
//
// Returns null when there is no active run, when the API is unreachable, or when the timing data
// is unusable — callers should treat null as "no progress information available".
export const fetchBuildProgress = async (options = {}) => {
  const runs = await fetchActiveBuildRuns(options);
  return runs.length > 0 ? runs[0] : null;
};

// Like fetchBuildProgress, but returns a map of release version → build progress so that each
// release still awaiting its APK can surface its own CI build status. When more than one active
// run maps to the same version, the most recently started one wins (runs are pre-sorted
// newest-first). Versions that cannot be derived from a run are skipped.
export const fetchBuildProgressByVersion = async (options = {}) => {
  const runs = await fetchActiveBuildRuns(options);
  const byVersion = {};
  for (const progress of runs) {
    if (progress.version && !(progress.version in byVersion)) {
      byVersion[progress.version] = progress;
    }
  }
  return byVersion;
};

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
      // Resolve each release's own APK + checksum URLs so the UI can offer a per-release
      // install/download button, not just one action for the newest release.
      const checksumAsset = apkAsset ? extractChecksumAsset(release.assets, apkAsset.name) : null;
      const apkDownloadUrl = apkAsset ? apkAsset.browser_download_url : null;
      const apkChecksumUrl = checksumAsset ? checksumAsset.browser_download_url : null;

      // Collect recent releases with APKs for changelog display regardless of version
      if (apkAsset && release.body && recentReleasesWithApk.length < MAX_CHANGELOG_ENTRIES) {
        recentReleasesWithApk.push({ version: releaseVersion, notes: release.body, publishedAt: release.published_at || null, releaseUrl: release.html_url || null, downloadUrl: apkDownloadUrl, checksumUrl: apkChecksumUrl });
      }

      if (compareVersions(releaseVersion, currentNormalized) <= 0) {
        continue; // not newer than current — skip
      }

      newerReleases.push({ version: releaseVersion, notes: release.body || null, hasApk: !!apkAsset, publishedAt: release.published_at || null, releaseUrl: release.html_url || null, downloadUrl: apkDownloadUrl, checksumUrl: apkChecksumUrl });

      if (apkAsset && (!bestRelease || compareVersions(releaseVersion, bestRelease.version) > 0)) {
        bestRelease = {
          version: releaseVersion,
          downloadUrl: apkDownloadUrl,
          checksumUrl: apkChecksumUrl,
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
      if (foundReleasesWithoutApk) {
        // The newer release(s) have no APK. Resolve each one's own CI build in a single request,
        // so a release can say whether its build is still running or has failed outright — a
        // failed build never attaches an APK, and without that distinction the release looks
        // identical to one whose build simply has not finished yet.
        const buildStateByVersion = await fetchBuildStateByVersion({ owner, repo, fetchImpl });
        // The most recently started *running* build is also surfaced top-level as
        // `buildProgress`, for the build-progress poller and legacy single-progress consumers.
        // Failures are deliberately absent from it: there is nothing left to poll for.
        const buildProgress = Object.values(buildStateByVersion)
          .map((state) => state.progress)
          .filter(Boolean)
          .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0] || null;

        // Every newer release is listed, notes or no notes. A release whose build failed is
        // exactly the one the user needs to see, and release-please occasionally publishes a tag
        // with an empty body — filtering those out used to leave the panel with nothing to show
        // and drop it onto the generic "could not check updates" screen.
        const releaseNotes = newerReleases
          .map((r) => ({
            version: r.version,
            notes: r.notes,
            hasApk: r.hasApk,
            publishedAt: r.publishedAt || null,
            releaseUrl: r.releaseUrl || null,
            downloadUrl: r.downloadUrl || null,
            checksumUrl: r.checksumUrl || null,
            buildProgress: !r.hasApk ? (buildStateByVersion[r.version]?.progress || null) : null,
            buildFailure: !r.hasApk ? (buildStateByVersion[r.version]?.failure || null) : null,
          }));
        return {
          success: false,
          isUpdateAvailable: false,
          currentVersion: currentNormalized,
          errorCode: 'releases_without_apks',
          releaseNotes: releaseNotes.length > 0 ? releaseNotes : null,
          recentReleaseNotes: recentReleasesWithApk.length > 0 ? recentReleasesWithApk : null,
          releasesUrl,
          buildProgress,
        };
      }
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion: currentNormalized,
        errorCode: 'invalid_release_data',
      };
    }

    const releaseNotes = newerReleases
      .filter((r) => r.notes && r.hasApk)
      .map((r) => ({ version: r.version, notes: r.notes, publishedAt: r.publishedAt || null, releaseUrl: r.releaseUrl || null, downloadUrl: r.downloadUrl || null, checksumUrl: r.checksumUrl || null }));

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

// Removes a downloaded APK from the cache. Used when the user asks to fetch a release again
// because the cached copy is suspect: deleting first is what makes the next download start from
// scratch instead of reusing (or resuming onto) the file already sitting there.
export const deleteDownloadedApk = async (localUri) => {
  if (!localUri) return false;
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    return true;
  } catch (e) {
    console.warn('[AppUpdate] could not delete the cached APK', e.message);
    return false;
  }
};

// Verifies the integrity of an APK already sitting in the cache for the given download URL.
// A previous download can be left truncated or corrupt (interrupted transfer, app killed
// mid-download, full disk), in which case offering "Install now" launches a broken installer
// that Android rejects with "There's a problem with the app file".
//
// Two layers of defence:
//   1. Checksum — when the release ships a .sha256 we hash the file and compare (strongest signal).
//   2. Structure — when no checksum is usable (asset missing, unfetchable, or hashing OOMed) we
//      fall back to a lightweight ZIP-structure check that still catches truncated downloads.
// A file that fails either layer is deleted so callers re-download cleanly.
//
// Returns one of:
//   { exists: false }                          — no usable cached file (absent or zero-size)
//   { exists: false, corrupted: true }         — cached file failed verification and was deleted
//   { exists: true, uri, verified: true }      — checksum matched
//   { exists: true, uri, verified: false }     — checksum unavailable but the file is structurally intact
export const verifyCachedApk = async (
  downloadUrl,
  { checksumUrl = null, cacheDir = FileSystem.cacheDirectory, fetchImpl = fetch } = {},
) => {
  const localUri = await checkAlreadyDownloaded(downloadUrl, cacheDir);
  if (!localUri) {
    return { exists: false };
  }

  // Layer 1: checksum verification when a checksum is available — the strongest proof.
  if (checksumUrl) {
    const filename = localUri.split('/').pop();
    const expectedHash = await fetchExpectedChecksum(checksumUrl, filename, fetchImpl);
    if (expectedHash) {
      // Only the hashing itself is guarded: an unreadable file leaves the verdict to the
      // structural check below, but once we have a hash its verdict is final — a failure to
      // delete must not be mistaken for a failure to hash.
      let actualHash = null;
      try {
        actualHash = await computeSha256(localUri);
      } catch (e) {
        console.warn('[AppUpdate] cached APK checksum computation failed; falling back to structure check', e.message);
      }
      if (actualHash && actualHash !== expectedHash) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        console.warn('[AppUpdate] cached APK failed checksum; deleted corrupt file', localUri);
        return { exists: false, corrupted: true };
      }
      if (actualHash) {
        return { exists: true, uri: localUri, verified: true };
      }
    }
    // expectedHash null → checksum asset missing/unfetchable/unparseable; fall through to structure.
  }

  // Layer 2: no usable checksum — verify the file is a structurally complete ZIP/APK so we still
  // catch truncated or partially-written downloads.
  const intact = await verifyApkStructure(localUri);
  if (!intact) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    console.warn('[AppUpdate] cached APK is structurally invalid; deleted corrupt file', localUri);
    return { exists: false, corrupted: true };
  }

  return { exists: true, uri: localUri, verified: false };
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

// ZIP signatures, little-endian, in the byte order they appear on disk.
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — first local file header
const ZIP_EOCD = [0x50, 0x4b, 0x05, 0x06];         // "PK\x05\x06" — End Of Central Directory record
// The EOCD is 22 bytes plus an optional comment of up to 0xFFFF bytes, so it lives within the
// last ~64KB of a valid archive. We never need to read more than this to find it.
const MAX_EOCD_SCAN = 22 + 0xffff; // 65557
const EOCD_MIN_SIZE = 22; // a ZIP with no entries is still at least one 22-byte EOCD record

// Checksum-independent integrity check for a cached APK. An APK is a ZIP archive: it must begin
// with a local file header (PK\x03\x04) and end with an End Of Central Directory record
// (PK\x05\x06) within the last ~64KB. A truncated or partially-written download — the usual cause
// of Android's "There's a problem with the app file" — is missing the trailing EOCD, so this
// catches exactly the corruption the OS installer would reject.
//
// Reads only the head (4 bytes) and tail (≤64KB), never the whole 30-50MB file, so it is cheap
// and OOM-safe. Returns true when the file looks intact OR when it cannot be inspected (a read
// error must not cause us to delete a possibly-good file — let other signals decide).
export const verifyApkStructure = async (fileUri) => {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    const size = info?.size;
    if (!Number.isFinite(size) || size < EOCD_MIN_SIZE) {
      return false; // too small to be a valid APK/ZIP
    }

    const headB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    const head = base64ToBytes(headB64);
    if (head.length < 4 || !ZIP_LOCAL_HEADER.every((b, i) => head[i] === b)) {
      return false;
    }

    const tailLen = Math.min(size, MAX_EOCD_SCAN);
    const tailB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: size - tailLen,
      length: tailLen,
    });
    const tail = base64ToBytes(tailB64);
    for (let i = tail.length - 4; i >= 0; i -= 1) {
      if (tail[i] === ZIP_EOCD[0] && tail[i + 1] === ZIP_EOCD[1]
        && tail[i + 2] === ZIP_EOCD[2] && tail[i + 3] === ZIP_EOCD[3]) {
        return true; // found the End Of Central Directory record — archive is complete
      }
    }
    return false; // no EOCD in the tail → truncated/corrupt
  } catch (e) {
    console.warn('[AppUpdate] APK structure check could not read file; skipping', e.message);
    return true; // unable to determine → do not treat as corrupt
  }
};

// How much of the APK is read per hashing step. Reading the file in one call asks the platform
// for a base64 string of ~4/3 its size, and a Java string costs two bytes per character: a 55MB
// APK therefore needs a ~150MB contiguous allocation, which is exactly what died on mid-range
// devices with "Failed to allocate a 149232328 byte allocation". A slice is a multiple of 3 so
// each read base64-encodes without interior padding.
const HASH_CHUNK_BYTES = 3 * 1024 * 1024;

// SHA-256 round constants: the first 32 bits of the fractional parts of the cube roots of the
// first 64 primes (FIPS 180-4, §4.2.2).
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

// Streaming SHA-256. The APK is hashed slice by slice, so this never needs the file in one piece —
// it carries only the 64-byte block that straddles two slices. Used when the runtime has no
// crypto.subtle (Hermes ships no Web Crypto, and nothing in this app polyfills one), which is the
// difference between verifying every download and silently verifying none.
export const createSha256 = () => {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const pending = new Uint8Array(64); // bytes left over from the previous update
  let pendingLen = 0;
  let totalBytes = 0;

  const compress = (bytes, at) => {
    for (let i = 0; i < 16; i += 1) {
      const p = at + i * 4;
      w[i] = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = state[0]; let b = state[1]; let c = state[2]; let d = state[3];
    let e = state[4]; let f = state[5]; let g = state[6]; let h = state[7];
    for (let i = 0; i < 64; i += 1) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    state[0] += a; state[1] += b; state[2] += c; state[3] += d;
    state[4] += e; state[5] += f; state[6] += g; state[7] += h;
  };

  return {
    update(chunk) {
      totalBytes += chunk.length;
      let i = 0;
      if (pendingLen) {
        const need = Math.min(64 - pendingLen, chunk.length);
        pending.set(chunk.subarray(0, need), pendingLen);
        pendingLen += need;
        i = need;
        if (pendingLen === 64) {
          compress(pending, 0);
          pendingLen = 0;
        }
      }
      for (; i + 64 <= chunk.length; i += 64) {
        compress(chunk, i);
      }
      if (i < chunk.length) {
        pending.set(chunk.subarray(i), 0);
        pendingLen = chunk.length - i;
      }
    },

    digest() {
      // Append the 0x80 terminator and the message length in bits as a 64-bit big-endian field,
      // spilling into a second block when the length no longer fits after the terminator.
      const block = new Uint8Array(pendingLen < 56 ? 64 : 128);
      block.set(pending.subarray(0, pendingLen));
      block[pendingLen] = 0x80;
      const bitsHigh = Math.floor(totalBytes / 0x20000000); // totalBytes * 8 / 2^32
      const bitsLow = (totalBytes * 8) >>> 0;
      const end = block.length;
      block[end - 8] = (bitsHigh >>> 24) & 0xff;
      block[end - 7] = (bitsHigh >>> 16) & 0xff;
      block[end - 6] = (bitsHigh >>> 8) & 0xff;
      block[end - 5] = bitsHigh & 0xff;
      block[end - 4] = (bitsLow >>> 24) & 0xff;
      block[end - 3] = (bitsLow >>> 16) & 0xff;
      block[end - 2] = (bitsLow >>> 8) & 0xff;
      block[end - 1] = bitsLow & 0xff;
      for (let i = 0; i < end; i += 64) {
        compress(block, i);
      }

      let hex = '';
      for (let i = 0; i < 8; i += 1) {
        hex += (state[i] >>> 0).toString(16).padStart(8, '0');
      }
      return hex;
    },
  };
};

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

// SHA-256 of a file, hashed from fixed-size slices so the whole file is never held as base64.
// Where the runtime offers crypto.subtle its native digest is far faster, at the cost of holding
// the file's bytes at once; without it we fall back to hashing each slice as it arrives, which
// needs no full buffer at all. Either way the huge base64 string that OOMed is gone.
export const computeSha256 = async (fileUri, { chunkBytes = HASH_CHUNK_BYTES } = {}) => {
  const info = await FileSystem.getInfoAsync(fileUri);
  const size = info?.size;
  if (!info?.exists || !Number.isFinite(size) || size <= 0) {
    throw new Error('Cannot hash file: missing, empty, or unreadable');
  }

  const subtle = globalThis.crypto?.subtle;
  const buffer = subtle ? new Uint8Array(size) : null;
  const hasher = subtle ? null : createSha256();

  let offset = 0;
  while (offset < size) {
    const remaining = size - offset;
    const sliceB64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length: Math.min(chunkBytes, remaining),
    });
    const read = base64ToBytes(sliceB64 || '');
    if (!read.length) {
      // A read that yields nothing would loop forever — the file shrank or became unreadable.
      throw new Error('Cannot hash file: read returned no data');
    }
    // A slice never runs past the size we measured; if the file grew under us, ignore the excess
    // so the digest still describes the file we sized.
    const slice = read.length > remaining ? read.subarray(0, remaining) : read;
    if (buffer) {
      buffer.set(slice, offset);
    } else {
      hasher.update(slice);
    }
    offset += slice.length;
  }

  return hasher ? hasher.digest() : toHex(await subtle.digest('SHA-256', buffer.buffer));
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

  let verified = false;
  if (checksumUrl) {
    const expectedHash = await fetchExpectedChecksum(checksumUrl, filename, fetchImpl);
    if (expectedHash) {
      // Hashing reads the file, so it can still fail on a device under memory pressure. Treat
      // that as "unable to verify" rather than a download failure — the structural check below
      // is the floor that keeps a broken file from reaching the installer. A hash we did get,
      // though, is the last word: nothing after this may install a file it disagrees with.
      let actualHash = null;
      try {
        onPhaseChange?.('verifying');
        actualHash = await computeSha256(result.uri);
      } catch (e) {
        console.warn('[AppUpdate] checksum computation failed; falling back to structure check', e.message);
      }
      if (actualHash && actualHash !== expectedHash) {
        try {
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
        } catch (e) {
          console.warn('[AppUpdate] could not delete the mismatched APK', e.message);
        }
        throw new Error('APK checksum mismatch — file discarded');
      }
      verified = !!actualHash;
    } else {
      console.warn('[AppUpdate] checksum file unavailable; falling back to structure check');
    }
  }

  // Nothing proved this download whole, so at least confirm it is a complete archive. A truncated
  // APK is what Android rejects with "There's a problem with the app file"; deleting it here is
  // what makes the next attempt re-download instead of offering to install the same broken file.
  if (!verified) {
    if (!(await verifyApkStructure(result.uri))) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      throw new Error('Downloaded APK is incomplete — file deleted');
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
