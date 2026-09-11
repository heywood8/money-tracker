import React from 'react';
import PropTypes from 'prop-types';
import SummaryTab from './SummaryTab';

const IncomeSummaryCard = ({
  colors,
  t,
  loadingIncome,
  totalIncome,
  selectedCurrency,
  language,
  onPress,
  expanded = false,
}) => (
  <SummaryTab
    testID="income-summary-card"
    colors={colors}
    icon="arrow-bottom-left"
    accent={colors.income}
    label={t('income').toUpperCase()}
    accessibilityLabel={t('income_by_category')}
    amount={totalIncome}
    loading={loadingIncome}
    selectedCurrency={selectedCurrency}
    language={language}
    onPress={onPress}
    expanded={expanded}
  />
);

IncomeSummaryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  totalIncome: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  language: PropTypes.string,
  onPress: PropTypes.func.isRequired,
  expanded: PropTypes.bool,
};

export default IncomeSummaryCard;
