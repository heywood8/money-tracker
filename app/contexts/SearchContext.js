import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

const SearchContext = createContext(null);

export const SearchProvider = ({ children }) => {
  const [searchHandler, setSearchHandler] = useState(null);

  const registerSearchHandler = useCallback((handler) => {
    setSearchHandler(() => handler);
  }, []);

  const openSearch = useCallback(() => {
    if (searchHandler) {
      searchHandler();
    }
  }, [searchHandler]);

  const value = useMemo(
    () => ({ registerSearchHandler, openSearch }),
    [registerSearchHandler, openSearch],
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
