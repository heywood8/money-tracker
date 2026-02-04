import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import defaultAccounts from '../defaults/defaultAccounts';
import * as AccountsDB from '../services/AccountsDB';
import * as OperationsDB from '../services/OperationsDB';
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
      console.log(`[AccountsDataContext] loadAccounts: found ${accountsData.length} accounts, createDefaultsIfEmpty=${createDefaultsIfEmpty}`);

      // If no accounts exist and we should create defaults, create default ones
      if (accountsData.length === 0 && createDefaultsIfEmpty) {
        console.log('[AccountsDataContext] No accounts found, creating defaults...');
        accountsData = await initializeDefaultAccounts();
        console.log(`[AccountsDataContext] Created ${accountsData.length} default accounts`);

        // Create default operations only if categories exist
        // On first launch, categories are created after language selection
        const CategoriesDB = require('../services/CategoriesDB');
        const categories = await CategoriesDB.getAllCategories();
        if (categories && categories.length > 0) {
          console.log('[AccountsDataContext] Creating default operations...');
          await OperationsDB.initializeDefaultOperations();
          console.log('[AccountsDataContext] Default operations created');
        } else {
          console.log('[AccountsDataContext] Skipping default operations - categories not initialized yet');
        }

        // Reload accounts to reflect balance changes from operations
        accountsData = await AccountsDB.getAllAccounts();

        // Emit RELOAD_ALL to refresh all screens with new data
        setTimeout(() => {
          console.log('Emitting RELOAD_ALL after default data creation');
          appEvents.emit(EVENTS.RELOAD_ALL);
        }, 100);
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
