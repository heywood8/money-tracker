import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import uuid from 'react-native-uuid';
import currencies from '../assets/currencies.json';
import * as AccountsDB from './services/AccountsDB';
import { performMigration, isMigrationComplete } from './services/migration';

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
        const accountsData = await AccountsDB.getAllAccounts();
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
  }, []);

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
      const updates = { ...updated, balance: String(updated.balance) };
      await AccountsDB.updateAccount(id, updates);
      setAccounts(accs => accs.map(a => a.id === id ? { ...a, ...updates } : a));
    } catch (err) {
      console.error('Failed to update account:', err);
      Alert.alert(
        'Error',
        'Failed to update account. Please try again.',
        [{ text: 'OK' }]
      );
      throw err;
    }
  }, []);

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

  const value = useMemo(() => ({
    accounts,
    loading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
    reloadAccounts,
    validateAccount,
    currencies,
  }), [accounts, loading, error, addAccount, updateAccount, deleteAccount, reloadAccounts]);

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => useContext(AccountsContext);
