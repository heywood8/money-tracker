import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

/**
 * On-disk cache for OpenStreetMap raster tiles used by the operations heatmap.
 *
 * Tiles live in cacheDirectory/map-tiles/{z}_{x}_{y}.png with a 30-day TTL
 * measured from the file's modification time. A fresh file is served as-is; an
 * expired one is re-downloaded, and if the refresh fails (offline, server
 * error) the stale copy is served instead — an old map beats no map. Downloads
 * go through a .tmp file and are moved into place only on HTTP 200, so a
 * failed refresh can never corrupt the stale tile it would have replaced.
 *
 * The OSM tile usage policy requires a meaningful User-Agent, hence the
 * explicit header on every download.
 */

export const TILE_CACHE_DIR = `${FileSystem.cacheDirectory}map-tiles/`;
export const TILE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Disk bound: tiles older than twice the TTL are pruned outright. Anything
// younger is kept so the stale-fallback path has something to serve offline.
export const TILE_PRUNE_AGE_MS = 2 * TILE_TTL_MS;

const OSM_TILE_HOST = 'https://tile.openstreetmap.org';

const appVersion = Constants?.expoConfig?.version ?? 'dev';
export const TILE_USER_AGENT =
  `Penny/${appVersion} (https://github.com/heywood8/money-tracker)`;

export const tileUrl = (z, x, y) => `${OSM_TILE_HOST}/${z}/${x}/${y}.png`;

export const tilePath = (z, x, y) => `${TILE_CACHE_DIR}${z}_${x}_${y}.png`;

// De-duplicates concurrent requests for the same tile — a pan can ask for a
// tile again before its first download resolves.
const inFlight = new Map();

// URIs that already resolved this session, readable SYNCHRONOUSLY. A tile
// component initializing from here paints on its very first frame — without
// this, crossing a zoom level remounts every tile empty for the async round
// trip to disk and the map flashes bare background.
const resolvedUris = new Map();

const rememberResolved = (z, x, y, uri) => {
  resolvedUris.set(`${z}/${x}/${y}`, uri);
  return uri;
};

/**
 * Synchronous lookup of a tile URI that some earlier getTileUri call already
 * resolved. Returns null for tiles not yet seen this session — the caller
 * then falls back to the async path.
 */
export const getResolvedTileUri = (z, x, y) =>
  resolvedUris.get(`${z}/${x}/${y}`) ?? null;

const downloadTile = async (z, x, y, path) => {
  await FileSystem.makeDirectoryAsync(TILE_CACHE_DIR, { intermediates: true });
  const tmpPath = `${path}.tmp`;
  try {
    const result = await FileSystem.downloadAsync(tileUrl(z, x, y), tmpPath, {
      headers: { 'User-Agent': TILE_USER_AGENT },
    });
    if (result.status !== 200) {
      throw new Error(`Tile download failed: HTTP ${result.status}`);
    }
    await FileSystem.moveAsync({ from: tmpPath, to: path });
    return path;
  } catch (error) {
    await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
    throw error;
  }
};

/**
 * Local URI for a tile, downloading or refreshing it as needed.
 * Resolution order: fresh cache hit → downloaded copy → stale cache hit.
 * @returns {Promise<string|null>} file:// URI, or null when the tile is
 *   unavailable (no cache and the download failed).
 */
export const getTileUri = async (z, x, y) => {
  const path = tilePath(z, x, y);
  let cached = null;
  try {
    cached = await FileSystem.getInfoAsync(path);
    if (cached.exists) {
      const ageMs = Date.now() - cached.modificationTime * 1000;
      if (ageMs < TILE_TTL_MS) return rememberResolved(z, x, y, path);
    }
  } catch {
    cached = null;
  }

  if (!inFlight.has(path)) {
    const promise = downloadTile(z, x, y, path).finally(() => {
      inFlight.delete(path);
    });
    inFlight.set(path, promise);
    // The shared promise must not reject unhandled when several callers await
    // it — each caller handles the failure below.
    promise.catch(() => {});
  }

  try {
    return rememberResolved(z, x, y, await inFlight.get(path));
  } catch {
    // Refresh failed — fall back to the expired copy when there is one.
    return cached?.exists ? rememberResolved(z, x, y, path) : null;
  }
};

// Prefetch runs at most this many downloads at once — a background warm-up
// must not saturate the connection the visible tiles are loading on, nor
// hammer the OSM server.
const PREFETCH_CONCURRENCY = 4;

/**
 * Fire-and-forget warm-up of tiles the user is likely to need next (e.g. the
 * adjacent zoom levels of the current viewport). Each tile goes through
 * getTileUri, so the disk cache, TTL, in-flight dedup and the synchronous
 * session map all apply — tiles already cached cost no network at all.
 * Failures are swallowed per tile: a prefetch must never surface an error.
 *
 * @param {Array<{z: number, x: number, y: number}>} tiles
 * @returns {Promise<void>} resolves when the whole batch settled
 */
export const prefetchTiles = async (tiles) => {
  const queue = [...(tiles || [])];
  if (queue.length === 0) return;
  const worker = async () => {
    while (queue.length > 0) {
      const tile = queue.shift();
      try {
        await getTileUri(tile.z, tile.x, tile.y);
      } catch {
        // Ignore — getTileUri already degrades to null, this is belt-and-braces.
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, worker),
  );
};

/**
 * Delete tiles older than TILE_PRUNE_AGE_MS. Fire-and-forget housekeeping —
 * callers do not await the per-file deletes' outcome and errors are swallowed:
 * a failed prune only costs disk space.
 */
export const pruneTileCache = async () => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(TILE_CACHE_DIR);
    if (!dirInfo.exists) return;
    const files = await FileSystem.readDirectoryAsync(TILE_CACHE_DIR);
    const now = Date.now();
    for (const name of files) {
      const filePath = `${TILE_CACHE_DIR}${name}`;
      try {
        const info = await FileSystem.getInfoAsync(filePath);
        if (!info.exists) continue;
        const ageMs = now - info.modificationTime * 1000;
        // Old .tmp files are leftovers from interrupted downloads; an age
        // floor keeps the scan from racing a download that is writing now.
        const isStaleTmp = name.endsWith('.tmp') && ageMs > 60 * 60 * 1000;
        if (ageMs > TILE_PRUNE_AGE_MS || isStaleTmp) {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
      } catch {
        // Skip files that vanish mid-scan.
      }
    }
  } catch {
    // Cache pruning must never surface an error.
  }
};
