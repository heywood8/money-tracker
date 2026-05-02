import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

const SearchContext = createContext(null);

export const SearchProvider = ({ children }) => {
  const [searchHandler, setSearchHandler] = useState(null);
  const [internalSearchMode, setInternalSearchMode] = useState('closed');

  const registerSearchHandler = useCallback((handler) => {
    console.log('[SearchContext] registerSearchHandler called with:', handler ? 'function' : 'null');
    setSearchHandler(() => handler);
  }, []);

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
    console.log('[SearchContext] openSearch called, searchHandler exists:', !!searchHandler);
    if (searchHandler) {
      searchHandler();
    }
  }, [searchHandler]);

  const value = useMemo(
    () => ({ registerSearchHandler, openSearch, searchMode: internalSearchMode, setSearchMode }),
    [registerSearchHandler, openSearch, internalSearchMode, setSearchMode],
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
