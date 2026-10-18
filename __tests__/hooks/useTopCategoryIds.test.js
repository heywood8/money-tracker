import { renderHook, act, waitFor } from '@testing-library/react-native';
import useTopCategoryIds, {
  __resetTopCategoryStores,
  rankTopCategoryIds,
} from '../../app/hooks/useTopCategoryIds';
import * as OperationsDB from '../../app/services/OperationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/OperationsDB', () => ({
  getRecentCategoryUsage: jest.fn(),
}));

const usage = (accountId, categoryId, count, extra = {}) => ({
  accountId, categoryId, type: 'expense', count, lastDate: '2026-09-01', ...extra,
});

describe('useTopCategoryIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The shared store lives at module scope so several consumers collapse onto
    // one query; it therefore outlives a test's render.
    __resetTopCategoryStores();
    OperationsDB.getRecentCategoryUsage.mockResolvedValue([
      usage(1, 'c1', 9),
      usage(1, 'c2', 4),
    ]);
  });

  it('loads the frequency-ordered ids on mount', async () => {
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(result.current).toEqual(['c1', 'c2']));
    expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(1);
  });

  it('degrades to an empty list when the query fails', async () => {
    OperationsDB.getRecentCategoryUsage.mockRejectedValue(new Error('db down'));
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('drops rows without a category id', async () => {
    OperationsDB.getRecentCategoryUsage.mockResolvedValue([
      usage(1, 'c1', 9),
      usage(1, null, 2),
    ]);
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(result.current).toEqual(['c1']));
  });

  it('reloads when an operation changes', async () => {
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(result.current).toEqual(['c1', 'c2']));

    OperationsDB.getRecentCategoryUsage.mockResolvedValue([usage(1, 'c9', 1)]);
    await act(async () => {
      appEvents.emit(EVENTS.OPERATION_CHANGED);
    });
    await waitFor(() => expect(result.current).toEqual(['c9']));
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalled());
    const callsBefore = OperationsDB.getRecentCategoryUsage.mock.calls.length;
    await unmount();
    appEvents.emit(EVENTS.RELOAD_ALL);
    await act(async () => { await Promise.resolve(); });
    expect(OperationsDB.getRecentCategoryUsage.mock.calls.length).toBe(callsBefore);
  });

  describe('Account-aware ranking', () => {
    beforeEach(() => {
      OperationsDB.getRecentCategoryUsage.mockResolvedValue([
        usage(1, 'rent', 20),
        usage(1, 'food', 10),
        usage(2, 'coffee', 3),
      ]);
    });

    it('puts what was booked from the account first', async () => {
      const { result } = await renderHook(() => useTopCategoryIds(10, 2));
      await waitFor(() => expect(result.current).toEqual(['coffee', 'rent', 'food']));
    });

    it('re-ranks without a new query when the account changes', async () => {
      const { result, rerender } = await renderHook(
        ({ accountId }) => useTopCategoryIds(10, accountId),
        { initialProps: { accountId: 1 } },
      );
      await waitFor(() => expect(result.current).toEqual(['rent', 'food', 'coffee']));

      await rerender({ accountId: 2 });

      // Synchronous: the grid follows an account tap at once, not a query later.
      expect(result.current).toEqual(['coffee', 'rent', 'food']);
      expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(1);
    });

    it('falls back to the overall ranking for an account without history', async () => {
      const { result } = await renderHook(() => useTopCategoryIds(10, 99));
      await waitFor(() => expect(result.current).toEqual(['rent', 'food', 'coffee']));
    });
  });

  describe('Shared across consumers', () => {
    it('issues one query however many consumers mount', async () => {
      // The Operations screen mounts two: the quick-add form's category
      // shortcuts and the notification binding card. They used to issue the
      // identical query twice, on mount and again on every operation change.
      const { result } = await renderHook(() => ({
        a: useTopCategoryIds(),
        b: useTopCategoryIds(),
      }));

      await waitFor(() => expect(result.current.a).toEqual(['c1', 'c2']));
      expect(result.current.b).toEqual(['c1', 'c2']);
      expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(1);
    });

    it('reloads once per event, not once per consumer', async () => {
      await renderHook(() => ({
        a: useTopCategoryIds(),
        b: useTopCategoryIds(),
        c: useTopCategoryIds(),
      }));
      await waitFor(() => expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(1));

      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

      await waitFor(() => expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(2));
    });

    it('shares one query across limits and accounts', async () => {
      const { result } = await renderHook(() => ({
        a: useTopCategoryIds(10),
        b: useTopCategoryIds(1),
        c: useTopCategoryIds(10, 1),
      }));

      await waitFor(() => expect(result.current.a).toEqual(['c1', 'c2']));
      expect(result.current.b).toEqual(['c1']);
      expect(result.current.c).toEqual(['c1', 'c2']);
      expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(1);
    });

    it('does not drop an event that lands while a load is in flight', async () => {
      let settle;
      OperationsDB.getRecentCategoryUsage.mockReturnValueOnce(
        new Promise((resolve) => { settle = resolve; }),
      );

      await renderHook(() => useTopCategoryIds());
      await waitFor(() => expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(1));

      // An operation is booked while the first query is still running.
      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });
      await act(async () => { settle([usage(1, 'c1', 1)]); });

      // The frequencies shifted, so the in-flight result is not the last word.
      await waitFor(() => expect(OperationsDB.getRecentCategoryUsage).toHaveBeenCalledTimes(2));
    });
  });
});

