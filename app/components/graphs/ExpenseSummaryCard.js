import React from 'react';
import { Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { HORIZONTAL_PADDING } from '../../styles/layout';

const screenWidth = Dimensions.get('window').width;
const cardWidth = (screenWidth - (HORIZONTAL_PADDING * 2) - 8) / 2; // 8 is gap

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  const symbol = currencyInfo?.symbol ?? currency;
  return `${symbol}${parseFloat(amount).toFixed(decimals)}`;
};

const ExpenseSummaryCard = ({
  colors,
  t,
  loading,
  totalExpenses,
  selectedCurrency,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.summaryCard, { backgroundColor: colors.altRow, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('expenses_by_category')}
    >
      <Text style={[styles.summaryText, { color: colors.text }]}>
        {t('expense_categories')}: {loading ? '...' : formatCurrency(totalExpenses, selectedCurrency)}
      </Text>
    </TouchableOpacity>
  );
};

ExpenseSummaryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  totalExpenses: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    width: cardWidth,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ExpenseSummaryCard;
