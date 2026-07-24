import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import * as BudgetPlansDB from '../services/BudgetPlansDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const BudgetPlansDataContext = createContext();

/**
 * Holds the list of budget plans (Budgets v2). Lines and derived totals are loaded
 * on demand through the actions context — this context only tracks the plans
 * themselves so the tree doesn't re-render on per-line edits.
 */
export const BudgetPlansDataProvider = ({ children }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  /**
   * Load all plans from the database.
   */
  const reloadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await BudgetPlansDB.getAllPlans();
      setPlans(data);
      setSaveError(null);
    } catch (error) {
      console.error('Failed to load budget plans:', error);
      setSaveError(error.message);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadPlans();
  }, [reloadPlans]);

  // Reload on the global RELOAD_ALL signal (e.g. after a restore).
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.debug('Reloading all budget plans...');
      reloadPlans();
    });
    return unsubscribe;
  }, [reloadPlans]);

  // Clear state on a database reset — the tables are gone until the user finishes
  // re-onboarding, and reloading now would race the reset.
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('BudgetPlansDataContext: Database reset detected, clearing plans');
      setPlans([]);
    });
    return unsubscribe;
  }, []);

  const value = useMemo(() => ({
    plans,
    loading,
    saveError,
    reloadPlans,
    // Internal setters for the actions context.
    _setPlans: setPlans,
    _setSaveError: setSaveError,
  }), [plans, loading, saveError, reloadPlans]);

  return (
    <BudgetPlansDataContext.Provider value={value}>
      {children}
    </BudgetPlansDataContext.Provider>
  );
};

BudgetPlansDataProvider.propTypes = {
  children: PropTypes.node,
};

export const useBudgetPlansData = () => useContext(BudgetPlansDataContext);
