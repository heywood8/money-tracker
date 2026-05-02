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

  const value = useMemo(
    () => ({ openSearch, searchMode: internalSearchMode, setSearchMode }),
    [openSearch, internalSearchMode, setSearchMode],
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
