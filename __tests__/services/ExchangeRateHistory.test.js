/**
 * Tests for the rate-history service behind the Graphs tab's exchange-rate
 * charts: range windows, request orientation, the on-disk cache and its
 * incremental top-up, offline fallback and the display helpers.
 */

import * as FileSystem from 'expo-file-system/legacy';
import {
  fetchRateHistory,
  clearRateHistoryCache,
  rangeStart,
  resolveRequestDirection,
  parseCacheEntry,
  summarizeRateSeries,
  rateDecimals,
  formatRateValue,
  formatRateChange,
  toIsoDate,
  HISTORY_REFRESH_MS,
  RATE_CACHE_DIR,
} from '../../app/services/ExchangeRateHistory';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

// The live table the direction is read from. A pair missing here answers like
// a failed lookup with no offline rate.
const mockLiveRates = {
  'USD|RUB': '81.55', 'RUB|USD': '0.01226', 'USD|AMD': '361', 'AMD|USD': '0.00277',
  'KRW|USD': '0.000755', 'USD|KRW': '1324.48',
};
jest.mock('../../app/services/currency', () => ({
  fetchLiveExchangeRate: jest.fn(async (from, to) => {
    const rate = mockLiveRates[`${from}|${to}`] ?? null;
    return { rate, source: rate ? 'live' : 'none' };
  }),
}));

const NOW = new Date(2026, 9, 23, 12, 0, 0); // 23 Oct 2026, local

const rowsResponse = (base, quote, entries) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(entries.map(([date, rate]) => ({ date, base, quote, rate }))),
});

const requestedUrl = (call) => new URL(global.fetch.mock.calls[call][0]);

// The file the service wrote last, parsed.
const lastWrite = () => {
  const calls = FileSystem.writeAsStringAsync.mock.calls;
  return JSON.parse(calls[calls.length - 1][1]);
};

