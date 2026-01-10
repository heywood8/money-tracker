import { useState, useCallback, useMemo } from 'react';
import { getIncomeByCategoryAndCurrency } from '../services/OperationsDB';
import { formatDate } from '../services/BalanceHistoryDB';

/**
 * Custom hook for loading and managing income data for GraphsScreen
 * Handles data aggregation by category and hierarchy navigation
 */
const useIncomeData = (selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors, t) => {
  const [incomeChartData, setIncomeChartData] = useState([]);
  const [loadingIncome, setLoadingIncome] = useState(true);

  // Load income data
  const loadIncomeData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoadingIncome(true);

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

      // Get income data
      const income = await getIncomeByCategoryAndCurrency(
        selectedCurrency,
        startDateStr,
        endDateStr,
      );

      // Create a map of category ID to category object
      const categoryMap = new Map();
      categories.forEach(cat => {
        categoryMap.set(cat.id, cat);
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

      // Aggregate income based on selected category
      let aggregatedIncome = {};

      if (selectedIncomeCategory === 'all') {
        // When "All categories" is selected, aggregate by root folders
        income.forEach(item => {
          const rootParent = getRootParent(item.category_id);
          if (rootParent) {
            const rootId = rootParent.id;
            if (!aggregatedIncome[rootId]) {
              aggregatedIncome[rootId] = {
                category: rootParent,
                total: 0,
              };
            }
            aggregatedIncome[rootId].total += parseFloat(item.total);
          }
        });
      } else {
        // When a specific folder is selected, show only immediate children
        income.forEach(item => {
          const category = categoryMap.get(item.category_id);
          if (!category) return;

          // Check if this category is a direct child of the selected folder
          if (category.parentId === selectedIncomeCategory) {
            if (!aggregatedIncome[category.id]) {
              aggregatedIncome[category.id] = {
                category: category,
                total: 0,
              };
            }
            aggregatedIncome[category.id].total += parseFloat(item.total);
          } else {
            // Check if this category is a descendant of the selected folder
            // If so, aggregate it under its direct parent (immediate child of selected folder)
            let current = category;
            while (current.parentId) {
              const parent = categoryMap.get(current.parentId);
              if (!parent) break;

              if (parent.id === selectedIncomeCategory) {
                // Current is a direct child of the selected folder
                if (!aggregatedIncome[current.id]) {
                  aggregatedIncome[current.id] = {
                    category: current,
                    total: 0,
                  };
                }
                aggregatedIncome[current.id].total += parseFloat(item.total);
                break;
              }
              current = parent;
            }
          }
        });
      }

      // Chart colors (vibrant palette - different from expenses)
      const chartColors = [
        '#4BC0C0', '#36A2EB', '#9966FF', '#FF9F40', '#FFCE56',
        '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40', '#FFCE56',
        '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0', '#FF9F40',
      ];

      // Transform aggregated data for pie chart
      const data = Object.values(aggregatedIncome).map((item, index) => {
        return {
          name: item.category.name,
          amount: item.total,
          color: chartColors[index % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: item.category.icon || null,
          categoryId: item.category.id, // For clickable legend navigation
        };
      });

      // Sort by amount descending
      data.sort((a, b) => b.amount - a.amount);

      setIncomeChartData(data);
    } catch (error) {
      console.error('Failed to load income data:', error);
    } finally {
      setLoadingIncome(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors.text, t]);

  // Calculate total income
  const totalIncome = useMemo(() => {
    return incomeChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [incomeChartData]);

  return {
    incomeChartData,
    loadingIncome,
    loadIncomeData,
    totalIncome,
  };
};

export default useIncomeData;
