/**
 * Tests for the balance-chart data sources.
 *
 * The single-account source is a pass-through to the per-account queries. The
 * net-worth source asks the same questions of every account and sums the answers
 * in one display currency — forward-filling each account's snapshots so a day
 * where only one account moved still counts what the others were holding.
 */

import {
  NET_WORTH_ACCOUNT_ID,
  isNetWorthSelection,
  normalizeHistoryDate,
  combineBalanceHistories,
  createSingleAccountSource,
  createNetWorthSource,
  createBalanceHistorySource,
} from '../../app/services/BalanceHistorySource';
import {
  getBalanceHistory,
  getAccountBalanceOnOrBeforeDate,
  getBalanceHistoryForAccounts,
  getAccountBalancesOnOrBeforeDate,
} from '../../app/services/BalanceHistoryDB';
import {
  getTotalExpenses,
  getTotalIncome,
  getTransferTotals,
  getMonthlyExpenseTotals,
  fetchRatesToTarget,
  convertWithRateMap,
} from '../../app/services/OperationsDB';

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  getBalanceHistory: jest.fn(),
  getAccountBalanceOnOrBeforeDate: jest.fn(),
  getBalanceHistoryForAccounts: jest.fn(),
  getAccountBalancesOnOrBeforeDate: jest.fn(),
}));

jest.mock('../../app/services/OperationsDB', () => ({
  getTotalExpenses: jest.fn(),
  getTotalIncome: jest.fn(),
  getTransferTotals: jest.fn(),
  getMonthlyExpenseTotals: jest.fn(),
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
}));

// Deterministic stand-ins for the real rate helpers: a fixed rate map and a
// plain multiply. A currency absent from the map converts to null (dropped),
// mirroring the real convertWithRateMap contract.
const stubRates = (rates) => {
  const rateMap = new Map(Object.entries(rates));
  fetchRatesToTarget.mockResolvedValue(rateMap);
  convertWithRateMap.mockImplementation((amount, from, target, map) => {
    if (from === target) return amount;
    const rate = map.get(from);
    if (!rate) return null;
    return String(parseFloat(amount) * parseFloat(rate));
  });
};

// Rows keyed by account id. The net-worth source reads them through the batched
// queries, which answer for every requested account in one map.
const stubHistory = (byAccount, anchors = {}) => {
  getBalanceHistoryForAccounts.mockImplementation(async (accountIds) => new Map(
    (accountIds || []).map(id => [String(id), byAccount[id] || []]),
  ));
  getAccountBalancesOnOrBeforeDate.mockImplementation(async (accountIds) => new Map(
    (accountIds || []).map(id => [String(id), anchors[id] === undefined ? null : anchors[id]]),
  ));
};

