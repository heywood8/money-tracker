import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';

const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

const DateSeparator = ({ date, spendingSums, formatDate, colors, t, onPress }) => {
  const hasSpending = spendingSums && Object.keys(spendingSums).length > 0;

  return (
    <View style={[styles.dateSeparator, { backgroundColor: colors.background }]}>
      <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
      <Pressable
        style={({ pressed }) => [
          styles.dateSeparatorContent,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${formatDate(date)}, press to select date`}
        accessibilityHint="Opens date picker to jump to a specific date"
      >
        <Text style={[styles.dateSeparatorText, { color: colors.mutedText }]}>
          {formatDate(date)}
        </Text>
        {hasSpending && (
          <Text style={[styles.dateSeparatorSpent, { color: colors.expense }]}>
            {t('spent_amount')}: {Object.entries(spendingSums)
              .map(([currency, amount]) => {
                const symbol = getCurrencySymbol(currency);
                const currencyInfo = currencies[currency];
                const decimals = currencyInfo?.decimal_digits ?? 2;
                return `${symbol}${amount.toFixed(decimals)}`;
              })
              .join(', ')}
          </Text>
        )}
      </Pressable>
      <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
    </View>
  );
};

DateSeparator.propTypes = {
  date: PropTypes.string.isRequired,
  spendingSums: PropTypes.object,
  formatDate: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onPress: PropTypes.func,
};

const styles = StyleSheet.create({
  dateSeparator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  dateSeparatorContent: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
  },
  dateSeparatorSpent: {
    fontSize: 13,
    fontWeight: '500',
  },
  dateSeparatorText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});

export default DateSeparator;
