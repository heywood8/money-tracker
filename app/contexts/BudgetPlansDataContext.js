import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import * as BudgetPlansDB from '../services/BudgetPlansDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useBudgetsData } from './BudgetsDataContext';

const BudgetPlansDataContext = createContext();

/**
 * Holds the list of budget plans (Budgets v2) and their plan-vs-actual statuses.
 * Lines and derived totals are loaded on demand through the actions context —
 * this context only tracks the plans themselves so the tree doesn't re-render on
 * per-line edits. Statuses refresh on operation changes (same event subscription
 * pattern BudgetsDataContext uses) and follow the shared convert-all toggle from
 * BudgetsDataContext, so the whole Budget tab converts consistently.
 */
export const BudgetPlansDataProvider = ({ children }) => {
  const [plans, setPlans] = useState([]);
  const [planStatuses, setPlanStatuses] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  // Shared convert-all state: BudgetPlansProvider is mounted inside
  // BudgetsProvider (App.js), but fall back to the same default (true) when
  // rendered standalone (tests). Mirrored in a ref so refreshPlanStatuses keeps
  // a stable identity for its event subscription.
  const budgetsData = useBudgetsData();
  const convertAllPlans = budgetsData?.convertAllBudgets ?? true;
  const convertAllRef = useRef(convertAllPlans);

  /**
   * Recompute plan-vs-actual statuses for all plans (each in its own currency).
   */
  const refreshPlanStatuses = useCallback(async () => {
    try {
      const statusMap = await BudgetPlansDB.calculateAllPlanStatuses(convertAllRef.current);
      setPlanStatuses(statusMap);
    } catch (error) {
      console.error('Failed to refresh plan statuses:', error);
    }
  }, []);

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

  // Recompute statuses whenever the plans list or the convert toggle changes.
  // The ref is synced first so the event-driven refresh below always uses the
  // latest toggle value.
  useEffect(() => {
    convertAllRef.current = convertAllPlans;
    refreshPlanStatuses();
  }, [plans, convertAllPlans, refreshPlanStatuses]);

  // Refresh statuses when operations change, so actuals track reality live.
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
      console.debug('Operation changed, refreshing plan statuses...');
      refreshPlanStatuses();
    });
    return unsubscribe;
  }, [refreshPlanStatuses]);

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
      setPlanStatuses(new Map());
    });
    return unsubscribe;
  }, []);

  const value = useMemo(() => ({
    plans,
    planStatuses,
    loading,
    saveError,
    reloadPlans,
    refreshPlanStatuses,
    // Internal setters for the actions context.
    _setPlans: setPlans,
    _setSaveError: setSaveError,
  }), [plans, planStatuses, loading, saveError, reloadPlans, refreshPlanStatuses]);

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
