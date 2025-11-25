import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import currencies from '../assets/currencies.json';
import * as AccountsDB from './services/AccountsDB';
import { performMigration, isMigrationComplete } from './services/migration';
import { appEvents, EVENTS } from './services/eventEmitter';

const AccountsContext = createContext();

function validateAccount(account) {
  const errors = {};
  if (!account.name.trim()) errors.name = 'Name required';
  if (isNaN(Number(account.balance)) || account.balance === '') errors.balance = 'Balance must be a number';
  if (!account.currency) errors.currency = 'Currency required';
  return errors;
}

export const AccountsProvider = ({ children }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Initialize default accounts if none exist
  const initializeDefaultAccounts = useCallback(async () => {
    try {
      const defaultAccounts = [
        {
          id: uuid.v4(),
          name: 'Наличка драмы',
          balance: '1000',
          currency: 'AMD',
        },
        {
          id: uuid.v4(),
          name: 'Ameria',
          balance: '5000',
          currency: 'AMD',
        },
      ];

      for (const account of defaultAccounts) {
        await AccountsDB.createAccount(account);
      }

      return defaultAccounts;
    } catch (err) {
      console.error('Failed to create default accounts:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        // Check and perform migration if needed
        const migrated = await isMigrationComplete();
        if (!migrated) {
          console.log('Performing first-time migration...');
          await performMigration();
        }

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
        Alert.alert(
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
  }, [initializeDefaultAccounts]);

  const addAccount = useCallback(async (account) => {
    try {
      const newAccount = {
        ...account,
        id: uuid.v4(),
        balance: String(account.balance),
      };

      await AccountsDB.createAccount(newAccount);
      setAccounts(accs => [...accs, newAccount]);
    } catch (err) {
      console.error('Failed to add account:', err);
      Alert.alert(
        'Error',
        'Failed to create account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, []);

  const updateAccount = useCallback(async (id, updated) => {
    try {
      const currentAccount = accounts.find(a => a.id === id);
      if (!currentAccount) {
        throw new Error('Account not found');
      }

      // Check if balance is being changed
      const balanceChanged = updated.balance !== undefined && currentAccount.balance !== String(updated.balance);

      if (balanceChanged) {
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
        // No balance change, just update normally
        // Filter out undefined values and convert balance to string if present
        const updates = {};
        if (updated.name !== undefined) updates.name = updated.name;
        if (updated.currency !== undefined) updates.currency = updated.currency;
        if (updated.balance !== undefined) updates.balance = String(updated.balance);

        await AccountsDB.updateAccount(id, updates);
      }

      // Reload accounts to get the updated balance from the database
      await reloadAccounts();
    } catch (err) {
      console.error('Failed to update account:', err);
      Alert.alert(
        'Error',
        'Failed to update account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, [accounts, reloadAccounts]);

  const deleteAccount = useCallback(async (id) => {
    try {
      await AccountsDB.deleteAccount(id);
      setAccounts(accs => accs.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete account:', err);
      Alert.alert(
        'Error',
        'Failed to delete account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, []);

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
      Alert.alert(
        'Error',
        'Failed to save new account order. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, [reloadAccounts]);

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

      // Clear migration status from database to prevent migration from running
      await executeQuery(
        'DELETE FROM app_metadata WHERE key = ?',
        ['migration_status']
      );

      // Set migration status to completed so migration doesn't run
      await executeQuery(
        'INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['migration_status', 'completed', new Date().toISOString()]
      );

      // Clear migration backup from AsyncStorage
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem('migration_backup');

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

      Alert.alert(
        'Success',
        'Database has been reset successfully.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('Failed to reset database:', err);
      Alert.alert(
        'Error',
        `Failed to reset database: ${err.message}`,
        [{ text: 'OK' }]
      );
      throw err;
    } finally {
      setLoading(false);
    }
  }, [initializeDefaultAccounts]);

  const value = useMemo(() => ({
    accounts,
    loading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
    reloadAccounts,
    reorderAccounts,
    resetDatabase,
    validateAccount,
    currencies,
  }), [accounts, loading, error, addAccount, updateAccount, deleteAccount, reloadAccounts, reorderAccounts, resetDatabase]);

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => useContext(AccountsContext);
