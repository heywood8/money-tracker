import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import ListCard from '../ListCard';

const OperationListItem = ({
  operation,
  colors,
  t,
  getCategoryInfo,
  getAccountName,
  formatCurrency,
  formatDate,
  onPress,
}) => {
  const isExpense = operation.type === 'expense';
  const isIncome = operation.type === 'income';
  const isTransfer = operation.type === 'transfer';

  // Check if this is a multi-currency transfer
  const isMultiCurrencyTransfer = isTransfer && operation.exchangeRate && operation.destinationAmount;

  // For transfers, use transfer icon and localized name instead of category
  const categoryInfo = isTransfer
    ? { name: t('transfer'), icon: 'swap-horizontal' }
    : getCategoryInfo(operation.categoryId);

  const accountName = getAccountName(operation.accountId);

  // Build comprehensive accessibility label
  const typeLabel = isExpense ? t('expense_label') : isIncome ? t('income_label') : t('transfer_label');
  let accessibilityLabel = `${typeLabel}, ${categoryInfo.name}, ${formatCurrency(operation.accountId, operation.amount)}, ${accountName}, ${formatDate(operation.date)}`;

  if (isTransfer && operation.toAccountId) {
    const toAccountName = getAccountName(operation.toAccountId);
    accessibilityLabel = `${typeLabel} from ${accountName} to ${toAccountName}, ${formatCurrency(operation.accountId, operation.amount)}, ${formatDate(operation.date)}`;

    if (isMultiCurrencyTransfer) {
      accessibilityLabel += `, exchange rate ${operation.exchangeRate}`;
    }
  }

  if (operation.description) {
    accessibilityLabel += `, note: ${operation.description}`;
  }

  return (
    <ListCard
      variant={operation.type}
      onPress={onPress}
      leftIcon={categoryInfo.icon}
      leftIconBackground={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('edit_operation_hint')}
    >
      <View style={styles.operationContent}>
        {/* Operation Info */}
        <View style={styles.operationInfo}>
          <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
            {categoryInfo.name}
          </Text>
          <Text style={[styles.accountName, { color: colors.mutedText }]} numberOfLines={1}>
            {accountName}
            {isTransfer && operation.toAccountId && ` → ${getAccountName(operation.toAccountId)}`}
          </Text>
          {/* Note: Description/exchange rate hidden in list view to fit 56px height */}
          {/* They are still visible in the edit modal */}
        </View>

        {/* Date and Amount */}
        <View style={styles.operationRight}>
          <Text
            style={[
              styles.amount,
              {
                color: isExpense
                  ? colors.expense
                  : isIncome
                    ? colors.income
                    : colors.text,
              },
            ]}
            numberOfLines={1}
          >
            {formatCurrency(operation.accountId, operation.amount)}
          </Text>
          {isMultiCurrencyTransfer && operation.toAccountId && (
            <Text style={[styles.destinationAmount, { color: colors.mutedText }]} numberOfLines={1}>
              → {formatCurrency(operation.toAccountId, operation.destinationAmount)}
            </Text>
          )}
          <Text style={[styles.date, { color: colors.mutedText }]} numberOfLines={1}>
            {formatDate(operation.date)}
          </Text>
        </View>
      </View>
    </ListCard>
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
  getCategoryInfo: PropTypes.func.isRequired,
  getAccountName: PropTypes.func.isRequired,
  formatCurrency: PropTypes.func.isRequired,
  formatDate: PropTypes.func.isRequired,
  onPress: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  accountName: {
    fontSize: 13,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '500',
  },
  date: {
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
  },
  destinationAmount: {
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
  },
  operationContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  operationInfo: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  operationRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});

export default OperationListItem;
