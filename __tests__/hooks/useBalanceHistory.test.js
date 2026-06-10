import { renderHook, act, waitFor } from '@testing-library/react-native';
import useBalanceHistory from '../../app/hooks/useBalanceHistory';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';
import * as OperationsDB from '../../app/services/OperationsDB';

// Mock the BalanceHistoryDB service
jest.mock('../../app/services/BalanceHistoryDB', () => ({
  getBalanceHistory: jest.fn(),
  upsertBalanceHistory: jest.fn(),
  deleteBalanceHistory: jest.fn(),
  formatDate: jest.fn((date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }),
}));

// Mock the OperationsDB service
jest.mock('../../app/services/OperationsDB', () => ({
  getTotalExpenses: jest.fn(),
}));

describe('useBalanceHistory', () => {
  const mockAccountId = 'account-1';
  const mockYear = 2024;
  const mockMonth = 0; // January

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no expenses in previous month
    OperationsDB.getTotalExpenses.mockResolvedValue(0);
    // Mock console.error to suppress error logs in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize with default state', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      expect(result.current.balanceHistoryData).toEqual({ labels: [] });
      expect(result.current.loadingBalanceHistory).toBe(true);
      expect(result.current.balanceHistoryTableData).toEqual([]);
      expect(result.current.editingBalanceRow).toBeNull();
      expect(result.current.editingBalanceValue).toBe('');
    });
  });

  describe('loadBalanceHistory', () => {
    it('should return early if no account selected', async () => {
      const { result } = await renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      expect(BalanceHistoryDB.getBalanceHistory).not.toHaveBeenCalled();
      expect(result.current.balanceHistoryData).toEqual({ labels: [] });
      expect(result.current.loadingBalanceHistory).toBe(false);
    });

    it('should return early if no month selected', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, null));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      expect(BalanceHistoryDB.getBalanceHistory).not.toHaveBeenCalled();
      expect(result.current.balanceHistoryData).toEqual({ labels: [] });
      expect(result.current.loadingBalanceHistory).toBe(false);
    });

    it('should load balance history data for current month', async () => {
      const mockHistory = [
        { date: '2024-01-05', balance: '1000' },
        { date: '2024-01-10', balance: '1200' },
        { date: '2024-01-15', balance: '1100' },
      ];
      const mockPrevHistory = [
        { date: '2023-12-10', balance: '900' },
        { date: '2023-12-20', balance: '950' },
      ];

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce(mockHistory)
        .mockResolvedValueOnce(mockPrevHistory);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.loadingBalanceHistory).toBe(false);
      });

      expect(BalanceHistoryDB.getBalanceHistory).toHaveBeenCalledTimes(2);
      expect(result.current.balanceHistoryData).toHaveProperty('actual');
      expect(result.current.balanceHistoryData).toHaveProperty('actualForChart');
      expect(result.current.balanceHistoryData).toHaveProperty('trend');
      expect(result.current.balanceHistoryData).toHaveProperty('burndown');
      expect(result.current.balanceHistoryData).toHaveProperty('prevMonth');
      expect(result.current.balanceHistoryData).toHaveProperty('prevMonthTotalExpenses');
      expect(result.current.balanceHistoryData).toHaveProperty('prevMonthDaysCount');
      expect(result.current.balanceHistoryData.labels.length).toBe(31); // January has 31 days
    });

    it('should calculate trend line with linear regression', async () => {
      const mockHistory = [
        { date: '2024-01-01', balance: '1000' },
        { date: '2024-01-02', balance: '1100' },
        { date: '2024-01-03', balance: '1200' },
      ];

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce(mockHistory)
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.trend).toBeDefined();
        expect(result.current.balanceHistoryData.trend.length).toBeGreaterThan(0);
      });
    });

    it('should not calculate trend line with less than 2 data points', async () => {
      const mockHistory = [
        { date: '2024-01-01', balance: '1000' },
      ];

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce(mockHistory)
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.trend).toEqual([]);
      });
    });

    it('should calculate burndown line from max balance', async () => {
      const mockHistory = [
        { date: '2024-01-01', balance: '1000' },
        { date: '2024-01-10', balance: '1500' },
        { date: '2024-01-20', balance: '1200' },
      ];

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce(mockHistory)
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.burndown).toBeDefined();
        expect(result.current.balanceHistoryData.burndown.length).toBe(31);
        // First point should be max balance (1500)
        expect(result.current.balanceHistoryData.burndown[0].y).toBe(1500);
        // Last point should be 0 or close to it
        const lastPoint = result.current.balanceHistoryData.burndown[30];
        expect(lastPoint.y).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle errors gracefully', async () => {
      BalanceHistoryDB.getBalanceHistory.mockRejectedValue(new Error('Database error'));

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.loadingBalanceHistory).toBe(false);
        expect(result.current.balanceHistoryData).toEqual({ labels: [] });
        expect(console.error).toHaveBeenCalledWith('Failed to load balance history:', expect.any(Error));
      });
    });
  });

  describe('loadBalanceHistoryTable', () => {
    it('should return null if no account selected', async () => {
      const { result } = await renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

      let tableData;
      await act(async () => {
        tableData = await result.current.loadBalanceHistoryTable();
      });

      expect(tableData).toBeNull();
      expect(result.current.balanceHistoryTableData).toEqual([]);
    });

    it('should load table data with all days in month', async () => {
      const mockHistory = [
        { date: '2024-01-05', balance: '1000' },
        { date: '2024-01-15', balance: '1200' },
      ];

      BalanceHistoryDB.getBalanceHistory.mockResolvedValue(mockHistory);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistoryTable();
      });

      expect(result.current.balanceHistoryTableData.length).toBe(31); // January has 31 days
      expect(result.current.balanceHistoryTableData[4]).toEqual({
        date: '2024-01-05',
        displayDate: '5',
        balance: '1000',
      });
      expect(result.current.balanceHistoryTableData[0].balance).toBeNull(); // Day without data
    });

    it('should handle errors gracefully', async () => {
      BalanceHistoryDB.getBalanceHistory.mockRejectedValue(new Error('Database error'));

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      let tableData;
      await act(async () => {
        tableData = await result.current.loadBalanceHistoryTable();
      });

      expect(tableData).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Failed to load balance history table:', expect.any(Error));
    });
  });

  describe('handleEditBalance', () => {
    it('should set editing state for a row', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', '1000');
      });

      expect(result.current.editingBalanceRow).toBe('2024-01-15');
      expect(result.current.editingBalanceValue).toBe('1000');
    });

    it('should handle null balance', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', null);
      });

      expect(result.current.editingBalanceRow).toBe('2024-01-15');
      expect(result.current.editingBalanceValue).toBe('');
    });
  });

  describe('handleCancelEdit', () => {
    it('should clear editing state', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', '1000');
      });

      expect(result.current.editingBalanceRow).toBe('2024-01-15');

      await act(async () => {
        result.current.handleCancelEdit();
      });

      expect(result.current.editingBalanceRow).toBeNull();
      expect(result.current.editingBalanceValue).toBe('');
    });
  });

  describe('handleSaveBalance', () => {
    it('should save balance and update table data', async () => {
      BalanceHistoryDB.upsertBalanceHistory.mockResolvedValue();
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      // Set up table data
      await act(async () => {
        result.current.setEditingBalanceValue('1500');
      });

      // First load table data
      await act(async () => {
        await result.current.loadBalanceHistoryTable();
      });

      // Mock the table data
      const mockTableData = [
        { date: '2024-01-15', displayDate: '15', balance: null },
      ];

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', null);
        result.current.setEditingBalanceValue('1500');
      });

      await act(async () => {
        await result.current.handleSaveBalance('2024-01-15');
      });

      expect(BalanceHistoryDB.upsertBalanceHistory).toHaveBeenCalledWith(mockAccountId, '2024-01-15', '1500');
    });

    it('should not save if no editing value', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', null);
      });

      await act(async () => {
        await result.current.handleSaveBalance('2024-01-15');
      });

      expect(BalanceHistoryDB.upsertBalanceHistory).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      BalanceHistoryDB.upsertBalanceHistory.mockRejectedValue(new Error('Database error'));

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', null);
        result.current.setEditingBalanceValue('1500');
      });

      await act(async () => {
        await result.current.handleSaveBalance('2024-01-15');
      });

      expect(console.error).toHaveBeenCalledWith('Failed to save balance:', expect.any(Error));
    });
  });

  describe('handleDeleteBalance', () => {
    it('should delete balance and update table data', async () => {
      BalanceHistoryDB.deleteBalanceHistory.mockResolvedValue();
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.handleDeleteBalance('2024-01-15');
      });

      expect(BalanceHistoryDB.deleteBalanceHistory).toHaveBeenCalledWith(mockAccountId, '2024-01-15');
    });

    it('should not delete if no account selected', async () => {
      const { result } = await renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

      await act(async () => {
        await result.current.handleDeleteBalance('2024-01-15');
      });

      expect(BalanceHistoryDB.deleteBalanceHistory).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      BalanceHistoryDB.deleteBalanceHistory.mockRejectedValue(new Error('Database error'));

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.handleDeleteBalance('2024-01-15');
      });

      expect(console.error).toHaveBeenCalledWith('Failed to delete balance:', expect.any(Error));
    });
  });

  describe('setEditingBalanceValue', () => {
    it('should update editing balance value', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.setEditingBalanceValue('1500');
      });

      expect(result.current.editingBalanceValue).toBe('1500');
    });
  });

  describe('Regression Tests', () => {
    it('regression #757: previous-month boundary for January uses December of prior year, not current year', async () => {
      // When selectedMonth is 0 (January), the bug caused prevMonthStart to point to
      // December of the *same* year (future) instead of December of the prior year.
      // We verify this by asserting the date strings passed to getBalanceHistory.
      const janYear = 2024;
      const janMonth = 0; // January

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([]) // current month (Jan 2024)
        .mockResolvedValueOnce([]); // previous month (should be Dec 2023)

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, janYear, janMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.loadingBalanceHistory).toBe(false);
      });

      // getBalanceHistory is called twice: once for Jan 2024, once for the prev month.
      // The second call must use Dec 2023 boundaries, not Dec 2024.
      const prevMonthCall = BalanceHistoryDB.getBalanceHistory.mock.calls[1];
      const prevStartDate = prevMonthCall[1]; // '2023-12-01'
      const prevEndDate = prevMonthCall[2];   // '2023-12-31'

      expect(prevStartDate).toBe('2023-12-01');
      expect(prevEndDate).toBe('2023-12-31');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty history data', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.actual).toEqual([]);
        expect(result.current.balanceHistoryData.trend).toEqual([]);
        expect(result.current.balanceHistoryData.burndown).toEqual([]);
      });
    });

    it('should forward-fill previous month data', async () => {
      const mockHistory = [];
      const mockPrevHistory = [
        { date: '2023-12-05', balance: '1000' },
        { date: '2023-12-15', balance: '1200' },
      ];

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce(mockHistory)
        .mockResolvedValueOnce(mockPrevHistory);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.prevMonth).toBeDefined();
        // Day 6 should have the balance from day 5 (forward-filled)
        expect(result.current.balanceHistoryData.prevMonth[5]).toBe(1000);
      });
    });

    it('should not produce undefined/null at end of prevMonth when current month has more days than previous month', async () => {
      // May has 31 days, April has 30 — day 31 previously returned undefined which
      // react-native-chart-kit rendered as 0, making the purple line drop to zero.
      const mayYear = 2026;
      const mayMonthIndex = 4; // May (0-based)

      const mockMayHistory = [];
      const mockAprilHistory = [
        { date: '2026-04-01', balance: '-250000' },
        { date: '2026-04-30', balance: '-262000' },
      ];

      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce(mockMayHistory)
        .mockResolvedValueOnce(mockAprilHistory);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mayYear, mayMonthIndex));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        const prevMonth = result.current.balanceHistoryData.prevMonth;
        expect(prevMonth).toBeDefined();
        // May has 31 elements; the last element (day 31) must NOT be undefined/null
        // It should forward-fill from April's last known value (-262000)
        expect(prevMonth[30]).toBe(-262000);
        expect(prevMonth[30]).not.toBeUndefined();
      });
    });

    it('should include prevMonthTotalExpenses and prevMonthDaysCount in balance history data', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      OperationsDB.getTotalExpenses.mockResolvedValue(620);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.prevMonthTotalExpenses).toBe(620);
        // January is month index 0, previous month is December (31 days)
        expect(result.current.balanceHistoryData.prevMonthDaysCount).toBe(31);
      });
    });
  });
});