describe('ExchangeRateHistory', () => {
  let disk;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    clearRateHistoryCache();
    global.fetch = jest.fn();
    disk = {};
    FileSystem.getInfoAsync.mockImplementation(async (path) => ({ exists: path in disk }));
    FileSystem.readAsStringAsync.mockImplementation(async (path) => disk[path]);
    FileSystem.writeAsStringAsync.mockImplementation(async (path, text) => { disk[path] = text; });
    FileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Date.now.mockRestore();
    delete global.fetch;
  });

  describe('rangeStart', () => {
    it('reaches a week back for the day and week ranges', () => {
      expect(rangeStart('day', NOW)).toBe('2026-10-16');
      expect(rangeStart('week', NOW)).toBe('2026-10-16');
    });

    it('steps whole months for month and year', () => {
      expect(rangeStart('month', NOW)).toBe('2026-09-23');
      expect(rangeStart('year', NOW)).toBe('2025-10-23');
    });

    it('holds the day inside a shorter month', () => {
      expect(rangeStart('month', new Date(2026, 2, 31))).toBe('2026-02-28');
      expect(rangeStart('year', new Date(2024, 1, 29))).toBe('2023-02-28');
    });

    it('starts all time at the oldest date the source has', () => {
      expect(rangeStart('all', NOW)).toBe('1948-01-01');
    });
  });

  describe('resolveRequestDirection', () => {
    it('asks a pair below 1 the other way round', async () => {
      await expect(resolveRequestDirection('AMD', 'USD')).resolves.toEqual({ base: 'USD', quote: 'AMD' });
      // Outside the bundled offline table too: the live table knows every currency.
      await expect(resolveRequestDirection('KRW', 'USD')).resolves.toEqual({ base: 'USD', quote: 'KRW' });
    });

    it('asks a pair above 1 as written', async () => {
      await expect(resolveRequestDirection('USD', 'RUB')).resolves.toEqual({ base: 'USD', quote: 'RUB' });
    });

    it('asks a pair no table knows as written', async () => {
      await expect(resolveRequestDirection('GEL', 'JPY')).resolves.toEqual({ base: 'GEL', quote: 'JPY' });
    });
  });

  describe('fetchRateHistory', () => {
    it('downloads the window once and saves it', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [
        ['2026-09-23', 84.1], ['2026-10-22', 81.81], ['2026-10-23', 81.55],
      ]));

      const result = await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      expect(result).toEqual({
        stale: false,
        points: [
          { date: '2026-09-23', rate: 84.1 },
          { date: '2026-10-22', rate: 81.81 },
          { date: '2026-10-23', rate: 81.55 },
        ],
      });
      const url = requestedUrl(0);
      expect(url.origin + url.pathname).toBe('https://api.frankfurter.dev/v2/rates');
      expect(url.searchParams.get('base')).toBe('USD');
      expect(url.searchParams.get('quotes')).toBe('RUB');
      expect(url.searchParams.get('from')).toBe('2026-09-23');
      // One file per pair, whichever way round it is read.
      expect(FileSystem.writeAsStringAsync.mock.calls[0][0]).toBe(`${RATE_CACHE_DIR}RUB_USD.json`);
    });

    it('inverts a pair it asked the other way round', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'AMD', [['2026-10-23', 361]]));

      const { points } = await fetchRateHistory('AMD', 'USD', 'week', { now: NOW });

      expect(points).toHaveLength(1);
      expect(points[0].rate).toBeCloseTo(1 / 361, 12);
      expect(requestedUrl(0).searchParams.get('base')).toBe('USD');
    });

    it('serves a fresh saved series without touching the network', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));
      await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      await fetchRateHistory('USD', 'RUB', 'week', { now: NOW });
      await fetchRateHistory('RUB', 'USD', 'day', { now: NOW });

      // Both directions and every range inside the month share one download.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('reads the saved history back from disk in a new session', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));
      await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      clearRateHistoryCache(); // app restarted: memory gone, files kept

      const { points } = await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });
      expect(points).toEqual([{ date: '2026-10-23', rate: 81.55 }]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('tops up only the newest days once the saved copy is stale', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [
        ['2026-09-23', 84.1], ['2026-10-22', 81.81], ['2026-10-23', 81.4],
      ]));
      await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      Date.now.mockReturnValue(NOW.getTime() + HISTORY_REFRESH_MS + 1);
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));

      const { points } = await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      // From the newest saved day (its rate may still have moved), not the window start.
      expect(requestedUrl(1).searchParams.get('from')).toBe('2026-10-23');
      expect(points.map((p) => p.rate)).toEqual([84.1, 81.81, 81.55]);
    });

    it('downloads the missing older days when a longer range is opened', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));
      await fetchRateHistory('USD', 'RUB', 'week', { now: NOW });

      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2025-10-23', 80.9]]));
      const { points } = await fetchRateHistory('USD', 'RUB', 'year', { now: NOW });

      // Only the days before the saved week, not the whole year again.
      expect(requestedUrl(1).searchParams.get('from')).toBe('2025-10-23');
      expect(requestedUrl(1).searchParams.get('to')).toBe('2026-10-15');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(points.map((p) => p.date)).toEqual(['2025-10-23', '2026-10-23']);
    });

    it('keeps only the last two fixings for the day range', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [
        ['2026-10-20', 82.85], ['2026-10-21', 82.48], ['2026-10-22', 81.81], ['2026-10-23', 81.55],
      ]));

      const { points } = await fetchRateHistory('USD', 'RUB', 'day', { now: NOW });

      expect(points).toEqual([
        { date: '2026-10-22', rate: 81.81 },
        { date: '2026-10-23', rate: 81.55 },
      ]);
    });

    it('draws all time from monthly averages ending on the latest daily rate', async () => {
      global.fetch.mockImplementation(async (url) => {
        const params = new URL(url).searchParams;
        return params.get('group') === 'month'
          ? rowsResponse('USD', 'RUB', [['1998-01-01', 6.0], ['2026-10-01', 83.86]])
          : rowsResponse('USD', 'RUB', [['2026-10-22', 81.81], ['2026-10-23', 81.55]]);
      });

      const { points } = await fetchRateHistory('USD', 'RUB', 'all', { now: NOW });

      expect(points).toEqual([
        { date: '1998-01-01', rate: 6.0 },
        { date: '2026-10-01', rate: 83.86 },
        { date: '2026-10-23', rate: 81.55 },
      ]);
      const monthlyCall = global.fetch.mock.calls.find(([url]) => url.includes('group=month'));
      expect(new URL(monthlyCall[0]).searchParams.get('from')).toBe('1948-01-01');
    });

    it('tops up the monthly series from its newest month', async () => {
      global.fetch.mockImplementation(async (url) => (
        new URL(url).searchParams.get('group') === 'month'
          ? rowsResponse('USD', 'RUB', [['2026-09-01', 84.99], ['2026-10-01', 83.5]])
          : rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]])
      ));
      await fetchRateHistory('USD', 'RUB', 'all', { now: NOW });

      Date.now.mockReturnValue(NOW.getTime() + HISTORY_REFRESH_MS + 1);
      global.fetch.mockClear();
      global.fetch.mockImplementation(async (url) => (
        new URL(url).searchParams.get('group') === 'month'
          ? rowsResponse('USD', 'RUB', [['2026-10-01', 83.86]])
          : rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]])
      ));

      const { points } = await fetchRateHistory('USD', 'RUB', 'all', { now: NOW });

      const monthlyCall = global.fetch.mock.calls.find(([url]) => url.includes('group=month'));
      expect(new URL(monthlyCall[0]).searchParams.get('from')).toBe('2026-10-01');
      expect(points.map((p) => p.rate)).toEqual([84.99, 83.86, 81.55]);
    });

    it('serves the saved series marked stale when the top-up fails', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));
      await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      Date.now.mockReturnValue(NOW.getTime() + HISTORY_REFRESH_MS + 1);
      global.fetch.mockRejectedValueOnce(new Error('offline'));

      await expect(fetchRateHistory('USD', 'RUB', 'month', { now: NOW })).resolves.toEqual({
        points: [{ date: '2026-10-23', rate: 81.55 }],
        stale: true,
      });
    });

    it('throws when nothing is saved and the network fails', async () => {
      global.fetch.mockRejectedValueOnce(new Error('offline'));

      await expect(fetchRateHistory('USD', 'RUB', 'month', { now: NOW }))
        .rejects.toMatchObject({ code: 'network' });
    });

    it('throws empty when the source has no rows for the pair', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', []));

      await expect(fetchRateHistory('USD', 'RUB', 'month', { now: NOW }))
        .rejects.toMatchObject({ code: 'empty' });
    });

    it('reports a currency the source refuses as unsupported', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 422 });

      await expect(fetchRateHistory('USD', 'XYZ', 'month', { now: NOW }))
        .rejects.toMatchObject({ code: 'unsupported' });
    });

    it('rejects a pair of one currency without a request', async () => {
      await expect(fetchRateHistory('USD', 'USD', 'month')).rejects.toMatchObject({ code: 'unsupported' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('re-downloads when the saved file is unreadable', async () => {
      disk[`${RATE_CACHE_DIR}USD_RUB.json`] = '{not json';
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));

      const { points } = await fetchRateHistory('USD', 'RUB', 'month', { now: NOW });

      expect(points).toEqual([{ date: '2026-10-23', rate: 81.55 }]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps both ranges when two load the same pair at once', async () => {
      // Regression guard for runExclusive: without it the second merge would
      // write over the first and the year backfill would be lost.
      global.fetch
        .mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]))
        .mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2025-10-23', 80.9]]));

      await Promise.all([
        fetchRateHistory('USD', 'RUB', 'week', { now: NOW }),
        fetchRateHistory('USD', 'RUB', 'year', { now: NOW }),
      ]);

      expect(lastWrite().daily.rows).toEqual([['2025-10-23', 80.9], ['2026-10-23', 81.55]]);
    });

    it('keeps the direction a pair was saved in', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]]));
      await fetchRateHistory('USD', 'RUB', 'week', { now: NOW });

      clearRateHistoryCache();
      // The live table now (wrongly) says RUB is the larger side.
      mockLiveRates['RUB|USD'] = '5';
      Date.now.mockReturnValue(NOW.getTime() + HISTORY_REFRESH_MS + 1);
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-10-23', 81.6]]));

      const { points } = await fetchRateHistory('RUB', 'USD', 'week', { now: NOW });

      expect(requestedUrl(1).searchParams.get('base')).toBe('USD');
      expect(points[0].rate).toBeCloseTo(1 / 81.6, 10);
      mockLiveRates['RUB|USD'] = '0.01226';
    });

    it('inverts a pair outside the offline table by the live rate', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'KRW', [['2026-10-23', 1324.48]]));

      const { points } = await fetchRateHistory('KRW', 'USD', 'week', { now: NOW });

      expect(requestedUrl(0).searchParams.get('base')).toBe('USD');
      expect(points[0].rate).toBeCloseTo(1 / 1324.48, 12);
    });

    it('still draws all time from the monthly series when the daily top-up fails', async () => {
      global.fetch.mockImplementation(async (url) => {
        if (new URL(url).searchParams.get('group') === 'month') {
          return rowsResponse('USD', 'RUB', [['2026-09-01', 84.99], ['2026-10-01', 83.86]]);
        }
        throw new Error('offline');
      });

      await expect(fetchRateHistory('USD', 'RUB', 'all', { now: NOW })).resolves.toEqual({
        points: [{ date: '2026-09-01', rate: 84.99 }, { date: '2026-10-01', rate: 83.86 }],
        stale: true,
      });
    });

    it('does not ask again within the hour for a pair the source has no months for', async () => {
      global.fetch.mockImplementation(async (url) => (
        new URL(url).searchParams.get('group') === 'month'
          ? rowsResponse('USD', 'RUB', [])
          : rowsResponse('USD', 'RUB', [['2026-10-23', 81.55]])
      ));
      await fetchRateHistory('USD', 'RUB', 'all', { now: NOW });
      global.fetch.mockClear();

      await fetchRateHistory('USD', 'RUB', 'all', { now: NOW });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('drops saved daily rows older than a year', async () => {
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2025-10-23', 80.9], ['2026-10-23', 81.55]]));
      await fetchRateHistory('USD', 'RUB', 'year', { now: NOW });

      const later = new Date(2026, 11, 1);
      Date.now.mockReturnValue(later.getTime());
      global.fetch.mockResolvedValueOnce(rowsResponse('USD', 'RUB', [['2026-12-01', 79.2]]));
      await fetchRateHistory('USD', 'RUB', 'week', { now: later });

      expect(lastWrite().daily.from).toBe(toIsoDate(new Date(2025, 11, 1)));
      expect(lastWrite().daily.rows.map(([date]) => date)).toEqual(['2026-10-23', '2026-12-01']);
    });
  });

  describe('parseCacheEntry', () => {
    const EMPTY = { v: 1, base: null, quote: null, daily: null, monthly: null };

    it('ignores a file of another version or shape', () => {
      expect(parseCacheEntry(null)).toEqual(EMPTY);
      expect(parseCacheEntry({ v: 2, base: 'USD', quote: 'RUB', daily: {} })).toEqual(EMPTY);
      expect(parseCacheEntry({ v: 1, daily: {} })).toEqual(EMPTY);
      expect(parseCacheEntry({
        v: 1, base: 'USD', quote: 'RUB', daily: { from: '2026-01-01', checkedAt: 1, rows: [['x', -1]] },
      }).daily).toBeNull();
    });

    it('keeps a well-formed entry', () => {
      const entry = {
        v: 1,
        base: 'USD',
        quote: 'RUB',
        daily: { from: '2026-10-01', checkedAt: 1, rows: [['2026-10-23', 81.55]] },
        monthly: { checkedAt: 1, rows: [] },
      };
      expect(parseCacheEntry(entry)).toEqual(entry);
    });
  });

  describe('summarizeRateSeries', () => {
    it('prices the series per amount and measures the move', () => {
      const summary = summarizeRateSeries([
        { date: '2026-10-01', rate: 0.2 },
        { date: '2026-10-10', rate: 0.25 },
        { date: '2026-10-23', rate: 0.22 },
      ], 100);

      expect(summary.current).toBeCloseTo(22);
      expect(summary.first).toBeCloseTo(20);
      expect(summary.change).toBeCloseTo(2);
      expect(summary.changePercent).toBeCloseTo(10);
      expect(summary.max).toBeCloseTo(25);
      expect(summary.min).toBeCloseTo(20);
      expect(summary.date).toBe('2026-10-23');
    });

    it('returns null for no points', () => {
      expect(summarizeRateSeries([])).toBeNull();
      expect(summarizeRateSeries(null)).toBeNull();
    });
  });

  describe('formatRateChange', () => {
    it('signs the move and its percentage, in the rate’s decimals', () => {
      expect(formatRateChange(1.55, 1.9375, 'en', 2)).toBe('+1.55 (+1.94%)');
      expect(formatRateChange(-0.0213, -1.86, 'en', 3)).toBe('-0.021 (-1.86%)');
      expect(formatRateChange(0, 0, 'en', 2)).toBe('0.00 (0.00%)');
    });
  });

  describe('rateDecimals / formatRateValue', () => {
    it('keeps four significant digits and at least two decimals', () => {
      expect(rateDecimals(81.55)).toBe(2);
      expect(rateDecimals(4.4268)).toBe(3);
      expect(rateDecimals(0.2259)).toBe(4);
      expect(rateDecimals(0.01226)).toBe(5);
      expect(rateDecimals(1324.48)).toBe(2);
      expect(rateDecimals(0)).toBe(2);
      expect(rateDecimals(1e-12)).toBe(8);
    });

    it('formats with the given decimals', () => {
      expect(formatRateValue(81.5512, 'en')).toBe('81.55');
      expect(formatRateValue(0.0122612, 'en')).toBe('0.01226');
      expect(formatRateValue(-0.26, 'en', 2)).toBe('-0.26');
      expect(formatRateValue(NaN, 'en')).toBe('—');
    });
  });
});
