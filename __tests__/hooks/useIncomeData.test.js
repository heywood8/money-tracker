import { renderHook, act, waitFor } from '@testing-library/react-native';
import useIncomeData from '../../app/hooks/useIncomeData';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';

// Mock the services
jest.mock('../../app/services/OperationsDB', () => ({
  getIncomeByCategoryAndCurrency: jest.fn(),
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

describe('useIncomeData', () => {
  const mockYear = 2024;
  const mockMonth = 0; // January
  const mockCurrency = 'USD';
  const mockColors = { text: '#000000' };
  const mockT = (key) => key;

  const mockCategories = [
    { id: 'cat-1', name: 'Salary', parentId: null, icon: 'money', categoryType: 'income', isShadow: false },
    { id: 'cat-2', name: 'Main Job', parentId: 'cat-1', icon: 'briefcase', categoryType: 'income', isShadow: false },
    { id: 'cat-3', name: 'Freelance', parentId: null, icon: 'laptop', categoryType: 'income', isShadow: false },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOperationChangedCallback = null;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      expect(result.current.incomeChartData).toEqual([]);
      expect(result.current.loadingIncome).toBe(true);
      expect(result.current.totalIncome).toBe(0);
    });
  });

  describe('loadIncomeData', () => {
    it('should return early if no currency selected', async () => {
      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, null, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      expect(OperationsDB.getIncomeByCategoryAndCurrency).not.toHaveBeenCalled();
      expect(result.current.loadingIncome).toBe(true);
    });

    it('should load income data for a single month', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '5000' },
        { category_id: 'cat-3', total: '1500' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      expect(OperationsDB.getIncomeByCategoryAndCurrency).toHaveBeenCalledWith(
        mockCurrency,
        '2024-01-01',
        '2024-01-31',
      );
      expect(result.current.incomeChartData.length).toBeGreaterThan(0);
    });

    it('should load income data for full year', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '60000' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, null, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      expect(OperationsDB.getIncomeByCategoryAndCurrency).toHaveBeenCalledWith(
        mockCurrency,
        '2024-01-01',
        '2024-12-31',
      );
    });

    it('should aggregate income by root folders when "all" selected', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '5000' }, // Main Job (child of Salary)
        { category_id: 'cat-3', total: '1500' }, // Freelance (root)
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      // Should aggregate Main Job under Salary
      const salaryItem = result.current.incomeChartData.find(item => item.name === 'Salary');
      expect(salaryItem).toBeDefined();
      expect(salaryItem.amount).toBe(5000);

      const freelanceItem = result.current.incomeChartData.find(item => item.name === 'Freelance');
      expect(freelanceItem).toBeDefined();
      expect(freelanceItem.amount).toBe(1500);
    });

    it('should show immediate children when specific folder selected', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '5000' }, // Main Job (child of Salary)
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'cat-1', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      // Should show Main Job as immediate child of Salary
      expect(result.current.incomeChartData.length).toBe(1);
      expect(result.current.incomeChartData[0].name).toBe('Main Job');
      expect(result.current.incomeChartData[0].amount).toBe(5000);
    });

    it('should sort chart data by amount descending', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '1000' },
        { category_id: 'cat-3', total: '5000' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      // First item should have highest amount
      expect(result.current.incomeChartData[0].amount).toBeGreaterThanOrEqual(
        result.current.incomeChartData[result.current.incomeChartData.length - 1].amount,
      );
    });

    it('should include category icon and ID in chart data', async () => {
      const mockIncome = [
        { category_id: 'cat-3', total: '1500' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      expect(result.current.incomeChartData[0]).toMatchObject({
        name: 'Freelance',
        amount: 1500,
        icon: 'laptop',
        categoryId: 'cat-3',
      });
    });

    it('should handle errors gracefully', async () => {
      OperationsDB.getIncomeByCategoryAndCurrency.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
        expect(console.error).toHaveBeenCalledWith('Failed to load income data:', expect.any(Error));
      });
    });
  });

  describe('totalIncome', () => {
    it('should calculate total income from chart data', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '5000' },
        { category_id: 'cat-3', total: '1500' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      expect(result.current.totalIncome).toBe(6500);
    });

    it('should return 0 for empty chart data', () => {
      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      expect(result.current.totalIncome).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty income data', async () => {
      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
        expect(result.current.incomeChartData).toEqual([]);
        expect(result.current.totalIncome).toBe(0);
      });
    });

    it('should handle category with no parent', async () => {
      const mockIncome = [
        { category_id: 'cat-orphan', total: '1000' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
        // Should not crash, just skip the orphan category
      });
    });

    it('should handle multiple levels of hierarchy', async () => {
      const categoriesWithDeepHierarchy = [
        { id: 'cat-1', name: 'Salary', parentId: null, icon: 'money', categoryType: 'income' },
        { id: 'cat-2', name: 'Main Job', parentId: 'cat-1', icon: 'briefcase', categoryType: 'income' },
        { id: 'cat-4', name: 'Bonus', parentId: 'cat-2', icon: 'gift', categoryType: 'income' },
      ];

      const mockIncome = [
        { category_id: 'cat-4', total: '1000' }, // Bonus (grandchild of Salary)
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', categoriesWithDeepHierarchy, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      // Should aggregate up to root level
      const salaryItem = result.current.incomeChartData.find(item => item.name === 'Salary');
      expect(salaryItem).toBeDefined();
      expect(salaryItem.amount).toBe(1000);
    });

    it('should handle income for specific subfolder', async () => {
      const categoriesWithDeepHierarchy = [
        { id: 'cat-1', name: 'Salary', parentId: null, icon: 'money', categoryType: 'income' },
        { id: 'cat-2', name: 'Main Job', parentId: 'cat-1', icon: 'briefcase', categoryType: 'income' },
        { id: 'cat-4', name: 'Bonus', parentId: 'cat-2', icon: 'gift', categoryType: 'income' },
      ];

      const mockIncome = [
        { category_id: 'cat-4', total: '1000' }, // Bonus (child of Main Job)
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'cat-2', categoriesWithDeepHierarchy, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      // Should show Bonus as immediate child of Main Job
      expect(result.current.incomeChartData.length).toBe(1);
      expect(result.current.incomeChartData[0].name).toBe('Bonus');
      expect(result.current.incomeChartData[0].amount).toBe(1000);
    });
  });

  describe('Regression Tests', () => {
    it('should handle zero amounts correctly', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '0' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
        expect(result.current.totalIncome).toBe(0);
      });
    });

    it('should handle decimal amounts correctly', async () => {
      const mockIncome = [
        { category_id: 'cat-2', total: '5432.10' },
        { category_id: 'cat-3', total: '1567.90' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
        expect(result.current.totalIncome).toBe(7000);
      });
    });

    it('should sum totalIncome without floating-point accumulation errors (#765)', async () => {
      // 0.1 + 0.2 in native JS = 0.30000000000000004; Decimal.js gives 0.3
      const mockIncome = [
        { category_id: 'cat-2', total: '0.10' },
        { category_id: 'cat-3', total: '0.20' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      // Must be exactly 0.3, not 0.30000000000000004
      expect(result.current.totalIncome).toBe(0.3);
    });

    it('should query all accounts for the currency without an account ID filter', async () => {
      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      expect(OperationsDB.getIncomeByCategoryAndCurrency).toHaveBeenCalledWith(
        mockCurrency,
        expect.any(String),
        expect.any(String),
      );
      expect(OperationsDB.getIncomeByCategoryAndCurrency).toHaveBeenCalledTimes(1);
      const callArgs = OperationsDB.getIncomeByCategoryAndCurrency.mock.calls[0];
      expect(callArgs).toHaveLength(3);
    });

    it('should roll up grandchild to immediate child when viewing subfolder', async () => {
      // Hierarchy: Salary > Main Job > Bonus
      // When viewing 'cat-1' (Salary), 'cat-4' (Bonus) should roll up to Main Job
      const deepCategories = [
        { id: 'cat-1', name: 'Salary', parentId: null, icon: 'money', categoryType: 'income' },
        { id: 'cat-2', name: 'Main Job', parentId: 'cat-1', icon: 'briefcase', categoryType: 'income' },
        { id: 'cat-4', name: 'Bonus', parentId: 'cat-2', icon: 'gift', categoryType: 'income' },
      ];
      const mockIncome = [
        { category_id: 'cat-4', total: '2000' }, // Bonus — grandchild of Salary, child of Main Job
      ];
      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'cat-1', deepCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });
      await waitFor(() => expect(result.current.loadingIncome).toBe(false));

      // Bonus is not a direct child of Salary — while-loop should roll it up to Main Job
      expect(result.current.incomeChartData).toHaveLength(1);
      expect(result.current.incomeChartData[0].name).toBe('Main Job');
      expect(result.current.incomeChartData[0].amount).toBe(2000);
    });

    it('should skip item in subfolder view when no ancestor matches selected category', async () => {
      // Freelance is in a completely different tree from cat-1 (Salary)
      const mockIncome = [
        { category_id: 'cat-3', total: '500' }, // Freelance — not under Salary at all
      ];
      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'cat-1', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });
      await waitFor(() => expect(result.current.loadingIncome).toBe(false));

      // No ancestor of Freelance matches Salary; chart should be empty
      expect(result.current.incomeChartData).toHaveLength(0);
    });

    it('should include income from multiple accounts in the same currency', async () => {
      // Simulates the DB returning rows that span multiple accounts for the currency
      const mockIncome = [
        { category_id: 'cat-2', total: '3000' }, // from account A
        { category_id: 'cat-2', total: '2000' }, // from account B, same category
        { category_id: 'cat-3', total: '1500' },
      ];

      OperationsDB.getIncomeByCategoryAndCurrency.mockResolvedValue(mockIncome);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });

      await waitFor(() => {
        expect(result.current.loadingIncome).toBe(false);
      });

      const salaryItem = result.current.incomeChartData.find(item => item.name === 'Salary');
      expect(salaryItem).toBeDefined();
      expect(salaryItem.amount).toBe(5000); // 3000 + 2000 aggregated across accounts

      expect(result.current.totalIncome).toBe(6500);
    });
  });

  describe('OPERATION_CHANGED event', () => {
    it('should reload data when OPERATION_CHANGED fires', async () => {
      OperationsDB.getIncomeByCategoryAndCurrency
        .mockResolvedValueOnce([{ category_id: 'cat-3', total: '100' }])
        .mockResolvedValueOnce([{ category_id: 'cat-3', total: '888' }]);

      const { result } = renderHook(() =>
        useIncomeData(mockYear, mockMonth, mockCurrency, 'all', mockCategories, mockColors, mockT),
      );

      await act(async () => {
        await result.current.loadIncomeData();
      });
      await waitFor(() => expect(result.current.loadingIncome).toBe(false));

      expect(capturedOperationChangedCallback).not.toBeNull();

      await act(async () => {
        await capturedOperationChangedCallback();
      });

      await waitFor(() => expect(result.current.loadingIncome).toBe(false));
      expect(OperationsDB.getIncomeByCategoryAndCurrency).toHaveBeenCalledTimes(2);
      const freelanceItem = result.current.incomeChartData.find(item => item.name === 'Freelance');
      expect(freelanceItem?.amount).toBe(888);
    });
  });
});
