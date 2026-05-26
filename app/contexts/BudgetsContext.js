import React from 'react';
import PropTypes from 'prop-types';
import { BudgetsDataProvider, useBudgetsData } from './BudgetsDataContext';
import { BudgetsActionsProvider, useBudgetsActions } from './BudgetsActionsContext';

/**
 * DEPRECATED: This file provides backward compatibility wrappers.
 *
 * BudgetsContext has been split into two separate contexts:
 * - BudgetsDataContext (frequently-changing data)
 * - BudgetsActionsContext (stable action functions)
 *
 * New code should import useBudgetsData and useBudgetsActions directly.
 * This wrapper is maintained for backward compatibility with existing consumers.
 *
 * Migration guide:
 * Before:
 *   const { budgets, loading, addBudget, getBudgetStatus } = useBudgets();
 *
 * After:
 *   const { budgets, loading, reloadBudgets, refreshBudgetStatuses } = useBudgetsData();
 *   const { addBudget, getBudgetStatus } = useBudgetsActions();
 */

/**
 * Deprecated hook that combines both data and actions.
 * Use useBudgetsData() and useBudgetsActions() separately instead.
 */
export const useBudgets = () => {
  const data = useBudgetsData();
  const actions = useBudgetsActions();

  if (!data || !actions) {
    throw new Error('useBudgets must be used within a BudgetsProvider');
  }

  return {
    ...data,
    ...actions,
  };
};

/**
 * Deprecated provider that wraps both split contexts.
 * Use BudgetsDataProvider and BudgetsActionsProvider directly in App.js.
 */
export const BudgetsProvider = ({ children }) => {
  return (
    <BudgetsDataProvider>
      <BudgetsActionsProvider>
        {children}
      </BudgetsActionsProvider>
    </BudgetsDataProvider>
  );
};

BudgetsProvider.propTypes = {
  children: PropTypes.node,
};
