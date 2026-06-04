import React, { createContext, useContext, useCallback, useMemo, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
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

// Re-export the OperationsDataContext hook for testing convenience
export { useOperationsData } from './OperationsDataContext';

export const OperationsActionsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const { reloadAccounts } = useAccountsActions();
  const {
    operations,
    activeFilters,
    searchState,
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
    _setFiltersActive,
    _setSearchState,
    _setSearchText,
    _updateSearchFilters,
    _clearAllSearch,
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

  // In-memory cache of all operations for instant text search
  const allOpsCacheRef = useRef(null);   // null = not loaded, Array = all operations
  const cacheLoadingRef = useRef(false); // prevents concurrent loads

  // Ref so loadInitialOperations can read latest filters without depending on them
  // (prevents the function from changing on every filter edit, which would re-trigger the
  // mount effect and show a loading spinner on every keystroke or filter tap)
  const activeFiltersRef = useRef(activeFilters);
  useEffect(() => {
    activeFiltersRef.current = activeFilters;
  }, [activeFilters]);

  const _loadCache = useCallback(async () => {
    if (cacheLoadingRef.current || Array.isArray(allOpsCacheRef.current)) return;
    cacheLoadingRef.current = true;
    try {
      const result = await OperationsDB.getAllOperations();
      if (Array.isArray(result)) {
        allOpsCacheRef.current = result;
      }
    } catch {
      // silent: cache stays null, text search falls back to DB
    } finally {
      cacheLoadingRef.current = false;
    }
  }, []);

  // Load initial week of operations
  const loadInitialOperations = useCallback(async (filters, showLoading = true) => {
    const effectiveFilters = filters ?? activeFiltersRef.current;
    console.debug('[OperationsActionsContext] loadInitialOperations called, requestId:', loadRequestIdRef.current + 1);
    // Increment request ID to track this specific call
    const requestId = ++loadRequestIdRef.current;

    try {
      if (showLoading) {
        _setLoading(true);
      }
      const isFiltered = _hasActiveFilters(effectiveFilters);
      const hasTextSearch = effectiveFilters.searchText && effectiveFilters.searchText.trim();

      let operationsData;
      let allDatesLoaded = false;

      if (hasTextSearch) {
        if (Array.isArray(allOpsCacheRef.current)) {
          // Cache ready: pass full list; useMemo in OperationsDataContext handles filtering
          operationsData = allOpsCacheRef.current;
        } else {
          // Cache not ready: fall back to DB and build cache in background for next time
          operationsData = await OperationsDB.getFilteredOperationsAllDates(effectiveFilters);
          _loadCache();
        }
        allDatesLoaded = true;
      } else if (isFiltered) {
        operationsData = await OperationsDB.getFilteredOperationsAllDates(effectiveFilters);
        allDatesLoaded = true;
      } else {
        operationsData = await OperationsDB.getOperationsByWeekOffset(0);
      }

      // Check if this request is still the latest (ignore stale results)
      if (requestId !== loadRequestIdRef.current) {
        console.debug(`[OperationsActionsContext] Ignoring stale request ${requestId}, current is ${loadRequestIdRef.current}`);
        return;
      }

      _setOperations(operationsData);

      // Track the oldest and newest dates in the initial load
      if (operationsData.length > 0) {
        const newestOp = operationsData[0]; // Operations are sorted DESC by date
        const oldestOp = operationsData[operationsData.length - 1];
        _setNewestLoadedDate(newestOp.date);
        _setOldestLoadedDate(oldestOp.date);
        _setHasNewerOperations(false);
      } else {
        _setNewestLoadedDate(null);
        _setOldestLoadedDate(null);
        _setHasNewerOperations(false);
      }

      // Text searches load all matching results at once — no further pagination needed.
      // Week-based pagination always starts with hasMore=true.
      _setHasMoreOperations(!allDatesLoaded);
      _setDataLoaded(true);

      // Pre-warm cache after first non-text load so subsequent text searches are instant
      if (!hasTextSearch && !Array.isArray(allOpsCacheRef.current)) {
        InteractionManager.runAfterInteractions(() => { _loadCache(); });
      }
    } catch (error) {
      console.error('Failed to load initial operations:', error);
    } finally {
      if (showLoading) {
        _setLoading(false);
      }
    }
  }, [
    _hasActiveFilters,
    _setLoading,
    _setOperations,
    _setNewestLoadedDate,
    _setOldestLoadedDate,
    _setHasNewerOperations,
    _setHasMoreOperations,
    _setDataLoaded,
    _loadCache,
  ]);

  // Load more operations (next week with operations)
  const loadMoreOperations = useCallback(async () => {
    if (loadingMore || !hasMoreOperations) return;

    _setLoadingMore(true);
    try {
      if (Array.isArray(allOpsCacheRef.current)) {
        // Cache is ready — serve from it to avoid an extra DB round-trip.
        // Cache is sorted DESC (newest first), same as getAllOperations.
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const boundary = _oldestLoadedDate ?? todayStr;

        const olderOps = allOpsCacheRef.current.filter(op => op.date < boundary);

        if (olderOps.length === 0) {
          _setHasMoreOperations(false);
          return;
        }

        // Take a 7-day window anchored at the most recent of the older ops.
        const chunkEnd = olderOps[0].date;
        const chunkEndDate = new Date(chunkEnd + 'T00:00:00');
        const chunkStartDate = new Date(chunkEndDate);
        chunkStartDate.setDate(chunkStartDate.getDate() - 6);
        const chunkStart = `${chunkStartDate.getFullYear()}-${String(chunkStartDate.getMonth() + 1).padStart(2, '0')}-${String(chunkStartDate.getDate()).padStart(2, '0')}`;

        const chunk = olderOps.filter(op => op.date >= chunkStart);

        _setOperations(prevOps => {
          const existingIds = new Set(prevOps.map(op => op.id));
          const newOps = chunk.filter(op => !existingIds.has(op.id));
          return [...prevOps, ...newOps];
        });

        if (chunk.length > 0) {
          _setOldestLoadedDate(chunk[chunk.length - 1].date);
        }

        _setHasMoreOperations(olderOps.some(op => op.date < chunkStart));
      } else {
        // Cache not ready yet — fall back to DB queries.
        const currentFilters = activeFiltersRef.current;
        const isFiltered = _hasActiveFilters(currentFilters);

        const todayStr = new Date().toISOString().split('T')[0];
        let nextOp;
        if (!_oldestLoadedDate) {
          nextOp = isFiltered
            ? await OperationsDB.getNextOldestFilteredOperation(todayStr, currentFilters)
            : await OperationsDB.getNextOldestOperation(todayStr);
        } else {
          nextOp = isFiltered
            ? await OperationsDB.getNextOldestFilteredOperation(_oldestLoadedDate, currentFilters)
            : await OperationsDB.getNextOldestOperation(_oldestLoadedDate);
        }

        if (!nextOp) {
          _setHasMoreOperations(false);
        } else {
          const moreOperations = isFiltered
            ? await OperationsDB.getFilteredOperationsByWeekFromDate(nextOp.date, currentFilters)
            : await OperationsDB.getOperationsByWeekFromDate(nextOp.date);

          _setOperations(prevOps => {
            const existingIds = new Set(prevOps.map(op => op.id));
            const newOps = moreOperations.filter(op => !existingIds.has(op.id));
            return [...prevOps, ...newOps];
          });

          if (moreOperations.length > 0) {
            _setOldestLoadedDate(moreOperations[moreOperations.length - 1].date);
          }
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

      const currentFilters = activeFiltersRef.current;
      const isFiltered = _hasActiveFilters(currentFilters);

      // Find the next newest operation after our current newest date
      const nextOp = isFiltered
        ? await OperationsDB.getNextNewestFilteredOperation(_newestLoadedDate, currentFilters)
        : await OperationsDB.getNextNewestOperation(_newestLoadedDate);

      if (!nextOp) {
        // No more newer operations found
        _setHasNewerOperations(false);
      } else {
        // Load a week of operations ending at this operation's date
        const newerOperations = isFiltered
          ? await OperationsDB.getFilteredOperationsByWeekToDate(nextOp.date, currentFilters)
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
    console.debug('[OperationsActionsContext] loadInitialOperations dependency changed, calling it');
    loadInitialOperations();
  }, [loadInitialOperations]);

  // Reload operations from DB when filters change. Text search also triggers a reload so
  // that results are fetched across all dates (not just the lazily-loaded window).
  const isFirstSearchEffectRef = useRef(true);
  const prevStructuralRef = useRef(null);
  useEffect(() => {
    if (isFirstSearchEffectRef.current) {
      isFirstSearchEffectRef.current = false;
      prevStructuralRef.current = activeFilters;
      return;
    }

    const prev = prevStructuralRef.current;
    prevStructuralRef.current = activeFilters;

    // Compare all filter fields by reference — React never mutates arrays in place,
    // so reference equality is sufficient to detect changes.
    const filtersChanged = !prev
      || prev.types !== activeFilters.types
      || prev.accountIds !== activeFilters.accountIds
      || prev.categoryIds !== activeFilters.categoryIds
      || prev.dateRange !== activeFilters.dateRange
      || prev.amountRange !== activeFilters.amountRange
      || prev.searchText !== activeFilters.searchText;

    if (filtersChanged) {
      loadInitialOperations(activeFilters, false);
    }

    setJsonPreference(PREF_KEYS.OPERATIONS_FILTERS, activeFilters).catch(err => {
      console.error('Failed to persist filters:', err);
    });
  }, [activeFilters, loadInitialOperations]);

  // Listen for reload events
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('Reloading operations due to RELOAD_ALL event');
      allOpsCacheRef.current = null; // data may have changed; rebuild on next text search
      loadInitialOperations();
    });

    return unsubscribe;
  }, [loadInitialOperations]);

  // Clear cache on database reset so stale data is never served
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      allOpsCacheRef.current = null;
      cacheLoadingRef.current = false;
    });
    return unsubscribe;
  }, []);

  // Note: Default operations are now created directly in AccountsDataContext
  // after default accounts are created, then RELOAD_ALL is emitted to refresh everything.

  const addOperation = useCallback(async (operation) => {
    try {
      console.debug('[OperationsContext] addOperation called with:', {
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

      console.debug('[OperationsContext] Operation created successfully:', createdOperation?.id);

      // Keep cache in sync so text search reflects the new operation immediately
      if (allOpsCacheRef.current !== null && createdOperation) {
        allOpsCacheRef.current = [createdOperation, ...allOpsCacheRef.current];
      }

      // Reload operations to include the new one (without showing loading spinner)
      // Note: We reload to ensure consistency with lazy-loaded week ranges
      await loadInitialOperations(activeFiltersRef.current, false);

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
  }, [reloadAccounts, showDialog, loadInitialOperations, _setSaveError]);

  const splitOperation = useCallback(async (id, updates, newOperationData) => {
    try {
      await OperationsDB.splitOperation(id, updates, newOperationData);

      // Invalidate cache — can't reconstruct the new split operations without a DB read
      allOpsCacheRef.current = null;
      _loadCache();

      await loadInitialOperations(activeFiltersRef.current, false);

      _setSaveError(null);

      await reloadAccounts();

      appEvents.emit(EVENTS.OPERATION_CHANGED);
    } catch (error) {
      console.error('Failed to split operation:', error);
      _setSaveError(error.message);
      showDialog(
        'Error',
        'Failed to split operation. Please try again.',
        [{ text: 'OK' }],
      );
      throw error;
    }
  }, [reloadAccounts, showDialog, loadInitialOperations, _setSaveError, _loadCache]);

  const updateOperation = useCallback(async (id, updates) => {
    try {
      // Update operation in DB (handles balance updates automatically)
      await OperationsDB.updateOperation(id, updates);

      // Refetch the persisted form so local state matches what the DB stored
      // (DB may normalize/format fields, e.g. dates, amounts, types).
      const persisted = await OperationsDB.getOperationById(id);

      _setOperations(ops => {
        return ops.map(op => {
          if (op.id === id) {
            return persisted ?? { ...op, ...updates };
          }
          return op;
        });
      });

      // Mirror the persisted form into the cache
      if (allOpsCacheRef.current !== null) {
        allOpsCacheRef.current = allOpsCacheRef.current.map(op =>
          op.id === id ? (persisted ?? { ...op, ...updates }) : op,
        );
      }
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

      // Mirror the deletion into the cache
      if (allOpsCacheRef.current !== null) {
        allOpsCacheRef.current = allOpsCacheRef.current.filter(op => op.id !== id);
      }
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
      // convert legacy activeFilters format to searchState format
      _setSearchState({
        text: newFilters.searchText || '',
        types: newFilters.types || [],
        accountIds: newFilters.accountIds || [],
        categoryIds: newFilters.categoryIds || [],
        dateRange: newFilters.dateRange || { startDate: null, endDate: null },
        amountRange: newFilters.amountRange || { min: null, max: null },
      });

      const isActive = _hasActiveFilters(newFilters);
      _setFiltersActive(isActive);

      // Persist filters to PreferencesDB
      await setJsonPreference(PREF_KEYS.OPERATIONS_FILTERS, newFilters);

      // Reset to first week when filters change
      await loadInitialOperations(newFilters);
    } catch (error) {
      console.error('Failed to update filters:', error);
    }
  }, [_hasActiveFilters, loadInitialOperations, _setSearchState, _setFiltersActive]);

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
      const currentFilters = activeFiltersRef.current;
      const isFiltered = _hasActiveFilters(currentFilters);

      // Calculate today's date in YYYY-MM-DD format
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Load all operations from the selected date to today
      const operationsData = isFiltered
        ? await OperationsDB.getFilteredOperationsByDateRange(date, todayStr, currentFilters)
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
    const f = activeFiltersRef.current;
    let count = 0;
    if (f.types.length > 0) count++;
    if (f.accountIds.length > 0) count++;
    if (f.categoryIds.length > 0) count++;
    if (f.searchText.trim().length > 0) count++;
    if (f.dateRange.startDate || f.dateRange.endDate) count++;
    if (f.amountRange.min !== null || f.amountRange.max !== null) count++;
    return count;
  }, []);

  const value = useMemo(() => ({
    addOperation,
    splitOperation,
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
    // New search API
    setSearchText: _setSearchText,
    updateSearchFilters: _updateSearchFilters,
    clearAllSearch: _clearAllSearch,
  }), [
    addOperation,
    splitOperation,
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
    _setSearchText,
    _updateSearchFilters,
    _clearAllSearch,
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
