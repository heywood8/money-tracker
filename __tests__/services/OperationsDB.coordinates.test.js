/**
 * Tests for getOperationCoordinates — the heatmap's coordinate query in
 * OperationsDB. The SQLite layer is mocked; the tests pin the SQL contract
 * (location present, chart-visibility predicate, optional date bounds) and the
 * JS-side sanitation of cast coordinates.
 */

import { getOperationCoordinates } from '../../app/services/OperationsDB';
import { queryAll } from '../../app/services/db';

jest.mock('../../app/services/db');
jest.mock('../../app/services/currency');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/defaults/defaultOperations');

describe('OperationsDB.getOperationCoordinates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryAll.mockResolvedValue([]);
  });

  it('selects only located, chart-visible operations', async () => {
    await getOperationCoordinates();
    const [sql, params] = queryAll.mock.calls[0];
    expect(sql).toContain('latitude IS NOT NULL');
    expect(sql).toContain('longitude IS NOT NULL');
    // Operations hidden from the charts must not surface as heatmap blobs.
    expect(sql).toContain('exclude_from_charts');
    expect(sql).not.toContain('date >=');
    expect(params).toEqual([]);
  });

  it('bounds the query by dates when a period is given', async () => {
    await getOperationCoordinates('2026-07-01', '2026-07-31');
    const [sql, params] = queryAll.mock.calls[0];
    expect(sql).toContain('date >= ?');
    expect(sql).toContain('date <= ?');
    expect(params).toEqual(['2026-07-01', '2026-07-31']);
  });

  it('returns numeric coordinate pairs', async () => {
    queryAll.mockResolvedValue([
      { latitude: 40.1772, longitude: 44.5035 },
      { latitude: 55.7558, longitude: 37.6173 },
    ]);
    const points = await getOperationCoordinates();
    expect(points).toEqual([
      { latitude: 40.1772, longitude: 44.5035 },
      { latitude: 55.7558, longitude: 37.6173 },
    ]);
  });

  it('drops rows whose cast coordinates are not finite or out of range', async () => {
    queryAll.mockResolvedValue([
      { latitude: 40.1772, longitude: 44.5035 },
      { latitude: null, longitude: 44.5 },      // CAST of corrupt text → null
      { latitude: NaN, longitude: 44.5 },
      { latitude: 91, longitude: 44.5 },        // impossible latitude
      { latitude: 40, longitude: 181 },         // impossible longitude
    ]);
    const points = await getOperationCoordinates();
    expect(points).toEqual([{ latitude: 40.1772, longitude: 44.5035 }]);
  });

  it('resolves to an empty list on a query failure', async () => {
    queryAll.mockRejectedValue(new Error('db down'));
    await expect(getOperationCoordinates()).resolves.toEqual([]);
  });
});
