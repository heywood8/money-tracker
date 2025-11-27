import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import * as BudgetsDB from './services/BudgetsDB';
import { appEvents, EVENTS } from './services/eventEmitter';

const BudgetsContext = createContext();

export const useBudgets = () => {
  const context = useContext(BudgetsContext);
  if (!context) {
    throw new Error('useBudgets must be used within a BudgetsProvider');
  }
  return context;
};

export const BudgetsProvider = ({ children }) => {
  const [budgets, setBudgets] = useState([]);
  const [budgetStatuses, setBudgetStatuses] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

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
  }, []);

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
      console.log('Operation changed, refreshing budget statuses...');
      refreshBudgetStatuses();
    });

    return unsubscribe;
  }, [refreshBudgetStatuses]);

  /**
   * Listen for budget reload events
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('Reloading all budgets...');
      reloadBudgets();
    });

    return unsubscribe;
  }, [reloadBudgets]);

  /**
   * Listen for DATABASE_RESET event to clear budgets
   */
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('BudgetsContext: Database reset detected, clearing budgets');
      setBudgets([]);
      setBudgetStatuses(new Map());
    });

    return unsubscribe;
  }, []);

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
        budget.periodType
      );

      if (duplicate) {
        throw new Error(
          'A budget already exists for this category, currency, and period type. ' +
          'Please edit the existing budget or delete it first.'
        );
      }

      // Create budget with UUID
      const newBudget = {
        ...budget,
        id: uuid.v4(),
      };

      await BudgetsDB.createBudget(newBudget);
      setBudgets(prev => [...prev, newBudget]);

      // Refresh statuses
      await refreshBudgetStatuses();

      setSaveError(null);
      return newBudget;
    } catch (error) {
      console.error('Failed to create budget:', error);
      setSaveError(error.message);
      Alert.alert('Error', error.message, [{ text: 'OK' }]);
      throw error;
    }
  }, [refreshBudgetStatuses]);

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
          id // Exclude this budget from duplicate check
        );

        if (duplicate) {
          throw new Error(
            'A budget already exists for this category, currency, and period type.'
          );
        }
      }

      await BudgetsDB.updateBudget(id, updates);
      setBudgets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));

      // Refresh statuses
      await refreshBudgetStatuses();

      setSaveError(null);
    } catch (error) {
      console.error('Failed to update budget:', error);
      setSaveError(error.message);
      Alert.alert('Error', error.message, [{ text: 'OK' }]);
      throw error;
    }
  }, [budgets, refreshBudgetStatuses]);

  /**
   * Delete budget
   */
  const deleteBudget = useCallback(async (id) => {
    try {
      await BudgetsDB.deleteBudget(id);
      setBudgets(prev => prev.filter(b => b.id !== id));

      // Remove from status map
      setBudgetStatuses(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });

      setSaveError(null);
    } catch (error) {
      console.error('Failed to delete budget:', error);
      setSaveError(error.message);
      Alert.alert('Error', 'Failed to delete budget. Please try again.', [{ text: 'OK' }]);
      throw error;
    }
  }, []);

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
    return status ? status.remaining : 0;
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
    budgets,
    budgetStatuses,
    loading,
    saveError,
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
    reloadBudgets,
    refreshBudgetStatuses,
  }), [
    budgets,
    budgetStatuses,
    loading,
    saveError,
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
    reloadBudgets,
    refreshBudgetStatuses,
  ]);

  return (
    <BudgetsContext.Provider value={value}>
      {children}
    </BudgetsContext.Provider>
  );
};
