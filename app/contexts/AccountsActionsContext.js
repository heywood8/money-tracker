import React, { createContext, useContext, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import * as AccountsDB from '../services/AccountsDB';
import { dropAllTables, getDatabase, closeDatabase } from '../services/db';
import { forceDeleteDatabase } from '../utils/emergencyReset';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { useDialog } from './DialogContext';
import { useAccountsData } from './AccountsDataContext';

const AccountsActionsContext = createContext();

function validateAccount(account, t = (key) => key) {
  const errors = {};
  if (!account.name.trim()) errors.name = t('name_required') || 'Name required';
  if (isNaN(Number(account.balance)) || account.balance === '') errors.balance = t('balance_must_be_number') || 'Balance must be a number';
  if (!account.currency) errors.currency = t('currency_required') || 'Currency required';
  return errors;
}

export const AccountsActionsProvider = ({ children }) => {
  const { showDialog } = useDialog();
  const {
    accounts,
    visibleAccounts,
    _setAccounts,
    _setLoading,
    _setShowHiddenAccounts,
    _initializeDefaultAccounts,
  } = useAccountsData();

  const addAccount = useCallback(async (account) => {
    try {
      const newAccount = {
        ...account,
        balance: String(account.balance),
      };

      const createdAccount = await AccountsDB.createAccount(newAccount);
      _setAccounts(accs => [...accs, createdAccount]);
    } catch (err) {
      console.error('Failed to add account:', err);
      showDialog(
        'Error',
        'Failed to create account. Please try again.',
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [_setAccounts, showDialog]);

  const reloadAccounts = useCallback(async () => {
    try {
      const accountsData = await AccountsDB.getAllAccounts();
      _setAccounts(accountsData);
    } catch (err) {
      console.error('Failed to reload accounts:', err);
    }
  }, [_setAccounts]);

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
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [accounts, reloadAccounts, showDialog]);

  const deleteAccount = useCallback(async (id, transferToAccountId = null) => {
    try {
      await AccountsDB.deleteAccount(id, transferToAccountId);
      _setAccounts(accs => accs.filter(a => a.id !== id));

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
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [_setAccounts, reloadAccounts, showDialog]);

  const reorderAccounts = useCallback(async (newOrder) => {
    try {
      // newOrder contains only displayed accounts (visible or all, depending on showHiddenAccounts)
      // We need to merge with accounts that aren't in newOrder to preserve them

      // Create a map of new order by ID
      const newOrderIds = new Set(newOrder.map(acc => acc.id));

      // Get accounts that aren't in the new order (hidden accounts when showHiddenAccounts=false)
      const unchangedAccounts = accounts.filter(acc => !newOrderIds.has(acc.id));

      // Assign display_order to reordered accounts
      const reorderedAccounts = newOrder.map((account, index) => ({
        ...account,
        display_order: index,
      }));

      // Append unchanged accounts at the end with sequential display_order
      const mergedAccounts = [
        ...reorderedAccounts,
        ...unchangedAccounts.map((account, index) => ({
          ...account,
          display_order: reorderedAccounts.length + index,
        })),
      ];

      // Update local state with merged array
      _setAccounts(mergedAccounts);

      // Prepare all accounts for database update
      const orderedAccounts = mergedAccounts.map(account => ({
        id: account.id,
        display_order: account.display_order,
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
        [{ text: 'OK' }],
      );
      throw err;
    }
  }, [accounts, _setAccounts, reloadAccounts, showDialog]);

  const resetDatabase = useCallback(async () => {
    try {
      _setLoading(true);

      // Emit DATABASE_RESET event to notify other contexts
      console.log('Emitting DATABASE_RESET event');
      appEvents.emit(EVENTS.DATABASE_RESET);

      try {
        // Try normal reset first - drop all tables
        console.log('Attempting normal database reset...');
        await dropAllTables();
        console.log('Tables dropped successfully');
      } catch (dropError) {
        console.warn('Normal reset failed, trying emergency reset...', dropError);

        // If normal reset fails, use emergency nuclear option
        try {
          await closeDatabase();
          const success = await forceDeleteDatabase();

          if (!success) {
            throw new Error('Emergency database deletion failed');
          }

          console.log('Emergency database deletion successful');
        } catch (emergencyError) {
          console.error('Emergency reset also failed:', emergencyError);
          throw new Error(`Both normal and emergency reset failed: ${emergencyError.message}`);
        }
      }

      // Force re-initialization by getting database again
      // This will create all tables with proper schema
      const db = await getDatabase();
      console.log('Database reinitialized successfully');

      // NOTE: Categories will be initialized after language selection
      // The AppInitializer will show the language selection screen
      // and initialize categories with the selected language

      // Create default accounts
      const defaultAccounts = await _initializeDefaultAccounts();
      _setAccounts(defaultAccounts);
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
        [{ text: 'OK' }],
      );
    } catch (err) {
      console.error('Failed to reset database:', err);
      showDialog(
        'Error',
        `Failed to reset database: ${err.message}`,
        [{ text: 'OK' }],
      );
      throw err;
    } finally {
      _setLoading(false);
    }
  }, [_initializeDefaultAccounts, _setAccounts, _setLoading, reloadAccounts, showDialog]);

  const getOperationCount = useCallback(async (accountId) => {
    try {
      return await AccountsDB.getOperationCount(accountId);
    } catch (err) {
      console.error('Failed to get operation count:', err);
      return 0;
    }
  }, []);

  const toggleShowHiddenAccounts = useCallback(() => {
    _setShowHiddenAccounts(prev => !prev);
  }, [_setShowHiddenAccounts]);

  const value = useMemo(() => ({
    addAccount,
    updateAccount,
    deleteAccount,
    reloadAccounts,
    reorderAccounts,
    resetDatabase,
    validateAccount,
    getOperationCount,
    toggleShowHiddenAccounts,
    initializeDefaultAccounts: _initializeDefaultAccounts,
  }), [addAccount, updateAccount, deleteAccount, reloadAccounts, reorderAccounts, resetDatabase, getOperationCount, toggleShowHiddenAccounts, _initializeDefaultAccounts]);

  return (
    <AccountsActionsContext.Provider value={value}>
      {children}
    </AccountsActionsContext.Provider>
  );
};

AccountsActionsProvider.propTypes = {
  children: PropTypes.node,
};

export const useAccountsActions = () => useContext(AccountsActionsContext);
