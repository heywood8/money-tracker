import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { AppState } from 'react-native';
import * as OperationsDB from '../services/OperationsDB';
import { useAccounts } from './AccountsContext';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useDialog } from './DialogContext';
import { getJsonPreference, setJsonPreference, PREF_KEYS } from '../services/PreferencesDB';

/**
 * OperationsContext manages financial operations/transactions state.
 *
 * DEPENDENCY: This context depends on AccountsContext (via useAccounts hook).
 * Therefore, AccountsProvider MUST wrap OperationsProvider in the component tree.
 * See App.js for the correct provider nesting order.
 */
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

  // Lazy-loading state - track the oldest and newest dates we've loaded so far
  const [oldestLoadedDate, setOldestLoadedDate] = useState(null);
  const [newestLoadedDate, setNewestLoadedDate] = useState(null);
  const [hasMoreOperations, setHasMoreOperations] = useState(true);
  const [hasNewerOperations, setHasNewerOperations] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);

  // Filter state
  const [activeFilters, setActiveFilters] = useState({
    types: [],
    accountIds: [],
    categoryIds: [],
    searchText: '',
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  });
  const [filtersActive, setFiltersActive] = useState(false);

  // Helper to check if any filters are active
  const hasActiveFilters = useCallback((filters) => {
    return (
      filters.types.length > 0 ||
      filters.accountIds.length > 0 ||
      filters.categoryIds.length > 0 ||
      filters.searchText.trim().length > 0 ||
      filters.dateRange.startDate !== null ||
      filters.dateRange.endDate !== null ||
      filters.amountRange.min !== null ||
      filters.amountRange.max !== null
    );
  }, []);

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

  // Load initial week of operations
  const loadInitialOperations = useCallback(async (filters = activeFilters) => {
    try {
      setLoading(true);
      const isFiltered = hasActiveFilters(filters);
      const operationsData = isFiltered
        ? await OperationsDB.getFilteredOperationsByWeekOffset(0, filters)
        : await OperationsDB.getOperationsByWeekOffset(0);
      setOperations(operationsData);

      // Track the oldest and newest dates in the initial load
      if (operationsData.length > 0) {
        const newestOp = operationsData[0]; // Operations are sorted DESC by date
        const oldestOp = operationsData[operationsData.length - 1];
        setNewestLoadedDate(newestOp.date);
        setOldestLoadedDate(oldestOp.date);
        // When loading initial (current week), there are no newer operations
        setHasNewerOperations(false);
      } else {
        setNewestLoadedDate(null);
        setOldestLoadedDate(null);
        setHasNewerOperations(false);
      }

      // Always assume there might be more operations initially
      setHasMoreOperations(true);
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to load initial operations:', error);
    } finally {
      setLoading(false);
    }
  }, [activeFilters, hasActiveFilters]);

  // Load more operations (next week with operations)
  // Triggered only when user scrolls to the bottom
  // Finds the next operation older than what we've loaded and loads a week from that date
  const loadMoreOperations = useCallback(async () => {
    if (loadingMore || !hasMoreOperations || !oldestLoadedDate) return;

    try {
      setLoadingMore(true);

      const isFiltered = hasActiveFilters(activeFilters);

      // Find the next oldest operation before our current oldest date
      const nextOp = isFiltered
        ? await OperationsDB.getNextOldestFilteredOperation(oldestLoadedDate, activeFilters)
        : await OperationsDB.getNextOldestOperation(oldestLoadedDate);

      if (!nextOp) {
        // No more operations found
        setHasMoreOperations(false);
      } else {
        // Load a week of operations starting from this operation's date
        const moreOperations = isFiltered
          ? await OperationsDB.getFilteredOperationsByWeekFromDate(nextOp.date, activeFilters)
          : await OperationsDB.getOperationsByWeekFromDate(nextOp.date);

        // Merge and deduplicate operations by ID
        setOperations(prevOps => {
          const existingIds = new Set(prevOps.map(op => op.id));
          const newOps = moreOperations.filter(op => !existingIds.has(op.id));
          return [...prevOps, ...newOps];
        });

        // Update the oldest loaded date (newest stays the same)
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
  }, [oldestLoadedDate, hasMoreOperations, loadingMore, activeFilters, hasActiveFilters]);

  // Load newer operations (previous week with operations)
  // Triggered when user scrolls to the top
  // Finds the next operation newer than what we've loaded and loads a week from that date
  const loadNewerOperations = useCallback(async () => {
    if (loadingNewer || !hasNewerOperations || !newestLoadedDate) return;

    try {
      setLoadingNewer(true);

      const isFiltered = hasActiveFilters(activeFilters);

      // Find the next newest operation after our current newest date
      const nextOp = isFiltered
        ? await OperationsDB.getNextNewestFilteredOperation(newestLoadedDate, activeFilters)
        : await OperationsDB.getNextNewestOperation(newestLoadedDate);

      if (!nextOp) {
        // No more newer operations found
        setHasNewerOperations(false);
      } else {
        // Load a week of operations ending at this operation's date
        const newerOperations = isFiltered
          ? await OperationsDB.getFilteredOperationsByWeekToDate(nextOp.date, activeFilters)
          : await OperationsDB.getOperationsByWeekToDate(nextOp.date);

        // Merge and deduplicate operations by ID
        setOperations(prevOps => {
          const existingIds = new Set(prevOps.map(op => op.id));
          const newOps = newerOperations.filter(op => !existingIds.has(op.id));
          return [...newOps, ...prevOps];
        });

        // Update the newest loaded date (oldest stays the same)
        if (newerOperations.length > 0) {
          const newestOp = newerOperations[0]; // Operations are sorted DESC by date
          setNewestLoadedDate(newestOp.date);
        }
      }
    } catch (error) {
      console.error('Failed to load newer operations:', error);
    } finally {
      setLoadingNewer(false);
    }
  }, [newestLoadedDate, hasNewerOperations, loadingNewer, activeFilters, hasActiveFilters]);

  // Reload operations from database (loads all operations)
  const reloadOperations = useCallback(async () => {
    try {
      setLoading(true);
      const operationsData = await OperationsDB.getAllOperations();
      setOperations(operationsData);
      setDataLoaded(true);
      // Reset lazy-loading state
      setHasMoreOperations(false); // All loaded
    } catch (error) {
      console.error('Failed to reload operations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load filters from PreferencesDB on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const filters = await getJsonPreference(PREF_KEYS.OPERATIONS_FILTERS);
        if (filters) {
          setActiveFilters(filters);
          setFiltersActive(hasActiveFilters(filters));
        }
      } catch (error) {
        console.error('Failed to load filters:', error);
      }
    };
    loadFilters();
  }, [hasActiveFilters]);

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

  // Balance snapshots functionality removed - no longer needed

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
      
      // Reload from the beginning to ensure consistency
      await loadInitialOperations();
      setSaveError(null);

      // Reload accounts to reflect balance changes
      await reloadAccounts();

      // Emit event to refresh budget statuses
      appEvents.emit(EVENTS.OPERATION_CHANGED);

      return createdOperation;
    } catch (error) {
      console.error('Failed to add operation:', error);
      setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to create operation. Please try again.',
        [{ text: 'OK' }],
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
        [{ text: 'OK' }],
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
        [{ text: 'OK' }],
      );
      throw error;
    }
  }, [reloadAccounts, showDialog]);

  // Update filters and reload operations
  const updateFilters = useCallback(async (newFilters) => {
    try {
      setActiveFilters(newFilters);
      const isActive = hasActiveFilters(newFilters);
      setFiltersActive(isActive);

      // Persist filters to PreferencesDB
      await setJsonPreference(PREF_KEYS.OPERATIONS_FILTERS, newFilters);

      // Reset to first week when filters change
      await loadInitialOperations(newFilters);
    } catch (error) {
      console.error('Failed to update filters:', error);
    }
  }, [hasActiveFilters, loadInitialOperations]);

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

  // Jump to a specific date (loads a week of operations starting from that date)
  const jumpToDate = useCallback(async (date) => {
    try {
      setLoading(true);
      const isFiltered = hasActiveFilters(activeFilters);

      // Load a week of operations starting from the selected date
      const operationsData = isFiltered
        ? await OperationsDB.getFilteredOperationsByWeekFromDate(date, activeFilters)
        : await OperationsDB.getOperationsByWeekFromDate(date);

      setOperations(operationsData);

      // Track the oldest and newest dates in the loaded data
      if (operationsData.length > 0) {
        const newestOp = operationsData[0]; // Operations are sorted DESC by date
        const oldestOp = operationsData[operationsData.length - 1];
        setNewestLoadedDate(newestOp.date);
        setOldestLoadedDate(oldestOp.date);

        // Check if there might be newer operations (compare with today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newestDate = new Date(newestOp.date);
        newestDate.setHours(0, 0, 0, 0);

        // If the newest loaded operation is before today, there are newer operations
        setHasNewerOperations(newestDate < today);
      } else {
        setNewestLoadedDate(date);
        setOldestLoadedDate(date);
        // If no operations at this date, assume there might be newer ones
        setHasNewerOperations(true);
      }

      // Assume there might be more older operations
      setHasMoreOperations(true);
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to jump to date:', error);
    } finally {
      setLoading(false);
    }
  }, [activeFilters, hasActiveFilters]);

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

  const value = useMemo(() => ({
    operations,
    loading,
    loadingMore,
    loadingNewer,
    hasMoreOperations,
    hasNewerOperations,
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
    activeFilters,
    filtersActive,
    updateFilters,
    clearFilters,
    getActiveFilterCount,
  }), [
    operations,
    loading,
    loadingMore,
    loadingNewer,
    hasMoreOperations,
    hasNewerOperations,
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
    activeFilters,
    filtersActive,
    updateFilters,
    clearFilters,
    getActiveFilterCount,
  ]);

  return (
    <OperationsContext.Provider value={value}>
      {children}
    </OperationsContext.Provider>
  );
};

OperationsProvider.propTypes = {
  children: PropTypes.node,
};
