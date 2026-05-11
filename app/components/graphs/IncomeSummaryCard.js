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

const IncomeSummaryCard = ({
  colors,
  t,
  loadingIncome,
  totalIncome,
  selectedCurrency,
  onPress,
  expanded = false,
  categoryName = null,
  onBack = null,
}) => {
  const { hideBalances } = useDisplaySettings();
  return (
    <TouchableOpacity
      testID="income-summary-card"
      style={styles.summaryCard}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('income_by_category')}
    >
      <View style={styles.iconBadge}>
        <Icon name="arrow-bottom-left" size={16} color={colors.income} />
      </View>
      <View style={styles.textContent}>
        <Text style={[styles.label, { color: colors.mutedText }]}>{t('income').toUpperCase()}</Text>
        <Text style={[styles.amount, { color: colors.text }]}>
          {hideBalances ? '••••' : (loadingIncome ? '...' : formatCurrency(totalIncome, selectedCurrency))}
        </Text>
      </View>
      {categoryName && onBack && (
        <TouchableOpacity
          onPress={onBack}
          style={styles.categoryBack}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={16} color={colors.mutedText} />
          <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
            {categoryName}
          </Text>
        </TouchableOpacity>
      )}
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedText} />
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
  expanded: PropTypes.bool,
  categoryName: PropTypes.string,
  onBack: PropTypes.func,
};

const styles = StyleSheet.create({
  amount: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  categoryBack: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 2,
    marginRight: 4,
  },
  categoryName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 90,
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

export default IncomeSummaryCard;
