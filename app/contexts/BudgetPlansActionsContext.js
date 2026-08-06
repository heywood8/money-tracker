import React, { createContext, useContext, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import uuid from 'react-native-uuid';
import * as BudgetPlansDB from '../services/BudgetPlansDB';
import { useDialog } from './DialogContext';
import { useLocalization } from './LocalizationContext';
import { useBudgetPlansData } from './BudgetPlansDataContext';

const BudgetPlansActionsContext = createContext();

// Prepend `plan` unless its id is already in the list. A double-tap
// create/copy can fire two DB calls that both resolve to the SAME winning
// plan (BudgetPlansDB's UNIQUE(month) race recovery hands the loser the
// winner's row instead of throwing — see BudgetPlansDB.createPlan/copyPlan) —
// without this guard, both callers' resolved promises would each prepend that
// plan, leaving two entries with the same id in state (Fix 4, adversarial
// review round 2). Module-level (not a hook) since it only needs its
// arguments — no component state/props to close over.
const prependUnlessPresent = (setPlans, plan) => {
  setPlans(prev => (prev.some(p => p.id === plan.id) ? prev : [plan, ...prev]));
};

/**
 * Stable action functions for budget plans (Budgets v2). Plan-level mutations keep
 * the plans list in the data context in sync; line-level mutations delegate to the
 * DB (lines are not held in context state).
 */
export const BudgetPlansActionsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const { t } = useLocalization();
  const { plans, reloadPlans, _setPlans, _setSaveError } = useBudgetPlansData();

  const reportError = useCallback((error, fallbackMessage) => {
    _setSaveError(error.message);
    showDialog(t('error'), fallbackMessage || error.message, [{ text: t('ok') }]);
  }, [showDialog, _setSaveError, t]);

  /**
   * Create a plan for a month.
   */
  const addPlan = useCallback(async (plan) => {
    try {
      const validationError = BudgetPlansDB.validatePlan(plan);
      if (validationError) {
        throw new Error(validationError);
      }
      const newPlan = { ...plan, id: plan.id || uuid.v4() };
      const created = await BudgetPlansDB.createPlan(newPlan);
      prependUnlessPresent(_setPlans, created);
      _setSaveError(null);
      return created;
    } catch (error) {
      console.error('Failed to create budget plan:', error);
      reportError(error);
      throw error;
    }
  }, [_setPlans, _setSaveError, reportError]);

  /**
   * Update a plan.
   */
  const updatePlan = useCallback(async (id, updates) => {
    try {
      const existing = plans.find(p => p.id === id);
      if (!existing) {
        throw new Error('Budget plan not found');
      }
      await BudgetPlansDB.updatePlan(id, updates);
      // Keep the list in month-DESC order (matches getAllPlans) in case the month
      // itself changed, so consumers don't see a transiently mis-sorted list.
      _setPlans(prev => prev
        .map(p => (p.id === id ? { ...p, ...updates } : p))
        .sort((a, b) => b.month.localeCompare(a.month)));
      _setSaveError(null);
    } catch (error) {
      console.error('Failed to update budget plan:', error);
      reportError(error);
      throw error;
    }
  }, [plans, _setPlans, _setSaveError, reportError]);

  /**
   * Delete a plan (and its lines, via cascade).
   */
  const deletePlan = useCallback(async (id) => {
    try {
      await BudgetPlansDB.deletePlan(id);
      _setPlans(prev => prev.filter(p => p.id !== id));
      _setSaveError(null);
    } catch (error) {
      console.error('Failed to delete budget plan:', error);
      reportError(error, t('failed_to_delete_plan'));
      throw error;
    }
  }, [_setPlans, _setSaveError, reportError, t]);

  /**
   * Clone a plan from one month into another.
   */
  const copyPlan = useCallback(async (fromMonth, toMonth) => {
    try {
      const created = await BudgetPlansDB.copyPlan(fromMonth, toMonth);
      prependUnlessPresent(_setPlans, created);
      _setSaveError(null);
      return created;
    } catch (error) {
      console.error('Failed to copy budget plan:', error);
      reportError(error);
      throw error;
    }
  }, [_setPlans, _setSaveError, reportError]);

  // Line-level operations delegate straight to the DB (lines are fetched on demand
  // by consumers via getPlanLines/getLinesForMonth, not held in context state).
  const addLine = useCallback((planId, line) => BudgetPlansDB.addLine(planId, line), []);
  // Recurring (global template) lines: not tied to any single month's plan — see
  // app/db/schema.js's budgetPlanLines doc comment.
  const addRecurringLine = useCallback((line) => BudgetPlansDB.addRecurringLine(line), []);
  // `options.fromMonth` (migration 0026) is the month the edit/delete takes effect
  // from: earlier months keep the recurring line exactly as it was, instead of
  // being re-rendered against a budget that did not exist when they were spent.
  const updateLine = useCallback((id, updates, options) => BudgetPlansDB.updateLine(id, updates, options), []);
  const deleteLine = useCallback((id, options) => BudgetPlansDB.deleteLine(id, options), []);
  const reorderLines = useCallback((planId, orderedIds) => BudgetPlansDB.reorderLines(planId, orderedIds), []);
  const reorderRecurringLines = useCallback((orderedIds) => BudgetPlansDB.reorderRecurringLines(orderedIds), []);
  const getPlanLines = useCallback((planId) => BudgetPlansDB.getPlanLines(planId), []);
  const getRecurringLines = useCallback(() => BudgetPlansDB.getRecurringLines(), []);
  // The merged view a month's Budgets screen renders: recurring lines UNION the
  // month's one-off lines (if a plan exists yet) — see BudgetPlansDB.getLinesForMonth.
  const getLinesForMonth = useCallback((month) => BudgetPlansDB.getLinesForMonth(month), []);
  const getBrokenLines = useCallback((planId) => BudgetPlansDB.getBrokenLines(planId), []);

  // Line groups (migration 0022): the envelopes several lines can share. Global,
  // so they are fetched once per screen rather than per month — like lines, they
  // are not held in context state.
  const getLineGroups = useCallback(() => BudgetPlansDB.getLineGroups(), []);
  const addLineGroup = useCallback(async (group) => {
    try {
      return await BudgetPlansDB.createLineGroup(group);
    } catch (error) {
      console.error('Failed to create budget line group:', error);
      reportError(error);
      throw error;
    }
  }, [reportError]);
  const updateLineGroup = useCallback(async (id, updates) => {
    try {
      await BudgetPlansDB.updateLineGroup(id, updates);
    } catch (error) {
      console.error('Failed to update budget line group:', error);
      reportError(error);
      throw error;
    }
  }, [reportError]);
  const deleteLineGroup = useCallback(async (id) => {
    try {
      await BudgetPlansDB.deleteLineGroup(id);
    } catch (error) {
      console.error('Failed to delete budget line group:', error);
      reportError(error);
      throw error;
    }
  }, [reportError]);
  const reorderLineGroups = useCallback((orderedIds) => BudgetPlansDB.reorderLineGroups(orderedIds), []);
  const getPlanTotals = useCallback((planId) => BudgetPlansDB.getPlanTotals(planId), []);
  const getPlanByMonth = useCallback((month) => BudgetPlansDB.getPlanByMonth(month), []);

  const value = useMemo(() => ({
    addPlan,
    updatePlan,
    deletePlan,
    copyPlan,
    addLine,
    addRecurringLine,
    updateLine,
    deleteLine,
    reorderLines,
    reorderRecurringLines,
    getPlanLines,
    getRecurringLines,
    getLinesForMonth,
    getBrokenLines,
    getLineGroups,
    addLineGroup,
    updateLineGroup,
    deleteLineGroup,
    reorderLineGroups,
    getPlanTotals,
    getPlanByMonth,
    reloadPlans,
  }), [
    addPlan,
    updatePlan,
    deletePlan,
    copyPlan,
    addLine,
    addRecurringLine,
    updateLine,
    deleteLine,
    reorderLines,
    reorderRecurringLines,
    getPlanLines,
    getRecurringLines,
    getLinesForMonth,
    getBrokenLines,
    getLineGroups,
    addLineGroup,
    updateLineGroup,
    deleteLineGroup,
    reorderLineGroups,
    getPlanTotals,
    getPlanByMonth,
    reloadPlans,
  ]);

  return (
    <BudgetPlansActionsContext.Provider value={value}>
      {children}
    </BudgetPlansActionsContext.Provider>
  );
};

BudgetPlansActionsProvider.propTypes = {
  children: PropTypes.node,
};

export const useBudgetPlansActions = () => useContext(BudgetPlansActionsContext);
