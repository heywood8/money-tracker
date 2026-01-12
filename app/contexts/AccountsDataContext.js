import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import defaultAccounts from '../defaults/defaultAccounts';
import * as AccountsDB from '../services/AccountsDB';
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
          [{ text: 'OK' }],
        );
      } finally {
        setLoading(false);
      }
    };
    loadAccounts();
  }, [initializeDefaultAccounts, showDialog]);

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
