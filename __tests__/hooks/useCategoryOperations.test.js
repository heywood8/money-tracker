import { renderHook, act, waitFor } from '@testing-library/react-native';
import useCategoryOperations from '../../app/hooks/useCategoryOperations';
import * as OperationsDB from '../../app/services/OperationsDB';

jest.mock('../../app/services/OperationsDB', () => ({
  getOperationsByCategoryAndCurrency: jest.fn(),
}));

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
}));

let capturedOperationChangedCallback = null;
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn((event, cb) => {
      if (event === 'OPERATION_CHANGED') {
        capturedOperationChangedCallback = cb;
      }
      return jest.fn(); // unsubscribe no-op
    }),
  },
  EVENTS: {
    OPERATION_CHANGED: 'OPERATION_CHANGED',
  },
}));

describe('useCategoryOperations', () => {
  const year = 2024;
  const month = 0; // January
  const currency = 'USD';

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOperationChangedCallback = null;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('stays idle and does not query when no leaf category is selected', async () => {
    const { result } = await renderHook(() =>
      useCategoryOperations(year, month, currency, null, 'expense'),
    );

    await waitFor(() => expect(result.current.loadingOperations).toBe(false));
    expect(OperationsDB.getOperationsByCategoryAndCurrency).not.toHaveBeenCalled();
    expect(result.current.operations).toEqual([]);
  });

  it('does not query when currency is missing', async () => {
    const { result } = await renderHook(() =>
      useCategoryOperations(year, month, '', 'cat-1', 'expense'),
    );

    await waitFor(() => expect(result.current.loadingOperations).toBe(false));
    expect(OperationsDB.getOperationsByCategoryAndCurrency).not.toHaveBeenCalled();
  });

  it('loads operations for a single month with the correct bounds', async () => {
    const ops = [{ id: '1', amount: '10', date: '2024-01-05' }];
    OperationsDB.getOperationsByCategoryAndCurrency.mockResolvedValue(ops);

    const { result } = await renderHook(() =>
      useCategoryOperations(year, month, currency, 'cat-1', 'expense'),
    );

    await waitFor(() => expect(result.current.operations).toEqual(ops));
    expect(OperationsDB.getOperationsByCategoryAndCurrency).toHaveBeenCalledWith(
      'cat-1',
      'USD',
      '2024-01-01',
      '2024-01-31',
      'expense',
    );
  });

  it('uses full-year bounds when month is null', async () => {
    OperationsDB.getOperationsByCategoryAndCurrency.mockResolvedValue([]);

    const { result } = await renderHook(() =>
      useCategoryOperations(year, null, currency, 'cat-1', 'income'),
    );

    await waitFor(() => expect(result.current.loadingOperations).toBe(false));
    expect(OperationsDB.getOperationsByCategoryAndCurrency).toHaveBeenCalledWith(
      'cat-1',
      'USD',
      '2024-01-01',
      '2024-12-31',
      'income',
    );
  });

  it('reloads when OPERATION_CHANGED fires', async () => {
    OperationsDB.getOperationsByCategoryAndCurrency
      .mockResolvedValueOnce([{ id: '1', amount: '10', date: '2024-01-05' }])
      .mockResolvedValueOnce([{ id: '2', amount: '20', date: '2024-01-06' }]);

    const { result } = await renderHook(() =>
      useCategoryOperations(year, month, currency, 'cat-1', 'expense'),
    );

    await waitFor(() => expect(result.current.operations.length).toBe(1));
    expect(capturedOperationChangedCallback).not.toBeNull();

    await act(async () => {
      await capturedOperationChangedCallback();
    });

    await waitFor(() => expect(result.current.operations[0].id).toBe('2'));
    expect(OperationsDB.getOperationsByCategoryAndCurrency).toHaveBeenCalledTimes(2);
  });

  it('handles errors gracefully', async () => {
    OperationsDB.getOperationsByCategoryAndCurrency.mockRejectedValue(new Error('boom'));

    const { result } = await renderHook(() =>
      useCategoryOperations(year, month, currency, 'cat-1', 'expense'),
    );

    await waitFor(() => expect(result.current.loadingOperations).toBe(false));
    expect(result.current.operations).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Failed to load category operations:', expect.any(Error));
  });
});
