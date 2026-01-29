import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const symbol = currencyInfo?.symbol ?? currency;
  const value = parseFloat(amount);
  if (value >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}K`;
  }
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${symbol}${value.toFixed(decimals)}`;
};

const IncomeSummaryCard = ({
  colors,
  t,
  loadingIncome,
  totalIncome,
  selectedCurrency,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.summaryCard, { backgroundColor: colors.altRow, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('income_by_category')}
    >
      <Text style={styles.summaryText}>
        {loadingIncome ? '...' : formatCurrency(totalIncome, selectedCurrency)}
      </Text>
    </TouchableOpacity>
  );
};

IncomeSummaryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  totalIncome: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  summaryText: {
    color: '#81C784',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default IncomeSummaryCard;
