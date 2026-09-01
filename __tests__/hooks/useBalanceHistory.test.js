import { renderHook, act, waitFor } from '@testing-library/react-native';
import useBalanceHistory, {
  buildYearAverageSeries,
  computeDayPeakBalance,
  buildYearSampleDays,
  buildYearSeries,
  dayOfYearFromDateString,
  median,
} from '../../app/hooks/useBalanceHistory';
import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';
import * as OperationsDB from '../../app/services/OperationsDB';

// Mock the BalanceHistoryDB service
jest.mock('../../app/services/BalanceHistoryDB', () => ({
  getBalanceHistory: jest.fn(),
  getAccountBalanceOnOrBeforeDate: jest.fn(),
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
  getTotalIncome: jest.fn(),
  getTransferTotals: jest.fn(),
  getMonthlyExpenseTotals: jest.fn(),
  getAccountDayDeltas: jest.fn(),
}));

describe('useBalanceHistory', () => {
  const mockAccountId = 'account-1';
  const mockYear = 2024;
  const mockMonth = 0; // January

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no expenses in previous month
    OperationsDB.getTotalExpenses.mockResolvedValue(0);
    // Defaults for the burndown-anchor (plainAvgMax) reads: no income, no transfers,
    // and no known day-1 balance unless a test overrides them.
    OperationsDB.getTotalIncome.mockResolvedValue('0');
    OperationsDB.getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    // "Year average" line inputs: no spending history unless a test says otherwise.
    OperationsDB.getMonthlyExpenseTotals.mockResolvedValue({});
    // Day-1 intraday walk (the day-zero peak): no operations unless a test says so.
    OperationsDB.getAccountDayDeltas.mockResolvedValue([]);
    BalanceHistoryDB.getAccountBalanceOnOrBeforeDate.mockResolvedValue(null);
    // Mock console.error to suppress error logs in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Initialization', () => {
    it('should initialize in the loading state', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      expect(result.current.balanceHistoryData).toEqual({ labels: [] });
      // loading starts true so the Graphs screen shows a spinner on first render
      // instead of a "no data" flash before loadBalanceHistory() runs (QoL-11).
      // The early-return in loadBalanceHistory() resets this to false when no
      // account/month is selected, so "nothing selected" stays a valid empty state.
      expect(result.current.loadingBalanceHistory).toBe(true);
      expect(result.current.balanceHistoryTableData).toEqual([]);
      expect(result.current.editingBalanceRow).toBeNull();
      expect(result.current.editingBalanceValue).toBe('');
    });

    it('resets loading to false via early-return when no account is selected', async () => {
      // Guard against an "eternal spinner": with loading initialized to true, the
      // early-return path must flip it back to false so the empty state shows.
      const { result } = await renderHook(() => useBalanceHistory(null, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      expect(result.current.loadingBalanceHistory).toBe(false);
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

    // "No month" is the whole-year view, not an empty state: it loads the year
    // rather than returning early (which is what used to hide the card entirely).
    it('loads the whole year when no month is selected', async () => {
      BalanceHistoryDB.getBalanceHistory.mockResolvedValue([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, null));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      expect(BalanceHistoryDB.getBalanceHistory).toHaveBeenCalledWith(mockAccountId, '2024-01-01', '2024-12-31');
      expect(result.current.balanceHistoryData.granularity).toBe('year');
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

      // current month + one 12-month window that covers the prev-month line too
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

    it('issues the four independent reads concurrently (QoL-10)', async () => {
      // Gate every read behind one manually-released promise. Serial awaits would
      // dispatch only the first read before the gate opens; concurrent dispatch
      // via Promise.all puts all four reads in flight up front.
      let releaseGate;
      const gate = new Promise((resolve) => { releaseGate = resolve; });
      BalanceHistoryDB.getBalanceHistory.mockImplementation(() => gate.then(() => []));
      OperationsDB.getTotalExpenses.mockImplementation(() => gate.then(() => 0));

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        const loadPromise = result.current.loadBalanceHistory();
        // Flush the synchronous Promise.all dispatch without opening the gate.
        await Promise.resolve();

        // All four reads are in flight before any has resolved → concurrent.
        expect(BalanceHistoryDB.getBalanceHistory).toHaveBeenCalledTimes(2);
        expect(OperationsDB.getTotalExpenses).toHaveBeenCalledTimes(2);

        releaseGate();
        await loadPromise;
      });
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

  describe('plainAvgMax (burndown anchor)', () => {
    it('computes plainAvgMax as day-1 balance + post-day-1 inflows − outgoing transfers', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([
          { date: '2024-01-01', balance: '1000' },
          { date: '2024-01-20', balance: '900' },
        ])
        .mockResolvedValueOnce([]);
      BalanceHistoryDB.getAccountBalanceOnOrBeforeDate.mockResolvedValue('1000'); // end of day 1
      OperationsDB.getTransferTotals.mockResolvedValue({ incoming: '300', outgoing: '50' });
      OperationsDB.getTotalIncome.mockResolvedValue('200');

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        // 1000 (day-1 balance) + 300 (incoming) − 50 (outgoing) + 200 (income) = 1450
        expect(result.current.balanceHistoryData.plainAvgMax).toBe(1450);
      });
    });

    it('queries inflows/outflows from day 2 and anchors the balance on day 1 (excludes the first day)', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      // January 2024: post-day-1 window is 2024-01-02 … 2024-01-31
      expect(OperationsDB.getTransferTotals).toHaveBeenCalledWith(mockAccountId, '2024-01-02', '2024-01-31');
      expect(OperationsDB.getTotalIncome).toHaveBeenCalledWith(mockAccountId, '2024-01-02', '2024-01-31');
      // The anchor is the balance on (or before) the first of the month
      expect(BalanceHistoryDB.getAccountBalanceOnOrBeforeDate).toHaveBeenCalledWith(mockAccountId, '2024-01-01');
    });

    it('leaves plainAvgMax null when the day-1 balance is unknown', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([{ date: '2024-01-10', balance: '500' }])
        .mockResolvedValueOnce([]);
      BalanceHistoryDB.getAccountBalanceOnOrBeforeDate.mockResolvedValue(null);
      OperationsDB.getTransferTotals.mockResolvedValue({ incoming: '300', outgoing: '50' });
      OperationsDB.getTotalIncome.mockResolvedValue('200');

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.plainAvgMax).toBeNull();
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

      // getBalanceHistory is called twice: once for Jan 2024, once for the 12-month
      // comparison window, which ends at the previous month — Dec 2023, not Dec 2024.
      const windowCall = BalanceHistoryDB.getBalanceHistory.mock.calls[1];
      expect(windowCall[1]).toBe('2023-01-01'); // 12 months back, same month
      expect(windowCall[2]).toBe('2023-12-31'); // end of the previous month

      // The prev-month expense total keeps its own Dec 2023 boundaries.
      const prevExpensesCall = OperationsDB.getTotalExpenses.mock.calls[0];
      expect(prevExpensesCall[1]).toBe('2023-12-01');
      expect(prevExpensesCall[2]).toBe('2023-12-31');
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
      // the chart rendered as 0, making the purple line drop to zero.
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
  describe('Day-zero peak (first day of the month)', () => {
    // A day's snapshot is its *closing* balance, so a month that opened on 100k
    // and spent 20k on the 1st recorded 80k and lost the 100k entirely. Walking
    // the day's operations backwards from the close recovers every balance the
    // account passed through; the highest is where the month really started.

    describe('computeDayPeakBalance', () => {
      it('recovers an opening balance that was spent down', () => {
        // Opened on 100000, spent 20000 → closed on 80000, peaked at the open.
        expect(computeDayPeakBalance('80000', ['-20000'])).toBe(100000);
      });

      it('takes an intraday high over both the open and the close', () => {
        // 20000 in, +100000 income, −20000 spend → closes on 100000, peaked at 120000.
        expect(computeDayPeakBalance('100000', ['100000', '-20000'])).toBe(120000);
      });

      it('returns the close when the day only gained', () => {
        expect(computeDayPeakBalance('120000', ['100000'])).toBe(120000);
      });

      it('returns the close for a day with no operations', () => {
        expect(computeDayPeakBalance('5000', [])).toBe(5000);
        expect(computeDayPeakBalance('5000', undefined)).toBe(5000);
      });

      it('handles a day that ends below zero', () => {
        expect(computeDayPeakBalance('-500', ['-1500'])).toBe(1000);
      });

      it('is null when the day has no known balance', () => {
        expect(computeDayPeakBalance(null, ['-20000'])).toBeNull();
        expect(computeDayPeakBalance(undefined, [])).toBeNull();
        expect(computeDayPeakBalance('not-a-number', [])).toBeNull();
      });

      it('skips unparsable deltas rather than abandoning the walk', () => {
        expect(computeDayPeakBalance('80000', ['-20000', 'oops'])).toBe(100000);
      });

      it('accepts a walk that lands back on the recorded opening', () => {
        expect(computeDayPeakBalance('80000', ['-20000'], '100000')).toBe(100000);
      });

      it('reports the close when the walk misses the recorded opening', () => {
        // The extra −30000 is an operation back-dated into the day, so it is not
        // in the 80000 snapshot; undoing it would invent a 130000 opening.
        expect(computeDayPeakBalance('80000', ['-20000', '-30000'], '100000')).toBe(80000);
      });

      it('tolerates sub-unit drift from converting a portfolio at display rates', () => {
        expect(computeDayPeakBalance('80000', ['-20000'], '100000.4')).toBe(100000);
      });

      it('accepts the walk when the opening is unknown', () => {
        // The charted thing's first day on record: there is nothing to check
        // against, and refusing every such month would be worse than trusting it.
        expect(computeDayPeakBalance('80000', ['-20000'], null)).toBe(100000);
      });
    });

    // Balances by the date they are asked for: the 1st is the day's close, the
    // 31st of December is the balance carried into the month.
    const stubBalances = (byDate) => {
      BalanceHistoryDB.getAccountBalanceOnOrBeforeDate.mockImplementation(
        async (accountId, date) => (byDate[date] === undefined ? null : byDate[date]),
      );
    };

    it('exposes the first day\'s peak on the loaded data', async () => {
      stubBalances({ '2023-12-31': '100000', '2024-01-01': '80000' });
      OperationsDB.getAccountDayDeltas.mockResolvedValue([
        { id: 1, createdAt: '2024-01-01T09:00:00Z', delta: '-20000' },
      ]);
      BalanceHistoryDB.getBalanceHistory.mockResolvedValue([
        { date: '2024-01-01', balance: '80000' },
      ]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.firstDayPeak).toBe(100000);
      });
    });

    it('falls back to the close when the day-1 operations do not reconcile', async () => {
      // A snapshot is only ever written under today's date, so an operation
      // back-dated into the 1st is in the delta list without being in the balance
      // the walk subtracts it from. Undoing it would invent a 130000 the account
      // never held — and put it straight on the chart as the month's opening.
      stubBalances({ '2023-12-31': '100000', '2024-01-01': '80000' });
      OperationsDB.getAccountDayDeltas.mockResolvedValue([
        { id: 1, createdAt: '2024-01-01T09:00:00Z', delta: '-20000' },
        { id: 2, createdAt: '2024-01-10T18:00:00Z', delta: '-30000' },
      ]);
      BalanceHistoryDB.getBalanceHistory.mockResolvedValue([
        { date: '2024-01-01', balance: '80000' },
      ]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.firstDayPeak).toBe(80000);
      });
    });

    it('reads the balance carried into the month to reconcile against', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(BalanceHistoryDB.getAccountBalanceOnOrBeforeDate)
          .toHaveBeenCalledWith(mockAccountId, '2023-12-31');
      });
    });

    it('reads the deltas for the first day of the selected month', async () => {
      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(OperationsDB.getAccountDayDeltas).toHaveBeenCalledWith(mockAccountId, '2024-01-01');
      });
    });

    it('is null when the month has no known day-1 balance', async () => {
      BalanceHistoryDB.getAccountBalanceOnOrBeforeDate.mockResolvedValue(null);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.firstDayPeak).toBeNull();
      });
    });
  });

  describe('Year average line', () => {
    it('median averages the two middle values on even counts', () => {
      expect(median([3, 1, 2])).toBe(2);
      expect(median([4, 1, 3, 2])).toBe(2.5);
      expect(median([])).toBeNull();
    });

    it('takes the median across the 12 previous months, per day', () => {
      const { yearAvg } = buildYearAverageSeries({
        historyRows: [
          { date: '2023-01-01', balance: '100' },
          { date: '2023-06-01', balance: '200' },
          { date: '2023-07-01', balance: '400' },
          { date: '2023-12-01', balance: '300' },
        ],
        monthlyExpenses: {},
        selectedYear: 2024,
        selectedMonth: 0, // January 2024
        daysInMonth: 31,
      });

      // Four contributing months → median of [100, 200, 300, 400]
      expect(yearAvg[0]).toBe(250);
      // Forward-filled: every later day inherits the same balances
      expect(yearAvg[30]).toBe(250);
    });

    it('includes the same month one year back (12 months, not 11)', () => {
      const withJan2023 = buildYearAverageSeries({
        historyRows: [
          { date: '2023-01-05', balance: '100' },
          { date: '2023-12-05', balance: '300' },
        ],
        monthlyExpenses: {},
        selectedYear: 2024,
        selectedMonth: 0,
        daysInMonth: 31,
      });
      // Jan 2023 is inside the window → median of [100, 300] on day 5
      expect(withJan2023.yearAvg[4]).toBe(200);
      expect(withJan2023.yearAvgMonthCount).toBe(2);

      const tooOld = buildYearAverageSeries({
        historyRows: [
          { date: '2022-12-05', balance: '100' },
          { date: '2023-12-05', balance: '300' },
        ],
        monthlyExpenses: {},
        selectedYear: 2024,
        selectedMonth: 0,
        daysInMonth: 31,
      });
      // Dec 2022 is 13 months back → out of the window, only Dec 2023 counts
      expect(tooOld.yearAvg[4]).toBe(300);
      expect(tooOld.yearAvgMonthCount).toBe(1);
    });

    it('holds a short month final value for the tail days', () => {
      const { yearAvg } = buildYearAverageSeries({
        historyRows: [
          { date: '2023-02-28', balance: '500' }, // February — 28 days
          { date: '2023-03-31', balance: '700' },
        ],
        monthlyExpenses: {},
        selectedYear: 2024,
        selectedMonth: 0,
        daysInMonth: 31,
      });

      // Day 29-31 have no February data: Feb holds 500, March reports 700
      expect(yearAvg[30]).toBe(600);
    });

    it('leaves days before any recorded balance empty', () => {
      const { yearAvg } = buildYearAverageSeries({
        historyRows: [{ date: '2023-12-20', balance: '300' }],
        monthlyExpenses: {},
        selectedYear: 2024,
        selectedMonth: 0,
        daysInMonth: 31,
      });

      expect(yearAvg[0]).toBeUndefined();
      expect(yearAvg[19]).toBe(300);
    });

    it('reports the median of the per-month spending rates', () => {
      const { yearAvgDailyAvg } = buildYearAverageSeries({
        historyRows: [
          { date: '2023-01-10', balance: '100' },
          { date: '2023-06-10', balance: '200' },
          { date: '2023-12-10', balance: '300' },
        ],
        monthlyExpenses: { '2023-01': '310', '2023-06': '600' },
        selectedYear: 2024,
        selectedMonth: 0,
        daysInMonth: 31,
      });

      // Rates: Jan -310/31 = -10, Jun -600/30 = -20, Dec (no expenses) 0 → median -10
      expect(yearAvgDailyAvg).toBe(-10);
    });

    it('survives an empty window', () => {
      const result = buildYearAverageSeries({
        historyRows: undefined,
        monthlyExpenses: undefined,
        selectedYear: 2024,
        selectedMonth: 0,
        daysInMonth: 31,
      });

      expect(result.yearAvg).toHaveLength(31);
      expect(result.yearAvg.every(v => v === undefined)).toBe(true);
      expect(result.yearAvgDailyAvg).toBeNull();
      expect(result.yearAvgMonthCount).toBe(0);
    });

    it('exposes the year average on the loaded balance history data', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([{ date: '2024-01-05', balance: '1000' }])
        .mockResolvedValueOnce([
          { date: '2023-01-05', balance: '100' },
          { date: '2023-12-05', balance: '300' },
        ]);
      OperationsDB.getMonthlyExpenseTotals.mockResolvedValue({ '2023-12': '620' });

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.yearAvg[4]).toBe(200);
        // Rates: Jan 2023 (no expenses) 0, Dec 2023 -620/31 = -20 → median -10
        expect(result.current.balanceHistoryData.yearAvgDailyAvg).toBe(-10);
      });
    });

    it('slices the prev-month line out of the same 12-month read', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([{ date: '2024-01-05', balance: '1000' }])
        .mockResolvedValueOnce([
          { date: '2023-06-05', balance: '100' },
          { date: '2023-12-05', balance: '900' },
        ]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, mockYear, mockMonth));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        // Only the December rows feed the prev-month line, June must not leak in
        expect(result.current.balanceHistoryData.prevMonth[4]).toBe(900);
        expect(result.current.balanceHistoryData.prevMonth[3]).toBeUndefined();
      });
    });
  });

  describe('Whole-year view', () => {
    describe('buildYearSampleDays', () => {
      it('walks the year on a 7-day stride', () => {
        const days = buildYearSampleDays(365);

        expect(days[0]).toBe(1);
        expect(days[1]).toBe(8);
        expect(days).toHaveLength(53);
        // A 365-day year lands its last stride exactly on the last day
        expect(days[days.length - 1]).toBe(365);
      });

      it('appends the leap day so the line still reaches the end of the year', () => {
        const days = buildYearSampleDays(366);

        expect(days[days.length - 1]).toBe(366);
        expect(days[days.length - 2]).toBe(365);
      });
    });

    describe('dayOfYearFromDateString', () => {
      it('counts from Jan 1 and accounts for the leap day', () => {
        expect(dayOfYearFromDateString('2024-01-01')).toBe(1);
        expect(dayOfYearFromDateString('2024-03-01')).toBe(61); // 31 + 29 + 1
        expect(dayOfYearFromDateString('2023-03-01')).toBe(60);
        expect(dayOfYearFromDateString('2024-12-31')).toBe(366);
      });

      it('returns null for junk instead of NaN', () => {
        expect(dayOfYearFromDateString(null)).toBeNull();
        expect(dayOfYearFromDateString('not-a-date')).toBeNull();
      });
    });

    describe('buildYearSeries', () => {
      it('forward-fills between samples and starts from the carried-in balance', () => {
        const series = buildYearSeries({
          historyRows: [
            { date: '2023-01-03', balance: '100' },
            { date: '2023-01-10', balance: '80' },
          ],
          sampleDays: [1, 8, 15, 22],
          anchorBalance: '150',
          maxDay: null,
        });

        // Day 1 has no record of its own → the balance carried in from December
        expect(series).toEqual([150, 100, 80, 80]);
      });

      it('leaves days after maxDay undefined instead of drawing a flat future', () => {
        const series = buildYearSeries({
          historyRows: [{ date: '2026-01-03', balance: '100' }],
          sampleDays: [1, 8, 15, 22],
          anchorBalance: null,
          maxDay: 10,
        });

        expect(series[1]).toBe(100);
        expect(series[2]).toBeUndefined();
        expect(series[3]).toBeUndefined();
      });

      it('holds the last known value when a year has no records at all after it', () => {
        const series = buildYearSeries({
          historyRows: [],
          sampleDays: [1, 8],
          anchorBalance: '42',
          maxDay: null,
        });

        expect(series).toEqual([42, 42]);
      });
    });

    it('loads the year plus the year before it for comparison', async () => {
      BalanceHistoryDB.getBalanceHistory
        .mockResolvedValueOnce([{ date: '2023-01-01', balance: '1000' }])
        .mockResolvedValueOnce([{ date: '2022-01-01', balance: '500' }]);
      OperationsDB.getTotalExpenses.mockResolvedValue(3650);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, 2023, null));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.granularity).toBe('year');
      });

      const data = result.current.balanceHistoryData;
      expect(BalanceHistoryDB.getBalanceHistory).toHaveBeenCalledWith(mockAccountId, '2023-01-01', '2023-12-31');
      expect(BalanceHistoryDB.getBalanceHistory).toHaveBeenCalledWith(mockAccountId, '2022-01-01', '2022-12-31');
      expect(OperationsDB.getTotalExpenses).toHaveBeenCalledWith(mockAccountId, '2022-01-01', '2022-12-31');
      expect(data.labels).toHaveLength(53);
      expect(data.labels[data.labels.length - 1]).toBe(365);
      expect(data.actualForChart[0]).toBe(1000);
      expect(data.prevYear[0]).toBe(500);
      expect(data.prevYearTotalExpenses).toBe(3650);
      expect(data.prevYearDaysCount).toBe(365);
      expect(data.daysInYear).toBe(365);
    });

    it('does not compute the monthly-only series in the year view', async () => {
      BalanceHistoryDB.getBalanceHistory.mockResolvedValue([{ date: '2023-05-01', balance: '700' }]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, 2023, null));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.granularity).toBe('year');
      });

      // The burndown anchor, the forecast inputs and the 12-month median are all
      // month-scoped: the year view must not even query for them.
      expect(OperationsDB.getTotalIncome).not.toHaveBeenCalled();
      expect(OperationsDB.getTransferTotals).not.toHaveBeenCalled();
      expect(OperationsDB.getMonthlyExpenseTotals).not.toHaveBeenCalled();
      expect(result.current.balanceHistoryData.plainAvgMax).toBeUndefined();
      expect(result.current.balanceHistoryData.yearAvg).toBeUndefined();
    });

    it('reports the year 366 days long in a leap year', async () => {
      BalanceHistoryDB.getBalanceHistory.mockResolvedValue([]);

      const { result } = await renderHook(() => useBalanceHistory(mockAccountId, 2024, null));

      await act(async () => {
        await result.current.loadBalanceHistory();
      });

      await waitFor(() => {
        expect(result.current.balanceHistoryData.daysInYear).toBe(366);
      });
      expect(result.current.balanceHistoryData.prevYearDaysCount).toBe(365);
    });
  });
});
