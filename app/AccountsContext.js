import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  useEffect(() => {
    AsyncStorage.getItem(ACCOUNT_STORAGE_KEY).then(data => {
      if (data) setAccounts(JSON.parse(data));
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  const addAccount = useCallback((account) => {
    setAccounts(accs => [...accs, { ...account, id: uuid.v4(), balance: String(account.balance) }]);
  }, []);

  const updateAccount = useCallback((id, updated) => {
    setAccounts(accs => accs.map(a => a.id === id ? { ...a, ...updated, balance: String(updated.balance) } : a));
  }, []);

  const deleteAccount = useCallback((id) => {
    setAccounts(accs => accs.filter(a => a.id !== id));
  }, []);

  return (
    <AccountsContext.Provider value={{ accounts, addAccount, updateAccount, deleteAccount, validateAccount, currencies }}>
      {children}
    </AccountsContext.Provider>
  );
};

export const useAccounts = () => useContext(AccountsContext);
