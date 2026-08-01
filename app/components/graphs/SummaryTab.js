import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PropTypes from 'prop-types';
import currencies from '../../../assets/currencies.json';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { FONT_SIZE, SPACING } from '../../styles/designTokens';

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

/**
 * One half of the income/expense tab strip. The whole tab is the press target —
 * the chevron is decoration, not a separate button — and the active tab is
 * marked with a tinted background plus an accent underline.
 *
 * The drill-down "back" chip deliberately lives OUTSIDE this component (it is an
 * overlay owned by GraphsScreen): nesting a button inside this button would give
 * screen readers nested controls and would flash the parent's activeOpacity on
 * every chip tap.
 */
const SummaryTab = ({
  colors,
  testID,
  icon,
  accent,
  label,
  accessibilityLabel,
  amount,
  loading,
  selectedCurrency,
  onPress,
  expanded = false,
}) => {
  const { hideBalances } = useDisplaySettings();
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.summaryCard,
        expanded && { backgroundColor: colors.altRow, borderBottomColor: accent },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.iconBadge}>
        <Icon name={icon} size={16} color={accent} />
      </View>
      <View style={styles.textContent}>
        <Text style={[styles.label, { color: colors.mutedText }]}>{label}</Text>
        <Text style={[styles.amount, { color: colors.text }]}>
          {hideBalances ? '••••' : (loading ? '...' : formatCurrency(amount, selectedCurrency))}
        </Text>
      </View>
      <View style={styles.chevron} pointerEvents="none">
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedText} />
      </View>
    </TouchableOpacity>
  );
};

SummaryTab.propTypes = {
  colors: PropTypes.object.isRequired,
  testID: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  accent: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  accessibilityLabel: PropTypes.string.isRequired,
  amount: PropTypes.number.isRequired,
  loading: PropTypes.bool.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onPress: PropTypes.func.isRequired,
  expanded: PropTypes.bool,
};

const styles = StyleSheet.create({
  amount: {
    fontSize: FONT_SIZE.base,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  chevron: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: 20,
  },
  iconBadge: {
    alignItems: 'center',
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  summaryCard: {
    alignItems: 'center',
    // Transparent by default so activating the tab doesn't shift its height
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  textContent: {
    flex: 1,
    minWidth: 0,
  },
});

export default SummaryTab;
