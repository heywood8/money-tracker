import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Button, Alert, ActivityIndicator } from 'react-native';
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
  const { operations, loading, deleteOperation } = useOperations();
  const { accounts } = useAccounts();
  const { categories } = useCategories();

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

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Reset time for comparison
    today.setHours(0, 0, 0, 0);
    yesterday.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    if (compareDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (compareDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const getItemLayout = useCallback((data, index) => ({
    length: 72,
    offset: 72 * index,
    index,
  }), []);

  const renderOperation = useCallback(({ item }) => {
    const operation = item;
    const categoryInfo = getCategoryInfo(operation.categoryId);
    const accountName = getAccountName(operation.accountId);
    const isExpense = operation.type === 'expense';
    const isIncome = operation.type === 'income';
    const isTransfer = operation.type === 'transfer';

    return (
      <TouchableOpacity
        style={[styles.operationRow, { borderBottomColor: colors.border }]}
        onPress={() => handleEditOperation(operation)}
        accessibilityRole="button"
        accessibilityLabel={`${categoryInfo.name} operation, ${operation.amount}`}
        accessibilityHint="Double tap to edit"
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
                    ? colors.expense || '#ff4444'
                    : isIncome
                    ? colors.income || '#44aa44'
                    : colors.text,
                },
              ]}
            >
              {isExpense ? '-' : isIncome ? '+' : ''}
              {operation.amount}
            </Text>
            <Text style={[styles.date, { color: colors.mutedText }]}>
              {formatDate(operation.date)}
            </Text>
          </View>

          {/* Delete Button */}
          <TouchableOpacity
            onPress={() => handleDeleteOperation(operation)}
            style={styles.deleteButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${categoryInfo.name} operation`}
            accessibilityHint="Deletes this operation"
          >
            <Icon name="delete-outline" size={20} color={colors.delete} accessible={false} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [colors, t, getCategoryInfo, getAccountName, handleEditOperation, handleDeleteOperation, formatDate]);

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_operations')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={sortedOperations}
        renderItem={renderOperation}
        keyExtractor={item => item.id}
        getItemLayout={getItemLayout}
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

      <View style={styles.addButtonWrapper}>
        <Button
          title={t('add_operation')}
          onPress={handleAddOperation}
          color={colors.primary}
        />
      </View>

      <OperationModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        operation={editingOperation}
        isNew={isNew}
      />
    </View>
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
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
  addButtonWrapper: {
    padding: 16,
    paddingBottom: 24,
  },
});

export default OperationsScreen;
