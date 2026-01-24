import { useState, useCallback, useMemo, useEffect } from 'react';
import { getMonthlySpendingByCategories } from '../services/OperationsDB';
import { getAllDescendants } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Custom hook for loading monthly spending data for a specific category
 * Includes all descendant categories in the totals
 * @param {number} selectedYear - Year to query
 * @param {string} selectedCurrency - Currency code
 * @param {string|null} selectedCategoryId - Category ID to show spending for
 * @param {Array} categories - Array of all categories
 */
const useCategoryMonthlySpending = (selectedYear, selectedCurrency, selectedCategoryId, categories) => {
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);

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

      // Get monthly spending data
      const spending = await getMonthlySpendingByCategories(
        selectedCurrency,
        selectedYear,
        categoryIds,
      );

      // Create a map of month to total for easy lookup
      const spendingMap = new Map();
      spending.forEach(item => {
        spendingMap.set(item.month, item.total);
      });

      // Build array of 12 months (fill 0 for missing months)
      const fullYearData = [];
      for (let month = 1; month <= 12; month++) {
        fullYearData.push({
          month,
          total: spendingMap.get(month) || 0,
        });
      }

      setMonthlyData(fullYearData);
    } catch (error) {
      console.error('Failed to load category monthly spending:', error);
      setMonthlyData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedCurrency, selectedCategoryId]);

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
