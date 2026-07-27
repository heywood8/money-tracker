import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import * as BudgetsDB from '../services/BudgetsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const BudgetsDataContext = createContext();

/** Current month as YYYY-MM (local calendar). */
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const BudgetsDataProvider = ({ children }) => {
  const [budgets, setBudgets] = useState([]);
  const [budgetStatuses, setBudgetStatuses] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);
  // Whether spending in other currencies counts toward each budget (converted
  // into the budget's currency at the current rate). On by default so
  // multi-currency totals are complete out of the box — same default as the
  // Graphs convert toggle. Mirrored in a ref so refreshBudgetStatuses keeps a
  // stable identity (its consumers subscribe to events with it as a dep).
  const convertAllRef = useRef(true);
  const [convertAllBudgets, setConvertAllBudgetsState] = useState(true);
  // The currency the Budgets tab is READ in. Empty until the screen seeds it from
  // the accounts. It is a display setting, not data: picking AMD converts every
  // figure on the tab into AMD at the current rate, it does not rewrite the
  // currency the plan (or any line) is stored in. Lives here, next to the
  // convert-all toggle, because BudgetPlansDataContext has to recompute its plan
  // statuses in the same unit the screen prints — a status computed in the plan's
  // stored currency while the rows convert to the chosen one is how the tab ended
  // up showing RUB totals under an AMD chip.
  const [displayCurrency, setDisplayCurrency] = useState('');
  // Reference date the budget statuses are computed for. `undefined` means
  // "today" (default). The merged Budgets screen sets this to a mid-month date
  // when the user navigates to another month, so per-category spent/exceeded
  // reflects the shown month. Kept in a ref so refreshBudgetStatuses keeps a
  // stable identity while event-driven refreshes still honor the chosen month.
  const referenceDateRef = useRef(undefined);

  /**
   * Refresh budget statuses for all active budgets
   */
  const refreshBudgetStatuses = useCallback(async () => {
    try {
      const statusMap = await BudgetsDB.calculateAllBudgetStatuses(referenceDateRef.current, convertAllRef.current);
      setBudgetStatuses(statusMap);
    } catch (error) {
      console.error('Failed to refresh budget statuses:', error);
    }
  }, []);

  /**
   * Point the status computation at a specific month (YYYY-MM) and recompute.
   * The current month resolves to `undefined` (today) so behavior is unchanged
   * for the common case; other months use a mid-month reference date, which
   * keeps monthly budgets scoped to that calendar month. Weekly/yearly budgets
   * fall back to their own period around that date (documented edge case).
   */
  const setBudgetStatusMonth = useCallback((monthKey) => {
    const nextRef = (!monthKey || monthKey === currentMonthKey())
      ? undefined
      : (() => {
        const [y, m] = monthKey.split('-').map(Number);
        return new Date(y, m - 1, 15);
      })();
    const prevTime = referenceDateRef.current ? referenceDateRef.current.getTime() : null;
    const nextTime = nextRef ? nextRef.getTime() : null;
    if (prevTime === nextTime) return;
    referenceDateRef.current = nextRef;
    refreshBudgetStatuses();
  }, [refreshBudgetStatuses]);

  /**
   * Flip the convert-all-currencies mode and recompute statuses with it.
   */
  const setConvertAllBudgets = useCallback((value) => {
    const next = typeof value === 'function' ? value(convertAllRef.current) : value;
    if (next === convertAllRef.current) return;
    convertAllRef.current = next;
    setConvertAllBudgetsState(next);
    refreshBudgetStatuses();
  }, [refreshBudgetStatuses]);

  /**
   * Load all budgets from database
   */
  const reloadBudgets = useCallback(async () => {
    try {
      setLoading(true);
      const budgetsData = await BudgetsDB.getAllBudgets();
      setBudgets(budgetsData);

      // Refresh statuses for all active budgets
      await refreshBudgetStatuses();

      setSaveError(null);
    } catch (error) {
      console.error('Failed to load budgets:', error);
      setSaveError(error.message);
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, [refreshBudgetStatuses]);

  /**
   * Load budgets on mount
   */
  useEffect(() => {
    reloadBudgets();
  }, [reloadBudgets]);

  /**
   * Listen for operation changes to refresh statuses
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      console.debug('Operation changed, refreshing budget statuses...');
      refreshBudgetStatuses();
    });

    return unsubscribe;
  }, [refreshBudgetStatuses]);

  /**
   * Listen for budget reload events
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.debug('Reloading all budgets...');
      reloadBudgets();
    });

    return unsubscribe;
  }, [reloadBudgets]);

  /**
   * Listen for DATABASE_RESET event to clear budgets
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('BudgetsDataContext: Database reset detected, clearing budgets');
      setBudgets([]);
      setBudgetStatuses(new Map());
    });

    return unsubscribe;
  }, []);

  const value = useMemo(() => ({
    // Public data
    budgets,
    budgetStatuses,
    loading,
    saveError,
    convertAllBudgets,
    setConvertAllBudgets,
    displayCurrency,
    setDisplayCurrency,
    setBudgetStatusMonth,
    reloadBudgets,
    refreshBudgetStatuses,
    // Internal setters for actions context
    _setBudgets: setBudgets,
    _setBudgetStatuses: setBudgetStatuses,
    _setSaveError: setSaveError,
  }), [
    budgets,
    budgetStatuses,
    loading,
    saveError,
    convertAllBudgets,
    setConvertAllBudgets,
    displayCurrency,
    setBudgetStatusMonth,
    reloadBudgets,
    refreshBudgetStatuses,
  ]);

  return (
    <BudgetsDataContext.Provider value={value}>
      {children}
    </BudgetsDataContext.Provider>
  );
};

BudgetsDataProvider.propTypes = {
  children: PropTypes.node,
};

export const useBudgetsData = () => useContext(BudgetsDataContext);
