import React, { createContext, useContext, useEffect, useState } from 'react';
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

  const setHideBalances = async (value) => {
    setHideBalancesState(value);
    await setPreference(PREF_KEYS.HIDE_BALANCES, value ? 'true' : 'false');
  };

  return (
    <DisplaySettingsContext.Provider value={{ hideBalances, setHideBalances }}>
      {children}
    </DisplaySettingsContext.Provider>
  );
};

DisplaySettingsProvider.propTypes = {
  children: PropTypes.node,
};

export const useDisplaySettings = () => useContext(DisplaySettingsContext);
