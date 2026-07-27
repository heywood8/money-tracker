import React from 'react';
import PropTypes from 'prop-types';
import SummaryTab from './SummaryTab';

// Expense red is intentionally theme-independent — it matches the arrow badge.
export const EXPENSE_ACCENT = '#d93025';

const ExpenseSummaryCard = ({
  colors,
  t,
  loading,
  totalExpenses,
  selectedCurrency,
  onPress,
  expanded = false,
}) => (
  <SummaryTab
    testID="expense-summary-card"
    colors={colors}
    icon="arrow-top-right"
    accent={EXPENSE_ACCENT}
    label={t('expense').toUpperCase()}
    accessibilityLabel={t('expenses_by_category')}
    amount={totalExpenses}
    loading={loading}
    selectedCurrency={selectedCurrency}
    onPress={onPress}
    expanded={expanded}
  />
);

ExpenseSummaryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  totalExpenses: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
  expanded: PropTypes.bool,
};

export default ExpenseSummaryCard;
