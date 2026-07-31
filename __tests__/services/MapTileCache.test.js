/**
 * Tests for the OSM tile cache (app/services/MapTileCache.js): the 30-day TTL,
 * download-through-tmp atomicity, stale-fallback on failed refresh, in-flight
 * de-duplication and cache pruning.
 */

import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));

import {
  getTileUri,
  pruneTileCache,
  tileUrl,
  tilePath,
  TILE_CACHE_DIR,
  TILE_TTL_MS,
  TILE_PRUNE_AGE_MS,
  TILE_USER_AGENT,
} from '../../app/services/MapTileCache';

const NOW = 1700000000000;

// getInfoAsync reports modificationTime in SECONDS since epoch.
const fileInfo = (ageMs) => ({
  exists: true,
  isDirectory: false,
  modificationTime: (NOW - ageMs) / 1000,
  size: 1024,
  uri: 'file:///cache/whatever.png',
});

const MISSING = { exists: false, isDirectory: false };

describe('MapTileCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    FileSystem.getInfoAsync.mockResolvedValue(MISSING);
    FileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
    FileSystem.downloadAsync.mockResolvedValue({ status: 200 });
    FileSystem.moveAsync.mockResolvedValue(undefined);
    FileSystem.deleteAsync.mockResolvedValue(undefined);
    FileSystem.readDirectoryAsync.mockResolvedValue([]);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe('URL and path building', () => {
    it('builds the OSM tile URL', () => {
      expect(tileUrl(12, 2437, 1546)).toBe('https://tile.openstreetmap.org/12/2437/1546.png');
    });

    it('stores tiles under the cache directory keyed by z/x/y', () => {
      expect(tilePath(12, 2437, 1546)).toBe(`${TILE_CACHE_DIR}12_2437_1546.png`);
      expect(TILE_CACHE_DIR).toBe('file:///cache/map-tiles/');
    });

    it('exposes a 30-day TTL', () => {
      expect(TILE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe('getTileUri', () => {
    it('serves a fresh cached tile without downloading', async () => {
      FileSystem.getInfoAsync.mockResolvedValue(fileInfo(TILE_TTL_MS - 60_000));
      const uri = await getTileUri(10, 1, 2);
      expect(uri).toBe(tilePath(10, 1, 2));
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    });

    it('downloads a missing tile through a tmp file with the OSM User-Agent', async () => {
      const path = tilePath(10, 3, 4);
      const uri = await getTileUri(10, 3, 4);
      expect(uri).toBe(path);
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        tileUrl(10, 3, 4),
        `${path}.tmp`,
        { headers: { 'User-Agent': TILE_USER_AGENT } },
      );
      expect(FileSystem.moveAsync).toHaveBeenCalledWith({ from: `${path}.tmp`, to: path });
    });

    it('re-downloads an expired tile', async () => {
      FileSystem.getInfoAsync.mockResolvedValue(fileInfo(TILE_TTL_MS + 60_000));
      const uri = await getTileUri(10, 5, 6);
      expect(uri).toBe(tilePath(10, 5, 6));
      expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(1);
    });

    it('falls back to the stale copy when the refresh fails', async () => {
      FileSystem.getInfoAsync.mockResolvedValue(fileInfo(TILE_TTL_MS + 60_000));
      FileSystem.downloadAsync.mockRejectedValue(new Error('offline'));
      const uri = await getTileUri(10, 7, 8);
      expect(uri).toBe(tilePath(10, 7, 8));
      // The stale file itself must not be deleted — only the tmp leftover.
      expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
        tilePath(10, 7, 8), expect.anything());
    });

    it('returns null when there is no cache and the download fails', async () => {
      FileSystem.downloadAsync.mockRejectedValue(new Error('offline'));
      const uri = await getTileUri(10, 9, 10);
      expect(uri).toBeNull();
    });

    it('treats a non-200 response as a failure and removes the tmp file', async () => {
      FileSystem.downloadAsync.mockResolvedValue({ status: 404 });
      const uri = await getTileUri(10, 11, 12);
      expect(uri).toBeNull();
      expect(FileSystem.moveAsync).not.toHaveBeenCalled();
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        `${tilePath(10, 11, 12)}.tmp`, { idempotent: true });
    });

    it('de-duplicates concurrent requests for the same tile', async () => {
      let resolveDownload;
      FileSystem.downloadAsync.mockImplementation(
        () => new Promise((resolve) => { resolveDownload = resolve; }));
      const first = getTileUri(10, 13, 14);
      const second = getTileUri(10, 13, 14);
      // Let both calls reach the download stage before resolving it.
      await new Promise((r) => setTimeout(r, 0));
      resolveDownload({ status: 200 });
      const [a, b] = await Promise.all([first, second]);
      expect(a).toBe(tilePath(10, 13, 14));
      expect(b).toBe(tilePath(10, 13, 14));
      expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('pruneTileCache', () => {
    it('does nothing when the cache directory does not exist', async () => {
      FileSystem.getInfoAsync.mockResolvedValue(MISSING);
      await pruneTileCache();
      expect(FileSystem.readDirectoryAsync).not.toHaveBeenCalled();
    });

    it('deletes tiles older than the prune age and keeps younger ones', async () => {
      FileSystem.getInfoAsync.mockImplementation(async (path) => {
        if (path === TILE_CACHE_DIR) return { exists: true, isDirectory: true };
        if (path.includes('old')) return fileInfo(TILE_PRUNE_AGE_MS + 60_000);
        return fileInfo(TILE_TTL_MS + 60_000); // expired but within prune age
      });
      FileSystem.readDirectoryAsync.mockResolvedValue(['old_1_1.png', 'young_2_2.png']);
      await pruneTileCache();
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        `${TILE_CACHE_DIR}old_1_1.png`, { idempotent: true });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
        `${TILE_CACHE_DIR}young_2_2.png`, expect.anything());
    });

    it('deletes stale tmp leftovers but not a tmp being written right now', async () => {
      FileSystem.getInfoAsync.mockImplementation(async (path) => {
        if (path === TILE_CACHE_DIR) return { exists: true, isDirectory: true };
        if (path.includes('stale')) return fileInfo(2 * 60 * 60 * 1000); // 2h old
        return fileInfo(10_000); // written seconds ago
      });
      FileSystem.readDirectoryAsync.mockResolvedValue(['stale_1_1.png.tmp', 'live_2_2.png.tmp']);
      await pruneTileCache();
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        `${TILE_CACHE_DIR}stale_1_1.png.tmp`, { idempotent: true });
      expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
        `${TILE_CACHE_DIR}live_2_2.png.tmp`, expect.anything());
    });

    it('swallows filesystem errors', async () => {
      FileSystem.getInfoAsync.mockRejectedValue(new Error('io'));
      await expect(pruneTileCache()).resolves.toBeUndefined();
    });
  });
});
