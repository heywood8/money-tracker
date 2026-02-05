import { renderHook, act, waitFor } from '@testing-library/react-native';
import useExpenseData from '../../app/hooks/useExpenseData';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';

// Mock the services
jest.mock('../../app/services/OperationsDB', () => ({
  getSpendingByCategoryAndCurrency: jest.fn(),
}));

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
}));

describe('useExpenseData', () => {
  const mockYear = 2024;
  const mockMonth = 0; // January
  const mockCurrency = 'USD';
  const mockColors = { text: '#000000' };
  const mockT = (key) => key;

  const mockCategories = [
    { id: 'cat-1', name: 'Food', parentId: null, icon: 'food', categoryType: 'expense', isShadow: false },
    { id: 'cat-2', name: 'Groceries', parentId: 'cat-1', icon: 'cart', categoryType: 'expense', isShadow: false },
    { id: 'cat-3', name: 'Transport', parentId: null, icon: 'car', categoryType: 'expense', isShadow: false },
    { id: 'cat-4', name: 'Shadow', parentId: null, icon: 'ghost', categoryType: 'expense', isShadow: true },
    { id: 'cat-5', name: 'Other', parentId: null, icon: 'dots-horizontal', categoryType: 'expense', isShadow: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      expect(result.current.chartData).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.totalExpenses).toBe(0);
    });
  });

  describe('loadExpenseData', () => {
    it('should return early if no currency selected', async () => {
      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, null, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      expect(OperationsDB.getSpendingByCategoryAndCurrency).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });

    it('should load expense data for a single month', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '500' },
        { category_id: 'cat-3', total: '300' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(OperationsDB.getSpendingByCategoryAndCurrency).toHaveBeenCalledWith(
        mockCurrency,
        '2024-01-01',
        '2024-01-31',
        null,
      );
      expect(result.current.chartData.length).toBeGreaterThan(0);
    });

    it('should load expense data for full year', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '5000' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, null, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(OperationsDB.getSpendingByCategoryAndCurrency).toHaveBeenCalledWith(
        mockCurrency,
        '2024-01-01',
        '2024-12-31',
        null,
      );
    });

    it('should aggregate spending by root folders when "all" selected', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '500' }, // Groceries (child of Food)
        { category_id: 'cat-3', total: '300' }, // Transport (root)
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should aggregate Groceries under Food
      const foodItem = result.current.chartData.find(item => item.name === 'Food');
      expect(foodItem).toBeDefined();
      expect(foodItem.amount).toBe(500);

      const transportItem = result.current.chartData.find(item => item.name === 'Transport');
      expect(transportItem).toBeDefined();
      expect(transportItem.amount).toBe(300);
    });

    it('should show immediate children when specific folder selected', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '500' }, // Groceries (child of Food)
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'cat-1', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should show Groceries as immediate child of Food
      expect(result.current.chartData.length).toBe(1);
      expect(result.current.chartData[0].name).toBe('Groceries');
      expect(result.current.chartData[0].amount).toBe(500);
    });

    it('should separate shadow categories from regular categories', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '500' }, // Regular category
        { category_id: 'cat-4', total: '100' }, // Shadow category
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should include balance_adjustments entry for shadow category
      const balanceAdjustments = result.current.chartData.find(item => item.name === 'balance_adjustments');
      expect(balanceAdjustments).toBeDefined();
      expect(balanceAdjustments.amount).toBe(100);
    });

    it('should only show balance adjustments in root "all" view', async () => {
      const mockSpending = [
        { category_id: 'cat-4', total: '100' }, // Shadow category
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'cat-1', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not show balance adjustments when not in "all" view
      const balanceAdjustments = result.current.chartData.find(item => item.name === 'balance_adjustments');
      expect(balanceAdjustments).toBeUndefined();
    });

    it('should sort chart data by amount descending', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '100' },
        { category_id: 'cat-3', total: '500' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First item should have highest amount
      expect(result.current.chartData[0].amount).toBeGreaterThanOrEqual(
        result.current.chartData[result.current.chartData.length - 1].amount,
      );
    });

    it('should include category icon and ID in chart data', async () => {
      const mockSpending = [
        { category_id: 'cat-3', total: '300' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.chartData[0]).toMatchObject({
        name: 'Transport',
        amount: 300,
        icon: 'car',
        categoryId: 'cat-3',
      });
    });

    it('should handle errors gracefully', async () => {
      OperationsDB.getSpendingByCategoryAndCurrency.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(console.error).toHaveBeenCalledWith('Failed to load expense data:', expect.any(Error));
      });
    });
  });

  describe('totalExpenses', () => {
    it('should calculate total expenses from chart data', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '500' },
        { category_id: 'cat-3', total: '300' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.totalExpenses).toBe(800);
    });

    it('should return 0 for empty chart data', () => {
      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      expect(result.current.totalExpenses).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty spending data', async () => {
      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.chartData).toEqual([]);
        expect(result.current.totalExpenses).toBe(0);
      });
    });

    it('should handle category with no parent', async () => {
      const mockSpending = [
        { category_id: 'cat-orphan', total: '100' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        // Should not crash, just skip the orphan category
      });
    });

  });

  describe('Regression Tests', () => {
    it('should handle zero amounts correctly', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '0' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.totalExpenses).toBe(0);
      });
    });

    it('should handle decimal amounts correctly', async () => {
      const mockSpending = [
        { category_id: 'cat-2', total: '123.45' },
        { category_id: 'cat-3', total: '67.89' },
      ];

      OperationsDB.getSpendingByCategoryAndCurrency.mockResolvedValue(mockSpending);

      const { result } = renderHook(() =>
        useExpenseData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadExpenseData();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.totalExpenses).toBeCloseTo(191.34, 2);
      });
    });
  });
});
