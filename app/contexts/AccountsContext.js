import React from 'react';
import PropTypes from 'prop-types';
import { AccountsDataProvider, useAccountsData } from './AccountsDataContext';
import { AccountsActionsProvider, useAccountsActions } from './AccountsActionsContext';
import currencies from '../../assets/currencies.json';

/**
 * DEPRECATED: This file provides backward compatibility wrappers.
 *
 * AccountsContext has been split into two separate contexts:
 * - AccountsDataContext (frequently-changing data)
 * - AccountsActionsContext (stable action functions)
 *
 * New code should import useAccountsData and useAccountsActions directly.
 * This wrapper is maintained for backward compatibility with existing tests.
 *
 * Migration guide:
 * Before:
 *   const { accounts, loading, addAccount, updateAccount, currencies } = useAccounts();
 *
 * After:
 *   const { accounts, loading } = useAccountsData();
 *   const { addAccount, updateAccount } = useAccountsActions();
 *   import currencies from '../../assets/currencies.json'; // For currencies
 */

/**
 * Deprecated hook that combines both data and actions.
 * Use useAccountsData() and useAccountsActions() separately instead.
 */
export const useAccounts = () => {
  const data = useAccountsData();
  const actions = useAccountsActions();

  return {
    ...data,
    ...actions,
    currencies, // Add currencies for backward compatibility
  };
};

/**
 * Deprecated provider that wraps both split contexts.
 * Use AccountsDataProvider and AccountsActionsProvider directly in App.js.
 */
export const AccountsProvider = ({ children }) => {
  return (
    <AccountsDataProvider>
      <AccountsActionsProvider>
        {children}
      </AccountsActionsProvider>
    </AccountsDataProvider>
  );
};

AccountsProvider.propTypes = {
  children: PropTypes.node,
};
