import {
  normalizeRateChart,
  normalizeRateCharts,
  reverseRateChart,
  loadRateCharts,
  saveRateCharts,
  upsertRateChart,
  removeRateChart,
} from '../../app/services/ExchangeRateCharts';
import { setJsonPreference, PREF_KEYS } from '../../app/services/PreferencesDB';
import { queryFirst } from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { EXCHANGE_RATE_CHARTS: 'exchange_rate_charts' },
  setJsonPreference: jest.fn(),
}));
jest.mock('../../app/services/db', () => ({
  queryFirst: jest.fn(),
}));

const stored = (list) => queryFirst.mockResolvedValue({ value: JSON.stringify(list) });

describe('ExchangeRateCharts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeRateChart', () => {
    it('keeps a well-formed chart as is', () => {
      const chart = { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
      expect(normalizeRateChart(chart)).toEqual(chart);
    });

    it('upper-cases codes and fills a missing id', () => {
      const chart = normalizeRateChart({ from: 'amd', to: 'rub', amount: 100, range: 'year' });
      expect(chart).toMatchObject({ from: 'AMD', to: 'RUB', amount: 100, range: 'year' });
      expect(chart.id).toMatch(/^rate-/);
    });

    it('falls back to defaults for an amount or range it does not offer', () => {
      expect(normalizeRateChart({ id: 'a', from: 'USD', to: 'RUB', amount: 7, range: 'decade' }))
        .toEqual({ id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' });
    });

    it('drops a chart it cannot draw', () => {
      expect(normalizeRateChart(null)).toBeNull();
      expect(normalizeRateChart({ from: 'USD', to: 'USD' })).toBeNull();
      expect(normalizeRateChart({ from: 'US', to: 'RUB' })).toBeNull();
      expect(normalizeRateChart({ from: 'USD' })).toBeNull();
    });
  });

  it('normalizeRateCharts drops invalid entries and repeated ids', () => {
    expect(normalizeRateCharts('nope')).toEqual([]);
    expect(normalizeRateCharts([
      { id: 'a', from: 'USD', to: 'RUB' },
      { id: 'a', from: 'EUR', to: 'RUB' },
      { id: 'b', from: 'USD', to: 'USD' },
      { id: 'c', from: 'RUB', to: 'AMD', amount: 10, range: 'week' },
    ])).toEqual([
      { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' },
      { id: 'c', from: 'RUB', to: 'AMD', amount: 10, range: 'week' },
    ]);
  });

  it('reverseRateChart swaps the currencies and keeps the rest', () => {
    expect(reverseRateChart({ id: 'a', from: 'USD', to: 'RUB', amount: 10, range: 'day' }))
      .toEqual({ id: 'a', from: 'RUB', to: 'USD', amount: 10, range: 'day' });
  });

  describe('loadRateCharts', () => {
    it('reads and cleans the stored list', async () => {
      stored([{ id: 'a', from: 'USD', to: 'RUB' }, { junk: true }]);

      await expect(loadRateCharts()).resolves.toEqual([
        { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' },
      ]);
      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT value FROM app_metadata WHERE key = ?',
        [PREF_KEYS.EXCHANGE_RATE_CHARTS],
      );
    });

    it('reads an absent or unparseable value as no charts', async () => {
      queryFirst.mockResolvedValueOnce(null);
      await expect(loadRateCharts()).resolves.toEqual([]);
      queryFirst.mockResolvedValueOnce({ value: '{oops' });
      await expect(loadRateCharts()).resolves.toEqual([]);
    });

    it('throws when the database cannot be read, rather than answering empty', async () => {
      queryFirst.mockRejectedValueOnce(new Error('database is locked'));
      await expect(loadRateCharts()).rejects.toThrow('database is locked');
    });
  });

  describe('upsertRateChart / removeRateChart', () => {
    const USD_RUB = { id: 'a', from: 'USD', to: 'RUB', amount: 1, range: 'month' };
    const AMD_RUB = { id: 'b', from: 'AMD', to: 'RUB', amount: 100, range: 'week' };

    beforeEach(() => {
      setJsonPreference.mockResolvedValue(undefined);
    });

    it('appends a new chart to the stored list', async () => {
      stored([USD_RUB]);
      await expect(upsertRateChart(AMD_RUB)).resolves.toEqual([USD_RUB, AMD_RUB]);
    });

    it('replaces a chart in place', async () => {
      stored([USD_RUB, AMD_RUB]);
      const reversed = { ...USD_RUB, from: 'RUB', to: 'USD' };
      await expect(upsertRateChart(reversed)).resolves.toEqual([reversed, AMD_RUB]);
    });

    it('removes a chart by id', async () => {
      stored([USD_RUB, AMD_RUB]);
      await expect(removeRateChart('a')).resolves.toEqual([AMD_RUB]);
    });

    it('writes nothing when the stored list cannot be read', async () => {
      // Regression guard: a failed read must not become "no charts" and let the
      // save overwrite everything the user had.
      queryFirst.mockRejectedValueOnce(new Error('database is locked'));
      await expect(upsertRateChart(AMD_RUB)).rejects.toThrow('database is locked');
      expect(setJsonPreference).not.toHaveBeenCalled();
    });
  });

  it('saveRateCharts stores the cleaned list and broadcasts it', async () => {
    setJsonPreference.mockResolvedValue(undefined);
    const listener = jest.fn();
    const off = appEvents.on(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, listener);

    const saved = await saveRateCharts([{ id: 'a', from: 'usd', to: 'rub', amount: 100 }]);

    const expected = [{ id: 'a', from: 'USD', to: 'RUB', amount: 100, range: 'month' }];
    expect(saved).toEqual(expected);
    expect(setJsonPreference).toHaveBeenCalledWith(PREF_KEYS.EXCHANGE_RATE_CHARTS, expected);
    expect(listener).toHaveBeenCalledWith(expected);
    off();
  });

  it('saveRateCharts does not broadcast a list it failed to store', async () => {
    setJsonPreference.mockRejectedValue(new Error('disk full'));
    const listener = jest.fn();
    const off = appEvents.on(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, listener);

    await expect(saveRateCharts([{ id: 'a', from: 'USD', to: 'RUB' }])).rejects.toThrow('disk full');
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});
