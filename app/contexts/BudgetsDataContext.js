import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import * as BudgetsDB from '../services/BudgetsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const BudgetsDataContext = createContext();

export const BudgetsDataProvider = ({ children }) => {
  const [budgets, setBudgets] = useState([]);
  const [budgetStatuses, setBudgetStatuses] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  /**
   * Refresh budget statuses for all active budgets
   */
  const refreshBudgetStatuses = useCallback(async () => {
    try {
      const statusMap = await BudgetsDB.calculateAllBudgetStatuses();
      setBudgetStatuses(statusMap);
    } catch (error) {
      console.error('Failed to refresh budget statuses:', error);
    }
  }, []);

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
