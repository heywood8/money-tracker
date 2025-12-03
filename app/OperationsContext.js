import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import uuid from 'react-native-uuid';
import * as OperationsDB from './services/OperationsDB';
import { useAccounts } from './AccountsContext';
import { appEvents, EVENTS } from './services/eventEmitter';
import { useDialog } from './DialogContext';

const OperationsContext = createContext();

export const useOperations = () => {
  const context = useContext(OperationsContext);
  if (!context) {
    throw new Error('useOperations must be used within an OperationsProvider');
  }
  return context;
};

export const OperationsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const { reloadAccounts } = useAccounts();

  // Lazy-loading state - track the oldest date we've loaded so far
  const [oldestLoadedDate, setOldestLoadedDate] = useState(null);
  const [hasMoreOperations, setHasMoreOperations] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load initial week of operations
  const loadInitialOperations = useCallback(async () => {
    try {
      setLoading(true);
      const operationsData = await OperationsDB.getOperationsByWeekOffset(0);
      setOperations(operationsData);

      // Track the oldest date in the initial load
      if (operationsData.length > 0) {
        const oldestOp = operationsData[operationsData.length - 1];
        setOldestLoadedDate(oldestOp.date);
      }

      // Always assume there might be more operations initially
      setHasMoreOperations(true);
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to load initial operations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load more operations (next week with operations)
  // Triggered only when user scrolls to the bottom
  // Finds the next operation older than what we've loaded and loads a week from that date
  const loadMoreOperations = useCallback(async () => {
    if (loadingMore || !hasMoreOperations || !oldestLoadedDate) return;

    try {
      setLoadingMore(true);

      // Find the next oldest operation before our current oldest date
      const nextOp = await OperationsDB.getNextOldestOperation(oldestLoadedDate);

      if (!nextOp) {
        // No more operations found
        setHasMoreOperations(false);
      } else {
        // Load a week of operations starting from this operation's date
        const moreOperations = await OperationsDB.getOperationsByWeekFromDate(nextOp.date);

        // Merge and deduplicate operations by ID
        setOperations(prevOps => {
          const existingIds = new Set(prevOps.map(op => op.id));
          const newOps = moreOperations.filter(op => !existingIds.has(op.id));
          return [...prevOps, ...newOps];
        });

        // Update the oldest loaded date
        if (moreOperations.length > 0) {
          const oldestOp = moreOperations[moreOperations.length - 1];
          setOldestLoadedDate(oldestOp.date);
        }
      }
    } catch (error) {
      console.error('Failed to load more operations:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [oldestLoadedDate, hasMoreOperations, loadingMore]);

  // Reload operations from database (loads all operations)
  const reloadOperations = useCallback(async () => {
    try {
      setLoading(true);
      const operationsData = await OperationsDB.getAllOperations();
      setOperations(operationsData);
      setDataLoaded(true);
      // Reset lazy-loading state
      setCurrentWeekOffset(Math.floor(operationsData.length / 50)); // Rough estimate
      setHasMoreOperations(false); // All loaded
    } catch (error) {
      console.error('Failed to reload operations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load operations from SQLite on mount
  useEffect(() => {
    loadInitialOperations();
  }, [loadInitialOperations]);

  // Listen for reload events
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('Reloading operations due to RELOAD_ALL event');
      reloadOperations();
    });

    return unsubscribe;
  }, [reloadOperations]);

  const addOperation = useCallback(async (operation) => {
    try {
      const newOperation = {
        ...operation,
        id: uuid.v4(),
        createdAt: new Date().toISOString(),
      };

      // Create operation in DB (handles balance updates automatically)
      await OperationsDB.createOperation(newOperation);

      // Reload from the beginning to ensure consistency
      await loadInitialOperations();
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);

      return newOperation;
    } catch (error) {
      console.error('Failed to add operation:', error);
      setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to create operation. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, [reloadAccounts, showDialog, loadInitialOperations]);

  const updateOperation = useCallback(async (id, updates) => {
    try {
      // Update operation in DB (handles balance updates automatically)
      await OperationsDB.updateOperation(id, updates);

      setOperations(ops => {
        return ops.map(op => {
          if (op.id === id) {
            return { ...op, ...updates };
          }
          return op;
        });
      });
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);
    } catch (error) {
      console.error('Failed to update operation:', error);
      setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to update operation. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, [reloadAccounts, showDialog]);

  const deleteOperation = useCallback(async (id) => {
    try {
      // Delete operation from DB (handles balance updates automatically)
      await OperationsDB.deleteOperation(id);

      setOperations(ops => ops.filter(op => op.id !== id));
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);
    } catch (error) {
      console.error('Failed to delete operation:', error);
      setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to delete operation. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    }
  }, [reloadAccounts, showDialog]);

  const validateOperation = useCallback((operation, t = (key) => key) => {
    if (!operation.type) {
      return t('operation_type_required') || 'Operation type is required';
    }
    if (!operation.amount || isNaN(Number(operation.amount)) || Number(operation.amount) <= 0) {
      return t('valid_amount_required') || 'Valid amount is required';
    }
    if (!operation.accountId) {
      return t('account_required') || 'Account is required';
    }
    if (operation.type === 'transfer') {
      if (!operation.toAccountId) {
        return t('destination_account_required') || 'Destination account is required for transfers';
      }
      if (operation.accountId === operation.toAccountId) {
        return t('accounts_must_be_different') || 'Source and destination accounts must be different';
      }
    } else {
      if (!operation.categoryId) {
        return t('category_required') || 'Category is required';
      }
    }
    if (!operation.date) {
      return t('date_required') || 'Date is required';
    }
    return null;
  }, []);

  // Get operations filtered by various criteria
  const getOperationsByAccount = useCallback((accountId) => {
    return operations.filter(op => op.accountId === accountId);
  }, [operations]);

  const getOperationsByCategory = useCallback((categoryId) => {
    return operations.filter(op => op.categoryId === categoryId);
  }, [operations]);

  const getOperationsByDateRange = useCallback((startDate, endDate) => {
    return operations.filter(op => {
      const opDate = new Date(op.date);
      return opDate >= startDate && opDate <= endDate;
    });
  }, [operations]);

  const value = useMemo(() => ({
    operations,
    loading,
    loadingMore,
    hasMoreOperations,
    addOperation,
    updateOperation,
    deleteOperation,
    validateOperation,
    getOperationsByAccount,
    getOperationsByCategory,
    getOperationsByDateRange,
    reloadOperations,
    loadMoreOperations,
    loadInitialOperations,
  }), [
    operations,
    loading,
    loadingMore,
    hasMoreOperations,
    addOperation,
    updateOperation,
    deleteOperation,
    validateOperation,
    getOperationsByAccount,
    getOperationsByCategory,
    getOperationsByDateRange,
    reloadOperations,
    loadMoreOperations,
    loadInitialOperations,
  ]);

  return (
    <OperationsContext.Provider value={value}>
      {children}
    </OperationsContext.Provider>
  );
};
