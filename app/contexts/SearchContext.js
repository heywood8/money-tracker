import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

const SearchContext = createContext(null);

export const SearchProvider = ({ children }) => {
  const [internalSearchMode, setInternalSearchMode] = useState('closed');

  const setSearchMode = useCallback((mode) => {
    const validModes = ['closed', 'open', 'collapsed'];
    if (!validModes.includes(mode)) {
      console.warn('[SearchContext] Invalid searchMode:', mode);
      return;
    }
    console.log('[SearchContext] setSearchMode:', mode);
    setInternalSearchMode(mode);
  }, []);

  const openSearch = useCallback(() => {
    console.log('[SearchContext] openSearch called');
    setInternalSearchMode('open');
  }, []);

  const closeSearch = useCallback((hasActiveFilters) => {
    console.log('[SearchContext] closeSearch called, hasActiveFilters:', hasActiveFilters);
    const newMode = hasActiveFilters ? 'collapsed' : 'closed';
    setInternalSearchMode(newMode);
  }, []);

  const reopenSearch = useCallback((hasTextFilter, hasOtherFilters, onShouldExpandFilters) => {
    console.log('[SearchContext] reopenSearch called, hasText:', hasTextFilter, 'hasOther:', hasOtherFilters);
    setInternalSearchMode('open');

    // Auto-expand filters if other filters (non-text) are present
    const shouldExpand = hasOtherFilters;
    if (onShouldExpandFilters) {
      onShouldExpandFilters(shouldExpand);
    }
  }, []);

  const value = useMemo(
    () => ({ openSearch, closeSearch, reopenSearch, searchMode: internalSearchMode, setSearchMode }),
    [openSearch, closeSearch, reopenSearch, internalSearchMode, setSearchMode],
  );

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};

SearchProvider.propTypes = {
  children: PropTypes.node,
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within SearchProvider');
  }
  return context;
};
