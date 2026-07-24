import React from 'react';
import PropTypes from 'prop-types';
import { BudgetPlansDataProvider, useBudgetPlansData } from './BudgetPlansDataContext';
import { BudgetPlansActionsProvider, useBudgetPlansActions } from './BudgetPlansActionsContext';

/**
 * Budgets v2 (monthly income-allocation plans). Follows the Data/Actions split
 * pattern used by budgets:
 * - BudgetPlansDataContext (the plans list + load state)
 * - BudgetPlansActionsContext (stable action functions)
 *
 * New code should import useBudgetPlansData / useBudgetPlansActions directly; this
 * merged hook + combined provider are the convenience wrappers.
 */

/**
 * Merged hook combining plans data and actions.
 */
export const useBudgetPlans = () => {
  const data = useBudgetPlansData();
  const actions = useBudgetPlansActions();

  if (!data || !actions) {
    throw new Error('useBudgetPlans must be used within a BudgetPlansProvider');
  }

  return {
    ...data,
    ...actions,
  };
};

/**
 * Combined provider that wraps both split contexts.
 */
export const BudgetPlansProvider = ({ children }) => {
  return (
    <BudgetPlansDataProvider>
      <BudgetPlansActionsProvider>
        {children}
      </BudgetPlansActionsProvider>
    </BudgetPlansDataProvider>
  );
};

BudgetPlansProvider.propTypes = {
  children: PropTypes.node,
};
