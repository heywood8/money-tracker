import {
  parseVersionFromRelease,
  compareVersions,
  extractApkAsset,
  extractChecksumAsset,
  checkForAppUpdate,
  cleanupOldApks,
  checkAlreadyDownloaded,
  verifyCachedApk,
  verifyApkStructure,
  sanitizeFilename,
  fetchExpectedChecksum,
  computeSha256,
  downloadAndInstallApk,
  fetchBuildProgress,
  fetchBuildProgressByVersion,
  fetchActiveBuildRuns,
} from '../../app/services/AppUpdateService';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  getContentUriAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));

const FileSystem = require('expo-file-system/legacy');

describe('AppUpdateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupOldApks', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      console.log.mockRestore();
    });

    it('does nothing when apk count is at or below keep limit', async () => {
      FileSystem.readDirectoryAsync.mockResolvedValue(['penny-v1.apk', 'penny-v2.apk', 'penny-v3.apk']);
      FileSystem.getInfoAsync.mockResolvedValue({ modificationTime: 1000 });

      await cleanupOldApks('file:///cache/', 3);

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('[AppUpdate] apk cleanup: 3 apk(s) found, none deleted (limit: 3)');
    });

    it('deletes oldest apks keeping only the 3 newest', async () => {
      FileSystem.readDirectoryAsync.mockResolvedValue([
        'penny-v1.apk',
        'penny-v2.apk',
        'penny-v3.apk',
        'penny-v4.apk',
        'penny-v5.apk',
      ]);
      FileSystem.getInfoAsync.mockImplementation((uri) => {
        const times = {
          'file:///cache/penny-v1.apk': 1000,
          'file:///cache/penny-v2.apk': 2000,
          'file:///cache/penny-v3.apk': 3000,
          'file:///cache/penny-v4.apk': 4000,
          'file:///cache/penny-v5.apk': 5000,
        };
        return Promise.resolve({ modificationTime: times[uri] || 0 });
      });
      FileSystem.deleteAsync.mockResolvedValue();

      await cleanupOldApks('file:///cache/', 3);

      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/penny-v1.apk', { idempotent: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/penny-v2.apk', { idempotent: true });
      expect(console.log).toHaveBeenCalledWith('[AppUpdate] apk cleanup: 5 apk(s) found, 2 deleted (limit: 3)');
    });

    it('ignores non-apk files', async () => {
      FileSystem.readDirectoryAsync.mockResolvedValue([
        'penny-v1.apk',
        'penny-v2.apk',
        'some-log.txt',
        'penny-v3.apk',
        'penny-v4.apk',
      ]);
      FileSystem.getInfoAsync.mockImplementation((uri) => {
        const times = {
          'file:///cache/penny-v1.apk': 1000,
          'file:///cache/penny-v2.apk': 2000,
          'file:///cache/penny-v3.apk': 3000,
          'file:///cache/penny-v4.apk': 4000,
        };
        return Promise.resolve({ modificationTime: times[uri] || 0 });
      });
      FileSystem.deleteAsync.mockResolvedValue();

      await cleanupOldApks('file:///cache/', 3);

      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/penny-v1.apk', { idempotent: true });
    });

    it('handles missing modificationTime gracefully', async () => {
      FileSystem.readDirectoryAsync.mockResolvedValue(['penny-v1.apk', 'penny-v2.apk', 'penny-v3.apk', 'penny-v4.apk']);
      FileSystem.getInfoAsync.mockResolvedValue({});
      FileSystem.deleteAsync.mockResolvedValue();

      await cleanupOldApks('file:///cache/', 3);

      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseVersionFromRelease', () => {
    it('parses plain semver tag', async () => {
      expect(parseVersionFromRelease({ tag_name: 'v1.2.3' })).toBe('1.2.3');
    });

    it('parses prefixed tag name', async () => {
      expect(parseVersionFromRelease({ tag_name: 'penny-v0.50.4' })).toBe('0.50.4');
    });

    it('falls back to release name when tag is invalid', async () => {
      expect(parseVersionFromRelease({ tag_name: 'latest', name: 'Release 2.1.0' })).toBe('2.1.0');
    });
  });

  describe('compareVersions', () => {
    it('returns 1 when left version is newer', async () => {
      expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    });

    it('returns -1 when left version is older', async () => {
      expect(compareVersions('0.49.9', '0.50.0')).toBe(-1);
    });

    it('returns 0 for equivalent normalized versions', async () => {
      expect(compareVersions('v1.2.3', 'release-1.2.3')).toBe(0);
    });
  });

  describe('extractApkAsset', () => {
    it('returns first valid apk asset', async () => {
      const asset = extractApkAsset([
        { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        { name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny.apk' },
      ]);

      expect(asset.browser_download_url).toBe('https://example.com/penny.apk');
    });

    it('returns null when no apk assets exist', async () => {
      expect(extractApkAsset([{ name: 'archive.zip', browser_download_url: 'https://example.com/archive.zip' }])).toBeNull();
    });
  });

  describe('checkAlreadyDownloaded', () => {
    it('returns local URI when APK file exists and has content', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345678 });

      const uri = await checkAlreadyDownloaded(
        'https://github.com/heywood8/money-tracker/releases/download/v1.2.3/penny-v1.2.3.apk',
        'file:///cache/',
      );

      expect(uri).toBe('file:///cache/penny-v1.2.3.apk');
      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///cache/penny-v1.2.3.apk');
    });

    it('returns null when APK file does not exist', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: false, size: 0 });

      const uri = await checkAlreadyDownloaded(
        'https://github.com/heywood8/money-tracker/releases/download/v1.2.3/penny-v1.2.3.apk',
        'file:///cache/',
      );

      expect(uri).toBeNull();
    });

    it('returns null when file exists but has zero size (incomplete download)', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 0 });

      const uri = await checkAlreadyDownloaded(
        'https://github.com/heywood8/money-tracker/releases/download/v1.2.3/penny-v1.2.3.apk',
        'file:///cache/',
      );

      expect(uri).toBeNull();
    });

    it('returns null when download URL has no APK filename', async () => {
      const uri = await checkAlreadyDownloaded(
        'https://github.com/heywood8/money-tracker/releases/tag/v1.2.3',
        'file:///cache/',
      );

      expect(uri).toBeNull();
      expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
    });

    it('returns null when getInfoAsync throws', async () => {
      FileSystem.getInfoAsync.mockRejectedValue(new Error('filesystem error'));

      const uri = await checkAlreadyDownloaded(
        'https://github.com/heywood8/money-tracker/releases/download/v1.2.3/penny-v1.2.3.apk',
        'file:///cache/',
      );

      expect(uri).toBeNull();
    });

    it('strips query params from URL when building local path', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 5000000 });

      const uri = await checkAlreadyDownloaded(
        'https://example.com/penny-v1.2.3.apk?sig=abc123',
        'file:///cache/',
      );

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///cache/penny-v1.2.3.apk');
      expect(uri).toBe('file:///cache/penny-v1.2.3.apk');
    });
  });

  describe('checkForAppUpdate', () => {
    it('reports update availability when latest release is newer', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.50.4',
            assets: [{ name: 'penny-v0.50.4.apk', browser_download_url: 'https://example.com/penny-v0.50.4.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.50.4',
            published_at: '2026-03-21T08:00:00Z',
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.latestVersion).toBe('0.50.4');
      expect(result.downloadUrl).toContain('.apk');
    });

    it('returns no-update when versions match', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.50.3',
            assets: [{ name: 'penny-v0.50.3.apk', browser_download_url: 'https://example.com/penny-v0.50.3.apk' }],
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(false);
    });

    it('includes recentReleaseNotes with up to 10 APK releases when up to date', async () => {
      const apk = (v) => ({ name: `penny-v${v}.apk`, browser_download_url: `https://example.com/penny-v${v}.apk` });
      const releases = Array.from({ length: 12 }, (_, i) => ({
        tag_name: `v0.50.${i + 1}`,
        assets: [apk(`0.50.${i + 1}`)],
        body: `Release notes for 0.50.${i + 1}`,
      }));
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => releases,
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.12',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(false);
      expect(result.recentReleaseNotes).not.toBeNull();
      expect(result.recentReleaseNotes.length).toBe(10);
      expect(result.releasesUrl).toBe('https://github.com/heywood8/money-tracker/releases');
    });

    it('includes recentReleaseNotes in available result and excludes releases without notes', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.50.5',
            assets: [{ name: 'penny-v0.50.5.apk', browser_download_url: 'https://example.com/penny-v0.50.5.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.50.5',
            body: 'New features in 0.50.5',
          },
          {
            tag_name: 'v0.50.4',
            assets: [{ name: 'penny-v0.50.4.apk', browser_download_url: 'https://example.com/penny-v0.50.4.apk' }],
            // no body — should be excluded from recentReleaseNotes
          },
          {
            tag_name: 'v0.50.3',
            assets: [{ name: 'penny-v0.50.3.apk', browser_download_url: 'https://example.com/penny-v0.50.3.apk' }],
            body: 'Fixes in 0.50.3',
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.recentReleaseNotes).not.toBeNull();
      expect(result.recentReleaseNotes.length).toBe(2); // 0.50.5 and 0.50.3 have bodies; 0.50.4 does not
      expect(result.recentReleaseNotes[0].version).toBe('0.50.5');
      expect(result.recentReleaseNotes[1].version).toBe('0.50.3');
      expect(result.releasesUrl).toBe('https://github.com/heywood8/money-tracker/releases');
    });

    it('propagates the release published_at timestamp into changelog entries', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.50.5',
            assets: [{ name: 'penny-v0.50.5.apk', browser_download_url: 'https://example.com/penny-v0.50.5.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.50.5',
            body: 'New features in 0.50.5',
            published_at: '2026-06-17T14:30:00Z',
          },
          {
            tag_name: 'v0.50.3',
            assets: [{ name: 'penny-v0.50.3.apk', browser_download_url: 'https://example.com/penny-v0.50.3.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.50.3',
            body: 'Fixes in 0.50.3',
            published_at: '2026-06-10T09:15:00Z',
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      // The newer release surfaces its timestamp in both the update changelog and the recent list.
      expect(result.releaseNotes[0].publishedAt).toBe('2026-06-17T14:30:00Z');
      expect(result.recentReleaseNotes[0].publishedAt).toBe('2026-06-17T14:30:00Z');
      expect(result.recentReleaseNotes[1].publishedAt).toBe('2026-06-10T09:15:00Z');
      // The release page URL travels with the changelog entries so the version can deep-link to it.
      expect(result.releaseNotes[0].releaseUrl).toBe('https://github.com/heywood8/money-tracker/releases/tag/v0.50.5');
      expect(result.recentReleaseNotes[0].releaseUrl).toBe('https://github.com/heywood8/money-tracker/releases/tag/v0.50.5');
    });

    it('handles GitHub rate limiting response gracefully', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('rate_limited');
    });

    it('skips releases without APK and uses the next one that has an APK', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.50.5',
            assets: [],
          },
          {
            tag_name: 'v0.50.4',
            assets: [{ name: 'penny-v0.50.4.apk', browser_download_url: 'https://example.com/penny-v0.50.4.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.50.4',
            published_at: '2026-03-20T08:00:00Z',
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.latestVersion).toBe('0.50.4');
      expect(result.downloadUrl).toContain('penny-v0.50.4.apk');
    });

    it('returns releases_without_apks error when all releases lack APKs', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          { tag_name: 'v0.50.5', assets: [], body: 'Notes for 0.50.5' },
          { tag_name: 'v0.50.4', assets: [{ name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' }] },
          { tag_name: 'v0.50.3', assets: [] },
          // 0.50.0 = current version — has APK, should appear in recentReleaseNotes
          { tag_name: 'v0.50.0', assets: [{ name: 'penny-0.50.0.apk', browser_download_url: 'https://example.com/penny-0.50.0.apk' }], body: 'Notes for 0.50.0' },
          { tag_name: 'v0.49.9', assets: [{ name: 'penny-0.49.9.apk', browser_download_url: 'https://example.com/penny-0.49.9.apk' }], body: 'Notes for 0.49.9' },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.0',
        fetchImpl,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('releases_without_apks');
      expect(result.recentReleaseNotes).not.toBeNull();
      expect(result.recentReleaseNotes.length).toBe(2);
      expect(result.recentReleaseNotes[0].version).toBe('0.50.0');
      expect(result.recentReleaseNotes[1].version).toBe('0.49.9');
    });

    it('attaches a CI build progress to each no-APK release that is still building', async () => {
      const MINUTE = 60000;
      const now = Date.now();
      // Route releases vs. workflow-runs requests to different payloads so each no-APK release
      // can be matched to its own active build run by tag.
      const fetchImpl = jest.fn(async (url) => {
        if (url.includes('/actions/workflows/')) {
          return {
            ok: true,
            json: async () => ({
              workflow_runs: [
                { status: 'in_progress', head_branch: 'penny-v0.50.5', run_started_at: new Date(now - 1.7 * MINUTE).toISOString() },
                { status: 'in_progress', head_branch: 'penny-v0.50.4', run_started_at: new Date(now - 8.5 * MINUTE).toISOString() },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ([
            { tag_name: 'v0.50.5', assets: [], body: 'Notes for 0.50.5' },
            { tag_name: 'v0.50.4', assets: [], body: 'Notes for 0.50.4' },
            { tag_name: 'v0.50.0', assets: [{ name: 'penny-0.50.0.apk', browser_download_url: 'https://example.com/penny-0.50.0.apk' }], body: 'Notes for 0.50.0' },
          ]),
        };
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.0',
        fetchImpl,
      });

      expect(result.errorCode).toBe('releases_without_apks');
      const byVersion = Object.fromEntries(result.releaseNotes.map((r) => [r.version, r]));
      expect(byVersion['0.50.5'].buildProgress.percent).toBe(10);
      expect(byVersion['0.50.4'].buildProgress.percent).toBe(50);
      // The newest active run is still surfaced top-level for the poller / legacy consumers.
      expect(result.buildProgress.version).toBe('0.50.5');
    });

    it('returns invalid_release_data when releases list is empty', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.3',
        fetchImpl,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('invalid_release_data');
    });

    it('finds a newer release even when a same-version release appears first in the list', async () => {
      // GitHub does not guarantee version-sorted order. The current version can appear
      // before newer releases in the list and must not cause the scan to stop early.
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.112.9',
            assets: [],
          },
          {
            tag_name: 'v0.112.12',
            assets: [{ name: 'penny-v0.112.12.apk', browser_download_url: 'https://example.com/penny-v0.112.12.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.112.12',
            published_at: '2026-04-01T08:00:00Z',
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.112.9',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.latestVersion).toBe('0.112.12');
      expect(result.downloadUrl).toContain('penny-v0.112.12.apk');
    });

    it('picks the highest-version APK when newer releases are out of date order', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v0.113.1',
            assets: [{ name: 'penny-v0.113.1.apk', browser_download_url: 'https://example.com/penny-v0.113.1.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.113.1',
            published_at: '2026-05-01T08:00:00Z',
          },
          {
            tag_name: 'v0.112.9',
            assets: [],
          },
          {
            tag_name: 'v0.113.5',
            assets: [{ name: 'penny-v0.113.5.apk', browser_download_url: 'https://example.com/penny-v0.113.5.apk' }],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.113.5',
            published_at: '2026-04-15T08:00:00Z',
          },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.112.9',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.latestVersion).toBe('0.113.5');
      expect(result.downloadUrl).toContain('penny-v0.113.5.apk');
    });

    it('finds newer releases that appear after a block of older ones (real-world API ordering)', async () => {
      // Mirrors the actual GitHub API response ordering that triggered this bug:
      // current version first, then older patch releases, then newer releases at the end.
      // [0.112.9 (current), 0.112.8, 0.112.7, ..., 0.112.13 (newest), 0.112.12, 0.112.11, 0.112.10]
      const apk = (v) => ({ name: `penny-v${v}.apk`, browser_download_url: `https://example.com/penny-v${v}.apk` });
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          { tag_name: 'penny-v0.112.9', assets: [apk('0.112.9')] },
          { tag_name: 'penny-v0.112.8', assets: [apk('0.112.8')] },
          { tag_name: 'penny-v0.112.7', assets: [apk('0.112.7')] },
          { tag_name: 'penny-v0.112.13', assets: [apk('0.112.13')], html_url: 'https://github.com/heywood8/money-tracker/releases/tag/penny-v0.112.13' },
          { tag_name: 'penny-v0.112.12', assets: [apk('0.112.12')], html_url: 'https://github.com/heywood8/money-tracker/releases/tag/penny-v0.112.12' },
          { tag_name: 'penny-v0.112.11', assets: [apk('0.112.11')] },
          { tag_name: 'penny-v0.112.10', assets: [apk('0.112.10')] },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.112.9',
        fetchImpl,
      });

      expect(result.success).toBe(true);
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.latestVersion).toBe('0.112.13');
      expect(result.downloadUrl).toContain('penny-v0.112.13.apk');
    });

    it('uses releases endpoint with per_page=20', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v1.0.0',
            assets: [{ name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny-v1.0.0.apk' }],
          },
        ]),
      });

      await checkForAppUpdate({ currentVersion: '0.50.3', fetchImpl });

      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining('/releases?per_page=20'),
        expect.any(Object),
      );
    });

    it('includes checksumUrl in result when checksum asset is present', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v1.0.0',
            assets: [
              { name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny-v1.0.0.apk' },
              { name: 'penny-v1.0.0.apk.sha256', browser_download_url: 'https://example.com/penny-v1.0.0.apk.sha256' },
            ],
            html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v1.0.0',
          },
        ]),
      });

      const result = await checkForAppUpdate({ currentVersion: '0.50.3', fetchImpl });

      expect(result.checksumUrl).toBe('https://example.com/penny-v1.0.0.apk.sha256');
    });

    it('returns checksumUrl null when no checksum asset present', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            tag_name: 'v1.0.0',
            assets: [{ name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny-v1.0.0.apk' }],
          },
        ]),
      });

      const result = await checkForAppUpdate({ currentVersion: '0.50.3', fetchImpl });

      expect(result.checksumUrl).toBeNull();
    });
  });

  describe('sanitizeFilename', () => {
    it('passes through a safe APK filename unchanged', async () => {
      expect(sanitizeFilename('penny-v1.2.3.apk')).toBe('penny-v1.2.3.apk');
    });

    it('removes path separators preventing traversal outside the cache directory', async () => {
      const result = sanitizeFilename('../../../evil.apk');
      // The slash is stripped so the result is a flat filename, not a traversal path.
      expect(result).not.toContain('/');
      // The sanitized name is still a valid (if ugly) flat filename within the cache directory.
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('replaces path separators in filenames', async () => {
      const result = sanitizeFilename('foo/bar.apk');
      expect(result).not.toContain('/');
      expect(result).toBe('foo_bar.apk');
    });

    it('returns default when result has no .apk extension', async () => {
      expect(sanitizeFilename('malicious')).toBe('penny-update.apk');
    });

    it('returns default for null input', async () => {
      expect(sanitizeFilename(null)).toBe('penny-update.apk');
    });

    it('returns default for empty string', async () => {
      expect(sanitizeFilename('')).toBe('penny-update.apk');
    });
  });

  describe('extractChecksumAsset', () => {
    it('finds a checksum asset matching the APK filename', async () => {
      const assets = [
        { name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny.apk' },
        { name: 'penny-v1.0.0.apk.sha256', browser_download_url: 'https://example.com/penny.apk.sha256' },
      ];
      const asset = extractChecksumAsset(assets, 'penny-v1.0.0.apk');
      expect(asset.browser_download_url).toBe('https://example.com/penny.apk.sha256');
    });

    it('returns null when no checksum asset is present', async () => {
      const assets = [{ name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny.apk' }];
      expect(extractChecksumAsset(assets, 'penny-v1.0.0.apk')).toBeNull();
    });

    it('returns null when apkFilename is missing', async () => {
      expect(extractChecksumAsset([], null)).toBeNull();
    });
  });

  describe('fetchExpectedChecksum', () => {
    it('parses sha256sum output and returns the hash for a matching filename', async () => {
      const checksumText = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd  penny-v1.0.0.apk\n';
      const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => checksumText });
      const hash = await fetchExpectedChecksum('https://example.com/checksum.sha256', 'penny-v1.0.0.apk', fetchImpl);
      expect(hash).toBe('abc123def456abc123def456abc123def456abc123def456abc123def456abcd');
    });

    it('handles binary-mode indicator (*) in sha256sum output', async () => {
      const checksumText = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd *penny-v1.0.0.apk\n';
      const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => checksumText });
      const hash = await fetchExpectedChecksum('https://example.com/checksum.sha256', 'penny-v1.0.0.apk', fetchImpl);
      expect(hash).toBe('abc123def456abc123def456abc123def456abc123def456abc123def456abcd');
    });

    it('returns null when filename does not match', async () => {
      const checksumText = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd  other-file.apk\n';
      const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => checksumText });
      const hash = await fetchExpectedChecksum('https://example.com/checksum.sha256', 'penny-v1.0.0.apk', fetchImpl);
      expect(hash).toBeNull();
    });

    it('returns null when fetch fails', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false });
      const hash = await fetchExpectedChecksum('https://example.com/checksum.sha256', 'penny-v1.0.0.apk', fetchImpl);
      expect(hash).toBeNull();
    });

    it('returns null when network error occurs', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('network error'));
      const hash = await fetchExpectedChecksum('https://example.com/checksum.sha256', 'penny-v1.0.0.apk', fetchImpl);
      expect(hash).toBeNull();
    });
  });

  describe('checkAlreadyDownloaded - path traversal prevention', () => {
    it('sanitizes path traversal in URL filename before checking cache', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 5000000 });

      const uri = await checkAlreadyDownloaded(
        'https://example.com/../../../evil.apk',
        'file:///cache/',
      );

      // getInfoAsync must be called with a sanitized path that stays within the cache
      const calledWith = FileSystem.getInfoAsync.mock.calls[0]?.[0] || '';
      expect(calledWith).not.toContain('../');
      expect(calledWith).toMatch(/^file:\/\/\/cache\//);
      expect(uri).not.toBeNull();
    });

    it('uses sanitized filename even when URL has encoded separators replaced', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: false });

      await checkAlreadyDownloaded(
        'https://example.com/foo%2Fbar.apk',
        'file:///cache/',
      );

      const calledWith = FileSystem.getInfoAsync.mock.calls[0]?.[0] || '';
      expect(calledWith).not.toContain('/bar.apk');
    });
  });

  describe('computeSha256', () => {
    it('reads the entire file in one call and returns the SHA-256 hex digest', async () => {
      // 'aGVsbG8=' is base64("hello"); SHA-256("hello") is a known constant
      FileSystem.readAsStringAsync.mockResolvedValue('aGVsbG8=');

      const result = await computeSha256('file:///cache/penny.apk');

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        'file:///cache/penny.apk',
        { encoding: 'base64' },
      );
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('propagates read errors to the caller', async () => {
      FileSystem.readAsStringAsync.mockRejectedValue(new Error('read failed'));

      await expect(computeSha256('file:///cache/penny.apk')).rejects.toThrow('read failed');
    });
  });

  describe('verifyCachedApk', () => {
    const URL = 'https://example.com/penny-v1.0.0.apk';
    // 'aGVsbG8=' = base64("hello"); SHA-256("hello") is this known constant
    const HELLO_B64 = 'aGVsbG8=';
    const HELLO_SHA = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    // Base64 of the ZIP signatures used by the structural integrity fallback.
    const APK_HEAD_B64 = 'UEsDBA=='; // PK\x03\x04 — local file header
    const APK_EOCD_B64 = 'UEsFBg=='; // PK\x05\x06 — End Of Central Directory record
    // Make the structural check (head read, then tail read) see a complete archive.
    const mockIntactApkStructure = () => {
      FileSystem.readAsStringAsync
        .mockResolvedValueOnce(APK_HEAD_B64)
        .mockResolvedValueOnce(APK_EOCD_B64);
    };

    it('reports exists:false when no cached APK is present', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: false, size: 0 });

      const result = await verifyCachedApk(URL, {
        checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256',
        cacheDir: 'file:///cache/',
        fetchImpl: jest.fn(),
      });

      expect(result).toEqual({ exists: false });
    });

    it('returns verified:false when no checksum URL is provided and the file is structurally intact', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      mockIntactApkStructure();

      const result = await verifyCachedApk(URL, { cacheDir: 'file:///cache/' });

      expect(result).toEqual({ exists: true, uri: 'file:///cache/penny-v1.0.0.apk', verified: false });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('deletes the file and reports corrupted when no checksum and the file is structurally truncated', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      FileSystem.deleteAsync.mockResolvedValue();
      // Valid header but the tail has no End Of Central Directory record (truncated download).
      FileSystem.readAsStringAsync
        .mockResolvedValueOnce(APK_HEAD_B64)
        .mockResolvedValueOnce('AAAAAAAA'); // decodes to zero bytes — no EOCD signature

      const result = await verifyCachedApk(URL, { cacheDir: 'file:///cache/' });

      expect(result).toEqual({ exists: false, corrupted: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///cache/penny-v1.0.0.apk',
        { idempotent: true },
      );
    });

    it('returns verified:true when the cached APK matches the checksum', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      FileSystem.readAsStringAsync.mockResolvedValue(HELLO_B64);
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => `${HELLO_SHA}  penny-v1.0.0.apk\n`,
      });

      const result = await verifyCachedApk(URL, {
        checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256',
        cacheDir: 'file:///cache/',
        fetchImpl,
      });

      expect(result).toEqual({ exists: true, uri: 'file:///cache/penny-v1.0.0.apk', verified: true });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('deletes the file and reports corrupted when the checksum does not match', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      FileSystem.readAsStringAsync.mockResolvedValue(HELLO_B64);
      FileSystem.deleteAsync.mockResolvedValue();
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff  penny-v1.0.0.apk\n',
      });

      const result = await verifyCachedApk(URL, {
        checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256',
        cacheDir: 'file:///cache/',
        fetchImpl,
      });

      expect(result).toEqual({ exists: false, corrupted: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///cache/penny-v1.0.0.apk',
        { idempotent: true },
      );
    });

    it('falls back to the structural check (verified:false) when the checksum file cannot be fetched', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      mockIntactApkStructure();
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false });

      const result = await verifyCachedApk(URL, {
        checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256',
        cacheDir: 'file:///cache/',
        fetchImpl,
      });

      expect(result).toEqual({ exists: true, uri: 'file:///cache/penny-v1.0.0.apk', verified: false });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it('deletes the file when the checksum is unfetchable AND the file is structurally truncated', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 12345 });
      FileSystem.deleteAsync.mockResolvedValue();
      FileSystem.readAsStringAsync
        .mockResolvedValueOnce(APK_HEAD_B64)
        .mockResolvedValueOnce('AAAAAAAA'); // no EOCD
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false });

      const result = await verifyCachedApk(URL, {
        checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256',
        cacheDir: 'file:///cache/',
        fetchImpl,
      });

      expect(result).toEqual({ exists: false, corrupted: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalled();
    });

    it('keeps the file (verified:false) when hashing throws (OOM / read error)', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 50_000_000 });
      FileSystem.readAsStringAsync.mockRejectedValue(new RangeError('Array buffer allocation failed'));
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => `${HELLO_SHA}  penny-v1.0.0.apk\n`,
      });

      const result = await verifyCachedApk(URL, {
        checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256',
        cacheDir: 'file:///cache/',
        fetchImpl,
      });

      expect(result).toEqual({ exists: true, uri: 'file:///cache/penny-v1.0.0.apk', verified: false });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('verifyApkStructure', () => {
    const FILE = 'file:///cache/penny-v1.0.0.apk';
    const APK_HEAD_B64 = 'UEsDBA=='; // PK\x03\x04
    const APK_EOCD_B64 = 'UEsFBg=='; // PK\x05\x06

    it('returns true for a complete archive (valid header + trailing EOCD)', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 40_000_000 });
      FileSystem.readAsStringAsync
        .mockResolvedValueOnce(APK_HEAD_B64)
        .mockResolvedValueOnce(APK_EOCD_B64);

      expect(await verifyApkStructure(FILE)).toBe(true);
    });

    it('reads only the head and tail, never the whole file', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 40_000_000 });
      FileSystem.readAsStringAsync
        .mockResolvedValueOnce(APK_HEAD_B64)
        .mockResolvedValueOnce(APK_EOCD_B64);

      await verifyApkStructure(FILE);

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);
      // Head: first 4 bytes from position 0.
      expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(1, FILE, {
        encoding: 'base64', position: 0, length: 4,
      });
      // Tail: the last ≤64KB, never offset 0 on a large file.
      const tailCall = FileSystem.readAsStringAsync.mock.calls[1][1];
      expect(tailCall.length).toBe(65557);
      expect(tailCall.position).toBe(40_000_000 - 65557);
    });

    it('returns false when the End Of Central Directory record is missing (truncated)', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 40_000_000 });
      FileSystem.readAsStringAsync
        .mockResolvedValueOnce(APK_HEAD_B64)
        .mockResolvedValueOnce('AAAAAAAA'); // zero bytes, no signature

      expect(await verifyApkStructure(FILE)).toBe(false);
    });

    it('returns false when the local file header magic is wrong', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 40_000_000 });
      FileSystem.readAsStringAsync.mockResolvedValueOnce('AAAAAAAA'); // not PK\x03\x04

      expect(await verifyApkStructure(FILE)).toBe(false);
      // Bails out after the header read — never bothers reading the tail.
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
    });

    it('returns false when the file is too small to be a valid archive', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 10 });

      expect(await verifyApkStructure(FILE)).toBe(false);
      expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
    });

    it('returns true (cannot determine) when the file cannot be read', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 40_000_000 });
      FileSystem.readAsStringAsync.mockRejectedValue(new Error('read failed'));

      expect(await verifyApkStructure(FILE)).toBe(true);
    });
  });

  describe('downloadAndInstallApk - checksum error handling', () => {
    const IntentLauncher = require('expo-intent-launcher');

    beforeEach(() => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 5 });
      FileSystem.readDirectoryAsync.mockResolvedValue([]);
      FileSystem.getContentUriAsync.mockResolvedValue('content://penny.apk');
      IntentLauncher.startActivityAsync.mockResolvedValue();
    });

    it('proceeds to install when computeSha256 throws (OOM / read error)', async () => {
      FileSystem.createDownloadResumable.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/penny-v1.0.0.apk' }),
      });
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 50_000_000 });
      FileSystem.readAsStringAsync.mockRejectedValue(new RangeError('Array buffer allocation failed'));

      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd  penny-v1.0.0.apk\n',
      });

      await expect(
        downloadAndInstallApk(
          'https://example.com/penny-v1.0.0.apk',
          null,
          { checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256', fetchImpl },
        ),
      ).resolves.toBeUndefined();

      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
      expect(IntentLauncher.startActivityAsync).toHaveBeenCalled();
    });

    it('deletes the file and throws when checksum does not match', async () => {
      FileSystem.createDownloadResumable.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/penny-v1.0.0.apk' }),
      });
      FileSystem.deleteAsync.mockResolvedValue();
      // 'aGVsbG8=' = base64("hello"); real SHA-256 ≠ 'ffff...'
      FileSystem.readAsStringAsync.mockResolvedValue('aGVsbG8=');

      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff  penny-v1.0.0.apk\n',
      });

      await expect(
        downloadAndInstallApk(
          'https://example.com/penny-v1.0.0.apk',
          null,
          { checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256', fetchImpl },
        ),
      ).rejects.toThrow('APK checksum mismatch — file deleted');

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///cache/penny-v1.0.0.apk',
        { idempotent: true },
      );
    });

    it('calls onPhaseChange("verifying") before computing the hash', async () => {
      FileSystem.createDownloadResumable.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/penny-v1.0.0.apk' }),
      });
      FileSystem.readAsStringAsync.mockResolvedValue('aGVsbG8=');

      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  penny-v1.0.0.apk\n',
      });
      const onPhaseChange = jest.fn();

      await downloadAndInstallApk(
        'https://example.com/penny-v1.0.0.apk',
        null,
        { checksumUrl: 'https://example.com/penny-v1.0.0.apk.sha256', fetchImpl, onPhaseChange },
      );

      expect(onPhaseChange).toHaveBeenCalledWith('verifying');
    });

    it('calls onPhaseChange("backing_up") but not "verifying" when no checksumUrl is provided', async () => {
      FileSystem.createDownloadResumable.mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/penny-v1.0.0.apk' }),
      });

      const onPhaseChange = jest.fn();

      await downloadAndInstallApk(
        'https://example.com/penny-v1.0.0.apk',
        null,
        { onPhaseChange },
      );

      expect(onPhaseChange).toHaveBeenCalledWith('backing_up');
      expect(onPhaseChange).not.toHaveBeenCalledWith('verifying');
    });
  });

  describe('fetchBuildProgress', () => {
    const MINUTE = 60000;
    const now = new Date('2026-06-18T12:00:00Z').getTime();

    const runsResponse = (runs) => ({
      ok: true,
      json: async () => ({ workflow_runs: runs }),
    });

    it('derives a percentage from how long the active run has been going (17 min = 100%)', async () => {
      // Started ~8.5 minutes ago → roughly 50%.
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', run_started_at: new Date(now - 8.5 * MINUTE).toISOString(), html_url: 'https://gh/run/1' },
      ]));

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result).not.toBeNull();
      expect(result.percent).toBe(50);
      expect(result.status).toBe('in_progress');
      expect(result.htmlUrl).toBe('https://gh/run/1');
    });

    it('queries the build-release-apk workflow runs endpoint', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'queued', run_started_at: new Date(now).toISOString() },
      ]));

      await fetchBuildProgress({ fetchImpl, now });

      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining('/actions/workflows/build-release-apk.yml/runs'),
        expect.any(Object),
      );
    });

    it('caps the percentage at 99% even when the build runs longer than expected', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', run_started_at: new Date(now - 40 * MINUTE).toISOString() },
      ]));

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result.percent).toBe(99);
    });

    it('picks the most recently started active run', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', run_started_at: new Date(now - 15 * MINUTE).toISOString() },
        { status: 'in_progress', run_started_at: new Date(now - 1.7 * MINUTE).toISOString() },
      ]));

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result.percent).toBe(10);
    });

    it('returns null when there are no active runs', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'completed', run_started_at: new Date(now - 5 * MINUTE).toISOString() },
      ]));

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result).toBeNull();
    });

    it('returns null when the API responds with an error', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result).toBeNull();
    });

    it('returns null when the request throws', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('network error'));

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result).toBeNull();
    });

    it('returns null when the payload has no workflow_runs array', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result).toBeNull();
    });

    it('derives the release version from the run head_branch (tag)', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        {
          status: 'in_progress',
          head_branch: 'penny-v0.142.0',
          run_started_at: new Date(now - 8.5 * MINUTE).toISOString(),
        },
      ]));

      const result = await fetchBuildProgress({ fetchImpl, now });

      expect(result.version).toBe('0.142.0');
    });
  });

  describe('fetchActiveBuildRuns', () => {
    const MINUTE = 60000;
    const now = new Date('2026-06-18T12:00:00Z').getTime();

    const runsResponse = (runs) => ({
      ok: true,
      json: async () => ({ workflow_runs: runs }),
    });

    it('returns every active run with progress, newest first', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', head_branch: 'penny-v0.141.4', run_started_at: new Date(now - 8.5 * MINUTE).toISOString() },
        { status: 'queued', head_branch: 'penny-v0.142.0', run_started_at: new Date(now - 1.7 * MINUTE).toISOString() },
        { status: 'completed', head_branch: 'penny-v0.140.0', run_started_at: new Date(now - 30 * MINUTE).toISOString() },
      ]));

      const result = await fetchActiveBuildRuns({ fetchImpl, now });

      expect(result).toHaveLength(2);
      // Newest first: 0.142.0 (1.7 min ago) then 0.141.4 (8.5 min ago).
      expect(result[0].version).toBe('0.142.0');
      expect(result[0].percent).toBe(10);
      expect(result[1].version).toBe('0.141.4');
      expect(result[1].percent).toBe(50);
    });

    it('returns an empty array on API error', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      const result = await fetchActiveBuildRuns({ fetchImpl, now });

      expect(result).toEqual([]);
    });
  });

  describe('fetchBuildProgressByVersion', () => {
    const MINUTE = 60000;
    const now = new Date('2026-06-18T12:00:00Z').getTime();

    const runsResponse = (runs) => ({
      ok: true,
      json: async () => ({ workflow_runs: runs }),
    });

    it('maps each release version to its own build progress', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', head_branch: 'penny-v0.141.4', run_started_at: new Date(now - 8.5 * MINUTE).toISOString() },
        { status: 'queued', head_branch: 'penny-v0.142.0', run_started_at: new Date(now - 1.7 * MINUTE).toISOString() },
      ]));

      const result = await fetchBuildProgressByVersion({ fetchImpl, now });

      expect(result['0.142.0'].percent).toBe(10);
      expect(result['0.141.4'].percent).toBe(50);
    });

    it('keeps the most recent run when multiple runs map to the same version', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', head_branch: 'penny-v0.142.0', run_started_at: new Date(now - 1.7 * MINUTE).toISOString() },
        { status: 'in_progress', head_branch: 'penny-v0.142.0', run_started_at: new Date(now - 15 * MINUTE).toISOString() },
      ]));

      const result = await fetchBuildProgressByVersion({ fetchImpl, now });

      expect(Object.keys(result)).toEqual(['0.142.0']);
      expect(result['0.142.0'].percent).toBe(10);
    });

    it('skips runs whose version cannot be derived', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(runsResponse([
        { status: 'in_progress', head_branch: 'main', run_started_at: new Date(now - 5 * MINUTE).toISOString() },
      ]));

      const result = await fetchBuildProgressByVersion({ fetchImpl, now });

      expect(result).toEqual({});
    });

    it('returns an empty map on API error', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404 });

      const result = await fetchBuildProgressByVersion({ fetchImpl, now });

      expect(result).toEqual({});
    });
  });
});

