import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import currencies from '../../../assets/currencies.json';

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

const CustomLegend = ({ data, currency, colors, onItemPress, isClickable }) => {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={styles.legendContainer}>
      {data.map((item, index) => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        const ItemWrapper = isClickable && item.categoryId ? TouchableOpacity : View;
        const wrapperProps = isClickable && item.categoryId ? {
          onPress: () => onItemPress(item.categoryId),
          activeOpacity: 0.7,
          accessibilityRole: 'button',
          accessibilityLabel: `View details for ${item.name}`,
          accessibilityHint: 'Double tap to filter by this category',
        } : {};

        return (
          <ItemWrapper
            key={index}
            style={[
              styles.legendItem,
              { borderBottomColor: colors.border },
              isClickable && item.categoryId && styles.legendItemClickable,
            ]}
            {...wrapperProps}
          >
            {/* Category column (flexible width) */}
            <View style={styles.categoryColumn}>
              <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
              {item.icon && (
                <Icon
                  name={item.icon}
                  size={18}
                  color={colors.text}
                  style={styles.legendIcon}
                />
              )}
              <Text style={[styles.legendName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {isClickable && item.categoryId && (
                <Icon
                  name="chevron-right"
                  size={16}
                  color={colors.mutedText}
                  style={styles.legendChevron}
                />
              )}
            </View>

            {/* Amount column (fixed width) */}
            <View style={styles.amountColumn}>
              <Text style={[styles.legendAmount, { color: colors.text }]} numberOfLines={1}>
                {formatCurrency(item.amount, currency)}
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
    width: 100,
  },
  categoryColumn: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  colorIndicator: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  legendChevron: {
    marginLeft: 4,
  },
  legendContainer: {
    marginTop: 16,
  },
  legendIcon: {
    marginLeft: 4,
  },
  legendItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  legendItemClickable: {
    opacity: 0.9,
  },
  legendName: {
    flex: 1,
    fontSize: 14,
  },
  legendPercentage: {
    fontSize: 14,
    fontWeight: '500',
  },
  percentageColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 50,
  },
  verticalDivider: {
    alignSelf: 'center',
    backgroundColor: 'rgba(120,120,120,0.13)',
    height: '70%',
    marginHorizontal: 8,
    width: 1,
  },
});

export default CustomLegend;
