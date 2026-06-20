import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { getCategoryNames } from '../../utils/categoryUtils';
import { parseLabels, visibleListLabels } from '../../utils/labelUtils';
import DescriptionSuggestionRow from './DescriptionSuggestionRow';
import { SPACING, FONT_SIZE, FONT_WEIGHT, ICON_SIZE, HEIGHTS } from '../../styles/designTokens';
import currencies from '../../../assets/currencies.json';

const getForeignSymbol = (currencyCode) => {
  if (!currencyCode) return '';
  return currencies[currencyCode]?.symbol || currencyCode;
};

// Cap the chips shown per row so a heavily-labelled operation can't blow up the
// row height; any remainder is summarised as a "+N" chip.
const MAX_VISIBLE_LABELS = 6;

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

  // Foreign currency expense/income: has exchange metadata but is NOT a transfer
  const isForeignCurrencyOp = !isTransfer
    && operation.sourceCurrency
    && operation.destinationCurrency
    && operation.sourceCurrency !== operation.destinationCurrency
    && operation.exchangeRate
    && operation.destinationAmount;

  const categoryInfo = isTransfer
    ? { icon: 'swap-horizontal' }
    : getCategoryInfo(operation.categoryId);

  const { categoryName, parentName } = isTransfer
    ? { categoryName: t('transfer'), parentName: null }
    : getCategoryNames(operation.categoryId, categories, t);

  const accountName = getAccountName(operation.accountId);

  // The description column holds a delimited list of labels (see labelUtils).
  // Memoised so the parse only re-runs when the description string changes,
  // not on every re-render of this memoised row (scroll, theme, selection, …).
  // Imported metadata labels (Account:/Category:/Category group:) are hidden in
  // the list; they remain visible when the operation is opened.
  const labels = useMemo(
    () => visibleListLabels(parseLabels(operation.description)),
    [operation.description],
  );
  const visibleLabels = labels.slice(0, MAX_VISIBLE_LABELS);
  const overflowCount = labels.length - visibleLabels.length;

  // Title is always the category name (or "Transfer"); labels render as chips below.
  const title = categoryName;

  // Subtitle: account context. Labels carry the per-operation detail now.
  let subtitle;
  if (isTransfer) {
    const toAccountName = getAccountName(operation.toAccountId);
    subtitle = `${accountName} → ${toAccountName}`;
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
  if (labels.length > 0) {
    accessibilityLabel += `, ${t('labels')}: ${labels.join(', ')}`;
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
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.text }]}>
                {title}
              </Text>
              {visibleLabels.map((label) => (
                <View
                  key={label}
                  style={[styles.labelChip, { backgroundColor: colors.altRow, borderColor: colors.border }]}
                  testID={`op-label-${label}`}
                >
                  <Text style={[styles.labelChipText, { color: colors.mutedText }]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ))}
              {overflowCount > 0 && (
                <View style={[styles.labelChip, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
                  <Text style={[styles.labelChipText, { color: colors.mutedText }]}>{`+${overflowCount}`}</Text>
                </View>
              )}
            </View>
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
            {isForeignCurrencyOp && (
              <Text style={[styles.foreignAmount, { color: colors.mutedText }]} numberOfLines={1}>
                {getForeignSymbol(operation.sourceCurrency)}{operation.destinationAmount}
              </Text>
            )}
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
    exchangeRate: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    destinationAmount: PropTypes.string,
    sourceCurrency: PropTypes.string,
    destinationCurrency: PropTypes.string,
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
  foreignAmount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    marginTop: 2,
    textAlign: 'right',
  },
  iconContainer: {
    alignItems: 'center',
    marginRight: SPACING.md,
    width: 32,
  },
  labelChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
  },
  labelChipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    maxWidth: 140,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: HEIGHTS.listItem,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
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
    flexShrink: 1,
    fontSize: FONT_SIZE.md + 1,
    fontWeight: FONT_WEIGHT.medium,
    includeFontPadding: false,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
});

export default memo(OperationListItem);
