import { useState, useCallback, useEffect } from 'react';
import { getOperationsByCategoryAndCurrency } from '../services/OperationsDB';
import { formatDate } from '../services/BalanceHistoryDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Load the individual operations of a single (leaf) category for the Graphs
 * pie-chart drill-down. When `categoryId` is null (no leaf selected) the hook
 * stays idle and returns an empty list without querying the DB. Reloads on
 * period / currency / category change and on OPERATION_CHANGED.
 *
 * @param {number} selectedYear
 * @param {number|null} selectedMonth - null means full-year
 * @param {string} selectedCurrency
 * @param {string|null} categoryId - leaf category id, or null when inactive
 * @param {string} [type] - 'expense' | 'income'
 * @param {boolean} [convertAllCurrencies] - include foreign-currency operations,
 *   converted to selectedCurrency (each op carries accountCurrency + convertedAmount)
 */
const useCategoryOperations = (selectedYear, selectedMonth, selectedCurrency, categoryId, type, convertAllCurrencies = false) => {
  const [operations, setOperations] = useState([]);
  const [loadingOperations, setLoadingOperations] = useState(false);

  const loadOperations = useCallback(async () => {
    if (!selectedCurrency || !categoryId) {
      setOperations([]);
      return;
    }

    try {
      setLoadingOperations(true);

      let startDate, endDate;
      if (selectedMonth === null) {
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else {
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      }

      const ops = await getOperationsByCategoryAndCurrency(
        categoryId,
        selectedCurrency,
        formatDate(startDate),
        formatDate(endDate),
        type,
        convertAllCurrencies,
      );

      setOperations(ops);
    } catch (error) {
      console.error('Failed to load category operations:', error);
      setOperations([]);
    } finally {
      setLoadingOperations(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, categoryId, type, convertAllCurrencies]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      loadOperations();
    });
    return unsubscribe;
  }, [loadOperations]);

  return {
    operations,
    loadingOperations,
  };
};

export default useCategoryOperations;
