import React, { memo } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencyMeta from '../../assets/currencies.json';
import { BORDER_RADIUS, SPACING } from '../styles/designTokens';

/**
 * The pill that names the currency a figure is read in, and opens the host's
 * `CurrencySheet` to change it. It used to be `PeriodHeader`'s second row —
 * one control shared by the Budgets and Graphs headers — but a unit belongs
 * next to the value it measures, not in the navigation chrome above it, so
 * both screens now plant it beside their own hero figures instead.
 *
 * The host decides whether there is anything to plant: with a single account
 * currency there is nothing to pick between, so the host simply does not
 * mount this component rather than passing it a prop to hide itself.
 */
const CurrencyScopeChip = memo(({
  code,
  onPress,
  active = false,
  accessibilityLabel,
  colors,
  testID,
}) => {
  // Blank for anything the catalogue has no symbol for, and blank when the
  // symbol *is* the code (CHF, and every currency the catalogue lists that
  // way) — a chip reading "CHF CHF" is worse than one reading "CHF".
  const symbol = currencyMeta[code]?.symbol;
  const displaySymbol = symbol && symbol !== code ? symbol : '';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, {
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary + '1F' : undefined,
      }]}
      android_ripple={{ color: colors.primary + '1F' }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {!!displaySymbol && (
        <Text style={[styles.symbol, { color: colors.mutedText }]}>{displaySymbol}</Text>
      )}
      <Text style={[styles.code, { color: colors.text }]}>{code}</Text>
      <Icon name="chevron-down" size={16} color={colors.mutedText} />
    </Pressable>
  );
});

CurrencyScopeChip.displayName = 'CurrencyScopeChip';

CurrencyScopeChip.propTypes = {
  code: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
  active: PropTypes.bool,
  accessibilityLabel: PropTypes.string,
  colors: PropTypes.object.isRequired,
  testID: PropTypes.string,
};

// A one-off pill rather than the shared CHIP/CHIP_TEXT from componentStyles.js
// (repo rule normally is: don't re-specify a recurring element). Deliberate
// here: this chip is the exact one PeriodHeader carried for both tabs before
// this relocation, moved verbatim so the move itself changes nothing about
// how it looks — a fixed 34dp height and 15/700 text neither shared token
// matches.
const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    height: 34,
    // The ripple is drawn by the platform on the view's own rectangle, so
    // without this it spills past the pill's rounded ends.
    overflow: 'hidden',
    paddingHorizontal: SPACING.md,
  },
  code: {
    fontSize: 15,
    fontWeight: '700',
  },
  symbol: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default CurrencyScopeChip;
