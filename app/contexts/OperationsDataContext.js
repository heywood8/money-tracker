import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { getJsonPreference, PREF_KEYS } from '../services/PreferencesDB';

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

  // Search state (new unified API)
  const [searchState, setSearchState] = useState({
    text: '',
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  });

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
    setSearchState(prev => ({ ...prev, text }));
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
    operations,
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
    _setActiveFilters: setActiveFilters,
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
    operations,
    loading,
    loadingMore,
    loadingNewer,
    hasMoreOperations,
    hasNewerOperations,
    activeFilters,
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
