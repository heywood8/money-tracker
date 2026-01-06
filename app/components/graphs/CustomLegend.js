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
            <View style={styles.legendLeft}>
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
            <View style={styles.legendRight}>
              <Text style={[styles.legendAmount, { color: colors.text }]}>
                {formatCurrency(item.amount, currency)}
              </Text>
              <Text style={[styles.legendPercentage, { color: colors.mutedText }]}>
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
  legendContainer: {
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  legendItemClickable: {
    opacity: 0.9,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendIcon: {
    marginLeft: 4,
  },
  legendName: {
    fontSize: 14,
    flex: 1,
  },
  legendChevron: {
    marginLeft: 4,
  },
  legendRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  legendPercentage: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default CustomLegend;
