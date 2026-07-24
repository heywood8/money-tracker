import React, { createContext, useContext, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import uuid from 'react-native-uuid';
import * as BudgetPlansDB from '../services/BudgetPlansDB';
import { useDialog } from './DialogContext';
import { useBudgetPlansData } from './BudgetPlansDataContext';

const BudgetPlansActionsContext = createContext();

/**
 * Stable action functions for budget plans (Budgets v2). Plan-level mutations keep
 * the plans list in the data context in sync; line-level mutations delegate to the
 * DB (lines are not held in context state).
 */
export const BudgetPlansActionsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const { plans, reloadPlans, _setPlans, _setSaveError } = useBudgetPlansData();

  const reportError = useCallback((error, fallbackMessage) => {
    _setSaveError(error.message);
    showDialog('Error', fallbackMessage || error.message, [{ text: 'OK' }]);
  }, [showDialog, _setSaveError]);

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
      _setPlans(prev => [created, ...prev]);
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
      reportError(error, 'Failed to delete plan. Please try again.');
      throw error;
    }
  }, [_setPlans, _setSaveError, reportError]);

  /**
   * Clone a plan from one month into another.
   */
  const copyPlan = useCallback(async (fromMonth, toMonth) => {
    try {
      const created = await BudgetPlansDB.copyPlan(fromMonth, toMonth);
      _setPlans(prev => [created, ...prev]);
      _setSaveError(null);
      return created;
    } catch (error) {
      console.error('Failed to copy budget plan:', error);
      reportError(error);
      throw error;
    }
  }, [_setPlans, _setSaveError, reportError]);

  // Line-level operations delegate straight to the DB (lines are fetched on demand
  // by consumers via getPlanLines, not held in context state).
  const addLine = useCallback((planId, line) => BudgetPlansDB.addLine(planId, line), []);
  const updateLine = useCallback((id, updates) => BudgetPlansDB.updateLine(id, updates), []);
  const deleteLine = useCallback((id) => BudgetPlansDB.deleteLine(id), []);
  const reorderLines = useCallback((planId, orderedIds) => BudgetPlansDB.reorderLines(planId, orderedIds), []);
  const getPlanLines = useCallback((planId) => BudgetPlansDB.getPlanLines(planId), []);
  const getBrokenLines = useCallback((planId) => BudgetPlansDB.getBrokenLines(planId), []);
  const getPlanTotals = useCallback((planId) => BudgetPlansDB.getPlanTotals(planId), []);
  const getPlanByMonth = useCallback((month) => BudgetPlansDB.getPlanByMonth(month), []);

  const value = useMemo(() => ({
    addPlan,
    updatePlan,
    deletePlan,
    copyPlan,
    addLine,
    updateLine,
    deleteLine,
    reorderLines,
    getPlanLines,
    getBrokenLines,
    getPlanTotals,
    getPlanByMonth,
    reloadPlans,
  }), [
    addPlan,
    updatePlan,
    deletePlan,
    copyPlan,
    addLine,
    updateLine,
    deleteLine,
    reorderLines,
    getPlanLines,
    getBrokenLines,
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
