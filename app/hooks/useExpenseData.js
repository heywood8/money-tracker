import { useState, useCallback, useMemo, useEffect } from 'react';
import { getSpendingByCategoryAndCurrency } from '../services/OperationsDB';
import { formatDate } from '../services/BalanceHistoryDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import * as Currency from '../services/currency';

const CHART_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
  '#FFCE56', '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0',
];

/**
 * Custom hook for loading and managing expense data for GraphsScreen.
 * DB is queried once per period/currency/account change. Category switches
 * re-aggregate the cached raw data synchronously (no DB hit).
 */
const useExpenseData = (selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors, t) => {
  const [rawSpending, setRawSpending] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadExpenseData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoading(true);

      let startDate, endDate;
      if (selectedMonth === null) {
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else {
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      }

      const spending = await getSpendingByCategoryAndCurrency(
        selectedCurrency,
        formatDate(startDate),
        formatDate(endDate),
      );

      setRawSpending(spending);
    } catch (error) {
      console.error('Failed to load expense data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency]);

  // Aggregate cached raw spending for the current category — no DB hit
  const chartData = useMemo(() => {
    if (!rawSpending || !selectedCurrency) return [];

    const categoryMap = new Map();
    categories.forEach(cat => categoryMap.set(cat.id, cat));

    const shadowCategoryIds = new Set(
      categories.filter(cat => cat.isShadow).map(cat => cat.id),
    );

    const getRootParent = (categoryId) => {
      let current = categoryMap.get(categoryId);
      if (!current) return null;
      while (current.parentId) {
        current = categoryMap.get(current.parentId);
        if (!current) return null;
      }
      return current;
    };

    const regularSpending = [];
    let shadowCategoryTotal = '0';

    rawSpending.forEach(item => {
      if (shadowCategoryIds.has(item.category_id)) {
        shadowCategoryTotal = Currency.add(shadowCategoryTotal, item.total);
      } else {
        regularSpending.push(item);
      }
    });

    const aggregatedSpending = {};

    if (selectedCategory === 'all') {
      regularSpending.forEach(item => {
        const rootParent = getRootParent(item.category_id);
        if (rootParent) {
          const rootId = rootParent.id;
          if (!aggregatedSpending[rootId]) {
            aggregatedSpending[rootId] = { category: rootParent, total: '0' };
          }
          aggregatedSpending[rootId].total = Currency.add(aggregatedSpending[rootId].total, item.total);
        }
      });
    } else {
      regularSpending.forEach(item => {
        const category = categoryMap.get(item.category_id);
        if (!category) return;

        if (category.parentId === selectedCategory) {
          if (!aggregatedSpending[category.id]) {
            aggregatedSpending[category.id] = { category, total: '0' };
          }
          aggregatedSpending[category.id].total = Currency.add(aggregatedSpending[category.id].total, item.total);
        } else {
          let current = category;
          while (current.parentId) {
            const parent = categoryMap.get(current.parentId);
            if (!parent) break;
            if (parent.id === selectedCategory) {
              if (!aggregatedSpending[current.id]) {
                aggregatedSpending[current.id] = { category: current, total: '0' };
              }
              aggregatedSpending[current.id].total = Currency.add(aggregatedSpending[current.id].total, item.total);
              break;
            }
            current = parent;
          }
        }
      });
    }

    const data = Object.values(aggregatedSpending).map((item, index) => {
      const hasChildren = categories.some(cat => cat.parentId === item.category.id);
      return {
        name: item.category.name,
        amount: parseFloat(item.total),
        color: CHART_COLORS[index % CHART_COLORS.length],
        legendFontColor: colors.text,
        legendFontSize: 13,
        icon: item.category.icon || null,
        categoryId: item.category.id,
        hasChildren,
      };
    });

    data.sort((a, b) => b.amount - a.amount);

    if (parseFloat(shadowCategoryTotal) > 0 && selectedCategory === 'all') {
      data.push({
        name: t('balance_adjustments'),
        amount: parseFloat(shadowCategoryTotal),
        color: CHART_COLORS[data.length % CHART_COLORS.length],
        legendFontColor: colors.text,
        legendFontSize: 13,
        icon: null,
      });
    }

    return data;
  }, [rawSpending, selectedCategory, categories, colors.text, t, selectedCurrency]);

  const totalExpenses = useMemo(
    () => parseFloat(chartData.reduce((sum, item) => Currency.add(sum, item.amount), '0')),
    [chartData],
  );

  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      loadExpenseData();
    });
    return unsubscribe;
  }, [loadExpenseData]);

  return {
    chartData,
    loading,
    loadExpenseData,
    totalExpenses,
  };
};

export default useExpenseData;
