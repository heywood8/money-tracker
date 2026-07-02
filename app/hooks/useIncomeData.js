import { useState, useCallback, useMemo, useEffect } from 'react';
import { getIncomeByCategoryAndCurrency } from '../services/OperationsDB';
import { formatDate } from '../services/BalanceHistoryDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import * as Currency from '../services/currency';

const CHART_COLORS = [
  '#4BC0C0', '#36A2EB', '#9966FF', '#FF9F40', '#FFCE56',
  '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40', '#FFCE56',
  '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0', '#FF9F40',
];

/**
 * Custom hook for loading and managing income data for GraphsScreen.
 * DB is queried once per period/currency change. Category switches
 * re-aggregate the cached raw data synchronously (no DB hit).
 */
const useIncomeData = (selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors, t) => {
  const [rawIncome, setRawIncome] = useState(null);
  const [loadingIncome, setLoadingIncome] = useState(false);

  const loadIncomeData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoadingIncome(true);

      let startDate, endDate;
      if (selectedMonth === null) {
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else {
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      }

      const income = await getIncomeByCategoryAndCurrency(
        selectedCurrency,
        formatDate(startDate),
        formatDate(endDate),
      );

      setRawIncome(income);
    } catch (error) {
      console.error('Failed to load income data:', error);
    } finally {
      setLoadingIncome(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency]);

  // Aggregate cached raw income for the current category — no DB hit
  const incomeChartData = useMemo(() => {
    if (!rawIncome || !selectedCurrency) return [];

    const categoryMap = new Map();
    categories.forEach(cat => categoryMap.set(cat.id, cat));

    const getRootParent = (categoryId) => {
      let current = categoryMap.get(categoryId);
      if (!current) return null;
      while (current.parentId) {
        current = categoryMap.get(current.parentId);
        if (!current) return null;
      }
      return current;
    };

    const aggregatedIncome = {};

    if (selectedIncomeCategory === 'all') {
      rawIncome.forEach(item => {
        const rootParent = getRootParent(item.category_id);
        if (rootParent) {
          const rootId = rootParent.id;
          if (!aggregatedIncome[rootId]) {
            aggregatedIncome[rootId] = { category: rootParent, total: '0' };
          }
          aggregatedIncome[rootId].total = Currency.add(aggregatedIncome[rootId].total, item.total);
        }
      });
    } else {
      rawIncome.forEach(item => {
        const category = categoryMap.get(item.category_id);
        if (!category) return;

        // Income recorded directly on the selected category itself must not be
        // dropped — without its own bucket the drill-down total shrinks below the
        // parent's slice in the "all" view.
        if (category.id === selectedIncomeCategory) {
          if (!aggregatedIncome[category.id]) {
            aggregatedIncome[category.id] = { category, total: '0' };
          }
          aggregatedIncome[category.id].total = Currency.add(aggregatedIncome[category.id].total, item.total);
        } else if (category.parentId === selectedIncomeCategory) {
          if (!aggregatedIncome[category.id]) {
            aggregatedIncome[category.id] = { category, total: '0' };
          }
          aggregatedIncome[category.id].total = Currency.add(aggregatedIncome[category.id].total, item.total);
        } else {
          let current = category;
          while (current.parentId) {
            const parent = categoryMap.get(current.parentId);
            if (!parent) break;
            if (parent.id === selectedIncomeCategory) {
              if (!aggregatedIncome[current.id]) {
                aggregatedIncome[current.id] = { category: current, total: '0' };
              }
              aggregatedIncome[current.id].total = Currency.add(aggregatedIncome[current.id].total, item.total);
              break;
            }
            current = parent;
          }
        }
      });
    }

    const data = Object.values(aggregatedIncome).map((item, index) => {
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

    return data;
  }, [rawIncome, selectedIncomeCategory, categories, colors.text, selectedCurrency]);

  const totalIncome = useMemo(
    () => parseFloat(incomeChartData.reduce((sum, item) => Currency.add(sum, item.amount), '0')),
    [incomeChartData],
  );

  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      loadIncomeData();
    });
    return unsubscribe;
  }, [loadIncomeData]);

  return {
    incomeChartData,
    loadingIncome,
    loadIncomeData,
    totalIncome,
  };
};

export default useIncomeData;
