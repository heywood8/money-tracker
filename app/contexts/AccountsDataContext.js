import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import defaultAccounts from '../defaults/defaultAccounts';
import * as AccountsDB from '../services/AccountsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useDialog } from './DialogContext';

const AccountsDataContext = createContext();

export const AccountsDataProvider = ({ children }) => {
  const { showDialog } = useDialog();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHiddenAccounts, setShowHiddenAccounts] = useState(false);

  // Initialize default accounts if none exist
  const initializeDefaultAccounts = useCallback(async () => {
    try {
      const accountsToCreate = defaultAccounts.map(acc => ({
        ...acc,
        balance: String(acc.balance),
      }));

      const createdAccounts = [];
      for (const account of accountsToCreate) {
        const created = await AccountsDB.createAccount(account);
        createdAccounts.push(created);
      }

      return createdAccounts;
    } catch (err) {
      console.error('Failed to create default accounts:', err);
      throw err;
    }
  }, []);

  // Reusable function to load accounts
  const loadAccounts = useCallback(async (createDefaultsIfEmpty = true) => {
    try {
      setLoading(true);
      // Load accounts from SQLite
      let accountsData = await AccountsDB.getAllAccounts();

      // If no accounts exist and we should create defaults, create default ones
      if (accountsData.length === 0 && createDefaultsIfEmpty) {
        console.log('No accounts found, creating defaults...');
        accountsData = await initializeDefaultAccounts();
      }

      setAccounts(accountsData);
      setError(null);
    } catch (err) {
      console.error('Failed to load accounts:', err);
      setError(err.message);
      showDialog(
        'Load Error',
        'Failed to load accounts from database.',
        [{ text: 'OK' }],
      );
    } finally {
      setLoading(false);
    }
  }, [initializeDefaultAccounts, showDialog]);

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Listen for DATABASE_RESET event to clear accounts state
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('AccountsDataContext: Database reset detected, clearing accounts');
      setAccounts([]);
      setError(null);
    });

    return unsubscribe;
  }, []);

  // Listen for RELOAD_ALL event to reload accounts
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('AccountsDataContext: Reloading accounts due to RELOAD_ALL event');
      loadAccounts();
    });

    return unsubscribe;
  }, [loadAccounts]);

  // Filter accounts based on hidden status
  const visibleAccounts = useMemo(() => {
    return accounts.filter(account => !account?.hidden);
  }, [accounts]);

  const hiddenAccounts = useMemo(() => {
    return accounts.filter(account => account?.hidden);
  }, [accounts]);

  // Accounts to display based on showHiddenAccounts toggle
  const displayedAccounts = useMemo(() => {
    return showHiddenAccounts ? accounts : visibleAccounts;
  }, [accounts, visibleAccounts, showHiddenAccounts]);

  const value = useMemo(() => ({
    // Data
    accounts,
    visibleAccounts,
    hiddenAccounts,
    displayedAccounts,
    showHiddenAccounts,
    loading,
    error,
    // Internal setters for actions context to use
    _setAccounts: setAccounts,
    _setLoading: setLoading,
    _setShowHiddenAccounts: setShowHiddenAccounts,
    _initializeDefaultAccounts: initializeDefaultAccounts,
  }), [accounts, visibleAccounts, hiddenAccounts, displayedAccounts, showHiddenAccounts, loading, error, initializeDefaultAccounts]);

  return (
    <AccountsDataContext.Provider value={value}>
      {children}
    </AccountsDataContext.Provider>
  );
};

AccountsDataProvider.propTypes = {
  children: PropTypes.node,
};

export const useAccountsData = () => useContext(AccountsDataContext);
