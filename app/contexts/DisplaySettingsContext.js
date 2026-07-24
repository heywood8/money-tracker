import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
import { hasMainMenuPinnedAccount } from '../services/AccountsDB';

const DisplaySettingsContext = createContext();

export const DisplaySettingsProvider = ({ children }) => {
  const [hideBalances, setHideBalancesState] = useState(false);
  // Opt-in toggle for attaching the device's geolocation to new operations.
  // Defaults off — with no user action the app behaves exactly as before
  // (no permission prompt, no capture). See issue #1091.
  const [attachLocation, setAttachLocationState] = useState(false);
  // Global toggle: when on, a dedicated Accounts tab is shown in the bottom
  // navigation. Defaults off — accounts remain reachable from Settings.
  const [showAccountsTab, setShowAccountsTabState] = useState(false);
  // Global toggle: when on, the Budget tab is shown in the bottom navigation.
  // Defaults ON (unlike Accounts) because budgets are reachable from nowhere
  // else — hiding it is an explicit opt-out.
  const [showBudgetTab, setShowBudgetTabState] = useState(true);

  useEffect(() => {
    getPreference(PREF_KEYS.HIDE_BALANCES, 'false').then(stored => {
      setHideBalancesState(stored === 'true');
    });
    getPreference(PREF_KEYS.ATTACH_LOCATION, 'false').then(stored => {
      setAttachLocationState(stored === 'true');
    });
    // Use null as the "never set" sentinel so we can tell a genuine stored value
    // apart from an upgrade with no preference yet.
    getPreference(PREF_KEYS.SHOW_ACCOUNTS_TAB, null).then(async stored => {
      if (stored !== null) {
        setShowAccountsTabState(stored === 'true');
        return;
      }
      // First run after upgrading from the per-account version (0.190.0): enable
      // the tab if the user had pinned any account, so their Accounts tab doesn't
      // silently disappear. Persist the resolved value so this bridge runs once.
      const hadPins = await hasMainMenuPinnedAccount();
      setShowAccountsTabState(hadPins);
      await setPreference(PREF_KEYS.SHOW_ACCOUNTS_TAB, hadPins ? 'true' : 'false');
    });
    getPreference(PREF_KEYS.SHOW_BUDGET_TAB, 'true').then(stored => {
      setShowBudgetTabState(stored === 'true');
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

  const setShowAccountsTab = useCallback(async (value) => {
    setShowAccountsTabState(value);
    await setPreference(PREF_KEYS.SHOW_ACCOUNTS_TAB, value ? 'true' : 'false');
  }, []);

  const setShowBudgetTab = useCallback(async (value) => {
    setShowBudgetTabState(value);
    await setPreference(PREF_KEYS.SHOW_BUDGET_TAB, value ? 'true' : 'false');
  }, []);

  const ctxValue = useMemo(
    () => ({ hideBalances, setHideBalances, attachLocation, setAttachLocation, showAccountsTab, setShowAccountsTab, showBudgetTab, setShowBudgetTab }),
    [hideBalances, setHideBalances, attachLocation, setAttachLocation, showAccountsTab, setShowAccountsTab, showBudgetTab, setShowBudgetTab],
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
