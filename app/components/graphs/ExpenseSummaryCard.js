import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

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

const ExpenseSummaryCard = ({
  colors,
  t,
  loading,
  totalExpenses,
  selectedCurrency,
  onPress,
  expanded,
}) => {
  const { hideBalances } = useDisplaySettings();
  return (
    <TouchableOpacity
      testID="expense-summary-card"
      style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('expenses_by_category')}
    >
      <View style={styles.iconBadge}>
        <Icon name="arrow-top-right" size={16} color="#d93025" />
      </View>
      <View style={styles.textContent}>
        <Text style={[styles.label, { color: colors.mutedText }]}>{t('expense').toUpperCase()}</Text>
        <Text style={[styles.amount, { color: colors.text }]}>
          {hideBalances ? '••••' : (loading ? '...' : formatCurrency(totalExpenses, selectedCurrency))}
        </Text>
      </View>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedText} />
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
  expanded: PropTypes.bool,
};

ExpenseSummaryCard.defaultProps = {
  expanded: false,
};

const styles = StyleSheet.create({
  amount: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  iconBadge: {
    alignItems: 'center',
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  textContent: {
    flex: 1,
    minWidth: 0,
  },
});

export default ExpenseSummaryCard;
