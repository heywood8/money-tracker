import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import * as Currency from '../../services/currency';
import { SPACING, FONT_SIZE, FONT_WEIGHT } from '../../styles/designTokens';

const DateSeparator = ({ date, spendingSums, formatDate, colors, language, t = (key) => key, onPress }) => {
  const hasSpending = spendingSums && Object.keys(spendingSums).length > 0;

  // Bind the date here so the parent can pass a STABLE onPress (onDateSeparatorPress)
  // instead of a fresh `() => onPress(date)` per render — the latter pierces this memo.
  const handlePress = useCallback(() => onPress?.(date), [onPress, date]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={formatDate(date)}
      accessibilityHint={t('jump_to_date_hint')}
    >
      <Text style={[styles.dateText, { color: colors.mutedText }]}>
        {formatDate(date).toUpperCase()}
      </Text>
      {hasSpending && (
        <Text style={[styles.totalText, { color: colors.mutedText }]}>
          {Object.entries(spendingSums)
            .map(([currency, amount]) => (
              // The sum arrives as a decimal.js string; formatMoney puts the
              // sign ahead of the symbol and groups it in the app's language.
              Currency.formatMoney(Currency.multiply(amount, -1, currency), currency, { language })
            ))
            .join(', ')}
        </Text>
      )}
    </Pressable>
  );
};

DateSeparator.propTypes = {
  language: PropTypes.string,
  t: PropTypes.func,
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