describe('rankTopCategoryIds', () => {
  it('sums a category across accounts for the overall ranking', () => {
    const rows = [
      usage(1, 'food', 5),
      usage(1, 'rent', 4),
      usage(2, 'rent', 4),
    ];
    expect(rankTopCategoryIds(rows, 10)).toEqual(['rent', 'food']);
  });

  it('lists expense ids before income ids, each capped at the limit', () => {
    const rows = [
      usage(1, 'salary', 30, { type: 'income' }),
      usage(1, 'bonus', 2, { type: 'income' }),
      usage(1, 'food', 9),
      usage(1, 'taxi', 5),
      usage(1, 'cinema', 1),
    ];
    expect(rankTopCategoryIds(rows, 2)).toEqual(['food', 'taxi', 'salary', 'bonus']);
  });

  it('breaks ties by the most recently used category', () => {
    const rows = [
      usage(1, 'old', 2, { lastDate: '2026-07-01' }),
      usage(1, 'new', 2, { lastDate: '2026-09-15' }),
    ];
    expect(rankTopCategoryIds(rows, 10)).toEqual(['new', 'old']);
  });

  it('puts the account\'s own history first, then the overall ranking without duplicates', () => {
    const rows = [
      usage(1, 'rent', 20),
      usage(1, 'food', 10),
      usage(2, 'food', 2),
      usage(2, 'coffee', 1),
    ];
    expect(rankTopCategoryIds(rows, 10, 2)).toEqual(['food', 'coffee', 'rent']);
  });

  it('keeps per-type order when the account has history of both types', () => {
    const rows = [
      usage(1, 'rent', 20),
      usage(1, 'salary', 20, { type: 'income' }),
      usage(2, 'coffee', 1),
      usage(2, 'refund', 1, { type: 'income' }),
    ];
    const ids = rankTopCategoryIds(rows, 10, 2);
    expect(ids.filter(id => ['rent', 'coffee'].includes(id))).toEqual(['coffee', 'rent']);
    expect(ids.filter(id => ['salary', 'refund'].includes(id))).toEqual(['refund', 'salary']);
  });

  it('matches an account id held as a string against an integer row id', () => {
    const rows = [usage(1, 'rent', 20), usage(2, 'coffee', 1)];
    expect(rankTopCategoryIds(rows, 10, '2')).toEqual(['coffee', 'rent']);
  });

  it('ignores an empty account id', () => {
    const rows = [usage(1, 'rent', 20), usage(2, 'coffee', 1)];
    expect(rankTopCategoryIds(rows, 10, '')).toEqual(['rent', 'coffee']);
  });

  it('returns [] for no rows', () => {
    expect(rankTopCategoryIds([], 10, 1)).toEqual([]);
  });
});
