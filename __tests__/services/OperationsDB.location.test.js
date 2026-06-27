/**
 * Tests for getLabelsNearLocation — location-based "proximity recall" label
 * suggestions in OperationsDB (issue #1091).
 *
 * The SQLite layer is mocked: queryAll's implementation simulates the
 * bounding-box SELECT (filter seeded operations by the lat/lng bounds the
 * function passes, drop null-coordinate / empty-description rows, group by
 * description with a count). This validates both the delta math (far-away ops
 * land outside the computed box) and the JS aggregation (frequency ranking,
 * hidden-label exclusion, null tolerance).
 */

import { getLabelsNearLocation } from '../../app/services/OperationsDB';
import { queryAll } from '../../app/services/db';

jest.mock('../../app/services/db');
jest.mock('../../app/services/currency');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/defaults/defaultOperations');

// A point near (40.0, 44.0). ~150 m is roughly 0.00135° latitude.
const HERE = { lat: 40.0, lng: 44.0 };

// Simulate the bounding-box SELECT against a seeded operations array.
const seedOperations = (ops) => {
  queryAll.mockImplementation(async (_sql, params) => {
    const [minLat, maxLat, minLng, maxLng] = params;
    const inBox = ops.filter((op) =>
      op.latitude != null &&
      op.longitude != null &&
      parseFloat(op.latitude) >= minLat &&
      parseFloat(op.latitude) <= maxLat &&
      parseFloat(op.longitude) >= minLng &&
      parseFloat(op.longitude) <= maxLng &&
      op.description != null &&
      op.description !== '');
    const groups = new Map();
    for (const op of inBox) {
      groups.set(op.description, (groups.get(op.description) || 0) + 1);
    }
    return Array.from(groups.entries())
      .map(([description, cnt]) => ({ description, cnt }))
      .sort((a, b) => b.cnt - a.cnt);
  });
};

describe('OperationsDB.getLabelsNearLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryAll.mockResolvedValue([]);
  });

  it('returns labels used nearby ranked by frequency', async () => {
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: 'Coffee' },
      { latitude: '40.0002', longitude: '44.0002', description: 'Coffee' },
      { latitude: '40.0000', longitude: '44.0000', description: 'Starbucks' },
    ]);

    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    // Coffee (2) ranks ahead of Starbucks (1).
    expect(labels).toEqual(['Coffee', 'Starbucks']);
  });

  it('excludes operations outside the bounding box', async () => {
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: 'Coffee' },
      // ~5 km away — well outside a 150 m box.
      { latitude: '40.05', longitude: '44.05', description: 'FarAway' },
    ]);

    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    expect(labels).toContain('Coffee');
    expect(labels).not.toContain('FarAway');
  });

  it('aggregates labels parsed from multi-label descriptions', async () => {
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: 'Coffee | Starbucks' },
      { latitude: '40.0002', longitude: '44.0002', description: 'Coffee | Tea' },
    ]);

    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    // Coffee appears in both (2); Starbucks and Tea once each.
    expect(labels[0]).toBe('Coffee');
    expect(labels).toEqual(expect.arrayContaining(['Coffee', 'Starbucks', 'Tea']));
  });

  it('excludes hidden / system labels and the [MoneyOK] marker', async () => {
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: '[MoneyOK] | Account: Cash | Category: Food | groceries' },
    ]);

    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    expect(labels).toEqual(['groceries']);
  });

  it('tolerates rows with null coordinates (skipped, never poison the result)', async () => {
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: 'Coffee' },
      { latitude: null, longitude: null, description: 'NoLocation' },
    ]);

    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    expect(labels).toEqual(['Coffee']);
  });

  it('returns partial-coverage suggestions with no minimum-sample threshold', async () => {
    // A single nearby geo-tagged op still produces a suggestion (R2.1).
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: 'Lonely' },
    ]);

    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    expect(labels).toEqual(['Lonely']);
  });

  it('returns [] for an empty box (cold start) without throwing', async () => {
    seedOperations([]);
    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng);
    expect(labels).toEqual([]);
  });

  it('respects the limit option', async () => {
    seedOperations([
      { latitude: '40.0001', longitude: '44.0001', description: 'a | b | c | d | e' },
    ]);
    const labels = await getLabelsNearLocation(HERE.lat, HERE.lng, { limit: 3 });
    expect(labels).toHaveLength(3);
  });

  it('returns [] for invalid coordinates without querying', async () => {
    const labels = await getLabelsNearLocation('not-a-number', 'nope');
    expect(labels).toEqual([]);
    expect(queryAll).not.toHaveBeenCalled();
  });

  it('never throws — a DB failure resolves to []', async () => {
    queryAll.mockRejectedValue(new Error('db exploded'));
    await expect(getLabelsNearLocation(HERE.lat, HERE.lng)).resolves.toEqual([]);
  });

  it('passes a bounding box centred on the requested point', async () => {
    seedOperations([]);
    await getLabelsNearLocation(HERE.lat, HERE.lng, { radiusMeters: 150 });

    expect(queryAll).toHaveBeenCalledTimes(1);
    const params = queryAll.mock.calls[0][1];
    const [minLat, maxLat, minLng, maxLng] = params;
    // Box brackets the point.
    expect(minLat).toBeLessThan(HERE.lat);
    expect(maxLat).toBeGreaterThan(HERE.lat);
    expect(minLng).toBeLessThan(HERE.lng);
    expect(maxLng).toBeGreaterThan(HERE.lng);
    // Latitude delta ≈ 150/111320 ≈ 0.00135°.
    expect((maxLat - minLat) / 2).toBeCloseTo(150 / 111320, 5);
  });
});
