import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import PropTypes from 'prop-types';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencies from '../../../assets/currencies.json';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const symbol = currencyInfo?.symbol ?? currency;
  const value = parseFloat(amount);
  if (value >= 1000000000) {
    return `${symbol}${(value / 1000000000).toFixed(1)}B`;
  }
  if (value >= 1000000) {
    return `${symbol}${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${symbol}${(value / 1000).toFixed(1)}K`;
  }
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${symbol}${value.toFixed(decimals)}`;
};

const CustomLegend = ({ data, currency, colors, onItemPress, isClickable }) => {
  const { hideBalances } = useDisplaySettings();
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={styles.legendContainer}>
      {data.map((item, index) => {
        // Whole-number percentages — "100.0%" overflowed the fixed column, and a
        // single decimal adds no real signal to a legend.
        const percentage = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        // Every category row is pressable: a parent drills into its children,
        // a leaf opens the list of that category's operations for the period.
        const isPressable = isClickable && !!item.categoryId;
        const ItemWrapper = isPressable ? TouchableOpacity : View;
        const wrapperProps = isPressable ? {
          onPress: () => onItemPress(item.categoryId),
          activeOpacity: 0.7,
          accessibilityRole: 'button',
          accessibilityLabel: `View details for ${item.name}`,
          accessibilityHint: item.hasChildren
            ? 'Double tap to filter by this category'
            : 'Double tap to view operations',
        } : {};

        return (
          <ItemWrapper
            key={index}
            style={[
              styles.legendItem,
              { borderBottomColor: colors.border },
              isPressable && styles.legendItemClickable,
            ]}
            {...wrapperProps}
          >
            {/* Category column (flexible width) */}
            <View style={styles.categoryColumn}>
              <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
              <Text style={[styles.legendName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {isPressable && (
                <Icon
                  name={item.hasChildren ? 'chevron-right' : 'format-list-bulleted'}
                  size={16}
                  color={colors.mutedText}
                  style={styles.legendChevron}
                />
              )}
            </View>

            {/* Amount column (fixed width) */}
            <View style={styles.amountColumn}>
              <Text style={[styles.legendAmount, { color: colors.text }]} numberOfLines={1}>
                {hideBalances ? '••••' : formatCurrency(item.amount, currency)}
              </Text>
            </View>

            {/* Separator */}
            <View style={styles.verticalDivider} />

            {/* Percentage column (fixed width) */}
            <View style={styles.percentageColumn}>
              <Text style={[styles.legendPercentage, { color: colors.text }]}>
                {percentage}%
              </Text>
            </View>
          </ItemWrapper>
        );
      })}
    </View>
  );
};

CustomLegend.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string,
      amount: PropTypes.number,
      color: PropTypes.string,
      icon: PropTypes.string,
      categoryId: PropTypes.string,
      hasChildren: PropTypes.bool,
    }),
  ).isRequired,
  currency: PropTypes.string.isRequired,
  colors: PropTypes.shape({
    border: PropTypes.string,
    text: PropTypes.string,
    mutedText: PropTypes.string,
  }).isRequired,
  onItemPress: PropTypes.func,
  isClickable: PropTypes.bool,
};

const styles = StyleSheet.create({
  amountColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 62,
  },
  categoryColumn: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
  },
  colorIndicator: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  legendAmount: {
    fontSize: 12,
    fontWeight: '600',
  },
  legendChevron: {
    marginLeft: 4,
  },
  legendContainer: {
    marginTop: 4,
  },
  legendItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 2,
    paddingVertical: 12,
  },
  legendItemClickable: {
    opacity: 0.9,
  },
  legendName: {
    flex: 1,
    fontSize: 12,
  },
  legendPercentage: {
    fontSize: 12,
    fontWeight: '500',
  },
  percentageColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 38,
  },
  verticalDivider: {
    alignSelf: 'center',
    backgroundColor: 'rgba(120,120,120,0.13)',
    height: '70%',
    marginHorizontal: 4,
    width: 1,
  },
});

export default CustomLegend;
