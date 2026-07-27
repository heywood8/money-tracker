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
  // The currency the Budgets tab is being read in (see BudgetsDataContext). Every
  // status is computed in it rather than in each plan's stored currency, so the
  // totals the screen prints are in the same unit as the rows above them. Empty
  // (screen hasn't seeded it yet) falls back to the plan's own currency.
  const displayCurrency = budgetsData?.displayCurrency || null;
  const displayCurrencyRef = useRef(displayCurrency);

  // Monotonic token guarding against out-of-order status refreshes. Two
  // independent triggers race here — the convert-all toggle and OPERATION_CHANGED
  // — and their async recomputes can resolve in any order; a slow stale one must
  // not clobber a fresher result. Bumped on every refresh start and on
  // DATABASE_RESET (so an in-flight refresh can't repopulate after a reset).
  const refreshTokenRef = useRef(0);

  /**
   * Recompute plan-vs-actual statuses for all plans, in the tab's display
   * currency (falling back to each plan's own currency when none is chosen).
   * Only the newest in-flight refresh is allowed to commit its result.
   */
  const refreshPlanStatuses = useCallback(async () => {
    const token = ++refreshTokenRef.current;
    try {
      const statusMap = await BudgetPlansDB.calculateAllPlanStatuses(
        convertAllRef.current,
        displayCurrencyRef.current,
      );
      if (token === refreshTokenRef.current) {
        setPlanStatuses(statusMap);
      }
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

  // Recompute statuses whenever the plans list, the convert toggle or the tab's
  // display currency changes. The refs are synced first so the event-driven
  // refresh below always uses the latest values.
  useEffect(() => {
    convertAllRef.current = convertAllPlans;
    displayCurrencyRef.current = displayCurrency;
    refreshPlanStatuses();
  }, [plans, convertAllPlans, displayCurrency, refreshPlanStatuses]);

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
      // Invalidate any in-flight refresh so its result can't repopulate the map
      // for plans that no longer exist after the reset.
      refreshTokenRef.current++;
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
