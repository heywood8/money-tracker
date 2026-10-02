import { renderHook, waitFor } from '@testing-library/react-native';
import useSourceCategoryIds from '../../app/hooks/useSourceCategoryIds';
import * as OperationsDB from '../../app/services/OperationsDB';

jest.mock('../../app/services/OperationsDB', () => ({
  getCategoryIdsForPayees: jest.fn(),
}));

const ITEM = { merchant: 'AMERIABANK API GATE', type: 'expense' };

describe('useSourceCategoryIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    OperationsDB.getCategoryIdsForPayees.mockResolvedValue(['taxi', 'cafe']);
  });

  it('loads the categories the source was booked under', async () => {
    const { result } = await renderHook(() => useSourceCategoryIds(ITEM, 'Ameria Gate'));
    await waitFor(() => expect(result.current).toEqual(['taxi', 'cafe']));
    expect(OperationsDB.getCategoryIdsForPayees).toHaveBeenCalledWith(
      'expense',
      ['AMERIABANK API GATE', 'Ameriabank Api Gate', 'Ameria Gate'],
    );
  });

  it('does not query while disabled', async () => {
    const { result } = await renderHook(() => useSourceCategoryIds(ITEM, '', false));
    expect(result.current).toEqual([]);
    expect(OperationsDB.getCategoryIdsForPayees).not.toHaveBeenCalled();
  });

  it('does not query for an item with no merchant', async () => {
    const { result } = await renderHook(() => useSourceCategoryIds({ type: 'expense' }));
    expect(result.current).toEqual([]);
    expect(OperationsDB.getCategoryIdsForPayees).not.toHaveBeenCalled();
  });

  it('degrades to an empty list when the lookup fails', async () => {
    OperationsDB.getCategoryIdsForPayees.mockRejectedValue(new Error('db down'));
    const { result } = await renderHook(() => useSourceCategoryIds(ITEM));
    await waitFor(() => expect(OperationsDB.getCategoryIdsForPayees).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
