import { renderHook, act, waitFor } from '@testing-library/react-native';
import useCategoryMonthlySpending, { ALL_EXPENSE_CATEGORIES, buildMonthWindow } from '../../app/hooks/useCategoryMonthlySpending';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock the services
jest.mock('../../app/services/OperationsDB', () => ({
  getMonthlySpendingHistoryByCategories: jest.fn(),
  getEarliestExpenseMonth: jest.fn(),
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
    // No history by default: the window falls back to the rolling 12 months.
    OperationsDB.getEarliestExpenseMonth.mockResolvedValue(null);
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize with loading=true and empty data', async () => {
      // Use a pending promise so effects never complete, keeping loading=true
      CategoriesDB.getAllDescendants.mockReturnValue(new Promise(() => {}));
      OperationsDB.getMonthlySpendingHistoryByCategories.mockReturnValue(new Promise(() => {}));

      const { result } = await renderHook(() =>
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
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue(mockSpending);

      const { result } = await renderHook(() =>
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
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { result } = await renderHook(() =>
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
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { result } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should include selected category + descendants
      expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
        mockCurrency,
        [mockCategoryId, 'cat-groceries', 'cat-restaurants'],
        false,
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );
    });

    it('should query every expense without a category filter for ALL_EXPENSE_CATEGORIES', async () => {
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { result } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, ALL_EXPENSE_CATEGORIES, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // null = no category filter at all, so uncategorised expenses count too
      expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
        mockCurrency,
        null,
        false,
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );
      expect(CategoriesDB.getAllDescendants).not.toHaveBeenCalled();
    });

    it('should filter by selected currency', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      await renderHook(() =>
        useCategoryMonthlySpending('EUR', mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
          'EUR',
          [mockCategoryId],
          false,
          expect.stringMatching(/^\d{4}-\d{2}$/),
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

      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue(mockSpending);

      const { result } = await renderHook(() =>
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

  describe('History window', () => {
    it('reaches back to the first expense ever recorded', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);
      const now = new Date();
      const start = new Date(now.getFullYear() - 2, now.getMonth(), 1);
      const startYearMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      OperationsDB.getEarliestExpenseMonth.mockResolvedValue(startYearMonth);

      const { result } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Two years back, inclusive of both ends.
      expect(result.current.monthlyData).toHaveLength(25);
      expect(result.current.monthlyData[0].yearMonth).toBe(startYearMonth);
      // The query is bounded by the same month the window starts at, so no
      // spending can land outside a bar.
      expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
        mockCurrency,
        [mockCategoryId],
        false,
        startYearMonth,
      );
    });

    it('does not shrink below a year for a brand-new ledger', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      OperationsDB.getEarliestExpenseMonth.mockResolvedValue(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      );

      const { result } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toHaveLength(12);
    });
  });

  describe('buildMonthWindow', () => {
    const june2025 = new Date(2025, 5, 15);

    it('ends on the current month', () => {
      const months = buildMonthWindow(null, june2025);
      expect(months[months.length - 1]).toEqual({ yearMonth: '2025-06', year: 2025, month: 5 });
    });

    it('runs the last 12 months when there is no history', () => {
      const months = buildMonthWindow(null, june2025);
      expect(months).toHaveLength(12);
      expect(months[0].yearMonth).toBe('2024-07');
    });

    it('crosses year boundaries without skipping a month', () => {
      const months = buildMonthWindow('2023-11', june2025);
      expect(months).toHaveLength(20);
      expect(months.slice(0, 4).map(m => m.yearMonth)).toEqual([
        '2023-11', '2023-12', '2024-01', '2024-02',
      ]);
      expect(months[2]).toEqual({ yearMonth: '2024-01', year: 2024, month: 0 });
    });

    it('pads a start inside the 12-month floor back out to a year', () => {
      const months = buildMonthWindow('2024-11', june2025);
      expect(months).toHaveLength(12);
      expect(months[0].yearMonth).toBe('2024-07');
    });

    it('caps a nonsense start date instead of building thousands of columns', () => {
      const months = buildMonthWindow('1600-01', june2025);
      expect(months).toHaveLength(240);
    });

    it('ignores an unparseable start date', () => {
      expect(buildMonthWindow('not-a-month', june2025)).toHaveLength(12);
    });
  });

  describe('Event Handling', () => {
    it('should subscribe to OPERATION_CHANGED event', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      await renderHook(() =>
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
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { unmount } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, mockCategories),
      );

      await unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty categories array', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { result } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, mockCategoryId, []),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toHaveLength(12);
    });

    it('should handle null selectedCategoryId', async () => {
      const { result } = await renderHook(() =>
        useCategoryMonthlySpending(mockCurrency, null, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(OperationsDB.getMonthlySpendingHistoryByCategories).not.toHaveBeenCalled();
    });

    it('should handle empty currency', async () => {
      const { result } = await renderHook(() =>
        useCategoryMonthlySpending('', mockCategoryId, mockCategories),
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.monthlyData).toEqual([]);
      expect(OperationsDB.getMonthlySpendingHistoryByCategories).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      CategoriesDB.getAllDescendants.mockRejectedValue(new Error('Database error'));

      const { result } = await renderHook(() =>
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
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { result } = await renderHook(() =>
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
      expect(OperationsDB.getMonthlySpendingHistoryByCategories.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Dependency Changes', () => {
    it('should reload data when currency changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { rerender } = await renderHook(
        ({ currency }) => useCategoryMonthlySpending(currency, mockCategoryId, mockCategories),
        { initialProps: { currency: 'USD' } },
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
          'USD',
          [mockCategoryId],
          false,
          expect.stringMatching(/^\d{4}-\d{2}$/),
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      rerender({ currency: 'EUR' });

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
          'EUR',
          [mockCategoryId],
          false,
          expect.stringMatching(/^\d{4}-\d{2}$/),
        );
      });
    });

    it('should reload data when categoryId changes', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      const { rerender } = await renderHook(
        ({ categoryId }) => useCategoryMonthlySpending(mockCurrency, categoryId, mockCategories),
        { initialProps: { categoryId: 'cat-food' } },
      );

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
          mockCurrency,
          ['cat-food'],
          false,
          expect.stringMatching(/^\d{4}-\d{2}$/),
        );
      });

      jest.clearAllMocks();
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      OperationsDB.getMonthlySpendingHistoryByCategories.mockResolvedValue([]);

      rerender({ categoryId: 'cat-transport' });

      await waitFor(() => {
        expect(OperationsDB.getMonthlySpendingHistoryByCategories).toHaveBeenCalledWith(
          mockCurrency,
          ['cat-transport'],
          false,
          expect.stringMatching(/^\d{4}-\d{2}$/),
        );
      });
    });
  });
});
