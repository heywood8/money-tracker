import React, { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

const SearchContext = createContext(null);

export const SearchProvider = ({ children }) => {
  const [searchHandler, setSearchHandler] = useState(null);

  const registerSearchHandler = (handler) => {
    setSearchHandler(() => handler);
  };

  const openSearch = () => {
    if (searchHandler) {
      searchHandler();
    }
  };

  return (
    <SearchContext.Provider value={{ registerSearchHandler, openSearch }}>
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
