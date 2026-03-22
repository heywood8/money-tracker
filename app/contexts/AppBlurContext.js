import React, { createContext, useContext, useState, useCallback } from 'react';
import PropTypes from 'prop-types';

const AppBlurContext = createContext({ blurCount: 0, increment: () => {}, decrement: () => {} });

export function AppBlurProvider({ children }) {
  const [blurCount, setBlurCount] = useState(0);
  const increment = useCallback(() => setBlurCount(c => c + 1), []);
  const decrement = useCallback(() => setBlurCount(c => Math.max(0, c - 1)), []);

  return (
    <AppBlurContext.Provider value={{ blurCount, increment, decrement }}>
      {children}
    </AppBlurContext.Provider>
  );
}

AppBlurProvider.propTypes = { children: PropTypes.node };

export const useAppBlur = () => useContext(AppBlurContext);
