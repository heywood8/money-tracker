import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { SPACING, FONT_SIZE, FONT_WEIGHT } from '../../styles/designTokens';

const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

const DateSeparator = ({ date, spendingSums, formatDate, colors, onPress }) => {
  const hasSpending = spendingSums && Object.keys(spendingSums).length > 0;

  // Bind the date here so the parent can pass a STABLE onPress (onDateSeparatorPress)
  // instead of a fresh `() => onPress(date)` per render — the latter pierces this memo.
  const handlePress = useCallback(() => onPress?.(date), [onPress, date]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${formatDate(date)}, press to select date`}
      accessibilityHint="Opens date picker to jump to a specific date"
    >
      <Text style={[styles.dateText, { color: colors.mutedText }]}>
        {formatDate(date).toUpperCase()}
      </Text>
      {hasSpending && (
        <Text style={[styles.totalText, { color: colors.mutedText }]}>
          {Object.entries(spendingSums)
            .map(([currency, amount]) => {
              const symbol = getCurrencySymbol(currency);
              const currencyInfo = currencies[currency];
              const decimals = currencyInfo?.decimal_digits ?? 2;
              return `-${symbol}${amount.toFixed(decimals)}`;
            })
            .join(', ')}
        </Text>
      )}
    </Pressable>
  );
};

DateSeparator.propTypes = {
  date: PropTypes.string.isRequired,
  spendingSums: PropTypes.object,
  formatDate: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  onPress: PropTypes.func,
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg + SPACING.sm,
    paddingTop: SPACING.sm,
  },
  dateText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.6,
  },
  pressed: {
    opacity: 0.6,
  },
  totalText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
});

export default memo(DateSeparator);
