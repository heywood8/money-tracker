import { useState, useCallback, useEffect } from 'react';
import { getBalanceHistory, upsertBalanceHistory, deleteBalanceHistory, formatDate } from '../services/BalanceHistoryDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Custom hook for loading and managing balance history data
 * Handles trend calculation, data visualization, and CRUD operations
 */
const useBalanceHistory = (selectedAccount, selectedYear, selectedMonth) => {
  const [balanceHistoryData, setBalanceHistoryData] = useState({ labels: [] });
  const [loadingBalanceHistory, setLoadingBalanceHistory] = useState(true);
  const [balanceHistoryTableData, setBalanceHistoryTableData] = useState([]);
  const [editingBalanceRow, setEditingBalanceRow] = useState(null);
  const [editingBalanceValue, setEditingBalanceValue] = useState('');

  // Helper function to calculate linear regression
  const calculateTrendLine = (data) => {
    if (data.length < 2) return null;

    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    data.forEach((point, index) => {
      sumX += index;
      sumY += point.y;
      sumXY += index * point.y;
      sumX2 += index * index;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  };

  // Load balance history data
  const loadBalanceHistory = useCallback(async () => {
    if (!selectedAccount || selectedMonth === null) {
      setBalanceHistoryData({ labels: [] });
      setLoadingBalanceHistory(false);
      return;
    }

    try {
      setLoadingBalanceHistory(true);

      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      // Get balance history from database
      const history = await getBalanceHistory(selectedAccount, startDateStr, endDateStr);

      // Calculate previous month dates
      const prevMonthStart = new Date(selectedYear, selectedMonth - 1, 1);
      const prevMonthEnd = new Date(selectedYear, selectedMonth, 0);
      const prevStartDateStr = formatDate(prevMonthStart);
      const prevEndDateStr = formatDate(prevMonthEnd);

      // Get previous month's balance history
      const prevHistory = await getBalanceHistory(selectedAccount, prevStartDateStr, prevEndDateStr);

      // Transform history data for chart
      const dataPoints = history.map(item => ({
        date: item.date,
        balance: parseFloat(item.balance),
      }));

      // Get current day of month
      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
      const currentDay = isCurrentMonth ? now.getDate() : endDate.getDate();

      // Generate all days in month for x-axis
      const daysInMonth = endDate.getDate();
      const allDays = [];
      for (let day = 1; day <= daysInMonth; day++) {
        allDays.push(day);
      }

      // Map balance history to days
      const balanceByDay = {};
      dataPoints.forEach(point => {
        // Extract day directly from date string to avoid timezone issues
        // date format is "YYYY-MM-DD", so split and get the third part
        const day = parseInt(point.date.split('-')[2], 10);
        balanceByDay[day] = point.balance;
      });

      // Create actual data line (only up to current day or last available data)
      const actualData = allDays.map(day => {
        if (balanceByDay[day] !== undefined) {
          return { x: day, y: balanceByDay[day] };
        }
        return null;
      }).filter(p => p && p.x <= currentDay);

      // Calculate trend line
      let trendData = [];
      if (actualData.length >= 2) {
        const trend = calculateTrendLine(actualData);
        if (trend) {
          // Extend trend line to end of month
          trendData = allDays.map(day => ({
            x: day,
            y: Math.max(0, trend.intercept + trend.slope * (day - 1)),
          }));
        }
      }

      // Calculate burndown line (from highest balance to 0)
      let burndownData = [];
      if (actualData.length > 0) {
        const maxBalance = Math.max(...actualData.map(p => p.y));
        const slope = -maxBalance / (daysInMonth - 1);
        burndownData = allDays.map(day => ({
          x: day,
          y: Math.max(0, maxBalance + slope * (day - 1)),
        }));
      }

      // Process previous month data
      const prevMonthDataPoints = prevHistory.map(item => ({
        date: item.date,
        balance: parseFloat(item.balance),
      }));

      // Get days in previous month
      const prevMonthDays = prevMonthEnd.getDate();

      // Map previous month balance history to days
      const prevBalanceByDay = {};
      prevMonthDataPoints.forEach(point => {
        const day = parseInt(point.date.split('-')[2], 10);
        prevBalanceByDay[day] = point.balance;
      });

      // Create previous month data line (forward-filled for all available days)
      const prevMonthData = allDays.map(day => {
        // Only include data if the day exists in previous month
        if (day > prevMonthDays) return undefined;

        if (prevBalanceByDay[day] !== undefined) {
          return prevBalanceByDay[day];
        }

        // Forward fill: use the most recent balance before this day
        for (let d = day - 1; d >= 1; d--) {
          if (prevBalanceByDay[d] !== undefined) {
            return prevBalanceByDay[d];
          }
        }

        // No data yet
        return undefined;
      });

      // Create forward-filled data for chart (to connect dots properly)
      // This ensures the chart line is continuous up to current day only
      const actualForChart = allDays.map(day => {
        // Only include data up to current day
        if (day > currentDay) return undefined;

        // Find if we have data for this day
        const point = actualData.find(p => p.x === day);
        if (point) return point.y;

        // Forward fill: use the most recent balance before this day
        const priorPoints = actualData.filter(p => p.x < day);
        if (priorPoints.length > 0) {
          return priorPoints[priorPoints.length - 1].y;
        }

        // No data yet, return undefined (chart will skip this point)
        return undefined;
      });

      setBalanceHistoryData({
        actual: actualData,
        actualForChart: actualForChart,
        trend: trendData,
        burndown: burndownData,
        prevMonth: prevMonthData,
        labels: allDays,
      });
    } catch (error) {
      console.error('Failed to load balance history:', error);
      setBalanceHistoryData({ labels: [] });
    } finally {
      setLoadingBalanceHistory(false);
    }
  }, [selectedAccount, selectedYear, selectedMonth]);

  // Open balance history modal with table data
  const loadBalanceHistoryTable = useCallback(async () => {
    if (!selectedAccount || selectedMonth === null) return null;

    try {
      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);
      const daysInMonth = endDate.getDate();

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      // Get balance history from database
      const history = await getBalanceHistory(selectedAccount, startDateStr, endDateStr);

      // Create map of existing balances
      const balanceByDate = {};
      history.forEach(item => {
        balanceByDate[item.date] = item.balance;
      });

      // Generate table data for all days in month
      const tableData = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth, day);
        const dateStr = formatDate(date);
        tableData.push({
          date: dateStr,
          displayDate: `${day}`,
          balance: balanceByDate[dateStr] || null,
        });
      }

      setBalanceHistoryTableData(tableData);
      return tableData;
    } catch (error) {
      console.error('Failed to load balance history table:', error);
      return null;
    }
  }, [selectedAccount, selectedYear, selectedMonth]);

  // Start editing a balance row
  const handleEditBalance = useCallback((date, currentBalance) => {
    setEditingBalanceRow(date);
    setEditingBalanceValue(currentBalance || '');
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingBalanceRow(null);
    setEditingBalanceValue('');
  }, []);

  // Save edited balance
  const handleSaveBalance = useCallback(async (date) => {
    if (!selectedAccount || !editingBalanceValue) return;

    try {
      await upsertBalanceHistory(selectedAccount, date, editingBalanceValue);

      // Update table data
      setBalanceHistoryTableData(prevData =>
        prevData.map(item =>
          item.date === date ? { ...item, balance: editingBalanceValue } : item,
        ),
      );

      // Reload the chart
      await loadBalanceHistory();

      setEditingBalanceRow(null);
      setEditingBalanceValue('');
    } catch (error) {
      console.error('Failed to save balance:', error);
    }
  }, [selectedAccount, editingBalanceValue, loadBalanceHistory]);

  // Delete balance entry
  const handleDeleteBalance = useCallback(async (date) => {
    if (!selectedAccount) return;

    try {
      await deleteBalanceHistory(selectedAccount, date);

      // Update table data
      setBalanceHistoryTableData(prevData =>
        prevData.map(item =>
          item.date === date ? { ...item, balance: null } : item,
        ),
      );

      // Reload the chart
      await loadBalanceHistory();
    } catch (error) {
      console.error('Failed to delete balance:', error);
    }
  }, [selectedAccount, loadBalanceHistory]);

  // Listen for operation changes and reload balance history
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      loadBalanceHistory();
    });

    return unsubscribe;
  }, [loadBalanceHistory]);

  return {
    balanceHistoryData,
    loadingBalanceHistory,
    loadBalanceHistory,
    balanceHistoryTableData,
    loadBalanceHistoryTable,
    editingBalanceRow,
    editingBalanceValue,
    setEditingBalanceValue,
    handleEditBalance,
    handleCancelEdit,
    handleSaveBalance,
    handleDeleteBalance,
  };
};

export default useBalanceHistory;
