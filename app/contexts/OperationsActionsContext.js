import React, { createContext, useContext, useCallback, useMemo, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as OperationsDB from '../services/OperationsDB';
import { useAccountsActions } from './AccountsActionsContext';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useDialog } from './DialogContext';
import { setJsonPreference, PREF_KEYS } from '../services/PreferencesDB';
import { useOperationsData } from './OperationsDataContext';

/**
 * OperationsActionsContext provides stable action functions for operations.
 * Split from OperationsContext to reduce unnecessary re-renders.
 *
 * This context contains stable functions that never change between renders.
 * For data state, use OperationsDataContext.
 *
 * DEPENDENCY: This context depends on AccountsActionsContext and OperationsDataContext.
 * Provider nesting in App.js: AccountsActionsProvider > OperationsDataProvider > OperationsActionsProvider
 */
const OperationsActionsContext = createContext();

export const useOperationsActions = () => {
  const context = useContext(OperationsActionsContext);
  if (!context) {
    throw new Error('useOperationsActions must be used within an OperationsActionsProvider');
  }
  return context;
};

export const OperationsActionsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const { reloadAccounts } = useAccountsActions();
  const {
    operations,
    activeFilters,
    _setOperations,
    _setLoading,
    _setDataLoaded,
    _setSaveError,
    _setOldestLoadedDate,
    _setNewestLoadedDate,
    _setHasMoreOperations,
    _setHasNewerOperations,
    _setLoadingMore,
    _setLoadingNewer,
    _setActiveFilters,
    _setFiltersActive,
    _hasActiveFilters,
    _oldestLoadedDate,
    _newestLoadedDate,
    loadingMore,
    hasMoreOperations,
    loadingNewer,
    hasNewerOperations,
  } = useOperationsData();

  // Request ID counter to handle race conditions in loadInitialOperations
  const loadRequestIdRef = useRef(0);

  // Load initial week of operations
  const loadInitialOperations = useCallback(async (filters = activeFilters, showLoading = true) => {
    // Increment request ID to track this specific call
    const requestId = ++loadRequestIdRef.current;

    try {
      if (showLoading) {
        _setLoading(true);
      }
      const isFiltered = _hasActiveFilters(filters);
      let operationsData = isFiltered
        ? await OperationsDB.getFilteredOperationsByWeekOffset(0, filters)
        : await OperationsDB.getOperationsByWeekOffset(0);

      // Check if this request is still the latest (ignore stale results)
      if (requestId !== loadRequestIdRef.current) {
        console.log(`[OperationsActionsContext] Ignoring stale request ${requestId}, current is ${loadRequestIdRef.current}`);
        return;
      }

      _setOperations(operationsData);

      // Track the oldest and newest dates in the initial load
      if (operationsData.length > 0) {
        const newestOp = operationsData[0]; // Operations are sorted DESC by date
        const oldestOp = operationsData[operationsData.length - 1];
        _setNewestLoadedDate(newestOp.date);
        _setOldestLoadedDate(oldestOp.date);
        // When loading initial (current week), there are no newer operations
        _setHasNewerOperations(false);
      } else {
        _setNewestLoadedDate(null);
        _setOldestLoadedDate(null);
        _setHasNewerOperations(false);
      }

      // Always assume there might be more operations initially
      _setHasMoreOperations(true);
      _setDataLoaded(true);
    } catch (error) {
      console.error('Failed to load initial operations:', error);
    } finally {
      if (showLoading) {
        _setLoading(false);
      }
    }
  }, [
    activeFilters,
    _hasActiveFilters,
    _setLoading,
    _setOperations,
    _setNewestLoadedDate,
    _setOldestLoadedDate,
    _setHasNewerOperations,
    _setHasMoreOperations,
    _setDataLoaded,
  ]);

  // Load more operations (next week with operations)
  const loadMoreOperations = useCallback(async () => {
    if (loadingMore || !hasMoreOperations) return;

    try {
      _setLoadingMore(true);

      const isFiltered = _hasActiveFilters(activeFilters);

      // If we don't have any operations loaded yet, find the most recent operation
      // and load its week. This handles the case where the current week has no operations.
      let nextOp;
      if (!_oldestLoadedDate) {
        // No operations loaded - find the most recent operation in the database
        nextOp = isFiltered
          ? await OperationsDB.getNextOldestFilteredOperation(new Date().toISOString().split('T')[0], activeFilters)
          : await OperationsDB.getNextOldestOperation(new Date().toISOString().split('T')[0]);
      } else {
        // Find the next oldest operation before our current oldest date
        nextOp = isFiltered
          ? await OperationsDB.getNextOldestFilteredOperation(_oldestLoadedDate, activeFilters)
          : await OperationsDB.getNextOldestOperation(_oldestLoadedDate);
      }

      if (!nextOp) {
        // No more operations found
        _setHasMoreOperations(false);
      } else {
        // Load a week of operations starting from this operation's date
        const moreOperations = isFiltered
          ? await OperationsDB.getFilteredOperationsByWeekFromDate(nextOp.date, activeFilters)
          : await OperationsDB.getOperationsByWeekFromDate(nextOp.date);

        // Merge and deduplicate operations by ID
        _setOperations(prevOps => {
          const existingIds = new Set(prevOps.map(op => op.id));
          const newOps = moreOperations.filter(op => !existingIds.has(op.id));
          return [...prevOps, ...newOps];
        });

        // Update the oldest loaded date (newest stays the same)
        if (moreOperations.length > 0) {
          const oldestOp = moreOperations[moreOperations.length - 1];
          _setOldestLoadedDate(oldestOp.date);
        }
      }
    } catch (error) {
      console.error('Failed to load more operations:', error);
    } finally {
      _setLoadingMore(false);
    }
  }, [
    _oldestLoadedDate,
    hasMoreOperations,
    loadingMore,
    activeFilters,
    _hasActiveFilters,
    _setLoadingMore,
    _setHasMoreOperations,
    _setOperations,
    _setOldestLoadedDate,
  ]);

  // Load newer operations (previous week with operations)
  const loadNewerOperations = useCallback(async () => {
    if (loadingNewer || !hasNewerOperations || !_newestLoadedDate) return;

    try {
      _setLoadingNewer(true);

      const isFiltered = _hasActiveFilters(activeFilters);

      // Find the next newest operation after our current newest date
      const nextOp = isFiltered
        ? await OperationsDB.getNextNewestFilteredOperation(_newestLoadedDate, activeFilters)
        : await OperationsDB.getNextNewestOperation(_newestLoadedDate);

      if (!nextOp) {
        // No more newer operations found
        _setHasNewerOperations(false);
      } else {
        // Load a week of operations ending at this operation's date
        const newerOperations = isFiltered
          ? await OperationsDB.getFilteredOperationsByWeekToDate(nextOp.date, activeFilters)
          : await OperationsDB.getOperationsByWeekToDate(nextOp.date);

        // Merge and deduplicate operations by ID
        _setOperations(prevOps => {
          const existingIds = new Set(prevOps.map(op => op.id));
          const newOps = newerOperations.filter(op => !existingIds.has(op.id));
          return [...newOps, ...prevOps];
        });

        // Update the newest loaded date (oldest stays the same)
        if (newerOperations.length > 0) {
          const newestOp = newerOperations[0]; // Operations are sorted DESC by date
          _setNewestLoadedDate(newestOp.date);
        }
      }
    } catch (error) {
      console.error('Failed to load newer operations:', error);
    } finally {
      _setLoadingNewer(false);
    }
  }, [
    _newestLoadedDate,
    hasNewerOperations,
    loadingNewer,
    activeFilters,
    _hasActiveFilters,
    _setLoadingNewer,
    _setHasNewerOperations,
    _setOperations,
    _setNewestLoadedDate,
  ]);

  // Reload operations from database (loads all operations)
  const reloadOperations = useCallback(async () => {
    try {
      _setLoading(true);
      const operationsData = await OperationsDB.getAllOperations();
      _setOperations(operationsData);
      _setDataLoaded(true);
      // Reset lazy-loading state
      _setHasMoreOperations(false); // All loaded
    } catch (error) {
      console.error('Failed to reload operations:', error);
    } finally {
      _setLoading(false);
    }
  }, [_setLoading, _setOperations, _setDataLoaded, _setHasMoreOperations]);

  // Load operations on mount
  useEffect(() => {
    loadInitialOperations();
  }, [loadInitialOperations]);

  // Listen for reload events
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('Reloading operations due to RELOAD_ALL event');
      // Use loadInitialOperations to load the current week's operations
      loadInitialOperations();
    });

    return unsubscribe;
  }, [loadInitialOperations]);

  // Note: Default operations are now created directly in AccountsDataContext
  // after default accounts are created, then RELOAD_ALL is emitted to refresh everything.

  const addOperation = useCallback(async (operation) => {
    try {
      console.log('[OperationsContext] addOperation called with:', {
        type: operation.type,
        amount: operation.amount,
        accountId: operation.accountId,
        toAccountId: operation.toAccountId,
        categoryId: operation.categoryId,
        date: operation.date,
        description: operation.description,
      });

      // Create operation in DB (ID will be auto-generated, handles balance updates automatically)
      const createdOperation = await OperationsDB.createOperation(operation);

      console.log('[OperationsContext] Operation created successfully:', createdOperation?.id);

      // Reload operations to include the new one (without showing loading spinner)
      // Note: We reload to ensure consistency with lazy-loaded week ranges
      await loadInitialOperations(activeFilters, false);

      _setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);

      return createdOperation;
    } catch (error) {
      console.error('Failed to add operation:', error);
      _setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to create operation. Please try again.',
        [{ text: 'OK' }],
      );
      throw error;
    }
  }, [reloadAccounts, showDialog, loadInitialOperations, activeFilters, _setSaveError]);

  const updateOperation = useCallback(async (id, updates) => {
    try {
      // Update operation in DB (handles balance updates automatically)
      await OperationsDB.updateOperation(id, updates);

      _setOperations(ops => {
        return ops.map(op => {
          if (op.id === id) {
            return { ...op, ...updates };
          }
          return op;
        });
      });
      _setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);
    } catch (error) {
      console.error('Failed to update operation:', error);
      _setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to update operation. Please try again.',
        [{ text: 'OK' }],
      );
      throw error;
    }
  }, [reloadAccounts, showDialog, _setOperations, _setSaveError]);

  const deleteOperation = useCallback(async (id) => {
    try {
      // Delete operation from DB (handles balance updates automatically)
      await OperationsDB.deleteOperation(id);

      _setOperations(ops => ops.filter(op => op.id !== id));
      _setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);
    } catch (error) {
      console.error('Failed to delete operation:', error);
      _setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to delete operation. Please try again.',
        [{ text: 'OK' }],
      );
      throw error;
    }
  }, [reloadAccounts, showDialog, _setOperations, _setSaveError]);

  // Update filters and reload operations
  const updateFilters = useCallback(async (newFilters) => {
    try {
      _setActiveFilters(newFilters);
      const isActive = _hasActiveFilters(newFilters);
      _setFiltersActive(isActive);

      // Persist filters to PreferencesDB
      await setJsonPreference(PREF_KEYS.OPERATIONS_FILTERS, newFilters);

      // Reset to first week when filters change
      await loadInitialOperations(newFilters);
    } catch (error) {
      console.error('Failed to update filters:', error);
    }
  }, [_hasActiveFilters, loadInitialOperations, _setActiveFilters, _setFiltersActive]);

  // Clear all filters
  const clearFilters = useCallback(async () => {
    const emptyFilters = {
      types: [],
      accountIds: [],
      categoryIds: [],
      searchText: '',
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    };
    await updateFilters(emptyFilters);
  }, [updateFilters]);

  // Jump to a specific date (loads all operations from selected date to today)
  const jumpToDate = useCallback(async (date) => {
    try {
      _setLoading(true);
      const isFiltered = _hasActiveFilters(activeFilters);

      // Calculate today's date in YYYY-MM-DD format
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Load all operations from the selected date to today
      const operationsData = isFiltered
        ? await OperationsDB.getFilteredOperationsByDateRange(date, todayStr, activeFilters)
        : await OperationsDB.getOperationsByDateRange(date, todayStr);

      _setOperations(operationsData);

      // Track the oldest and newest dates in the loaded data
      if (operationsData.length > 0) {
        const newestOp = operationsData[0]; // Operations are sorted DESC by date
        const oldestOp = operationsData[operationsData.length - 1];
        _setNewestLoadedDate(newestOp.date);
        _setOldestLoadedDate(oldestOp.date);

        // No newer operations since we loaded up to today
        _setHasNewerOperations(false);
      } else {
        _setNewestLoadedDate(todayStr);
        _setOldestLoadedDate(date);
        // No newer operations since we loaded up to today
        _setHasNewerOperations(false);
      }

      // Assume there might be more older operations
      _setHasMoreOperations(true);
      _setDataLoaded(true);
    } catch (error) {
      console.error('Failed to jump to date:', error);
    } finally {
      _setLoading(false);
    }
  }, [
    activeFilters,
    _hasActiveFilters,
    _setLoading,
    _setOperations,
    _setNewestLoadedDate,
    _setOldestLoadedDate,
    _setHasNewerOperations,
    _setHasMoreOperations,
    _setDataLoaded,
  ]);

  const validateOperation = useCallback((operation, t = (key) => key) => {
    if (!operation.type) {
      return t('operation_type_required') || 'Operation type is required';
    }
    if (!operation.amount || isNaN(parseFloat(operation.amount)) || parseFloat(operation.amount) <= 0) {
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

  // Count active filter groups
  const getActiveFilterCount = useCallback(() => {
    let count = 0;
    if (activeFilters.types.length > 0) count++;
    if (activeFilters.accountIds.length > 0) count++;
    if (activeFilters.categoryIds.length > 0) count++;
    if (activeFilters.searchText.trim().length > 0) count++;
    if (activeFilters.dateRange.startDate || activeFilters.dateRange.endDate) count++;
    if (activeFilters.amountRange.min !== null || activeFilters.amountRange.max !== null) count++;
    return count;
  }, [activeFilters]);

  const value = useMemo(() => ({
    addOperation,
    updateOperation,
    deleteOperation,
    validateOperation,
    getOperationsByAccount,
    getOperationsByCategory,
    getOperationsByDateRange,
    reloadOperations,
    loadMoreOperations,
    loadNewerOperations,
    loadInitialOperations,
    jumpToDate,
    updateFilters,
    clearFilters,
    getActiveFilterCount,
  }), [
    addOperation,
    updateOperation,
    deleteOperation,
    validateOperation,
    getOperationsByAccount,
    getOperationsByCategory,
    getOperationsByDateRange,
    reloadOperations,
    loadMoreOperations,
    loadNewerOperations,
    loadInitialOperations,
    jumpToDate,
    updateFilters,
    clearFilters,
    getActiveFilterCount,
  ]);

  return (
    <OperationsActionsContext.Provider value={value}>
      {children}
    </OperationsActionsContext.Provider>
  );
};

OperationsActionsProvider.propTypes = {
  children: PropTypes.node,
};
