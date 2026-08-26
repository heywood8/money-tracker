/**
 * Tests for the net-worth selection of the balance chart.
 *
 * Picking "net worth" in the account picker charts every account at once,
 * converted into the display currency. The hook drives it through the same code
 * path as a single account (see services/BalanceHistorySource), so what is worth
 * pinning down here is what changes: the per-account fan-out, the summed series,
 * and the fact that a sum has no single snapshot behind it to edit.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import useBalanceHistory from '../../app/hooks/useBalanceHistory';
import { NET_WORTH_ACCOUNT_ID } from '../../app/services/BalanceHistorySource';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';
import * as OperationsDB from '../../app/services/OperationsDB';

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  getBalanceHistory: jest.fn(),
  getAccountBalanceOnOrBeforeDate: jest.fn(),
  getBalanceHistoryForAccounts: jest.fn(),
  getAccountBalancesOnOrBeforeDate: jest.fn(),
  upsertBalanceHistory: jest.fn(),
  deleteBalanceHistory: jest.fn(),
  formatDate: jest.fn((date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
}));

jest.mock('../../app/services/OperationsDB', () => ({
  getTotalExpenses: jest.fn(),
  getTotalIncome: jest.fn(),
  getTransferTotals: jest.fn(),
  getMonthlyExpenseTotals: jest.fn(),
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
}));

const YEAR = 2024;
const MONTH = 0; // January

const ACCOUNTS = [
  { id: 'a', currency: 'AMD' },
  { id: 'b', currency: 'USD' },
];

// $1 = ֏400, and a plain multiply — the same deterministic stand-in the other
// conversion tests use.
const stubRates = (rates) => {
  const rateMap = new Map(Object.entries(rates));
  OperationsDB.fetchRatesToTarget.mockResolvedValue(rateMap);
  OperationsDB.convertWithRateMap.mockImplementation((amount, from, target, map) => {
    if (from === target) return amount;
    const rate = map.get(from);
    if (!rate) return null;
    return String(parseFloat(amount) * parseFloat(rate));
  });
};

// The net-worth source reads history through the batched query: one call per
// window answering for every account at once.
const stubHistoryRows = (rowsFor) => {
  BalanceHistoryDB.getBalanceHistoryForAccounts.mockImplementation(
    async (accountIds, startDate, endDate) => new Map(
      (accountIds || []).map(id => [String(id), rowsFor(id, startDate, endDate) || []]),
    ),
  );
};

const renderNetWorth = (accounts = ACCOUNTS) => renderHook(
  ({ list }) => useBalanceHistory(NET_WORTH_ACCOUNT_ID, YEAR, MONTH, {
    accounts: list,
    targetCurrency: 'AMD',
  }),
  { initialProps: { list: accounts } },
);

describe('useBalanceHistory — net worth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubRates({ USD: '400' });
    BalanceHistoryDB.getBalanceHistory.mockResolvedValue([]);
    BalanceHistoryDB.getAccountBalanceOnOrBeforeDate.mockResolvedValue(null);
    stubHistoryRows(() => []);
    BalanceHistoryDB.getAccountBalancesOnOrBeforeDate.mockImplementation(
      async (accountIds) => new Map((accountIds || []).map(id => [String(id), null])),
    );
    OperationsDB.getTotalExpenses.mockResolvedValue('0');
    OperationsDB.getTotalIncome.mockResolvedValue('0');
    OperationsDB.getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    OperationsDB.getMonthlyExpenseTotals.mockResolvedValue({});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('charts the sum of every account, converted to the display currency', async () => {
    // Only answer for the selected month's window; the 12-month comparison
    // window stays empty so the assertion is about the actual line alone.
    stubHistoryRows((accountId, startDate) => {
      if (startDate !== '2024-01-01') return [];
      return accountId === 'a'
        ? [{ date: '2024-01-01', balance: '1000' }, { date: '2024-01-10', balance: '800' }]
        : [{ date: '2024-01-01', balance: '10' }];
    });

    const { result } = await renderNetWorth();

    await act(async () => { await result.current.loadBalanceHistory(); });
    await waitFor(() => expect(result.current.loadingBalanceHistory).toBe(false));

    // Both accounts are covered by one query per window (month + comparison).
    expect(BalanceHistoryDB.getBalanceHistoryForAccounts)
      .toHaveBeenCalledWith(['a', 'b'], '2024-01-01', '2024-01-31');

    const { actual } = result.current.balanceHistoryData;
    // Day 1: ֏1000 + $10×400. Day 10: account a moved, account b holds its $10.
    expect(actual).toEqual([
      { x: 1, y: 5000 },
      { x: 10, y: 4800 },
    ]);
  });

  it('sums the month totals that feed the forecast across accounts', async () => {
    OperationsDB.getTotalExpenses.mockImplementation(async (accountId) => (accountId === 'a' ? '500' : '2'));

    const { result } = await renderNetWorth();

    await act(async () => { await result.current.loadBalanceHistory(); });
    await waitFor(() => expect(result.current.loadingBalanceHistory).toBe(false));

    // ֏500 + $2×400 = ֏1300, for both the current and the previous month window.
    expect(result.current.balanceHistoryData.currentMonthTotalExpenses).toBe('1300.00');
    expect(result.current.balanceHistoryData.prevMonthTotalExpenses).toBe('1300.00');
  });

  it('charts the year view from every account as well', async () => {
    stubHistoryRows((accountId, startDate) => {
      if (startDate !== '2024-01-01') return [];
      return accountId === 'a'
        ? [{ date: '2024-01-01', balance: '1000' }]
        : [{ date: '2024-01-01', balance: '10' }];
    });

    const { result } = await renderHook(() => useBalanceHistory(NET_WORTH_ACCOUNT_ID, YEAR, null, {
      accounts: ACCOUNTS,
      targetCurrency: 'AMD',
    }));

    await act(async () => { await result.current.loadBalanceHistory(); });
    await waitFor(() => expect(result.current.loadingBalanceHistory).toBe(false));

    expect(result.current.balanceHistoryData.granularity).toBe('year');
    expect(result.current.balanceHistoryData.actual[0]).toEqual({ x: 1, y: 5000 });
  });

  it('offers no editable calendar, since a sum has no snapshot of its own', async () => {
    const { result } = await renderNetWorth();

    await act(async () => {
      await expect(result.current.loadBalanceHistoryTable()).resolves.toBeNull();
    });

    await act(async () => {
      result.current.setEditingBalanceValue('123');
    });
    await act(async () => {
      await result.current.handleSaveBalance('2024-01-05');
      await result.current.handleDeleteBalance('2024-01-05');
    });

    expect(BalanceHistoryDB.upsertBalanceHistory).not.toHaveBeenCalled();
    expect(BalanceHistoryDB.deleteBalanceHistory).not.toHaveBeenCalled();
  });

  it('does not reload when the accounts context hands back an equal list', async () => {
    const { result, rerender } = await renderNetWorth();

    await act(async () => { await result.current.loadBalanceHistory(); });
    const initialLoad = result.current.loadBalanceHistory;

    // A re-rendered context returns a fresh array holding the same accounts;
    // rebuilding the source for it would re-run every query on every render.
    await act(async () => {
      rerender({ list: ACCOUNTS.map(acc => ({ ...acc })) });
    });

    expect(result.current.loadBalanceHistory).toBe(initialLoad);
  });

  it('rebuilds when an account is added', async () => {
    const { result, rerender } = await renderNetWorth();

    await act(async () => { await result.current.loadBalanceHistory(); });
    const initialLoad = result.current.loadBalanceHistory;

    await act(async () => {
      rerender({ list: [...ACCOUNTS, { id: 'c', currency: 'EUR' }] });
    });

    expect(result.current.loadBalanceHistory).not.toBe(initialLoad);
  });

  it('keeps a single-account chart untouched when the display currency changes', async () => {
    const { result, rerender } = await renderHook(
      ({ currency }) => useBalanceHistory('a', YEAR, MONTH, { accounts: ACCOUNTS, targetCurrency: currency }),
      { initialProps: { currency: 'AMD' } },
    );

    await act(async () => { await result.current.loadBalanceHistory(); });
    const initialLoad = result.current.loadBalanceHistory;

    // One account is charted in its own currency, so the screen's display
    // currency has nothing to say about it — reloading would be a spinner over
    // an identical chart.
    await act(async () => { rerender({ currency: 'USD' }); });

    expect(result.current.loadBalanceHistory).toBe(initialLoad);
  });

  it('reloads the net-worth chart when the display currency changes', async () => {
    const { result, rerender } = await renderHook(
      ({ currency }) => useBalanceHistory(NET_WORTH_ACCOUNT_ID, YEAR, MONTH, {
        accounts: ACCOUNTS,
        targetCurrency: currency,
      }),
      { initialProps: { currency: 'AMD' } },
    );

    await act(async () => { await result.current.loadBalanceHistory(); });
    const initialLoad = result.current.loadBalanceHistory;

    await act(async () => { rerender({ currency: 'USD' }); });

    expect(result.current.loadBalanceHistory).not.toBe(initialLoad);
  });

  it('never lets a slow net-worth load repaint over a newer selection', async () => {
    // The net-worth load fans out over every account and can wait on a live
    // exchange rate; the user switching back to one account meanwhile must not
    // end up with portfolio totals under that account's currency symbol.
    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    BalanceHistoryDB.getBalanceHistoryForAccounts.mockImplementation(() => gate.then(() => new Map([
      ['a', [{ date: '2024-01-01', balance: '1000' }]],
      ['b', [{ date: '2024-01-01', balance: '10' }]],
    ])));
    BalanceHistoryDB.getBalanceHistory.mockResolvedValue([{ date: '2024-01-02', balance: '7' }]);

    const { result, rerender } = await renderHook(
      ({ account }) => useBalanceHistory(account, YEAR, MONTH, {
        accounts: ACCOUNTS,
        targetCurrency: 'AMD',
      }),
      { initialProps: { account: NET_WORTH_ACCOUNT_ID } },
    );

    let stale;
    await act(async () => {
      stale = result.current.loadBalanceHistory();
      await Promise.resolve();
    });

    await act(async () => { rerender({ account: 'a' }); });
    await act(async () => { await result.current.loadBalanceHistory(); });

    await act(async () => {
      releaseGate();
      await stale;
    });

    expect(result.current.balanceHistoryData.actual).toEqual([{ x: 2, y: 7 }]);
    expect(result.current.loadingBalanceHistory).toBe(false);
  });
});
