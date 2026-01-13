import { renderHook, act, waitFor } from '@testing-library/react-native';
import useBalanceHistory from '../../app/hooks/useBalanceHistory';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';

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

describe('useBalanceHistory', () => {
  const mockAccountId = 'account-1';
  const mockYear = 2024;
  const mockMonth = 0; // January

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.error to suppress error logs in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      expect(result.current.balanceHistoryData).toEqual({ labels: [] });
      expect(result.current.loadingBalanceHistory).toBe(true);
      expect(result.current.balanceHistoryTableData).toEqual([]);
      expect(result.current.editingBalanceRow).toBeNull();
      expect(result.current.editingBalanceValue).toBe('');
    });
  });

  describe('loadBalanceHistory', () => {
    it('should return early if no account selected', async () => {
      const { result } = renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      expect(BalanceHistoryDB.getBalanceHistory).not.toHaveBeenCalled();
      expect(result.current.balanceHistoryData).toEqual({ labels: [] });
      expect(result.current.loadingBalanceHistory).toBe(false);
    });

    it('should return early if no month selected', async () => {
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, null));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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
      const { result } = renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', '1000');
      });

      expect(result.current.editingBalanceRow).toBe('2024-01-15');
      expect(result.current.editingBalanceValue).toBe('1000');
    });

    it('should handle null balance', async () => {
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.handleEditBalance('2024-01-15', null);
      });

      expect(result.current.editingBalanceRow).toBe('2024-01-15');
      expect(result.current.editingBalanceValue).toBe('');
    });
  });

  describe('handleCancelEdit', () => {
    it('should clear editing state', async () => {
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.handleDeleteBalance('2024-01-15');
      });

      expect(BalanceHistoryDB.deleteBalanceHistory).toHaveBeenCalledWith(mockAccountId, '2024-01-15');
    });

    it('should not delete if no account selected', async () => {
      const { result } = renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

      await act(async () => {
        await result.current.handleDeleteBalance('2024-01-15');
      });

      expect(BalanceHistoryDB.deleteBalanceHistory).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      BalanceHistoryDB.deleteBalanceHistory.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.handleDeleteBalance('2024-01-15');
      });

      expect(console.error).toHaveBeenCalledWith('Failed to delete balance:', expect.any(Error));
    });
  });

  describe('setEditingBalanceValue', () => {
    it('should update editing balance value', async () => {
      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        result.current.setEditingBalanceValue('1500');
      });

      expect(result.current.editingBalanceValue).toBe('1500');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty history data', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

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

      const { result } = renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.prevMonth).toBeDefined();
        // Day 6 should have the balance from day 5 (forward-filled)
        expect(result.current.balanceHistoryData.prevMonth[5]).toBe(1000);
      });
    });
  });
});
