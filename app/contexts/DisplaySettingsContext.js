import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';

const DisplaySettingsContext = createContext();

export const DisplaySettingsProvider = ({ children }) => {
  const [hideBalances, setHideBalancesState] = useState(false);

  useEffect(() => {
    getPreference(PREF_KEYS.HIDE_BALANCES, 'false').then(stored => {
      setHideBalancesState(stored === 'true');
    });
  }, []);

  const setHideBalances = useCallback(async (value) => {
    setHideBalancesState(value);
    await setPreference(PREF_KEYS.HIDE_BALANCES, value ? 'true' : 'false');
  }, []);

  const ctxValue = useMemo(() => ({ hideBalances, setHideBalances }), [hideBalances, setHideBalances]);

  return (
    <DisplaySettingsContext.Provider value={ctxValue}>
      {children}
    </DisplaySettingsContext.Provider>
  );
};

DisplaySettingsProvider.propTypes = {
  children: PropTypes.node,
};

export const useDisplaySettings = () => useContext(DisplaySettingsContext);
