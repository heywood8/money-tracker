import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useOperations } from './OperationsContext';
import { useAccounts } from './AccountsContext';
import { useCategories } from './CategoriesContext';
import OperationModal from './OperationModal';

const OperationsScreen = () => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { operations, loading: operationsLoading, deleteOperation } = useOperations();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { categories, loading: categoriesLoading } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingOperation, setEditingOperation] = useState(null);
  const [isNew, setIsNew] = useState(false);

  const handleAddOperation = () => {
    setEditingOperation(null);
    setIsNew(true);
    setModalVisible(true);
  };

  const handleEditOperation = (operation) => {
    setEditingOperation(operation);
    setIsNew(false);
    setModalVisible(true);
  };

  const handleDeleteOperation = (operation) => {
    Alert.alert(
      t('delete_operation'),
      t('delete_operation_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => deleteOperation(operation.id),
        },
      ]
    );
  };

  // Get account name
  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : 'Unknown';
  }, [accounts]);

  // Get category info
  const getCategoryInfo = useCallback((categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return { name: 'Unknown', icon: 'help-circle' };
    return {
      name: category.nameKey ? t(category.nameKey) : category.name,
      icon: category.icon || 'help-circle',
    };
  }, [categories, t]);

  // Sort operations by date (newest first)
  const sortedOperations = useMemo(() => {
    return [...operations].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [operations]);

  // Format date (memoized)
  const formatDate = useCallback((dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - compareDate) / 86400000);

    if (diffDays === 0) {
      return t('today');
    } else if (diffDays === 1) {
      return t('yesterday');
    } else {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }, [t]);

  // Format amount with currency (memoized)
  const formatCurrency = useCallback((accountId, amount) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return amount;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return amount;

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: account.currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numAmount);
    } catch (error) {
      // Fallback if currency is invalid
      return `${numAmount.toFixed(2)} ${account.currency || 'USD'}`;
    }
  }, [accounts]);

  const getItemLayout = useCallback((data, index) => ({
    length: 72,
    offset: 72 * index,
    index,
  }), []);

  const renderAddOperationHeader = useCallback(() => {
    return (
      <TouchableOpacity
        style={[styles.addOperationHeader, {
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }]}
        onPress={handleAddOperation}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('add_operation')}
        accessibilityHint={t('add_operation_hint')}
      >
        <View style={[styles.addIconContainer, { borderColor: colors.primary }]}>
          <Icon
            name="plus"
            size={28}
            color={colors.primary}
            accessible={false}
          />
        </View>
        <Text style={[styles.addOperationText, { color: colors.primary }]}>
          {t('add_operation')}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, t, handleAddOperation]);

  const renderOperation = useCallback(({ item }) => {
    const operation = item;
    const isExpense = operation.type === 'expense';
    const isIncome = operation.type === 'income';
    const isTransfer = operation.type === 'transfer';

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
    }

    if (operation.description) {
      accessibilityLabel += `, note: ${operation.description}`;
    }

    return (
      <TouchableOpacity
        style={[styles.operationRow, { borderBottomColor: colors.border }]}
        onPress={() => handleEditOperation(operation)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={t('edit_operation_hint')}
      >
        <View style={styles.operationContent}>
          {/* Category Icon */}
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: isExpense
                  ? colors.expenseBackground || '#ffe5e5'
                  : isIncome
                  ? colors.incomeBackground || '#e5ffe5'
                  : colors.transferBackground || '#e5e5ff',
              },
            ]}
          >
            <Icon
              name={categoryInfo.icon}
              size={24}
              color={isExpense ? colors.expense || '#ff4444' : isIncome ? colors.income || '#44ff44' : colors.transfer || '#4444ff'}
              accessible={false}
            />
          </View>

          {/* Operation Info */}
          <View style={styles.operationInfo}>
            <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
              {categoryInfo.name}
            </Text>
            <Text style={[styles.accountName, { color: colors.mutedText }]} numberOfLines={1}>
              {accountName}
              {isTransfer && operation.toAccountId && ` → ${getAccountName(operation.toAccountId)}`}
            </Text>
            {operation.description ? (
              <Text style={[styles.description, { color: colors.mutedText }]} numberOfLines={1}>
                {operation.description}
              </Text>
            ) : null}
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
            >
              {isExpense ? '-' : isIncome ? '+' : ''}
              {formatCurrency(operation.accountId, operation.amount)}
            </Text>
            <Text style={[styles.date, { color: colors.mutedText }]}>
              {formatDate(operation.date)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [colors, t, getCategoryInfo, getAccountName, handleEditOperation, formatDate, formatCurrency]);

  if (operationsLoading || accountsLoading || categoriesLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]} edges={['bottom']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_operations')}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={sortedOperations}
        renderItem={renderOperation}
        keyExtractor={item => item.id}
        extraData={[accounts, categories]}
        getItemLayout={getItemLayout}
        ListHeaderComponent={renderAddOperationHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="cash-multiple" size={64} color={colors.mutedText} />
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {t('no_operations')}
            </Text>
          </View>
        }
        contentContainerStyle={sortedOperations.length === 0 ? styles.emptyList : null}
        windowSize={10}
        maxToRenderPerBatch={10}
        initialNumToRender={15}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
      />

      <OperationModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        operation={editingOperation}
        isNew={isNew}
        onDelete={handleDeleteOperation}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  operationRow: {
    borderBottomWidth: 1,
    minHeight: 72,
  },
  operationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  operationInfo: {
    flex: 1,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  accountName: {
    fontSize: 13,
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
  },
  operationRight: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyList: {
    flex: 1,
  },
  addOperationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  addIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addOperationText: {
    fontSize: 18,
    fontWeight: '600',
  },
});

export default OperationsScreen;
