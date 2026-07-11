import { renderHook, act, waitFor } from '@testing-library/react-native';
import useTopCategoryIds from '../../app/hooks/useTopCategoryIds';
import * as OperationsDB from '../../app/services/OperationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/OperationsDB', () => ({
  getTopCategoriesFromLastMonth: jest.fn(),
}));

describe('useTopCategoryIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
