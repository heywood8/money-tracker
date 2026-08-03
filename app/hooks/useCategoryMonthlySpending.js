import { useState, useCallback, useMemo, useEffect } from 'react';
import { getEarliestExpenseMonth, getMonthlySpendingHistoryByCategories } from '../services/OperationsDB';
import * as Currency from '../services/currency';
import { getAllDescendants } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Sentinel category id meaning "every expense", not a single category.
 * Kept distinct from `null` (which means "no series at all", used by the
 * comparison series when nothing is picked to compare against).
 */
export const ALL_EXPENSE_CATEGORIES = 'all';

// The window never gets shorter than a year, however new the ledger is: a
// three-bar chart says less about a spending habit than three bars and nine
// blanks do.
const MIN_MONTHS = 12;
// A guard against a nonsense date (a typo'd year, a bad import) turning into a
// chart with thousands of columns.
const MAX_MONTHS = 240;

/**
 * Every month from `startYearMonth` (or 12 months back, whichever is earlier)
 * through the current one.
 *
 * Computed per call (not memoized at mount) so the window follows a month
 * rollover during a long-lived session — the DB query recomputes its end from
 * "now" too, and the two must agree or the newest month's spending maps to
 * nothing.
 */
export const buildMonthWindow = (startYearMonth, now = new Date()) => {
  const currentIndex = now.getFullYear() * 12 + now.getMonth();
  let startIndex = currentIndex - (MIN_MONTHS - 1);

  if (startYearMonth) {
    const [year, month] = startYearMonth.split('-').map(Number);
    if (Number.isFinite(year) && Number.isFinite(month)) {
      startIndex = Math.min(startIndex, year * 12 + (month - 1));
    }
  }
  startIndex = Math.max(startIndex, currentIndex - (MAX_MONTHS - 1));

  const months = [];
  for (let index = startIndex; index <= currentIndex; index++) {
    const year = Math.floor(index / 12);
    const month = index % 12; // 0-11
    months.push({
      yearMonth: `${year}-${String(month + 1).padStart(2, '0')}`,
      year,
      month,
    });
  }
  return months;
};

/**
 * Custom hook for loading monthly spending data for a specific category
 * Covers every month back to the first expense ever recorded (at least 12)
 * Includes all descendant categories in the totals
 * @param {string} selectedCurrency - Currency code
 * @param {string|null} selectedCategoryId - Category ID to show spending for,
 *   or ALL_EXPENSE_CATEGORIES for the total across every expense
 * @param {Array} categories - Array of all categories
 */
const useCategoryMonthlySpending = (selectedCurrency, selectedCategoryId, categories, convertAllCurrencies = false) => {
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load monthly spending data
  const loadData = useCallback(async () => {
    if (!selectedCurrency || !selectedCategoryId) {
      setMonthlyData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get all descendant category IDs including the selected category itself.
      // `null` tells the DB layer to skip the category filter entirely, which
      // also picks up expenses left uncategorised.
      let categoryIds = null;
      if (selectedCategoryId !== ALL_EXPENSE_CATEGORIES) {
        const descendants = await getAllDescendants(selectedCategoryId);
        categoryIds = [selectedCategoryId, ...descendants.map(d => d.id)];
      }

      // The window is the ledger's own history, so the chart can be scrolled
      // back to the first expense instead of stopping a year ago.
      const earliestMonth = await getEarliestExpenseMonth();
      const monthWindow = buildMonthWindow(earliestMonth);

      const spending = await getMonthlySpendingHistoryByCategories(
        selectedCurrency,
        categoryIds,
        convertAllCurrencies,
        monthWindow[0].yearMonth,
      );

      // Create a map of yearMonth to total for easy lookup
      const spendingMap = new Map();
      spending.forEach(item => {
        spendingMap.set(item.yearMonth, item.total);
      });

      // Fill 0 for months with no spending.
      // totals arrive as Decimal-safe strings from the DB layer; convert to float here
      // since chart components need numeric values for bar height arithmetic.
      const windowData = monthWindow.map(monthInfo => ({
        yearMonth: monthInfo.yearMonth,
        year: monthInfo.year,
        month: monthInfo.month,
        total: parseFloat(spendingMap.get(monthInfo.yearMonth) || '0') || 0,
      }));

      setMonthlyData(windowData);
    } catch (error) {
      console.error('Failed to load category monthly spending:', error);
      setMonthlyData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCurrency, selectedCategoryId, convertAllCurrencies]);

  // Total across the whole loaded window using Decimal-safe addition before the final float conversion
  const totalYearlySpending = useMemo(() => {
    const total = monthlyData.reduce(
      (sum, item) => Currency.add(sum, String(item.total || '0')),
      '0',
    );
    return parseFloat(total) || 0;
  }, [monthlyData]);

  // Listen for operation changes and reload data
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      loadData();
    });

    return unsubscribe;
  }, [loadData]);

  // Load data when dependencies change
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    monthlyData,
    loading,
    totalYearlySpending,
    loadData,
  };
};

export default useCategoryMonthlySpending;
