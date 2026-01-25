import { useState, useCallback, useMemo, useEffect } from 'react';
import { getLast12MonthsSpendingByCategories } from '../services/OperationsDB';
import { getAllDescendants } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Custom hook for loading monthly spending data for a specific category
 * Shows the last 12 months (rolling window)
 * Includes all descendant categories in the totals
 * @param {string} selectedCurrency - Currency code
 * @param {string|null} selectedCategoryId - Category ID to show spending for
 * @param {Array} categories - Array of all categories
 */
const useCategoryMonthlySpending = (selectedCurrency, selectedCategoryId, categories) => {
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate the last 12 months as YYYY-MM strings
  const last12Months = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        yearMonth,
        year: date.getFullYear(),
        month: date.getMonth(), // 0-11
      });
    }
    return months;
  }, []);

  // Load monthly spending data
  const loadData = useCallback(async () => {
    if (!selectedCurrency || !selectedCategoryId) {
      setMonthlyData([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get all descendant category IDs including the selected category itself
      const descendants = await getAllDescendants(selectedCategoryId);
      const categoryIds = [selectedCategoryId, ...descendants.map(d => d.id)];

      // Get last 12 months spending data
      const spending = await getLast12MonthsSpendingByCategories(
        selectedCurrency,
        categoryIds,
      );

      // Create a map of yearMonth to total for easy lookup
      const spendingMap = new Map();
      spending.forEach(item => {
        spendingMap.set(item.yearMonth, item.total);
      });

      // Build array of 12 months (fill 0 for missing months)
      const fullYearData = last12Months.map(monthInfo => ({
        yearMonth: monthInfo.yearMonth,
        year: monthInfo.year,
        month: monthInfo.month,
        total: spendingMap.get(monthInfo.yearMonth) || 0,
      }));

      setMonthlyData(fullYearData);
    } catch (error) {
      console.error('Failed to load category monthly spending:', error);
      setMonthlyData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCurrency, selectedCategoryId, last12Months]);

  // Calculate total yearly spending
  const totalYearlySpending = useMemo(() => {
    return monthlyData.reduce((sum, item) => sum + item.total, 0);
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
