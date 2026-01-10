import { useState, useCallback, useMemo } from 'react';
import { getSpendingByCategoryAndCurrency } from '../services/OperationsDB';
import { formatDate } from '../services/BalanceHistoryDB';

/**
 * Custom hook for loading and managing expense data for GraphsScreen
 * Handles data aggregation by category, hierarchy navigation, and forecast calculations
 */
const useExpenseData = (selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors, t) => {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load expense data
  const loadExpenseData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoading(true);

      // Calculate start and end dates for the selected month or full year
      let startDate, endDate;
      if (selectedMonth === null) {
        // Full year view
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else {
        // Single month view
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      }

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      // Get spending data
      const spending = await getSpendingByCategoryAndCurrency(
        selectedCurrency,
        startDateStr,
        endDateStr,
      );

      // Create a map of category ID to category object
      const categoryMap = new Map();
      categories.forEach(cat => {
        categoryMap.set(cat.id, cat);
      });

      // Create a Set of shadow category IDs for easy lookup
      const shadowCategoryIds = new Set();
      categories.forEach(cat => {
        if (cat.isShadow) {
          shadowCategoryIds.add(cat.id);
        }
      });

      // Helper function to get the root parent (top-level folder) of a category
      const getRootParent = (categoryId) => {
        let current = categoryMap.get(categoryId);
        if (!current) return null;

        while (current.parentId) {
          current = categoryMap.get(current.parentId);
          if (!current) return null;
        }
        return current;
      };

      // Separate shadow categories from regular categories
      const regularSpending = [];
      let shadowCategoryTotal = 0;

      spending.forEach(item => {
        if (shadowCategoryIds.has(item.category_id)) {
          // Accumulate shadow category amounts
          shadowCategoryTotal += parseFloat(item.total);
        } else {
          // Keep regular categories
          regularSpending.push(item);
        }
      });

      // Helper function to check if a category is excluded from forecast
      const isCategoryExcludedFromForecast = (categoryId) => {
        let current = categoryMap.get(categoryId);
        while (current) {
          if (current.excludeFromForecast) {
            return true;
          }
          current = current.parentId ? categoryMap.get(current.parentId) : null;
        }
        return false;
      };

      // Aggregate spending based on selected category
      let aggregatedSpending = {};

      if (selectedCategory === 'all') {
        // When "All categories" is selected, aggregate by root folders
        regularSpending.forEach(item => {
          const rootParent = getRootParent(item.category_id);
          if (rootParent) {
            const rootId = rootParent.id;
            const isExcluded = isCategoryExcludedFromForecast(item.category_id);
            const amount = parseFloat(item.total);

            if (!aggregatedSpending[rootId]) {
              aggregatedSpending[rootId] = {
                category: rootParent,
                total: 0,
                forecastTotal: 0, // Total excluding excluded categories
              };
            }
            aggregatedSpending[rootId].total += amount;

            // Only add to forecastTotal if not excluded
            if (!isExcluded) {
              aggregatedSpending[rootId].forecastTotal += amount;
            }
          }
        });
      } else {
        // When a specific folder is selected, show only immediate children
        regularSpending.forEach(item => {
          const category = categoryMap.get(item.category_id);
          if (!category) return;

          const isExcluded = isCategoryExcludedFromForecast(item.category_id);
          const amount = parseFloat(item.total);

          // Check if this category is a direct child of the selected folder
          if (category.parentId === selectedCategory) {
            if (!aggregatedSpending[category.id]) {
              aggregatedSpending[category.id] = {
                category: category,
                total: 0,
                forecastTotal: 0,
              };
            }
            aggregatedSpending[category.id].total += amount;
            if (!isExcluded) {
              aggregatedSpending[category.id].forecastTotal += amount;
            }
          } else {
            // Check if this category is a descendant of the selected folder
            // If so, aggregate it under its direct parent (immediate child of selected folder)
            let current = category;
            while (current.parentId) {
              const parent = categoryMap.get(current.parentId);
              if (!parent) break;

              if (parent.id === selectedCategory) {
                // Current is a direct child of the selected folder
                if (!aggregatedSpending[current.id]) {
                  aggregatedSpending[current.id] = {
                    category: current,
                    total: 0,
                    forecastTotal: 0,
                  };
                }
                aggregatedSpending[current.id].total += amount;
                if (!isExcluded) {
                  aggregatedSpending[current.id].forecastTotal += amount;
                }
                break;
              }
              current = parent;
            }
          }
        });
      }

      // Chart colors (vibrant palette)
      const chartColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
        '#FFCE56', '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0',
      ];

      // Transform aggregated data for pie chart
      const data = Object.values(aggregatedSpending).map((item, index) => {
        return {
          name: item.category.name,
          amount: item.total,
          color: chartColors[index % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: item.category.icon || null,
          categoryId: item.category.id, // For clickable legend navigation
          forecastAmount: item.forecastTotal !== undefined ? item.forecastTotal : item.total, // Amount to use for forecast (excluding excluded categories)
        };
      });

      // Sort by amount descending
      data.sort((a, b) => b.amount - a.amount);

      // Add aggregated balance adjustments if there are any (amounts are already positive for expenses)
      // Only show balance adjustments in the root "All categories" view
      if (shadowCategoryTotal > 0 && selectedCategory === 'all') {
        data.push({
          name: t('balance_adjustments'),
          amount: shadowCategoryTotal,
          color: chartColors[data.length % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: null,
          forecastAmount: shadowCategoryTotal, // Balance adjustments are included in forecast
        });
      }

      setChartData(data);
    } catch (error) {
      console.error('Failed to load expense data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors.text, t]);

  // Calculate total expenses
  const totalExpenses = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.amount, 0);
  }, [chartData]);

  return {
    chartData,
    loading,
    loadExpenseData,
    totalExpenses,
  };
};

export default useExpenseData;
