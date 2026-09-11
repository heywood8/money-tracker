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
  // Background reloads (RELOAD_ALL after a balance edit, the notification
  // pipeline, a category change) report through `refreshing` instead of
  // `loading`: consumers read `loading` as "there is nothing to show yet" and
  // swap the whole list for a spinner, which remounts it and loses the scroll
  // position even though the previous data is still perfectly good.
  const [refreshing, setRefreshing] = useState(false);
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

  const isLoadingRef = useRef(false);
  // Which of the two flags a load raises is decided by what is *currently on
  // screen*, not by how many loads have run: a load with nothing to show is a
  // foreground `loading`, a load over existing rows is a background
  // `refreshing`. Keying it on the committed accounts rather than a
  // "has loaded once" flag keeps it right through a failed first load (still
  // empty, so the retry shows the spinner), a database reset, and a repopulate
  // driven by AccountsActionsContext's own `_setAccounts`. The no-deps effect
  // below runs after every commit, so the ref always holds the latest state.
  const accountsRef = useRef([]);
  useEffect(() => {
    accountsRef.current = accounts;
  });

  // Reusable function to load accounts
  const loadAccounts = useCallback(async (createDefaultsIfEmpty = true) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    const hasDataOnScreen = accountsRef.current.length > 0;
    try {
      if (!hasDataOnScreen) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      // Load accounts from SQLite
      let accountsData = await AccountsDB.getAllAccounts();
      console.debug(`[AccountsDataContext] loadAccounts: found ${accountsData.length} accounts, createDefaultsIfEmpty=${createDefaultsIfEmpty}`);

      let defaultsCreated = false;
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
        defaultsCreated = true;
      }

      setAccounts(accountsData);
      setError(null);

      if (defaultsCreated) {
        // Emit synchronously after state is updated so other screens see fresh data immediately.
        // The isLoadingRef guard above prevents the RELOAD_ALL listener from re-entering loadAccounts.
        console.debug('Emitting RELOAD_ALL after default data creation');
        appEvents.emit(EVENTS.RELOAD_ALL);
      }
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
      setRefreshing(false);
      isLoadingRef.current = false;
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
      // Clear the mirror synchronously as well: a RELOAD_ALL emitted in the same
      // tick would otherwise still see the pre-reset accounts (the sync effect
      // only runs on the next commit) and report the reload as a background
      // refresh over a list that no longer has anything in it.
      accountsRef.current = [];
      setAccounts([]);
      setError(null);
    });

    return unsubscribe;
  }, []);

  // Listen for RELOAD_ALL event to reload accounts
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.debug('AccountsDataContext: Reloading accounts due to RELOAD_ALL event');
      loadAccounts();
    });

    return unsubscribe;
  }, [loadAccounts]);

  // Filter accounts based on hidden status.
  // Naming note: the UI calls these accounts *archived* ("Archived account",
  // "Show archived accounts"). The `hidden` column — and therefore the
  // identifiers derived from it here and in AccountsActionsContext — keep the
  // original name so existing databases, backups and Sheets exports need no
  // migration. See docs/DATABASE.md.
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
    refreshing,
    error,
    // Internal setters for actions context to use
    _setAccounts: setAccounts,
    _setLoading: setLoading,
    _setShowHiddenAccounts: setShowHiddenAccounts,
    _initializeDefaultAccounts: initializeDefaultAccounts,
  }), [accounts, visibleAccounts, hiddenAccounts, displayedAccounts, showHiddenAccounts, loading, refreshing, error, initializeDefaultAccounts]);

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
