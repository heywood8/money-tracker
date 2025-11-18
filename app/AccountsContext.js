import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import currencies from '../assets/currencies.json';

const ACCOUNT_STORAGE_KEY = 'accounts';
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
        const data = await AsyncStorage.getItem(ACCOUNT_STORAGE_KEY);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            setAccounts(parsed);
          } catch (parseError) {
            console.error('Failed to parse accounts:', parseError);
            setAccounts([]);
            setError('Failed to load accounts data');
          }
        }
      } catch (err) {
        console.error('Failed to load accounts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };
    loadAccounts();
  }, []);

  useEffect(() => {
    // Only save if data has been loaded (prevents race condition on initial load)
    if (dataLoaded) {
      AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts))
        .catch(err => {
          console.error('Failed to save accounts:', err);
          Alert.alert(
            'Save Failed',
            'Unable to save your accounts. Your changes may be lost.',
            [{ text: 'OK' }]
          );
        });
    }
  }, [accounts, dataLoaded]);

  const addAccount = useCallback((account) => {
    setAccounts(accs => [...accs, { ...account, id: uuid.v4(), balance: String(account.balance) }]);
  }, []);

  const updateAccount = useCallback((id, updated) => {
    setAccounts(accs => accs.map(a => a.id === id ? { ...a, ...updated, balance: String(updated.balance) } : a));
  }, []);

  const deleteAccount = useCallback((id) => {
    setAccounts(accs => accs.filter(a => a.id !== id));
  }, []);

  const value = useMemo(() => ({
    accounts,
    loading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
    validateAccount,
    currencies,
  }), [accounts, loading, error, addAccount, updateAccount, deleteAccount]);

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => useContext(AccountsContext);
