import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import uuid from 'react-native-uuid';
import * as PlannedOperationsDB from '../services/PlannedOperationsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useDialog } from './DialogContext';
import { useLocalization } from './LocalizationContext';
import { formatDate } from '../services/BalanceHistoryDB';

const PlannedOperationsContext = createContext();

export const usePlannedOperations = () => {
  const context = useContext(PlannedOperationsContext);
  if (!context) {
    throw new Error('usePlannedOperations must be used within a PlannedOperationsProvider');
  }
  return context;
};

/**
 * Get current month string in YYYY-MM format
 */
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const PlannedOperationsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const { t } = useLocalization();
  const [plannedOperations, setPlannedOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(null);

  /**
   * Load all planned operations from database
   */
  const reloadPlannedOperations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await PlannedOperationsDB.getAllPlannedOperations();
      setPlannedOperations(data);
      setSaveError(null);
    } catch (error) {
      console.error('Failed to load planned operations:', error);
      setSaveError(error.message);
      setPlannedOperations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    reloadPlannedOperations();
  }, [reloadPlannedOperations]);

  // Listen for RELOAD_ALL
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      reloadPlannedOperations();
    });
    return unsubscribe;
  }, [reloadPlannedOperations]);

  // Listen for DATABASE_RESET
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      setPlannedOperations([]);
    });
    return unsubscribe;
  }, []);

  /**
   * Create a new planned operation
   */
  const addPlannedOperation = useCallback(async (op) => {
    try {
      const validationError = PlannedOperationsDB.validatePlannedOperation(op);
      if (validationError) {
        throw new Error(t(validationError) || validationError);
      }

      const newOp = {
        ...op,
        id: uuid.v4(),
      };

      const created = await PlannedOperationsDB.createPlannedOperation(newOp);
      setPlannedOperations(prev => [...prev, created]);
      setSaveError(null);
      return created;
    } catch (error) {
      console.error('Failed to create planned operation:', error);
      setSaveError(error.message);
      showDialog(t('error'), error.message, [{ text: t('ok') }]);
      throw error;
    }
  }, [showDialog, t]);

  /**
   * Update an existing planned operation
   */
  const updatePlannedOperation = useCallback(async (id, updates) => {
    try {
      await PlannedOperationsDB.updatePlannedOperation(id, updates);
      setPlannedOperations(prev =>
        prev.map(op => op.id === id ? { ...op, ...updates } : op),
      );
      setSaveError(null);
    } catch (error) {
      console.error('Failed to update planned operation:', error);
      setSaveError(error.message);
      showDialog(t('error'), error.message, [{ text: t('ok') }]);
      throw error;
    }
  }, [showDialog, t]);

  /**
   * Delete a planned operation
   */
  const deletePlannedOperation = useCallback(async (id) => {
    try {
      await PlannedOperationsDB.deletePlannedOperation(id);
      setPlannedOperations(prev => prev.filter(op => op.id !== id));
      setSaveError(null);
    } catch (error) {
      console.error('Failed to delete planned operation:', error);
      setSaveError(error.message);
      showDialog(t('error'), error.message, [{ text: t('ok') }]);
      throw error;
    }
  }, [showDialog, t]);

  /**
   * Execute a planned operation — create a real operation with today's date.
   * All DB writes (operation insert, balance updates, markExecuted, optional delete)
   * run in a single transaction so a crash mid-way cannot leave the operation
   * created but the planned-op still showing as pending.
   */
  const executePlannedOperation = useCallback(async (plannedOp) => {
    try {
      const currentMonth = getCurrentMonth();

      const operationData = {
        type: plannedOp.type,
        amount: plannedOp.amount,
        accountId: plannedOp.accountId,
        categoryId: plannedOp.categoryId || null,
        toAccountId: plannedOp.toAccountId || null,
        date: formatDate(new Date()),
        description: plannedOp.name || plannedOp.description || null,
      };

      // Single atomic transaction: insert operation + mark executed + optional delete
      const createdOperation = await PlannedOperationsDB.executeAndMark(
        plannedOp, operationData, currentMonth,
      );

      // Update local React state after the DB commit succeeds
      if (plannedOp.isRecurring) {
        setPlannedOperations(prev =>
          prev.map(op => op.id === plannedOp.id
            ? { ...op, lastExecutedMonth: currentMonth }
            : op),
        );
      } else {
        setPlannedOperations(prev => prev.filter(op => op.id !== plannedOp.id));
      }

      // Trigger reloads in other contexts (operations list, account balances, budgets)
      appEvents.emit(EVENTS.OPERATION_CHANGED);
      appEvents.emit(EVENTS.RELOAD_ALL);

      return createdOperation;
    } catch (error) {
      console.error('Failed to execute planned operation:', error);
      showDialog(t('error'), error.message, [{ text: t('ok') }]);
      throw error;
    }
  }, [showDialog, t]);

  /**
   * Mark a planned operation as executed without creating a real operation
   * (for cases where the user already added the operation manually).
   */
  const markPlannedOperationExecuted = useCallback(async (plannedOp) => {
    try {
      const currentMonth = getCurrentMonth();

      await PlannedOperationsDB.markExecutedOnly(plannedOp, currentMonth);

      if (plannedOp.isRecurring) {
        setPlannedOperations(prev =>
          prev.map(op => op.id === plannedOp.id
            ? { ...op, lastExecutedMonth: currentMonth }
            : op),
        );
      } else {
        setPlannedOperations(prev => prev.filter(op => op.id !== plannedOp.id));
      }
    } catch (error) {
      console.error('Failed to mark planned operation as executed:', error);
      showDialog(t('error'), error.message, [{ text: t('ok') }]);
      throw error;
    }
  }, [showDialog, t]);

  /**
   * Check if a planned operation has been executed this month
   */
  const isExecutedThisMonth = useCallback((plannedOp) => {
    return plannedOp.lastExecutedMonth === getCurrentMonth();
  }, []);

  const value = useMemo(() => ({
    plannedOperations,
    loading,
    saveError,
    addPlannedOperation,
    updatePlannedOperation,
    deletePlannedOperation,
    executePlannedOperation,
    markPlannedOperationExecuted,
    isExecutedThisMonth,
    reloadPlannedOperations,
  }), [
    plannedOperations,
    loading,
    saveError,
    addPlannedOperation,
    updatePlannedOperation,
    deletePlannedOperation,
    executePlannedOperation,
    markPlannedOperationExecuted,
    isExecutedThisMonth,
    reloadPlannedOperations,
  ]);

  return (
    <PlannedOperationsContext.Provider value={value}>
      {children}
    </PlannedOperationsContext.Provider>
  );
};

PlannedOperationsProvider.propTypes = {
  children: PropTypes.node,
};
