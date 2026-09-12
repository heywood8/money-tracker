import { renderHook, act, waitFor } from '@testing-library/react-native';
import useTopCategoryIds, { __resetTopCategoryStores } from '../../app/hooks/useTopCategoryIds';
import * as OperationsDB from '../../app/services/OperationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/OperationsDB', () => ({
  getTopCategoriesFromLastMonth: jest.fn(),
}));

describe('useTopCategoryIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The shared per-limit store lives at module scope so several consumers
    // collapse onto one query; it therefore outlives a test's render.
    __resetTopCategoryStores();
    OperationsDB.getTopCategoriesFromLastMonth.mockResolvedValue([
      { categoryId: 'c1', count: 9 },
      { categoryId: 'c2', count: 4 },
    ]);
  });

  it('loads the frequency-ordered ids on mount', async () => {
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(result.current).toEqual(['c1', 'c2']));
    expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledWith(10);
  });

  it('degrades to an empty list when the query fails', async () => {
    OperationsDB.getTopCategoriesFromLastMonth.mockRejectedValue(new Error('db down'));
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('drops rows without a category id', async () => {
    OperationsDB.getTopCategoriesFromLastMonth.mockResolvedValue([
      { categoryId: 'c1', count: 9 },
      { categoryId: null, count: 2 },
    ]);
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(result.current).toEqual(['c1']));
  });

  it('reloads when an operation changes', async () => {
    const { result } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(result.current).toEqual(['c1', 'c2']));

    OperationsDB.getTopCategoriesFromLastMonth.mockResolvedValue([{ categoryId: 'c9', count: 1 }]);
    await act(async () => {
      appEvents.emit(EVENTS.OPERATION_CHANGED);
    });
    await waitFor(() => expect(result.current).toEqual(['c9']));
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = await renderHook(() => useTopCategoryIds());
    await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalled());
    const callsBefore = OperationsDB.getTopCategoriesFromLastMonth.mock.calls.length;
    await unmount();
    appEvents.emit(EVENTS.RELOAD_ALL);
    await act(async () => { await Promise.resolve(); });
    expect(OperationsDB.getTopCategoriesFromLastMonth.mock.calls.length).toBe(callsBefore);
  });

  describe('Shared across consumers', () => {
    it('issues one query however many consumers mount', async () => {
      // The Operations screen mounts two: the quick-add form's category
      // shortcuts and the standalone hook. They used to issue the identical
      // query twice, on mount and again on every operation change.
      const { result } = await renderHook(() => ({
        a: useTopCategoryIds(),
        b: useTopCategoryIds(),
      }));

      await waitFor(() => expect(result.current.a).toEqual(['c1', 'c2']));
      expect(result.current.b).toEqual(['c1', 'c2']);
      expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledTimes(1);
    });

    it('reloads once per event, not once per consumer', async () => {
      await renderHook(() => ({
        a: useTopCategoryIds(),
        b: useTopCategoryIds(),
        c: useTopCategoryIds(),
      }));
      await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledTimes(1));

      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });

      await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledTimes(2));
    });

    it('keeps a different limit on its own store', async () => {
      await renderHook(() => ({
        a: useTopCategoryIds(10),
        b: useTopCategoryIds(4),
      }));

      await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledTimes(2));
      expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledWith(10);
      expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledWith(4);
    });

    it('does not drop an event that lands while a load is in flight', async () => {
      let settle;
      OperationsDB.getTopCategoriesFromLastMonth.mockReturnValueOnce(
        new Promise((resolve) => { settle = resolve; }),
      );

      await renderHook(() => useTopCategoryIds());
      await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledTimes(1));

      // An operation is booked while the first query is still running.
      await act(async () => { appEvents.emit(EVENTS.OPERATION_CHANGED); });
      await act(async () => { settle([{ categoryId: 'c1', count: 1 }]); });

      // The frequencies shifted, so the in-flight result is not the last word.
      await waitFor(() => expect(OperationsDB.getTopCategoriesFromLastMonth).toHaveBeenCalledTimes(2));
    });
  });

});
