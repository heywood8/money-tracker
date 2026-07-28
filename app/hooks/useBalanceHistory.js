import { useState, useCallback, useEffect } from 'react';
import { getBalanceHistory, getAccountBalanceOnOrBeforeDate, upsertBalanceHistory, deleteBalanceHistory, formatDate } from '../services/BalanceHistoryDB';
import { getTotalExpenses, getTotalIncome, getTransferTotals, getMonthlyExpenseTotals } from '../services/OperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

// Median of a numeric list; even counts average the two middle values.
// Exported for unit testing.
export const median = (values) => {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Build the "year average" comparison series: for every day of the selected
 * month, the median balance on that same day across the previous 12 months.
 *
 * Twelve, not eleven — the window starts at the same month one year back and
 * ends at the month right before the selected one, so a full seasonal cycle is
 * represented exactly once.
 *
 * Each month is forward-filled the same way the prev-month line is (a day with
 * no recorded balance inherits the last known one, and short months hold their
 * final value for the tail days), so the median compares like with like.
 *
 * Exported for unit testing.
 */
export const buildYearAverageSeries = ({
  historyRows,
  monthlyExpenses,
  selectedYear,
  selectedMonth,
  daysInMonth,
}) => {
  const months = [];
  for (let i = 12; i >= 1; i--) {
    const d = new Date(selectedYear, selectedMonth - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  // Bucket the flat history rows by 'YYYY-MM' → day → balance.
  const byMonth = {};
  (historyRows || []).forEach((row) => {
    if (!row || typeof row.date !== 'string') return;
    const [year, month, day] = row.date.split('-');
    if (!year || !month || !day) return;
    const balance = parseFloat(row.balance);
    if (!Number.isFinite(balance)) return;
    const key = `${year}-${month}`;
    if (!byMonth[key]) byMonth[key] = {};
    byMonth[key][parseInt(day, 10)] = balance;
  });

  const monthSeries = months.map(({ year, month }) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const balances = byMonth[key];
    if (!balances) return null;
    const monthDays = new Date(year, month + 1, 0).getDate();
    const series = [];
    let lastKnown;
    for (let day = 1; day <= daysInMonth; day++) {
      if (day <= monthDays && balances[day] !== undefined) lastKnown = balances[day];
      series.push(lastKnown);
    }
    return { key, monthDays, series };
  }).filter(Boolean);

  const yearAvg = [];
  for (let i = 0; i < daysInMonth; i++) {
    const values = monthSeries
      .map(m => m.series[i])
      .filter(v => v !== undefined && Number.isFinite(v));
    yearAvg.push(values.length > 0 ? median(values) : undefined);
  }

  // Daily-average column: the median of the per-month spending rates, so it is
  // directly comparable with the prev-month row (which is that month's expenses
  // divided by its length). Only months the account actually has history for
  // take part — the same months that shape the median line.
  const dailyRates = monthSeries.map(({ key, monthDays }) => {
    const total = parseFloat(monthlyExpenses?.[key] ?? '0');
    if (!Number.isFinite(total) || monthDays <= 0) return null;
    return -total / monthDays;
  }).filter(v => v !== null);

  return {
    yearAvg,
    yearAvgDailyAvg: dailyRates.length > 0 ? median(dailyRates) : null,
    yearAvgMonthCount: monthSeries.length,
  };
};

// Whole-year view: 365 daily balances would be both illegible and slow to draw,
// so the year is sampled on a fixed 7-day stride. A constant stride (rather than
// "N points per month") keeps the x-axis linear in time, so the slope of the line
// means the same thing everywhere on it.
export const YEAR_SAMPLE_STEP = 7;

const daysInYearOf = (year) =>
  ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);

// Sample days as day-of-year: 1, 8, 15 … A 365-day year lands its last stride
// exactly on day 365; a leap year gets day 366 appended so the line still reaches
// the end of the year (one short final segment beats a truncated one).
// Exported for unit testing.
export const buildYearSampleDays = (daysInYear) => {
  const days = [];
  for (let day = 1; day <= daysInYear; day += YEAR_SAMPLE_STEP) days.push(day);
  if (days[days.length - 1] !== daysInYear) days.push(daysInYear);
  return days;
};

// 'YYYY-MM-DD' → 1-based day of year. Parsed off the string (not via a local
// Date) so a timezone west of UTC can't shift a date onto the previous day.
export const dayOfYearFromDateString = (dateStr) => {
  if (typeof dateStr !== 'string') return null;
  const [year, month, day] = dateStr.split('-').map(part => parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const diff = Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1);
  return Math.round(diff / 86400000) + 1;
};

/**
 * Forward-fill a year of recorded balances and read it off at the sample days.
 *
 * `anchorBalance` is the balance carried in from before Jan 1, so a year whose
 * first snapshot lands in March still starts the line at a real number instead of
 * a gap. Days after `maxDay` (today, for the current year) stay undefined — the
 * chart must not draw a flat line into the future.
 *
 * Exported for unit testing.
 */
export const buildYearSeries = ({ historyRows, sampleDays, anchorBalance, maxDay }) => {
  const balanceByDay = {};
  (historyRows || []).forEach((row) => {
    if (!row || typeof row.date !== 'string') return;
    const balance = parseFloat(row.balance);
    if (!Number.isFinite(balance)) return;
    const day = dayOfYearFromDateString(row.date);
    if (day === null) return;
    balanceByDay[day] = balance;
  });

  const anchor = parseFloat(anchorBalance);
  let lastKnown = Number.isFinite(anchor) ? anchor : undefined;
  let cursor = 1;

  return sampleDays.map((sampleDay) => {
    for (; cursor <= sampleDay; cursor++) {
      if (balanceByDay[cursor] !== undefined) lastKnown = balanceByDay[cursor];
    }
    if (maxDay != null && sampleDay > maxDay) return undefined;
    return lastKnown;
  });
};

/**
 * Custom hook for loading and managing balance history data
 * Handles trend calculation, data visualization, and CRUD operations
 *
 * `selectedMonth === null` means the whole-year view, which loads a separate,
 * coarser dataset (see loadYearHistory) rather than the day-by-day month one.
 */
const useBalanceHistory = (selectedAccount, selectedYear, selectedMonth) => {
  const [balanceHistoryData, setBalanceHistoryData] = useState({ labels: [] });
  // Start in the loading state so the first render shows a spinner instead of a
  // momentary "no data" flash before loadBalanceHistory() runs (QoL-11). The
  // early-return in loadBalanceHistory() immediately resets this to false when no
  // account/month is selected, so "nothing selected" reads as a valid empty state
  // rather than an eternal spinner.
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

  // Whole-year view. Deliberately a much smaller dataset than the monthly one:
  // the actual balance sampled weekly, the same sampling of the previous year for
  // comparison, and nothing else. There is no burndown norm (a year-long line to
  // zero describes nothing) and no forecast (the month's prediction has no
  // year-scale counterpart).
  const loadYearHistory = useCallback(async () => {
    try {
      setLoadingBalanceHistory(true);

      const daysInYear = daysInYearOf(selectedYear);
      const prevDaysInYear = daysInYearOf(selectedYear - 1);
      const sampleDays = buildYearSampleDays(daysInYear);

      const startDateStr = formatDate(new Date(selectedYear, 0, 1));
      const endDateStr = formatDate(new Date(selectedYear, 11, 31));
      const prevStartDateStr = formatDate(new Date(selectedYear - 1, 0, 1));
      const prevEndDateStr = formatDate(new Date(selectedYear - 1, 11, 31));

      // For the running year the line stops at today — the remaining samples are
      // future days, and a forward-filled flat line through them would read as a
      // real (unchanging) balance.
      const now = new Date();
      const maxDay = selectedYear === now.getFullYear()
        ? dayOfYearFromDateString(formatDate(now))
        : null;

      const [
        history,
        prevHistory,
        anchorBalance,
        prevAnchorBalance,
        prevYearTotalExpenses,
      ] = await Promise.all([
        getBalanceHistory(selectedAccount, startDateStr, endDateStr),
        getBalanceHistory(selectedAccount, prevStartDateStr, prevEndDateStr),
        // Balance carried in from before Jan 1, so a year whose first snapshot
        // lands in March still starts at a real number instead of a gap.
        getAccountBalanceOnOrBeforeDate(selectedAccount, startDateStr),
        getAccountBalanceOnOrBeforeDate(selectedAccount, prevStartDateStr),
        getTotalExpenses(selectedAccount, prevStartDateStr, prevEndDateStr),
      ]);

      const actualForChart = buildYearSeries({
        historyRows: history,
        sampleDays,
        anchorBalance,
        maxDay,
      });

      // The previous year is read at the same day-of-year samples, so the two
      // lines are directly comparable at every x. A 366th sample in a leap year
      // simply holds the previous year's final value.
      const prevYear = buildYearSeries({
        historyRows: prevHistory,
        sampleDays,
        anchorBalance: prevAnchorBalance,
        maxDay: null,
      });

      const actual = sampleDays
        .map((day, index) => (actualForChart[index] === undefined
          ? null
          : { x: day, y: actualForChart[index] }))
        .filter(Boolean);

      setBalanceHistoryData({
        granularity: 'year',
        labels: sampleDays,
        actual,
        actualForChart,
        prevYear,
        prevYearTotalExpenses,
        prevYearDaysCount: prevDaysInYear,
        daysInYear,
        maxDay,
      });
    } catch (error) {
      console.error('Failed to load balance history:', error);
      setBalanceHistoryData({ labels: [] });
    } finally {
      setLoadingBalanceHistory(false);
    }
  }, [selectedAccount, selectedYear]);

  // Load balance history data
  const loadBalanceHistory = useCallback(async () => {
    if (!selectedAccount) {
      setBalanceHistoryData({ labels: [] });
      setLoadingBalanceHistory(false);
      return;
    }

    if (selectedMonth === null) {
      await loadYearHistory();
      return;
    }

    try {
      setLoadingBalanceHistory(true);

      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      // Calculate previous month dates.
      // When selectedMonth is 0 (January), selectedMonth - 1 = -1 which JS rolls
      // to December of the *same* year instead of decrementing the year — fix explicitly.
      const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYear  = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const prevMonthStart = new Date(prevYear, prevMonth, 1);
      const prevMonthEnd = new Date(selectedYear, selectedMonth, 0);
      const prevStartDateStr = formatDate(prevMonthStart);
      const prevEndDateStr = formatDate(prevMonthEnd);

      // Get current day of month
      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
      const currentDay = isCurrentMonth ? now.getDate() : endDate.getDate();

      // Current month's total expenses feed the spending prediction. For the
      // current month, cap the window at today — the prediction divides by
      // elapsed days, so future-dated operations (e.g. scheduled rent later this
      // month) must not inflate the average.
      const expenseEndStr = isCurrentMonth ? formatDate(now) : endDateStr;

      // Burndown ("plain avg") max is anchored to the balance at end of day 1 plus
      // every inflow/outflow *after* day 1 — day-1 activity is already baked into
      // that anchor, so the post-day-1 window starts on the 2nd (see plainAvgMax).
      const secondDayStr = formatDate(new Date(selectedYear, selectedMonth, 2));

      // 12-month comparison window for the "year average" line: from the same
      // month one year back through the end of the previous month.
      const yearWindowStartStr = formatDate(new Date(selectedYear, selectedMonth - 12, 1));

      // These reads are mutually independent — only the date strings above gate
      // them — so issue them concurrently instead of awaiting in series.
      const [
        history,
        yearHistory,
        prevMonthTotalExpenses,
        currentMonthTotalExpenses,
        firstDayBalance,
        transferTotals,
        incomeAfterDay1,
        yearMonthlyExpenses,
      ] = await Promise.all([
        getBalanceHistory(selectedAccount, startDateStr, endDateStr),
        // One read covers both comparison lines: the previous month is just the
        // tail of the 12-month window, sliced out below instead of re-queried.
        getBalanceHistory(selectedAccount, yearWindowStartStr, prevEndDateStr),
        getTotalExpenses(selectedAccount, prevStartDateStr, prevEndDateStr),
        getTotalExpenses(selectedAccount, startDateStr, expenseEndStr),
        getAccountBalanceOnOrBeforeDate(selectedAccount, startDateStr),
        getTransferTotals(selectedAccount, secondDayStr, endDateStr),
        getTotalIncome(selectedAccount, secondDayStr, endDateStr),
        getMonthlyExpenseTotals(selectedAccount, yearWindowStartStr, prevEndDateStr),
      ]);

      const prevMonthKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
      const prevHistory = (yearHistory || []).filter(
        item => typeof item?.date === 'string' && item.date.startsWith(prevMonthKey),
      );

      // Burndown line anchor (a.k.a. "plain avg" max): the ceiling of money
      // available to spend across the month. Start from the balance at end of day 1,
      // add every post-day-1 inflow (incoming transfers + income) and remove
      // outgoing transfers. Expenses are intentionally excluded — the burndown line
      // is precisely the depiction of that ceiling being spent down to zero. Null
      // when the day-1 balance is unknown (e.g. an account younger than the month);
      // the card then falls back to the peak-actual max.
      let plainAvgMax = null;
      if (firstDayBalance !== null && firstDayBalance !== undefined) {
        const computed = parseFloat(firstDayBalance)
          + parseFloat(transferTotals.incoming)
          - parseFloat(transferTotals.outgoing)
          + parseFloat(incomeAfterDay1);
        if (Number.isFinite(computed)) {
          plainAvgMax = computed;
        }
      }

      // Transform history data for chart
      const dataPoints = history.map(item => ({
        date: item.date,
        balance: parseFloat(item.balance),
      }));

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
            y: trend.intercept + trend.slope * (day - 1),
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
      // lastKnownPrevValue is carried forward so that days beyond the previous
      // month's length (e.g. day 31 when prev month is April) keep the final
      // balance instead of falling back to null/0 in the chart library.
      let lastKnownPrevValue;
      const prevMonthData = allDays.map(day => {
        if (day > prevMonthDays) {
          // Current month has more days than prev month — hold the last value flat
          return lastKnownPrevValue;
        }

        if (prevBalanceByDay[day] !== undefined) {
          lastKnownPrevValue = prevBalanceByDay[day];
          return lastKnownPrevValue;
        }

        // Forward fill: use the most recent balance before this day
        for (let d = day - 1; d >= 1; d--) {
          if (prevBalanceByDay[d] !== undefined) {
            lastKnownPrevValue = prevBalanceByDay[d];
            return lastKnownPrevValue;
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

      const yearAverage = buildYearAverageSeries({
        historyRows: yearHistory,
        monthlyExpenses: yearMonthlyExpenses,
        selectedYear,
        selectedMonth,
        daysInMonth,
      });

      setBalanceHistoryData({
        actual: actualData,
        actualForChart: actualForChart,
        trend: trendData,
        burndown: burndownData,
        prevMonth: prevMonthData,
        yearAvg: yearAverage.yearAvg,
        yearAvgDailyAvg: yearAverage.yearAvgDailyAvg,
        prevMonthTotalExpenses,
        prevMonthDaysCount: prevMonthDays,
        currentMonthTotalExpenses,
        plainAvgMax,
        labels: allDays,
      });
    } catch (error) {
      console.error('Failed to load balance history:', error);
      setBalanceHistoryData({ labels: [] });
    } finally {
      setLoadingBalanceHistory(false);
    }
  }, [selectedAccount, selectedYear, selectedMonth, loadYearHistory]);

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
