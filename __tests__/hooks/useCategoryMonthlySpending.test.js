import { renderHook, act, waitFor } from '@testing-library/react-native';
import useCategoryMonthlySpending from '../../app/hooks/useCategoryMonthlySpending';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock the services
jest.mock('../../app/services/OperationsDB', () => ({
  getLast12MonthsSpendingByCategories: jest.fn(),
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
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.monthlyData).toEqual([]);
      expect(result.current.totalYearlySpending).toBe(0);
    });
  });

  describe('Data Loading', () => {
    it('should load data for last 12 months', async () => {
      const mockDescendants = [
        { id: 'cat-groceries' },
        { id: 'cat-restaurants' },
      ];
      const mockSpending = [
        { yearMonth: '2024-01', total: 100 },
        { yearMonth: '2024-03', total: 200 },
        { yearMonth: '2024-06', total: 150 },
      ];

      CategoriesDB.getAllDescendants.mockResolvedValue(mockDescendants);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have 12 months
      expect(result.current.monthlyData).toHaveLength(12);
      // Each item should have yearMonth, year, month, and total
      expect(result.current.monthlyData[0]).toHaveProperty('yearMonth');
      expect(result.current.monthlyData[0]).toHaveProperty('year');
      expect(result.current.monthlyData[0]).toHaveProperty('month');
      expect(result.current.monthlyData[0]).toHaveProperty('total');
    });

    it('should return 0 for months with no spending', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // All months should have total 0
      result.current.monthlyData.forEach(item => {
        expect(item.total).toBe(0);
      });
    });

    it('should aggregate descendant categories', async () => {
      const mockDescendants = [
        { id: 'cat-groceries' },
        { id: 'cat-restaurants' },
      ];

      CategoriesDB.getAllDescendants.mockResolvedValue(mockDescendants);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should include selected category + descendants
      expect(OperationsDB.getLast12MonthsSpendingByCategories).toHaveBeenCalledWith(
        mockCurrency,
        [mockCategoryId, 'cat-groceries', 'cat-restaurants'],
      );
    });

    it('should filter by selected currency', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      renderHook(() =>
        useCategoryMonthlySpending('EUR', mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(OperationsDB.getLast12MonthsSpendingByCategories).toHaveBeenCalledWith(
          'EUR',
          [mockCategoryId],
        );
      });
    });

    it('should calculate yearly total correctly', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);

      // Generate mock data that matches the last 12 months format
      const now = new Date();
      const mockSpending = [];
      for (let i = 0; i < 4; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        mockSpending.push({ yearMonth, total: 100 + i * 50 });
      }

      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Total should be sum of all months with data
      const expectedTotal = mockSpending.reduce((sum, item) => sum + item.total, 0);
      expect(result.current.totalYearlySpending).toBe(expectedTotal);
    });
  });

  describe('Event Handling', () => {
    it('should subscribe to OPERATION_CHANGED event', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
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
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { unmount } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty categories array', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, []),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toHaveLength(12);
    });

    it('should handle null selectedCategoryId', async () => {
      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, null, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(OperationsDB.getLast12MonthsSpendingByCategories).not.toHaveBeenCalled();
    });

    it('should handle empty currency', async () => {
      const { result } = renderHook(() =>
        useCategoryMonthlySpending('', mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(OperationsDB.getLast12MonthsSpendingByCategories).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      CategoriesDB.getAllDescendants.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
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
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
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
      expect(OperationsDB.getLast12MonthsSpendingByCategories.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Dependency Changes', () => {
    it('should reload data when currency changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ currency }) => useCategoryMonthlySpending(currency, mockCategoryId, mockCategories),
        { initialProps: { currency: 'USD' } },
      );

      await waitFor(() => {
        expect(OperationsDB.getLast12MonthsSpendingByCategories).toHaveBeenCalledWith(
          'USD',
          [mockCategoryId],
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      rerender({ currency: 'EUR' });

      await waitFor(() => {
        expect(OperationsDB.getLast12MonthsSpendingByCategories).toHaveBeenCalledWith(
          'EUR',
          [mockCategoryId],
        );
      });
    });

    it('should reload data when categoryId changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ categoryId }) => useCategoryMonthlySpending(mockCurrency, categoryId, mockCategories),
        { initialProps: { categoryId: 'cat-food' } },
      );

      await waitFor(() => {
        expect(OperationsDB.getLast12MonthsSpendingByCategories).toHaveBeenCalledWith(
          mockCurrency,
          ['cat-food'],
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getLast12MonthsSpendingByCategories.mockResolvedValue([]);

      rerender({ categoryId: 'cat-transport' });

      await waitFor(() => {
        expect(OperationsDB.getLast12MonthsSpendingByCategories).toHaveBeenCalledWith(
          mockCurrency,
          ['cat-transport'],
        );
      });
    });
  });
});
