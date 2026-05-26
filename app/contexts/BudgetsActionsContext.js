import React, { createContext, useContext, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import uuid from 'react-native-uuid';
import * as BudgetsDB from '../services/BudgetsDB';
import { useDialog } from './DialogContext';
import { useBudgetsData } from './BudgetsDataContext';

const BudgetsActionsContext = createContext();

export const BudgetsActionsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const {
    budgets,
    budgetStatuses,
    refreshBudgetStatuses,
    _setBudgets,
    _setBudgetStatuses,
    _setSaveError,
  } = useBudgetsData();

  /**
   * Create new budget
   */
  const addBudget = useCallback(async (budget) => {
    try {
      // Validate budget
      const validationError = BudgetsDB.validateBudget(budget);
      if (validationError) {
        throw new Error(validationError);
      }

      // Check for duplicates
      const duplicate = await BudgetsDB.findDuplicateBudget(
        budget.categoryId,
        budget.currency,
        budget.periodType,
      );

      if (duplicate) {
        throw new Error(
          'A budget already exists for this category, currency, and period type. ' +
          'Please edit the existing budget or delete it first.',
        );
      }

      // Create budget with UUID
      const newBudget = {
        ...budget,
        id: uuid.v4(),
      };

      await BudgetsDB.createBudget(newBudget);
      _setBudgets(prev => [...prev, newBudget]);

      // Refresh statuses
      await refreshBudgetStatuses();

      _setSaveError(null);
      return newBudget;
    } catch (error) {
      console.error('Failed to create budget:', error);
      _setSaveError(error.message);
      showDialog('Error', error.message, [{ text: 'OK' }]);
      throw error;
    }
  }, [refreshBudgetStatuses, showDialog, _setBudgets, _setSaveError]);

  /**
   * Update existing budget
   */
  const updateBudget = useCallback(async (id, updates) => {
    try {
      // Validate updates
      const existingBudget = budgets.find(b => b.id === id);
      if (!existingBudget) {
        throw new Error('Budget not found');
      }

      const updatedBudget = { ...existingBudget, ...updates };
      const validationError = BudgetsDB.validateBudget(updatedBudget);
      if (validationError) {
        throw new Error(validationError);
      }

      // Check for duplicates (excluding current budget)
      if (updates.categoryId || updates.currency || updates.periodType) {
        const duplicate = await BudgetsDB.findDuplicateBudget(
          updatedBudget.categoryId,
          updatedBudget.currency,
          updatedBudget.periodType,
          id, // Exclude this budget from duplicate check
        );

        if (duplicate) {
          throw new Error(
            'A budget already exists for this category, currency, and period type.',
          );
        }
      }

      await BudgetsDB.updateBudget(id, updates);
      _setBudgets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));

      // Refresh statuses
      await refreshBudgetStatuses();

      _setSaveError(null);
    } catch (error) {
      console.error('Failed to update budget:', error);
      _setSaveError(error.message);
      showDialog('Error', error.message, [{ text: 'OK' }]);
      throw error;
    }
  }, [budgets, refreshBudgetStatuses, showDialog, _setBudgets, _setSaveError]);

  /**
   * Delete budget
   */
  const deleteBudget = useCallback(async (id) => {
    try {
      await BudgetsDB.deleteBudget(id);
      _setBudgets(prev => prev.filter(b => b.id !== id));

      // Remove from status map
      _setBudgetStatuses(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });

      _setSaveError(null);
    } catch (error) {
      console.error('Failed to delete budget:', error);
      _setSaveError(error.message);
      showDialog('Error', 'Failed to delete budget. Please try again.', [{ text: 'OK' }]);
      throw error;
    }
  }, [showDialog, _setBudgets, _setBudgetStatuses, _setSaveError]);

  /**
   * Get budget for category
   */
  const getBudgetForCategory = useCallback((categoryId, currency = null, periodType = null) => {
    return budgets.find(b => {
      if (b.categoryId !== categoryId) return false;
      if (currency && b.currency !== currency) return false;
      if (periodType && b.periodType !== periodType) return false;
      return true;
    });
  }, [budgets]);

  /**
   * Get budget status
   */
  const getBudgetStatus = useCallback((budgetId) => {
    return budgetStatuses.get(budgetId) || null;
  }, [budgetStatuses]);

  /**
   * Check if budget is exceeded
   */
  const isBudgetExceeded = useCallback((budgetId) => {
    const status = budgetStatuses.get(budgetId);
    return status ? status.isExceeded : false;
  }, [budgetStatuses]);

  /**
   * Get budget progress percentage
   */
  const getBudgetProgress = useCallback((budgetId) => {
    const status = budgetStatuses.get(budgetId);
    return status ? status.percentage : 0;
  }, [budgetStatuses]);

  /**
   * Get remaining budget amount
   */
  const getRemainingBudget = useCallback((budgetId) => {
    const status = budgetStatuses.get(budgetId);
    return status ? status.remaining : '0';
  }, [budgetStatuses]);

  /**
   * Get budgets by period type
   */
  const getBudgetsByPeriod = useCallback((periodType) => {
    return budgets.filter(b => b.periodType === periodType);
  }, [budgets]);

  /**
   * Check if category has active budget
   */
  const hasActiveBudget = useCallback((categoryId, currency = null) => {
    return budgets.some(b => {
      if (b.categoryId !== categoryId) return false;
      if (currency && b.currency !== currency) return false;

      // Check if budget is active (no end date or end date in future)
      if (!b.endDate) return true;
      const endDate = new Date(b.endDate);
      return endDate >= new Date();
    });
  }, [budgets]);

  const value = useMemo(() => ({
    addBudget,
    updateBudget,
    deleteBudget,
    getBudgetForCategory,
    getBudgetStatus,
    isBudgetExceeded,
    getBudgetProgress,
    getRemainingBudget,
    getBudgetsByPeriod,
    hasActiveBudget,
  }), [
    addBudget,
    updateBudget,
    deleteBudget,
    getBudgetForCategory,
    getBudgetStatus,
    isBudgetExceeded,
    getBudgetProgress,
    getRemainingBudget,
    getBudgetsByPeriod,
    hasActiveBudget,
  ]);

  return (
    <BudgetsActionsContext.Provider value={value}>
      {children}
    </BudgetsActionsContext.Provider>
  );
};

BudgetsActionsProvider.propTypes = {
  children: PropTypes.node,
};

export const useBudgetsActions = () => useContext(BudgetsActionsContext);
