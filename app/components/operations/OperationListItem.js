import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { getCategoryNames } from '../../utils/categoryUtils';
import DescriptionSuggestionRow from './DescriptionSuggestionRow';
import { SPACING, FONT_SIZE, FONT_WEIGHT, ICON_SIZE, HEIGHTS } from '../../styles/designTokens';

const OperationListItem = ({
  operation,
  colors,
  t,
  categories,
  getCategoryInfo,
  getAccountName,
  formatCurrency,
  isLast,
  onPress,
  testID,
  suggestionChips,
  onApplySuggestion,
  onDismissSuggestion,
}) => {
  const isExpense = operation.type === 'expense';
  const isIncome = operation.type === 'income';
  const isTransfer = operation.type === 'transfer';

  const isMultiCurrencyTransfer = isTransfer && operation.exchangeRate && operation.destinationAmount;

  const categoryInfo = isTransfer
    ? { icon: 'swap-horizontal' }
    : getCategoryInfo(operation.categoryId);

  const { categoryName, parentName } = isTransfer
    ? { categoryName: t('transfer'), parentName: null }
    : getCategoryNames(operation.categoryId, categories, t);

  const accountName = getAccountName(operation.accountId);

  // Title: user's description if set, otherwise the category name
  const title = (operation.description && operation.description.trim())
    ? operation.description.trim()
    : categoryName;

  // Subtitle: "Category · Account" when description is the title, else "ParentCat · Account"
  let subtitle;
  if (isTransfer) {
    const toAccountName = getAccountName(operation.toAccountId);
    subtitle = `${accountName} → ${toAccountName}`;
  } else if (operation.description && operation.description.trim()) {
    subtitle = parentName
      ? `${parentName} / ${categoryName} · ${accountName}`
      : `${categoryName} · ${accountName}`;
  } else if (parentName) {
    subtitle = `${parentName} · ${accountName}`;
  } else {
    subtitle = accountName;
  }

  const formattedAmount = formatCurrency(operation.accountId, operation.amount);
  const displayAmount = formattedAmount;

  const amountColor = isExpense
    ? colors.expense
    : isIncome
      ? colors.income
      : colors.transfer;

  // Build accessibility label
  const typeLabel = isExpense ? t('expense_label') : isIncome ? t('income_label') : t('transfer_label');
  let accessibilityLabel = `${typeLabel}, ${title}, ${displayAmount}`;
  if (operation.description) {
    accessibilityLabel += `, note: ${operation.description}`;
  }

  return (
    <>
      <TouchableRipple
        testID={testID}
        onPress={onPress}
        rippleColor="rgba(0, 0, 0, .08)"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={t('edit_operation_hint')}
      >
        <View style={styles.row}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Icon name={categoryInfo.icon} size={ICON_SIZE.md} color={amountColor} />
          </View>

          {/* Text */}
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedText }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          {/* Amount */}
          <View style={styles.amountContainer}>
            <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
              {displayAmount}
              {isMultiCurrencyTransfer && operation.toAccountId && (
                <Text style={[styles.destinationAmount, { color: colors.mutedText }]}>
                  {' → '}{formatCurrency(operation.toAccountId, operation.destinationAmount)}
                </Text>
              )}
            </Text>
          </View>
        </View>
      </TouchableRipple>

      {suggestionChips && suggestionChips.length > 0 && (
        <DescriptionSuggestionRow
          chips={suggestionChips}
          colors={colors}
          onApply={onApplySuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}

      {/* Separator line between items (not after the last one) */}
      {!isLast && (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      )}
    </>
  );
};

OperationListItem.propTypes = {
  operation: PropTypes.shape({
    type: PropTypes.string.isRequired,
    accountId: PropTypes.string.isRequired,
    categoryId: PropTypes.string,
    amount: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    toAccountId: PropTypes.string,
    exchangeRate: PropTypes.number,
    destinationAmount: PropTypes.string,
    description: PropTypes.string,
  }).isRequired,
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  categories: PropTypes.array.isRequired,
  getCategoryInfo: PropTypes.func.isRequired,
  getAccountName: PropTypes.func.isRequired,
  formatCurrency: PropTypes.func.isRequired,
  isLast: PropTypes.bool,
  onPress: PropTypes.func.isRequired,
  testID: PropTypes.string,
  suggestionChips: PropTypes.arrayOf(PropTypes.string),
  onApplySuggestion: PropTypes.func,
  onDismissSuggestion: PropTypes.func,
};

OperationListItem.defaultProps = {
  isLast: false,
  testID: undefined,
  suggestionChips: null,
  onApplySuggestion: () => {},
  onDismissSuggestion: () => {},
};

const styles = StyleSheet.create({
  amount: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    includeFontPadding: false,
    textAlign: 'right',
  },
  amountContainer: {
    alignItems: 'flex-end',
    marginLeft: SPACING.md,
  },
  destinationAmount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
  },
  iconContainer: {
    alignItems: 'center',
    marginRight: SPACING.md,
    width: 32,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: HEIGHTS.listItem,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  separator: {
    height: 1,
    marginLeft: SPACING.lg + 32 + SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    includeFontPadding: false,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  title: {
    fontSize: FONT_SIZE.md + 1,
    fontWeight: FONT_WEIGHT.medium,
    includeFontPadding: false,
  },
});

export default memo(OperationListItem);
