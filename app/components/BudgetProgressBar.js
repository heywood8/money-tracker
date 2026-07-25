import React from 'react';
import PropTypes from 'prop-types';
import { useBudgets } from '../contexts/BudgetsContext';
import StatusProgressBar from './StatusProgressBar';

/**
 * Budget (v1) progress bar: looks up the budget's status from context and
 * renders the shared StatusProgressBar. Monthly-plan lines (Budgets v2) feed
 * StatusProgressBar directly with a per-line status object instead.
 */
const BudgetProgressBar = ({ budgetId, compact = false, showDetails = true, style }) => {
  const { getBudgetStatus } = useBudgets();

  const status = getBudgetStatus(budgetId);

  if (!status) return null;

  return (
    <StatusProgressBar
      status={status}
      compact={compact}
      showDetails={showDetails}
      style={style}
    />
  );
};

BudgetProgressBar.propTypes = {
  budgetId: PropTypes.string.isRequired,
  compact: PropTypes.bool,
  showDetails: PropTypes.bool,
  style: PropTypes.any,
};

export default BudgetProgressBar;
