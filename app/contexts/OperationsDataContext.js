import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { getJsonPreference, PREF_KEYS } from '../services/PreferencesDB';
import { normalizeSearchText } from '../services/searchNormalize';
import { useAccountsData } from './AccountsDataContext';
import { useCategories } from './CategoriesContext';
import { useLocalization } from './LocalizationContext';

/**
 * OperationsDataContext manages operations data state.
 * Split from OperationsContext to reduce unnecessary re-renders.
 *
 * This context contains frequently-changing data (operations array, loading states, filters).
 * For stable action functions, use OperationsActionsContext.
 */
const OperationsDataContext = createContext();

export const useOperationsData = () => {
  const context = useContext(OperationsDataContext);
  if (!context) {
    throw new Error('useOperationsData must be used within an OperationsDataProvider');
  }
  return context;
};

export const OperationsDataProvider = ({ children }) => {
  // Dependencies from other contexts
  const { accounts } = useAccountsData();
  const { categories, getCategoryPath } = useCategories();
  const { t } = useLocalization();

  // Core data state
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Lazy-loading state - track the oldest and newest dates we've loaded so far
  const [oldestLoadedDate, setOldestLoadedDate] = useState(null);
  const [newestLoadedDate, setNewestLoadedDate] = useState(null);
  const [hasMoreOperations, setHasMoreOperations] = useState(true);
  const [hasNewerOperations, setHasNewerOperations] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);

  // Search state (unified API - single source of truth)
  const [searchState, setSearchState] = useState({
    text: '',
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  });

  // Legacy filter state tracking (for backwards compatibility)
  const [filtersActive, setFiltersActive] = useState(false);

  // activeFilters is now a computed property (alias) pointing to searchState
  // maintains backwards compatibility while having single source of truth
  const activeFilters = useMemo(() => ({
    types: searchState.types,
    accountIds: searchState.accountIds,
    categoryIds: searchState.categoryIds,
    searchText: searchState.text,
    dateRange: searchState.dateRange,
    amountRange: searchState.amountRange,
  }), [searchState]);

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

  // Search state action functions
  const setSearchText = useCallback((text) => {
    setSearchState(prev => {
      // Don't update if text hasn't changed (prevents infinite loop)
      if (prev.text === text) {
        return prev;
      }
      return { ...prev, text };
    });
  }, []);

  const updateSearchFilters = useCallback((partialFilters) => {
    setSearchState(prev => ({ ...prev, ...partialFilters }));
  }, []);

  const clearAllSearch = useCallback(() => {
    setSearchState({
      text: '',
      types: [],
      accountIds: [],
      categoryIds: [],
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    });
  }, []);

  // Computed property: check if any search is active
  const hasActiveSearch = useMemo(() => {
    return (
      searchState.text !== '' ||
      searchState.types.length > 0 ||
      searchState.accountIds.length > 0 ||
      searchState.categoryIds.length > 0 ||
      searchState.dateRange.startDate !== null ||
      searchState.dateRange.endDate !== null ||
      searchState.amountRange.min !== null ||
      searchState.amountRange.max !== null
    );
  }, [searchState]);

  // Stable account name lookup — only rebuilds when account IDs or names change,
  // not when balances change. Prevents filteredOperations from recomputing on every
  // operation add/edit (which triggers an account balance reload).
  const accountNamesKey = accounts.map(a => `${a.id}:${a.name}`).join('|');
  const accountNameById = useMemo(() => new Map(accounts.map(a => [a.id, a.name])), [accountNamesKey]);

  // Filtered operations based on search state
  const filteredOperations = useMemo(() => {
    let result = operations;

    // text search - match description, account name, category name, amount, type.
    // Both query and field values are run through normalizeSearchText so the match is
    // case-insensitive AND treats Russian ё/е as equivalent (a Russian keyboard's
    // autocomplete frequently swaps one for the other, so "Самолет" must find "Самолёт"
    // and vice versa). This is the same normalization SEARCH_NORM applies in SQL.
    const trimmedText = searchState.text ? searchState.text.trim() : '';
    if (trimmedText) {
      const searchLower = normalizeSearchText(trimmedText);
      result = result.filter(op => {
        // match description
        if (op.description && normalizeSearchText(op.description).includes(searchLower)) {
          return true;
        }

        // match type (localized)
        if (op.type) {
          const typeName = t(op.type);
          if (normalizeSearchText(typeName).includes(searchLower)) {
            return true;
          }
        }

        // match account name
        const accountName = accountNameById.get(op.accountId);
        if (accountName && normalizeSearchText(accountName).includes(searchLower)) {
          return true;
        }

        // match category name (including parent categories in hierarchy)
        const categoryPath = getCategoryPath(op.categoryId);
        if (categoryPath.some(cat => {
          const name = cat.nameKey ? t(cat.nameKey) : cat.name;
          return name && normalizeSearchText(name).includes(searchLower);
        })) {
          return true;
        }

        // match amount (digits and dot only — normalization is a no-op but keeps the
        // path uniform).
        if (op.amount && String(op.amount).includes(searchLower)) {
          return true;
        }

        return false;
      });
    }

    // type filter
    if (searchState.types.length > 0) {
      result = result.filter(op => searchState.types.includes(op.type));
    }

    // account filter
    if (searchState.accountIds.length > 0) {
      result = result.filter(op => searchState.accountIds.includes(op.accountId));
    }

    // category filter
    if (searchState.categoryIds.length > 0) {
      result = result.filter(op => searchState.categoryIds.includes(op.categoryId));
    }

    // date range filter — string compare YYYY-MM-DD to avoid timezone issues from new Date(...)
    if (searchState.dateRange.startDate || searchState.dateRange.endDate) {
      // Extract just the date portion (in case op.date includes a time component)
      const dateOnly = (d) => (typeof d === 'string' ? d.slice(0, 10) : d);
      let { startDate, endDate } = searchState.dateRange;
      if (startDate && endDate && startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
      }
      result = result.filter(op => {
        const opDate = dateOnly(op.date);
        if (startDate && opDate < startDate) return false;
        if (endDate && opDate > endDate) return false;
        return true;
      });
    }

    // amount range filter
    if (searchState.amountRange.min !== null || searchState.amountRange.max !== null) {
      result = result.filter(op => {
        const amount = parseFloat(op.amount);
        if (isNaN(amount)) return false;

        if (searchState.amountRange.min !== null && amount < searchState.amountRange.min) {
          return false;
        }
        if (searchState.amountRange.max !== null && amount > searchState.amountRange.max) {
          return false;
        }
        return true;
      });
    }

    return result;
  }, [operations, searchState, accountNameById, getCategoryPath, t]);

  // Count active filter groups (excluding text search)
  const getSearchFilterCount = useCallback(() => {
    let count = 0;
    if (searchState.types.length > 0) count++;
    if (searchState.accountIds.length > 0) count++;
    if (searchState.categoryIds.length > 0) count++;
    if (searchState.dateRange.startDate !== null || searchState.dateRange.endDate !== null) count++;
    if (searchState.amountRange.min !== null || searchState.amountRange.max !== null) count++;
    return count;
  }, [searchState]);

  // Load filters from PreferencesDB on mount
  useEffect(() => {
    let mounted = true;
    const loadFilters = async () => {
      try {
        const filters = await getJsonPreference(PREF_KEYS.OPERATIONS_FILTERS);
        if (!mounted) return;
        if (filters) {
          const normalized = {
            text: filters.searchText || '',
            types: filters.types || [],
            accountIds: filters.accountIds || [],
            categoryIds: filters.categoryIds || [],
            dateRange: filters.dateRange || { startDate: null, endDate: null },
            amountRange: filters.amountRange || { min: null, max: null },
          };
          setSearchState(normalized);
          setFiltersActive(hasActiveFilters({
            types: normalized.types,
            accountIds: normalized.accountIds,
            categoryIds: normalized.categoryIds,
            searchText: normalized.text,
            dateRange: normalized.dateRange,
            amountRange: normalized.amountRange,
          }));
        }
      } catch (error) {
        if (mounted) console.error('Failed to load filters:', error);
      }
    };
    loadFilters();
    return () => { mounted = false; };
  }, [hasActiveFilters]);

  // Listen for DATABASE_RESET event to clear operations state
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('OperationsDataContext: Database reset detected, clearing operations');
      setOperations([]);
      setDataLoaded(false);
      setOldestLoadedDate(null);
      setNewestLoadedDate(null);
      setHasMoreOperations(true);
      setHasNewerOperations(false);
      setSaveError(null);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(() => ({
    // Public data
    operations: filteredOperations,
    loading,
    loadingMore,
    loadingNewer,
    hasMoreOperations,
    hasNewerOperations,
    activeFilters,
    filtersActive,

    // New search state API
    searchState,
    hasActiveSearch,
    getSearchFilterCount,

    // Internal setters for actions context (prefixed with _)
    _setOperations: setOperations,
    _setLoading: setLoading,
    _setDataLoaded: setDataLoaded,
    _setSaveError: setSaveError,
    _setOldestLoadedDate: setOldestLoadedDate,
    _setNewestLoadedDate: setNewestLoadedDate,
    _setHasMoreOperations: setHasMoreOperations,
    _setHasNewerOperations: setHasNewerOperations,
    _setLoadingMore: setLoadingMore,
    _setLoadingNewer: setLoadingNewer,
    _setFiltersActive: setFiltersActive,
    _setSearchState: setSearchState,
    _setSearchText: setSearchText,
    _updateSearchFilters: updateSearchFilters,
    _clearAllSearch: clearAllSearch,
    _hasActiveFilters: hasActiveFilters,
    _oldestLoadedDate: oldestLoadedDate,
    _newestLoadedDate: newestLoadedDate,
    _dataLoaded: dataLoaded,
  }), [
    filteredOperations,
    loading,
    loadingMore,
    loadingNewer,
    hasMoreOperations,
    hasNewerOperations,
    filtersActive,
    searchState,
    hasActiveSearch,
    oldestLoadedDate,
    newestLoadedDate,
    dataLoaded,
    hasActiveFilters,
    getSearchFilterCount,
    setSearchText,
    updateSearchFilters,
    clearAllSearch,
    activeFilters,
  ]);

  return (
    <OperationsDataContext.Provider value={value}>
      {children}
    </OperationsDataContext.Provider>
  );
};

OperationsDataProvider.propTypes = {
  children: PropTypes.node,
};
