import { renderHook, act, waitFor } from '@testing-library/react-native';
import useCategoryMonthlySpending from '../../app/hooks/useCategoryMonthlySpending';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock the services
jest.mock('../../app/services/OperationsDB', () => ({
  getMonthlySpendingByCategories: jest.fn(),
}));

jest.mock('../../app/services/CategoriesDB', () => ({
  getAllDescendants: jest.fn(),
}));

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(() => jest.fn()),
  },
  EVENTS: {
    OPERATION_CHANGED: 'operation:changed',
  },
}));

describe('useCategoryMonthlySpending', () => {
  const mockYear = 2024;
  const mockCurrency = 'USD';
  const mockCategoryId = 'cat-food';

  const mockCategories = [
    { id: 'cat-food', name: 'Food', parentId: null, categoryType: 'expense' },
    { id: 'cat-groceries', name: 'Groceries', parentId: 'cat-food', categoryType: 'expense' },
    { id: 'cat-restaurants', name: 'Restaurants', parentId: 'cat-food', categoryType: 'expense' },
    { id: 'cat-transport', name: 'Transport', parentId: null, categoryType: 'expense' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize with loading=true and empty data', () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.monthlyData).toEqual([]);
      expect(result.current.totalYearlySpending).toBe(0);
    });
  });

  describe('Data Loading', () => {
    it('should load data for all 12 months', async () => {
      const mockDescendants = [
        { id: 'cat-groceries' },
        { id: 'cat-restaurants' },
      ];
      const mockSpending = [
        { month: 1, total: 100 },
        { month: 3, total: 200 },
        { month: 6, total: 150 },
      ];

      CategoriesDB.getAllDescendants.mockResolvedValue(mockDescendants);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have 12 months
      expect(result.current.monthlyData).toHaveLength(12);
      // Check specific months have data
      expect(result.current.monthlyData[0]).toEqual({ month: 1, total: 100 });
      expect(result.current.monthlyData[2]).toEqual({ month: 3, total: 200 });
      expect(result.current.monthlyData[5]).toEqual({ month: 6, total: 150 });
    });

    it('should return 0 for months with no spending', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([
        { month: 3, total: 100 },
      ]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Months without data should be 0
      expect(result.current.monthlyData[0]).toEqual({ month: 1, total: 0 });
      expect(result.current.monthlyData[1]).toEqual({ month: 2, total: 0 });
      // Month 3 should have data
      expect(result.current.monthlyData[2]).toEqual({ month: 3, total: 100 });
    });

    it('should aggregate descendant categories', async () => {
      const mockDescendants = [
        { id: 'cat-groceries' },
        { id: 'cat-restaurants' },
      ];

      CategoriesDB.getAllDescendants.mockResolvedValue(mockDescendants);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should include selected category + descendants
      expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
        mockCurrency,
        mockYear,
        [mockCategoryId, 'cat-groceries', 'cat-restaurants'],
      );
    });

    it('should filter by selected currency', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      renderHook(() =>
        useCategoryMonthlySpending(mockYear, 'EUR', mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          'EUR',
          mockYear,
          [mockCategoryId],
        );
      });
    });

    it('should calculate yearly total correctly', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([
        { month: 1, total: 100 },
        { month: 3, total: 200 },
        { month: 6, total: 150 },
        { month: 12, total: 50 },
      ]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalYearlySpending).toBe(500);
    });
  });

  describe('Event Handling', () => {
    it('should subscribe to OPERATION_CHANGED event', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      expect(appEvents.on).toHaveBeenCalledWith(
        EVENTS.OPERATION_CHANGED,
        expect.any(Function),
      );
    });

    it('should unsubscribe on unmount', async () => {
      const unsubscribe = jest.fn();
      appEvents.on.mockReturnValue(unsubscribe);

      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { unmount } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty categories array', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, []),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toHaveLength(12);
    });

    it('should handle null selectedCategoryId', async () => {
      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, null, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(OperationsDB.getMonthlySpendingByCategories).not.toHaveBeenCalled();
    });

    it('should handle empty currency', async () => {
      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, '', mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(OperationsDB.getMonthlySpendingByCategories).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      CategoriesDB.getAllDescendants.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to load category monthly spending:',
        expect.any(Error),
      );
    });
  });

  describe('loadData function', () => {
    it('should expose loadData function for manual refresh', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockYear, mockCurrency, mockCategoryId, mockCategories),
      );

      expect(typeof result.current.loadData).toBe('function');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Call loadData again
      await act(async () => {
        await result.current.loadData();
      });

      // Should have been called at least twice (initial + manual)
      expect(OperationsDB.getMonthlySpendingByCategories.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Dependency Changes', () => {
    it('should reload data when year changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ year }) => useCategoryMonthlySpending(year, mockCurrency, mockCategoryId, mockCategories),
        { initialProps: { year: 2024 } },
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          mockCurrency,
          2024,
          [mockCategoryId],
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      rerender({ year: 2025 });

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          mockCurrency,
          2025,
          [mockCategoryId],
        );
      });
    });

    it('should reload data when currency changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ currency }) => useCategoryMonthlySpending(mockYear, currency, mockCategoryId, mockCategories),
        { initialProps: { currency: 'USD' } },
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          'USD',
          mockYear,
          [mockCategoryId],
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      rerender({ currency: 'EUR' });

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          'EUR',
          mockYear,
          [mockCategoryId],
        );
      });
    });

    it('should reload data when categoryId changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ categoryId }) => useCategoryMonthlySpending(mockYear, mockCurrency, categoryId, mockCategories),
        { initialProps: { categoryId: 'cat-food' } },
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          mockCurrency,
          mockYear,
          ['cat-food'],
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingByCategories.mockResolvedValue([]);

      rerender({ categoryId: 'cat-transport' });

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingByCategories).toHaveBeenCalledWith(
          mockCurrency,
          mockYear,
          ['cat-transport'],
        );
      });
    });
  });
});
