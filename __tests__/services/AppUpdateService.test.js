import {
  parseVersionFromRelease,
  compareVersions,
  extractApkAsset,
  checkForAppUpdate,
} from '../../app/services/AppUpdateService';

describe('AppUpdateService', () => {
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

  describe('checkForAppUpdate', () => {
    it('reports update availability when latest release is newer', async () => {
      const fetchImpl = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v0.50.4',
          assets: [{ name: 'penny-v0.50.4.apk', browser_download_url: 'https://example.com/penny-v0.50.4.apk' }],
          html_url: 'https://github.com/heywood8/money-tracker/releases/tag/v0.50.4',
          published_at: '2026-03-21T08:00:00Z',
        }),
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
        json: async () => ({
          tag_name: 'v0.50.3',
          assets: [{ name: 'penny-v0.50.3.apk', browser_download_url: 'https://example.com/penny-v0.50.3.apk' }],
        }),
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
  });
});

