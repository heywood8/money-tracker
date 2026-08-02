/**
 * Tests for the Web Mercator math behind the operations heatmap
 * (app/utils/mapProjection.js): projection round-trips, screen mapping,
 * pan/zoom region transforms, bounds fitting and the visible-tile grid.
 */

import {
  TILE_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  SINGLE_POINT_ZOOM,
  clampLatitude,
  clampZoom,
  lonToWorldX,
  latToWorldY,
  worldXToLon,
  worldYToLat,
  pointToScreen,
  translateRegion,
  scaleRegion,
  fitBounds,
  visibleTiles,
} from '../../app/utils/mapProjection';

describe('mapProjection', () => {
  describe('projection primitives', () => {
    it('maps the projection anchor points at zoom 0', () => {
      expect(lonToWorldX(-180, 0)).toBeCloseTo(0);
      expect(lonToWorldX(0, 0)).toBeCloseTo(TILE_SIZE / 2);
      expect(lonToWorldX(180, 0)).toBeCloseTo(TILE_SIZE);
      expect(latToWorldY(0, 0)).toBeCloseTo(TILE_SIZE / 2);
      // Top edge of the Mercator square is the max latitude.
      expect(latToWorldY(85.05112878, 0)).toBeCloseTo(0, 5);
      expect(latToWorldY(-85.05112878, 0)).toBeCloseTo(TILE_SIZE, 5);
    });

    it('doubles world coordinates per zoom level', () => {
      expect(lonToWorldX(37.62, 10)).toBeCloseTo(lonToWorldX(37.62, 9) * 2);
      expect(latToWorldY(55.75, 10)).toBeCloseTo(latToWorldY(55.75, 9) * 2);
    });

    it('round-trips lat/lng through world coordinates', () => {
      const lat = 40.1772;
      const lon = 44.5035; // Yerevan
      expect(worldXToLon(lonToWorldX(lon, 12), 12)).toBeCloseTo(lon, 6);
      expect(worldYToLat(latToWorldY(lat, 12), 12)).toBeCloseTo(lat, 6);
    });

    it('clamps latitude to the Mercator singularity bound', () => {
      expect(clampLatitude(90)).toBeCloseTo(85.05112878);
      expect(clampLatitude(-90)).toBeCloseTo(-85.05112878);
      expect(clampLatitude(50)).toBe(50);
    });

    it('clamps zoom to the supported range', () => {
      expect(clampZoom(0)).toBe(MIN_ZOOM);
      expect(clampZoom(25)).toBe(MAX_ZOOM);
      expect(clampZoom(9.5)).toBe(9.5);
    });
  });

  describe('pointToScreen', () => {
    const region = { latitude: 40, longitude: 44, zoom: 12 };

    it('puts the region center at the viewport center', () => {
      const p = pointToScreen(40, 44, region, 400, 800);
      expect(p.x).toBeCloseTo(200);
      expect(p.y).toBeCloseTo(400);
    });

    it('moves east points right and north points up', () => {
      const east = pointToScreen(40, 44.1, region, 400, 800);
      const north = pointToScreen(40.1, 44, region, 400, 800);
      expect(east.x).toBeGreaterThan(200);
      expect(east.y).toBeCloseTo(400);
      expect(north.y).toBeLessThan(400);
      expect(north.x).toBeCloseTo(200);
    });
  });

  describe('translateRegion', () => {
    it('dragging content right moves the center west', () => {
      const region = { latitude: 40, longitude: 44, zoom: 10 };
      const next = translateRegion(region, 50, 0);
      expect(next.longitude).toBeLessThan(44);
      expect(next.latitude).toBeCloseTo(40, 6);
      expect(next.zoom).toBe(10);
    });

    it('keeps the dragged point under the finger', () => {
      const region = { latitude: 40, longitude: 44, zoom: 10 };
      const next = translateRegion(region, 37, -21);
      // The world point previously at screen center must now sit 37px right,
      // 21px up in the new region's screen space.
      const p = pointToScreen(40, 44, next, 400, 800);
      expect(p.x).toBeCloseTo(200 + 37, 4);
      expect(p.y).toBeCloseTo(400 - 21, 4);
    });

    it('wraps longitude across the antimeridian', () => {
      const region = { latitude: 0, longitude: 179.9, zoom: 8 };
      const next = translateRegion(region, -500, 0);
      expect(next.longitude).toBeLessThan(0); // wrapped to the -180 side
      expect(Math.abs(next.longitude)).toBeLessThanOrEqual(180);
    });
  });

  describe('scaleRegion', () => {
    it('raises zoom by log2 of the factor', () => {
      const region = { latitude: 40, longitude: 44, zoom: 10 };
      const next = scaleRegion(region, 2, 200, 400, 400, 800);
      expect(next.zoom).toBeCloseTo(11);
    });

    it('keeps the focal point stationary on screen', () => {
      const region = { latitude: 40, longitude: 44, zoom: 10 };
      const focal = { x: 300, y: 200 };
      // Which lat/lng is under the focal point before the pinch?
      const before = { latitude: 40, longitude: 44, zoom: 10 };
      const dLon = worldXToLon(lonToWorldX(44, 10) + (focal.x - 200), 10);
      const dLat = worldYToLat(latToWorldY(40, 10) + (focal.y - 400), 10);
      const next = scaleRegion(before, 1.7, focal.x, focal.y, 400, 800);
      const after = pointToScreen(dLat, dLon, next, 400, 800);
      expect(after.x).toBeCloseTo(focal.x, 3);
      expect(after.y).toBeCloseTo(focal.y, 3);
    });

    it('does not zoom past MAX_ZOOM', () => {
      const region = { latitude: 40, longitude: 44, zoom: MAX_ZOOM };
      const next = scaleRegion(region, 4, 200, 400, 400, 800);
      expect(next.zoom).toBe(MAX_ZOOM);
      expect(next.latitude).toBeCloseTo(40, 6);
      expect(next.longitude).toBeCloseTo(44, 6);
    });

    it('keeps longitude in range when zooming near the antimeridian', () => {
      const region = { latitude: 0, longitude: 179.99, zoom: 4 };
      // Zoom anchored far right of center pushes the center eastward across
      // the antimeridian — the result must wrap, not walk out of range.
      const next = scaleRegion(region, 2, 390, 400, 400, 800);
      expect(next.longitude).toBeGreaterThanOrEqual(-180);
      expect(next.longitude).toBeLessThanOrEqual(180);
    });
  });

  describe('fitBounds', () => {
    it('returns null for an empty list', () => {
      expect(fitBounds([], 400, 800)).toBeNull();
      expect(fitBounds(null, 400, 800)).toBeNull();
    });

    it('centers on a single point with SINGLE_POINT_ZOOM', () => {
      const region = fitBounds([{ latitude: 40, longitude: 44 }], 400, 800);
      expect(region.latitude).toBeCloseTo(40, 4);
      expect(region.longitude).toBeCloseTo(44, 4);
      expect(region.zoom).toBe(SINGLE_POINT_ZOOM);
    });

    it('fits all points inside the padded viewport', () => {
      const points = [
        { latitude: 40.15, longitude: 44.45 },
        { latitude: 40.20, longitude: 44.55 },
        { latitude: 40.10, longitude: 44.50 },
      ];
      const region = fitBounds(points, 400, 800, 48);
      for (const p of points) {
        const s = pointToScreen(p.latitude, p.longitude, region, 400, 800);
        expect(s.x).toBeGreaterThanOrEqual(48 - 1);
        expect(s.x).toBeLessThanOrEqual(400 - 48 + 1);
        expect(s.y).toBeGreaterThanOrEqual(48 - 1);
        expect(s.y).toBeLessThanOrEqual(800 - 48 + 1);
      }
    });

    it('never zooms a tight cluster past SINGLE_POINT_ZOOM', () => {
      const region = fitBounds(
        [
          { latitude: 40.0000001, longitude: 44.0000001 },
          { latitude: 40.0000002, longitude: 44.0000002 },
        ],
        400, 800,
      );
      expect(region.zoom).toBeLessThanOrEqual(SINGLE_POINT_ZOOM);
    });
  });

  describe('visibleTiles', () => {
    it('returns nothing for an unmeasured viewport', () => {
      expect(visibleTiles({ latitude: 0, longitude: 0, zoom: 5 }, 0, 0)).toEqual([]);
    });

    it('covers the viewport with adjacent tiles', () => {
      const tiles = visibleTiles({ latitude: 40, longitude: 44, zoom: 12 }, 400, 800);
      expect(tiles.length).toBeGreaterThan(0);
      // Every tile is TILE_SIZE (integer zoom → scale 1) and the set covers
      // the whole viewport rectangle.
      const minX = Math.min(...tiles.map(tl => tl.screenX));
      const maxX = Math.max(...tiles.map(tl => tl.screenX + tl.size));
      const minY = Math.min(...tiles.map(tl => tl.screenY));
      const maxY = Math.max(...tiles.map(tl => tl.screenY + tl.size));
      expect(minX).toBeLessThanOrEqual(0);
      expect(maxX).toBeGreaterThanOrEqual(400);
      expect(minY).toBeLessThanOrEqual(0);
      expect(maxY).toBeGreaterThanOrEqual(800);
      expect(tiles[0].size).toBeCloseTo(TILE_SIZE);
      expect(tiles[0].z).toBe(12);
    });

    it('scales tiles for fractional zoom', () => {
      const tiles = visibleTiles({ latitude: 40, longitude: 44, zoom: 12.5 }, 400, 800);
      // Nearest integer level is 13 (round), drawn at 2^-0.5 scale.
      expect(tiles[0].z).toBe(13);
      expect(tiles[0].size).toBeCloseTo(TILE_SIZE * Math.pow(2, -0.5));
    });

    it('wraps x indices across the antimeridian and skips out-of-world y', () => {
      const tiles = visibleTiles({ latitude: 84, longitude: 180, zoom: 3 }, 800, 800);
      const count = Math.pow(2, 3);
      for (const tile of tiles) {
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.x).toBeLessThan(count);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeLessThan(count);
      }
    });

    it('keeps tile keys unique', () => {
      const tiles = visibleTiles({ latitude: 40, longitude: 44, zoom: 11 }, 1080, 2000);
      const keys = new Set(tiles.map(tl => tl.key));
      expect(keys.size).toBe(tiles.length);
    });

    it('honors a forced tile level and rescales accordingly', () => {
      // Region at zoom 13 rendered from level 12 tiles (the underlay case):
      // tiles come from z12 drawn at double size, covering the viewport.
      const region = { latitude: 40, longitude: 44, zoom: 13 };
      const tiles = visibleTiles(region, 400, 800, 12);
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.every(tl => tl.z === 12)).toBe(true);
      expect(tiles[0].size).toBeCloseTo(TILE_SIZE * 2);
      const minX = Math.min(...tiles.map(tl => tl.screenX));
      const maxX = Math.max(...tiles.map(tl => tl.screenX + tl.size));
      expect(minX).toBeLessThanOrEqual(0);
      expect(maxX).toBeGreaterThanOrEqual(400);
    });
  });
});
