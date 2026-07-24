import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import * as BudgetsDB from '../services/BudgetsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const BudgetsDataContext = createContext();

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

  /**
   * Refresh budget statuses for all active budgets
   */
  const refreshBudgetStatuses = useCallback(async () => {
    try {
      const statusMap = await BudgetsDB.calculateAllBudgetStatuses(undefined, convertAllRef.current);
      setBudgetStatuses(statusMap);
    } catch (error) {
      console.error('Failed to refresh budget statuses:', error);
    }
  }, []);

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
