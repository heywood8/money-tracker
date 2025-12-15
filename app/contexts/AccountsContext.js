import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import currencies from '../../assets/currencies.json';
import defaultAccounts from '../defaults/defaultAccounts';
import * as AccountsDB from '../services/AccountsDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useDialog } from './DialogContext';

const AccountsContext = createContext();

function validateAccount(account, t = (key) => key) {
  const errors = {};
  if (!account.name.trim()) errors.name = t('name_required') || 'Name required';
  if (isNaN(Number(account.balance)) || account.balance === '') errors.balance = t('balance_must_be_number') || 'Balance must be a number';
  if (!account.currency) errors.currency = t('currency_required') || 'Currency required';
  return errors;
}

export const AccountsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
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

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        // Load accounts from SQLite
        let accountsData = await AccountsDB.getAllAccounts();

        // If no accounts exist, create default ones
        if (accountsData.length === 0) {
          console.log('No accounts found, creating defaults...');
          accountsData = await initializeDefaultAccounts();
        }

        setAccounts(accountsData);
      } catch (err) {
        console.error('Failed to load accounts:', err);
        setError(err.message);
        showDialog(
          'Load Error',
          'Failed to load accounts from database.',
          [{ text: 'OK' }]
        );
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    loadAccounts();
  }, [initializeDefaultAccounts, showDialog]);

  const addAccount = useCallback(async (account) => {
    try {
      const newAccount = {
        ...account,
        balance: String(account.balance),
      };

      const createdAccount = await AccountsDB.createAccount(newAccount);
      setAccounts(accs => [...accs, createdAccount]);
    } catch (err) {
      console.error('Failed to add account:', err);
      showDialog(
        'Error',
        'Failed to create account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, [showDialog]);

  const updateAccount = useCallback(async (id, updated, createAdjustmentOperation = true) => {
    try {
      const currentAccount = accounts.find(a => a.id === id);
      if (!currentAccount) {
        throw new Error('Account not found');
      }

      // Check if balance is being changed
      const balanceChanged = updated.balance !== undefined && currentAccount.balance !== String(updated.balance);

      if (balanceChanged && createAdjustmentOperation) {
        // Use adjustAccountBalance for balance changes to create adjustment operations
        await AccountsDB.adjustAccountBalance(id, String(updated.balance), '');

        // Update non-balance fields if changed
        const nonBalanceUpdates = {};
        if (updated.name !== undefined && updated.name !== currentAccount.name) {
          nonBalanceUpdates.name = updated.name;
        }
        if (updated.currency !== undefined && updated.currency !== currentAccount.currency) {
          nonBalanceUpdates.currency = updated.currency;
        }

        if (Object.keys(nonBalanceUpdates).length > 0) {
          await AccountsDB.updateAccount(id, nonBalanceUpdates);
        }

        // Emit event to reload operations since we created/updated an adjustment operation
        appEvents.emit(EVENTS.RELOAD_ALL);
      } else {
        // No balance change or createAdjustmentOperation is false, just update normally
        // Filter out undefined values and convert balance to string if present
        const updates = {};
        if (updated.name !== undefined) updates.name = updated.name;
        if (updated.currency !== undefined) updates.currency = updated.currency;
        if (updated.balance !== undefined) updates.balance = String(updated.balance);
        if (updated.hidden !== undefined) updates.hidden = updated.hidden;

        await AccountsDB.updateAccount(id, updates);

        // If balance changed but adjustment operation was disabled, reload operations
        if (balanceChanged && !createAdjustmentOperation) {
          appEvents.emit(EVENTS.RELOAD_ALL);
        }
      }

      // Reload accounts to get the updated balance from the database
      await reloadAccounts();
    } catch (err) {
      console.error('Failed to update account:', err);
      showDialog(
        'Error',
        'Failed to update account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, [accounts, reloadAccounts, showDialog]);

  const deleteAccount = useCallback(async (id, transferToAccountId = null) => {
    try {
      await AccountsDB.deleteAccount(id, transferToAccountId);
      setAccounts(accs => accs.filter(a => a.id !== id));

      // If operations were transferred, reload all accounts to reflect balance changes
      if (transferToAccountId) {
        await reloadAccounts();
        // Emit event to reload operations since they were transferred
        appEvents.emit(EVENTS.RELOAD_ALL);
      }
    } catch (err) {
      console.error('Failed to delete account:', err);
      showDialog(
        'Error',
        'Failed to delete account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, [reloadAccounts, showDialog]);

  const reloadAccounts = useCallback(async () => {
    try {
      const accountsData = await AccountsDB.getAllAccounts();
      setAccounts(accountsData);
    } catch (err) {
      console.error('Failed to reload accounts:', err);
    }
  }, []);

  const reorderAccounts = useCallback(async (newOrder) => {
    try {
      // Update local state immediately for responsive UI
      setAccounts(newOrder);

      // Prepare data for database update
      const orderedAccounts = newOrder.map((account, index) => ({
        id: account.id,
        display_order: index,
      }));

      // Persist to database
      await AccountsDB.reorderAccounts(orderedAccounts);
    } catch (err) {
      console.error('Failed to reorder accounts:', err);
      // Reload accounts to restore correct order
      await reloadAccounts();
      showDialog(
        'Error',
        'Failed to save new account order. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, [reloadAccounts, showDialog]);

  const resetDatabase = useCallback(async () => {
    try {
      setLoading(true);

      // Emit DATABASE_RESET event to notify other contexts
      console.log('Emitting DATABASE_RESET event');
      appEvents.emit(EVENTS.DATABASE_RESET);

      // Drop and reinitialize the database
      const { dropAllTables, getDatabase, executeQuery } = await import('./services/db');
      await dropAllTables();

      // Force re-initialization by getting database again
      // This will create all tables with proper schema
      const db = await getDatabase();
      console.log('Database reinitialized successfully');

      // NOTE: Categories will be initialized after language selection
      // The AppInitializer will show the language selection screen
      // and initialize categories with the selected language

      // Create default accounts
      const defaultAccounts = await initializeDefaultAccounts();
      setAccounts(defaultAccounts);
      console.log('Default accounts initialized');

      // Reload accounts to ensure consistency
      await reloadAccounts();

      // Note: We don't emit RELOAD_ALL here because:
      // - Categories will be initialized after the user selects a language
      // - Operations will be empty anyway after reset
      // The AppInitializer will handle category initialization with the selected language

      showDialog(
        'Success',
        'Database has been reset successfully.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('Failed to reset database:', err);
      showDialog(
        'Error',
        `Failed to reset database: ${err.message}`,
        [{ text: 'OK' }]
      );
      throw err;
    } finally {
      setLoading(false);
    }
  }, [initializeDefaultAccounts, reloadAccounts, showDialog]);

  const getOperationCount = useCallback(async (accountId) => {
    try {
      return await AccountsDB.getOperationCount(accountId);
    } catch (err) {
      console.error('Failed to get operation count:', err);
      return 0;
    }
  }, []);

  const toggleShowHiddenAccounts = useCallback(() => {
    setShowHiddenAccounts(prev => !prev);
  }, []);

  // Filter accounts based on hidden status
  const visibleAccounts = useMemo(() => {
    return accounts.filter(account => !account.hidden);
  }, [accounts]);

  const hiddenAccounts = useMemo(() => {
    return accounts.filter(account => account.hidden);
  }, [accounts]);

  // Accounts to display based on showHiddenAccounts toggle
  const displayedAccounts = useMemo(() => {
    return showHiddenAccounts ? accounts : visibleAccounts;
  }, [accounts, visibleAccounts, showHiddenAccounts]);

  const value = useMemo(() => ({
    accounts,
    visibleAccounts,
    hiddenAccounts,
    displayedAccounts,
    showHiddenAccounts,
    toggleShowHiddenAccounts,
    loading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
    reloadAccounts,
    reorderAccounts,
    resetDatabase,
    validateAccount,
    getOperationCount,
    currencies,
  }), [accounts, visibleAccounts, hiddenAccounts, displayedAccounts, showHiddenAccounts, toggleShowHiddenAccounts, loading, error, addAccount, updateAccount, deleteAccount, reloadAccounts, reorderAccounts, resetDatabase, getOperationCount]);

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => useContext(AccountsContext);
