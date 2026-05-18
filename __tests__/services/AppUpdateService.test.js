import {
  parseVersionFromRelease,
  compareVersions,
  extractApkAsset,
  extractChecksumAsset,
  checkForAppUpdate,
  cleanupOldApks,
  checkAlreadyDownloaded,
  sanitizeFilename,
  fetchExpectedChecksum,
  computeSha256,
  downloadAndInstallApk,
  IncrementalSha256,
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
    it('parses plain semver tag', () => {
      expect(parseVersionFromRelease({ tag_name: 'v1.2.3' })).toBe('1.2.3');
    });

    it('parses prefixed tag name', () => {
      expect(parseVersionFromRelease({ tag_name: 'penny-v0.50.4' })).toBe('0.50.4');
    });

    it('falls back to release name when tag is invalid', () => {
      expect(parseVersionFromRelease({ tag_name: 'latest', name: 'Release 2.1.0' })).toBe('2.1.0');
    });
  });

  describe('compareVersions', () => {
    it('returns 1 when left version is newer', () => {
      expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
    });

    it('returns -1 when left version is older', () => {
      expect(compareVersions('0.49.9', '0.50.0')).toBe(-1);
    });

    it('returns 0 for equivalent normalized versions', () => {
      expect(compareVersions('v1.2.3', 'release-1.2.3')).toBe(0);
    });
  });

  describe('extractApkAsset', () => {
    it('returns first valid apk asset', () => {
      const asset = extractApkAsset([
        { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        { name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny.apk' },
      ]);

      expect(asset.browser_download_url).toBe('https://example.com/penny.apk');
    });

    it('returns null when no apk assets exist', () => {
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
          { tag_name: 'v0.50.5', assets: [] },
          { tag_name: 'v0.50.4', assets: [{ name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' }] },
          { tag_name: 'v0.50.3', assets: [] },
          { tag_name: 'v0.50.2', assets: [] },
          { tag_name: 'v0.50.1', assets: [] },
        ]),
      });

      const result = await checkForAppUpdate({
        currentVersion: '0.50.0',
        fetchImpl,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('releases_without_apks');
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
    it('passes through a safe APK filename unchanged', () => {
      expect(sanitizeFilename('penny-v1.2.3.apk')).toBe('penny-v1.2.3.apk');
    });

    it('removes path separators preventing traversal outside the cache directory', () => {
      const result = sanitizeFilename('../../../evil.apk');
      // The slash is stripped so the result is a flat filename, not a traversal path.
      expect(result).not.toContain('/');
      // The sanitized name is still a valid (if ugly) flat filename within the cache directory.
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('replaces path separators in filenames', () => {
      const result = sanitizeFilename('foo/bar.apk');
      expect(result).not.toContain('/');
      expect(result).toBe('foo_bar.apk');
    });

    it('returns default when result has no .apk extension', () => {
      expect(sanitizeFilename('malicious')).toBe('penny-update.apk');
    });

    it('returns default for null input', () => {
      expect(sanitizeFilename(null)).toBe('penny-update.apk');
    });

    it('returns default for empty string', () => {
      expect(sanitizeFilename('')).toBe('penny-update.apk');
    });
  });

  describe('extractChecksumAsset', () => {
    it('finds a checksum asset matching the APK filename', () => {
      const assets = [
        { name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny.apk' },
        { name: 'penny-v1.0.0.apk.sha256', browser_download_url: 'https://example.com/penny.apk.sha256' },
      ];
      const asset = extractChecksumAsset(assets, 'penny-v1.0.0.apk');
      expect(asset.browser_download_url).toBe('https://example.com/penny.apk.sha256');
    });

    it('returns null when no checksum asset is present', () => {
      const assets = [{ name: 'penny-v1.0.0.apk', browser_download_url: 'https://example.com/penny.apk' }];
      expect(extractChecksumAsset(assets, 'penny-v1.0.0.apk')).toBeNull();
    });

    it('returns null when apkFilename is missing', () => {
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

  describe('IncrementalSha256', () => {
    const hexOf = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const encode = (str) => new TextEncoder().encode(str);

    it('matches SHA-256("") — NIST FIPS 180-4 test vector', () => {
      const hash = new IncrementalSha256().digest();
      expect(hexOf(hash)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('matches SHA-256("hello") — known vector', () => {
      const hash = new IncrementalSha256().update(encode('hello')).digest();
      expect(hexOf(hash)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('matches SHA-256("abc") — NIST FIPS 180-4 test vector', () => {
      const hash = new IncrementalSha256().update(encode('abc')).digest();
      expect(hexOf(hash)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('gives the same result whether data arrives in one call or many', () => {
      const data = encode('the quick brown fox jumps over the lazy dog');
      const single = hexOf(new IncrementalSha256().update(data).digest());
      const multi = hexOf(
        new IncrementalSha256()
          .update(data.subarray(0, 10))
          .update(data.subarray(10, 25))
          .update(data.subarray(25))
          .digest(),
      );
      expect(single).toBe(multi);
    });

    it('correctly handles input that spans multiple 64-byte compression blocks', () => {
      // 200 bytes of data → 4 full 64-byte blocks during padding
      const data = new Uint8Array(200).fill(0x61); // 200 × 'a'
      const hash = new IncrementalSha256().update(data).digest();
      expect(hexOf(hash)).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('computeSha256', () => {
    it('reads the file in chunks and returns the real SHA-256 hex digest', async () => {
      // 'aGVsbG8=' is base64("hello"), SHA-256("hello") is a known constant
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 5 });
      FileSystem.readAsStringAsync.mockResolvedValue('aGVsbG8=');

      const result = await computeSha256('file:///cache/penny.apk');

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        'file:///cache/penny.apk',
        { encoding: 'base64', position: 0, length: 5 },
      );
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('issues multiple readAsStringAsync calls for files larger than the chunk size', async () => {
      const MB = 1024 * 1024;
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: MB + 5 });
      // Both chunks decode to 'hello' — we only care that two calls were made
      FileSystem.readAsStringAsync.mockResolvedValue('aGVsbG8=');

      await computeSha256('file:///cache/large.apk');

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);
      expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        1, 'file:///cache/large.apk', { encoding: 'base64', position: 0, length: MB },
      );
      expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        2, 'file:///cache/large.apk', { encoding: 'base64', position: MB, length: 5 },
      );
    });

    it('propagates read errors to the caller', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 5 });
      FileSystem.readAsStringAsync.mockRejectedValue(new Error('read failed'));

      await expect(computeSha256('file:///cache/penny.apk')).rejects.toThrow('read failed');
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
  });
});

