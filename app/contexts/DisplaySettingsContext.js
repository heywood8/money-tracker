import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';

const DisplaySettingsContext = createContext();

export const DisplaySettingsProvider = ({ children }) => {
  const [hideBalances, setHideBalancesState] = useState(false);
  // Opt-in toggle for attaching the device's geolocation to new operations.
  // Defaults off — with no user action the app behaves exactly as before
  // (no permission prompt, no capture). See issue #1091.
  const [attachLocation, setAttachLocationState] = useState(false);

  useEffect(() => {
    getPreference(PREF_KEYS.HIDE_BALANCES, 'false').then(stored => {
      setHideBalancesState(stored === 'true');
    });
    getPreference(PREF_KEYS.ATTACH_LOCATION, 'false').then(stored => {
      setAttachLocationState(stored === 'true');
    });
  }, []);

  const setHideBalances = useCallback(async (value) => {
    setHideBalancesState(value);
    await setPreference(PREF_KEYS.HIDE_BALANCES, value ? 'true' : 'false');
  }, []);

  const setAttachLocation = useCallback(async (value) => {
    setAttachLocationState(value);
    await setPreference(PREF_KEYS.ATTACH_LOCATION, value ? 'true' : 'false');
  }, []);

  const ctxValue = useMemo(
    () => ({ hideBalances, setHideBalances, attachLocation, setAttachLocation }),
    [hideBalances, setHideBalances, attachLocation, setAttachLocation],
  );

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