describe('BalanceHistorySource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubRates({});
    getBalanceHistory.mockResolvedValue([]);
    getAccountBalanceOnOrBeforeDate.mockResolvedValue(null);
    stubHistory({}, {});
    getTotalExpenses.mockResolvedValue('0');
    getTotalIncome.mockResolvedValue('0');
    getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    getMonthlyExpenseTotals.mockResolvedValue({});
  });

  describe('isNetWorthSelection', () => {
    it('recognises the sentinel and nothing else', () => {
      expect(isNetWorthSelection(NET_WORTH_ACCOUNT_ID)).toBe(true);
      expect(isNetWorthSelection('account-1')).toBe(false);
      expect(isNetWorthSelection(null)).toBe(false);
      expect(isNetWorthSelection(undefined)).toBe(false);
    });
  });

  describe('normalizeHistoryDate', () => {
    it('keeps a plain calendar date', () => {
      expect(normalizeHistoryDate('2024-01-05')).toBe('2024-01-05');
    });

    it('trims an imported timestamp down to its calendar day', () => {
      expect(normalizeHistoryDate('2024-01-05 13:22:01')).toBe('2024-01-05');
    });

    it('rejects anything that is not a date string', () => {
      expect(normalizeHistoryDate(null)).toBeNull();
      expect(normalizeHistoryDate('2024-1')).toBeNull();
      expect(normalizeHistoryDate(20240105)).toBeNull();
    });
  });

  describe('combineBalanceHistories', () => {
    it('sums the accounts that moved on a day with the ones that did not', () => {
      const combined = combineBalanceHistories([
        { anchor: null, rows: [{ date: '2024-01-01', balance: '100' }, { date: '2024-01-05', balance: '80' }] },
        { anchor: null, rows: [{ date: '2024-01-01', balance: '50' }, { date: '2024-01-03', balance: '60' }] },
      ]);

      expect(combined).toEqual([
        { date: '2024-01-01', balance: '150.00' },
        // Account 2 moved; account 1 still holds the 100 it had on the 1st.
        { date: '2024-01-03', balance: '160.00' },
        // Account 1 moved; account 2 still holds the 60 it had on the 3rd.
        { date: '2024-01-05', balance: '140.00' },
      ]);
    });

    it('carries the anchor in for an account with no row in the window', () => {
      const combined = combineBalanceHistories([
        { anchor: null, rows: [{ date: '2024-02-10', balance: '200' }] },
        { anchor: '75', rows: [] },
      ]);

      expect(combined).toEqual([{ date: '2024-02-10', balance: '275.00' }]);
    });

    it('leaves an account out until its first known balance', () => {
      const combined = combineBalanceHistories([
        { anchor: null, rows: [{ date: '2024-03-01', balance: '100' }] },
        // Opened mid-month: contributes nothing on the 1st rather than a zero.
        { anchor: null, rows: [{ date: '2024-03-10', balance: '40' }] },
      ]);

      expect(combined).toEqual([
        { date: '2024-03-01', balance: '100.00' },
        { date: '2024-03-10', balance: '140.00' },
      ]);
    });

    it('normalises imported timestamps so they land on the right day', () => {
      const combined = combineBalanceHistories([
        { anchor: null, rows: [{ date: '2024-01-02 09:00:00', balance: '10' }] },
        { anchor: null, rows: [{ date: '2024-01-02', balance: '5' }] },
      ]);

      expect(combined).toEqual([{ date: '2024-01-02', balance: '15.00' }]);
    });

    it('ignores unusable rows and returns nothing when no balance is known', () => {
      expect(combineBalanceHistories([
        { anchor: null, rows: [{ date: 'nope', balance: '10' }, { date: '2024-01-02', balance: 'abc' }] },
      ])).toEqual([]);
      expect(combineBalanceHistories([])).toEqual([]);
      expect(combineBalanceHistories(undefined)).toEqual([]);
    });

    it('reads rows in date order even when the query hands them back unsorted', () => {
      const combined = combineBalanceHistories([
        { anchor: null, rows: [{ date: '2024-01-09', balance: '30' }, { date: '2024-01-02', balance: '10' }] },
      ]);

      expect(combined).toEqual([
        { date: '2024-01-02', balance: '10.00' },
        { date: '2024-01-09', balance: '30.00' },
      ]);
    });
  });

  describe('createSingleAccountSource', () => {
    it('passes every question straight through to the account queries', async () => {
      const source = createSingleAccountSource('account-1');

      await source.getHistory('2024-01-01', '2024-01-31');
      await source.getAnchorBalance('2024-01-01');
      await source.getTotalExpenses('2024-01-01', '2024-01-31');
      await source.getTotalIncome('2024-01-02', '2024-01-31');
      await source.getTransferTotals('2024-01-02', '2024-01-31');
      await source.getMonthlyExpenseTotals('2023-01-01', '2023-12-31');

      expect(source.isNetWorth).toBe(false);
      expect(getBalanceHistory).toHaveBeenCalledWith('account-1', '2024-01-01', '2024-01-31');
      expect(getAccountBalanceOnOrBeforeDate).toHaveBeenCalledWith('account-1', '2024-01-01');
      expect(getTotalExpenses).toHaveBeenCalledWith('account-1', '2024-01-01', '2024-01-31');
      expect(getTotalIncome).toHaveBeenCalledWith('account-1', '2024-01-02', '2024-01-31');
      expect(getTransferTotals).toHaveBeenCalledWith('account-1', '2024-01-02', '2024-01-31');
      expect(getMonthlyExpenseTotals).toHaveBeenCalledWith('account-1', '2023-01-01', '2023-12-31');
      expect(fetchRatesToTarget).not.toHaveBeenCalled();
    });
  });

  describe('createNetWorthSource', () => {
    const accounts = [
      { id: 'a', currency: 'AMD' },
      { id: 'b', currency: 'USD' },
    ];

    it('converts each account into the display currency before summing', async () => {
      stubRates({ USD: '400' });
      stubHistory({
        a: [{ date: '2024-01-01', balance: '1000' }],
        b: [{ date: '2024-01-01', balance: '10' }],
      });

      const source = createNetWorthSource(accounts, 'AMD');
      const history = await source.getHistory('2024-01-01', '2024-01-31');

      expect(source.isNetWorth).toBe(true);
      expect(history).toEqual([{ date: '2024-01-01', balance: '5000.00' }]);
    });

    it('anchors the forward-fill on balances from before the window', async () => {
      stubRates({ USD: '400' });
      stubHistory(
        { a: [{ date: '2024-01-15', balance: '1000' }] },
        { a: '900', b: '10' },
      );

      const source = createNetWorthSource(accounts, 'AMD');
      const history = await source.getHistory('2024-01-01', '2024-01-31');

      // Account b never moved this month but still holds $10 = ֏4000.
      expect(history).toEqual([{ date: '2024-01-15', balance: '5000.00' }]);
      expect(getAccountBalancesOnOrBeforeDate).toHaveBeenCalledWith(['a', 'b'], '2024-01-01');
    });

    it('drops accounts whose currency has no rate rather than counting them at par', async () => {
      stubRates({}); // no USD rate available
      stubHistory({
        a: [{ date: '2024-01-01', balance: '1000' }],
        b: [{ date: '2024-01-01', balance: '10' }],
      });

      const source = createNetWorthSource(accounts, 'AMD');
      const history = await source.getHistory('2024-01-01', '2024-01-31');

      expect(history).toEqual([{ date: '2024-01-01', balance: '1000.00' }]);
    });

    it('sums the anchor balance across accounts', async () => {
      stubRates({ USD: '400' });
      stubHistory({}, { a: '1000', b: '10' });

      const source = createNetWorthSource(accounts, 'AMD');

      await expect(source.getAnchorBalance('2024-01-01')).resolves.toBe('5000.00');
    });

    it('reports an unknown anchor as null, not zero', async () => {
      stubRates({ USD: '400' });
      stubHistory({}, {});

      const source = createNetWorthSource(accounts, 'AMD');

      await expect(source.getAnchorBalance('2024-01-01')).resolves.toBeNull();
    });

    it('sums converted expenses and income', async () => {
      stubRates({ USD: '400' });
      getTotalExpenses.mockImplementation(async (accountId) => (accountId === 'a' ? '500' : '2'));
      getTotalIncome.mockImplementation(async (accountId) => (accountId === 'a' ? '100' : '1'));

      const source = createNetWorthSource(accounts, 'AMD');

      await expect(source.getTotalExpenses('2024-01-01', '2024-01-31')).resolves.toBe('1300.00');
      await expect(source.getTotalIncome('2024-01-02', '2024-01-31')).resolves.toBe('500.00');
    });

    it('sums transfers per direction so internal moves cancel when netted', async () => {
      stubRates({ USD: '400' });
      getTransferTotals.mockImplementation(async (accountId) => (accountId === 'a'
        ? { incoming: '4000', outgoing: '0' }
        : { incoming: '0', outgoing: '10' }));

      const source = createNetWorthSource(accounts, 'AMD');
      const totals = await source.getTransferTotals('2024-01-02', '2024-01-31');

      expect(totals).toEqual({ incoming: '4000.00', outgoing: '4000.00' });
      expect(parseFloat(totals.incoming) - parseFloat(totals.outgoing)).toBe(0);
    });

    it('merges monthly expense totals across accounts and currencies', async () => {
      stubRates({ USD: '400' });
      getMonthlyExpenseTotals.mockImplementation(async (accountId) => (accountId === 'a'
        ? { '2023-11': '1000', '2023-12': '2000' }
        : { '2023-12': '5' }));

      const source = createNetWorthSource(accounts, 'AMD');

      await expect(source.getMonthlyExpenseTotals('2023-11-01', '2023-12-31')).resolves.toEqual({
        '2023-11': '1000.00',
        '2023-12': '4000.00',
      });
    });

    it('fetches the rate map once for the whole source', async () => {
      stubRates({ USD: '400' });
      const source = createNetWorthSource(accounts, 'AMD');

      await source.getHistory('2024-01-01', '2024-01-31');
      await source.getTotalExpenses('2024-01-01', '2024-01-31');
      await source.getAnchorBalance('2024-01-01');

      expect(fetchRatesToTarget).toHaveBeenCalledTimes(1);
    });

    it('reads every account in one query rather than one query each', async () => {
      stubRates({ USD: '400' });
      const source = createNetWorthSource(accounts, 'AMD');

      await source.getHistory('2024-01-01', '2024-01-31');

      expect(getBalanceHistoryForAccounts).toHaveBeenCalledWith(['a', 'b'], '2024-01-01', '2024-01-31');
      expect(getBalanceHistory).not.toHaveBeenCalled();
    });

    it('survives an empty account list', async () => {
      const source = createNetWorthSource([], 'AMD');

      await expect(source.getHistory('2024-01-01', '2024-01-31')).resolves.toEqual([]);
      await expect(source.getAnchorBalance('2024-01-01')).resolves.toBeNull();
      await expect(source.getTotalExpenses('2024-01-01', '2024-01-31')).resolves.toBe('0');
    });
  });

  describe('createBalanceHistorySource', () => {
    it('picks the net-worth source for the sentinel and the account source otherwise', () => {
      const accounts = [{ id: 'a', currency: 'AMD' }];
      expect(createBalanceHistorySource(NET_WORTH_ACCOUNT_ID, { accounts, targetCurrency: 'AMD' }).isNetWorth).toBe(true);
      expect(createBalanceHistorySource('a', { accounts, targetCurrency: 'AMD' }).isNetWorth).toBe(false);
      expect(createBalanceHistorySource('a').isNetWorth).toBe(false);
    });
  });
});
