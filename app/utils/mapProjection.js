/**
 * Web Mercator ("slippy map") projection math for the operations heatmap.
 *
 * Pure functions only — no React, no I/O — so the whole coordinate pipeline
 * (lat/lng → world px → screen px → tile grid) is unit-testable. The world is
 * TILE_SIZE·2^zoom pixels wide; a "region" is {latitude, longitude, zoom} with
 * a continuous (fractional) zoom, rendered by scaling the nearest integer tile
 * level.
 */

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

// Web Mercator singularity guard — the standard slippy-map latitude clamp.
const MAX_LATITUDE = 85.05112878;

export const clampLatitude = (lat) =>
  Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));

export const clampZoom = (zoom) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

const worldSize = (zoom) => TILE_SIZE * Math.pow(2, zoom);

/** Longitude → world X in pixels at the given (fractional) zoom. */
export const lonToWorldX = (lon, zoom) =>
  ((lon + 180) / 360) * worldSize(zoom);

/** Latitude → world Y in pixels at the given (fractional) zoom. */
export const latToWorldY = (lat, zoom) => {
  const clamped = clampLatitude(lat);
  const sin = Math.sin((clamped * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return y * worldSize(zoom);
};

export const worldXToLon = (x, zoom) =>
  (x / worldSize(zoom)) * 360 - 180;

export const worldYToLat = (y, zoom) => {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/**
 * Project a lat/lng point to screen coordinates for a viewport of
 * width×height centered on `region`.
 * @returns {{x: number, y: number}}
 */
export const pointToScreen = (lat, lon, region, width, height) => {
  const zoom = region.zoom;
  const dx = lonToWorldX(lon, zoom) - lonToWorldX(region.longitude, zoom);
  const dy = latToWorldY(lat, zoom) - latToWorldY(region.latitude, zoom);
  return { x: width / 2 + dx, y: height / 2 + dy };
};

/**
 * Shift a region by a screen-pixel delta (pan gesture). Positive dx drags the
 * map content right, i.e. the center moves west — the usual map-pan feel.
 */
export const translateRegion = (region, dxPx, dyPx) => {
  const zoom = region.zoom;
  const cx = lonToWorldX(region.longitude, zoom) - dxPx;
  const cy = latToWorldY(region.latitude, zoom) - dyPx;
  const size = worldSize(zoom);
  // Wrap longitude around the antimeridian; clamp latitude to the projection.
  const wrappedX = ((cx % size) + size) % size;
  const clampedY = Math.max(0, Math.min(size, cy));
  return {
    latitude: worldYToLat(clampedY, zoom),
    longitude: worldXToLon(wrappedX, zoom),
    zoom,
  };
};

/**
 * Zoom a region by `factor` keeping the screen point (focalX, focalY) fixed —
 * the pinch-to-zoom anchor. The focal point stays over the same coordinate.
 */
export const scaleRegion = (region, factor, focalX, focalY, width, height) => {
  const newZoom = clampZoom(region.zoom + Math.log2(factor));
  const applied = Math.pow(2, newZoom - region.zoom);
  if (applied === 1) return { ...region, zoom: newZoom };
  // World coords (at the OLD zoom) of the focal point, then re-center so that
  // after scaling the same world point still sits under the finger.
  const fx = lonToWorldX(region.longitude, region.zoom) + (focalX - width / 2);
  const fy = latToWorldY(region.latitude, region.zoom) + (focalY - height / 2);
  const newCx = fx * applied - (focalX - width / 2);
  const newCy = fy * applied - (focalY - height / 2);
  return {
    latitude: worldYToLat(newCy, newZoom),
    longitude: worldXToLon(newCx, newZoom),
    zoom: newZoom,
  };
};

/**
 * Region that fits every point in a width×height viewport with `padding`
 * screen pixels kept clear on each side.
 *
 * @param {Array<{latitude: number, longitude: number}>} points
 * @returns {{latitude: number, longitude: number, zoom: number}|null}
 *   null for an empty list; a single point gets SINGLE_POINT_ZOOM.
 */
export const SINGLE_POINT_ZOOM = 15;

export const fitBounds = (points, width, height, padding = 48) => {
  if (!points || points.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
  }

  const centerLat = worldYToLat(
    (latToWorldY(minLat, 0) + latToWorldY(maxLat, 0)) / 2, 0);
  const centerLon = (minLon + maxLon) / 2;

  // Span of the bounding box in world pixels at zoom 0.
  const spanX = lonToWorldX(maxLon, 0) - lonToWorldX(minLon, 0);
  const spanY = latToWorldY(minLat, 0) - latToWorldY(maxLat, 0);
  const availW = Math.max(width - 2 * padding, 32);
  const availH = Math.max(height - 2 * padding, 32);

  let zoom;
  if (spanX <= 0 && spanY <= 0) {
    zoom = SINGLE_POINT_ZOOM;
  } else {
    const zx = spanX > 0 ? Math.log2(availW / spanX) : Infinity;
    const zy = spanY > 0 ? Math.log2(availH / spanY) : Infinity;
    zoom = Math.min(zx, zy, SINGLE_POINT_ZOOM);
  }

  return { latitude: centerLat, longitude: centerLon, zoom: clampZoom(zoom) };
};

/**
 * The tile grid covering a width×height viewport centered on `region`.
 *
 * Tiles come from the integer zoom nearest the region's fractional zoom and
 * are drawn scaled by 2^(zoom − tileZoom), so `size` is the on-screen edge
 * length. X wraps around the antimeridian (the fetch coordinate is `x`,
 * already wrapped); Y outside the world is skipped.
 *
 * @returns {Array<{key: string, z: number, x: number, y: number,
 *                  screenX: number, screenY: number, size: number}>}
 */
export const visibleTiles = (region, width, height) => {
  if (!width || !height) return [];
  const tileZoom = Math.round(clampZoom(region.zoom));
  const scale = Math.pow(2, region.zoom - tileZoom);
  const scaledTile = TILE_SIZE * scale;
  const tileCount = Math.pow(2, tileZoom);

  // Center in world pixels at the tile zoom, then the range of tile indices
  // whose scaled footprint intersects the viewport.
  const cx = lonToWorldX(region.longitude, tileZoom);
  const cy = latToWorldY(region.latitude, tileZoom);
  const halfW = width / 2 / scale;
  const halfH = height / 2 / scale;

  const minX = Math.floor((cx - halfW) / TILE_SIZE);
  const maxX = Math.floor((cx + halfW) / TILE_SIZE);
  const minY = Math.floor((cy - halfH) / TILE_SIZE);
  const maxY = Math.floor((cy + halfH) / TILE_SIZE);

  const tiles = [];
  for (let ty = minY; ty <= maxY; ty++) {
    if (ty < 0 || ty >= tileCount) continue;
    for (let tx = minX; tx <= maxX; tx++) {
      const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${tileZoom}/${tx}/${ty}`,
        z: tileZoom,
        x: wrappedX,
        y: ty,
        screenX: width / 2 + (tx * TILE_SIZE - cx) * scale,
        screenY: height / 2 + (ty * TILE_SIZE - cy) * scale,
        size: scaledTile,
      });
    }
  }
  return tiles;
};
