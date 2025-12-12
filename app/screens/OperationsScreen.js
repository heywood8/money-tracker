import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Pressable, Modal, Keyboard } from 'react-native';
import { FAB } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperations } from '../contexts/OperationsContext';
import { useAccounts } from '../contexts/AccountsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getLastAccessedAccount, setLastAccessedAccount } from '../services/LastAccount';
import OperationModal from '../modals/OperationModal';
import FilterModal from '../components/FilterModal';
import Calculator from '../components/Calculator';
import currencies from '../../assets/currencies.json';

/**
 * Get currency symbol from currency code
 * @param {string} currencyCode - Currency code like 'USD', 'EUR', etc.
 * @returns {string} Currency symbol or code if not found
 */
const getCurrencySymbol = (currencyCode) => {
  if (!currencyCode) return '';
  const currency = currencies[currencyCode];
  return currency ? currency.symbol : currencyCode;
};

// Separate memoized component for the quick add form
const QuickAddForm = memo(({
  colors,
  t,
  quickAddValues,
  setQuickAddValues,
  accounts: visibleAccounts,
  filteredCategories,
  getAccountName,
  getAccountBalance,
  getCategoryName,
  openPicker,
  handleQuickAdd,
  TYPES
}) => {
  return (
    <View style={[styles.quickAddForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Type Selector */}
      <View style={styles.typeSelector}>
        {TYPES.map(type => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.typeButton,
              {
                backgroundColor: quickAddValues.type === type.key ? colors.primary : colors.inputBackground,
                borderColor: colors.border,
              }
            ]}
            onPress={() => setQuickAddValues(v => ({
              ...v,
              type: type.key,
              categoryId: type.key === 'transfer' ? '' : v.categoryId,
              toAccountId: type.key !== 'transfer' ? '' : v.toAccountId,
            }))}
          >
            <Icon
              name={type.icon}
              size={18}
              color={quickAddValues.type === type.key ? '#fff' : colors.text}
            />
            <Text style={[
              styles.typeButtonText,
              { color: quickAddValues.type === type.key ? '#fff' : colors.text }
            ]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Account Pickers - Side by side for transfers */}
      {quickAddValues.type === 'transfer' ? (
        <View style={styles.accountPickersRow}>
          {/* From Account Picker */}
          <Pressable
            style={[styles.formInputHalf, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => openPicker('account', visibleAccounts)}
          >
            <Icon name="wallet" size={18} color={colors.mutedText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.formInputText, { color: colors.text }]} numberOfLines={1}>
                {quickAddValues.accountId ? getAccountName(quickAddValues.accountId) : t('select_account')}
              </Text>
              {quickAddValues.accountId && (
                <Text style={[styles.accountBalanceText, { color: colors.mutedText }]} numberOfLines={1}>
                  {getAccountBalance(quickAddValues.accountId)}
                </Text>
              )}
            </View>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </Pressable>

          {/* To Account Picker */}
          <Pressable
            style={[styles.formInputHalf, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => openPicker('toAccount', visibleAccounts.filter(acc => acc.id !== quickAddValues.accountId))}
          >
            <Icon name="swap-horizontal" size={18} color={colors.mutedText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.formInputText, { color: colors.text }]} numberOfLines={1}>
                {quickAddValues.toAccountId ? getAccountName(quickAddValues.toAccountId) : t('to_account')}
              </Text>
              {quickAddValues.toAccountId && (
                <Text style={[styles.accountBalanceText, { color: colors.mutedText }]} numberOfLines={1}>
                  {getAccountBalance(quickAddValues.toAccountId)}
                </Text>
              )}
            </View>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </Pressable>
        </View>
      ) : (
        /* Account Picker for non-transfer operations */
        <Pressable
          style={[styles.formInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          onPress={() => openPicker('account', visibleAccounts)}
        >
          <Icon name="wallet" size={18} color={colors.mutedText} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.formInputText, { color: colors.text }]}>
              {quickAddValues.accountId ? getAccountName(quickAddValues.accountId) : t('select_account')}
            </Text>
            {quickAddValues.accountId && (
              <Text style={[styles.accountBalanceText, { color: colors.mutedText }]}>
                {getAccountBalance(quickAddValues.accountId)}
              </Text>
            )}
          </View>
          <Icon name="chevron-down" size={18} color={colors.mutedText} />
        </Pressable>
      )}

      {/* Amount Calculator */}
      <Calculator
        value={quickAddValues.amount}
        onValueChange={text => setQuickAddValues(v => ({ ...v, amount: text }))}
        colors={colors}
        placeholder={t('amount')}
      />

      {/* Description Input */}
      <View style={[styles.formInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
        <Icon name="text" size={18} color={colors.mutedText} />
        <TextInput
          style={[styles.formTextInput, { color: colors.text }]}
          value={quickAddValues.description}
          onChangeText={text => setQuickAddValues(v => ({ ...v, description: text }))}
          placeholder={t('description')}
          placeholderTextColor={colors.mutedText}
          returnKeyType="done"
        />
      </View>

      {/* Category Picker and Add Button Row */}
      {quickAddValues.type !== 'transfer' && (
        <View style={styles.categoryAddRow}>
          <Pressable
            style={[styles.formInputCategory, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
            onPress={() => openPicker('category', filteredCategories)}
          >
            <Icon name="tag" size={18} color={colors.mutedText} />
            <Text style={[styles.formInputText, { color: colors.text }]}>
              {getCategoryName(quickAddValues.categoryId)}
            </Text>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </Pressable>
          <TouchableOpacity
            style={[styles.quickAddButton, { backgroundColor: colors.primary }]}
            onPress={handleQuickAdd}
          >
            <Text style={styles.quickAddButtonText}>{t('add')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Button for transfers (full width) */}
      {quickAddValues.type === 'transfer' && (
        <TouchableOpacity
          style={[styles.quickAddButton, { backgroundColor: colors.primary }]}
          onPress={handleQuickAdd}
        >
          <Text style={styles.quickAddButtonText}>{t('add')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

QuickAddForm.displayName = 'QuickAddForm';

const OperationsScreen = () => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    operations,
    loading: operationsLoading,
    loadingMore,
    hasMoreOperations,
    deleteOperation,
    addOperation,
    validateOperation,
    loadMoreOperations,
    activeFilters,
    filtersActive,
    updateFilters,
    clearFilters,
    getActiveFilterCount,
  } = useOperations();
  const { accounts, visibleAccounts, loading: accountsLoading } = useAccounts();
  const { categories, loading: categoriesLoading } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingOperation, setEditingOperation] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Quick add form state
  const [quickAddValues, setQuickAddValues] = useState({
    type: 'expense',
    amount: '',
    accountId: '',
    categoryId: '',
    description: '',
    toAccountId: '',
  });
  const [pickerState, setPickerState] = useState({
    visible: false,
    type: null,
    data: [],
    allCategories: [], // Store all available categories for navigation
  });

  // Category navigation state (for hierarchical folder navigation)
  const [categoryNavigation, setCategoryNavigation] = useState({
    currentFolderId: null, // null means showing root folders
    breadcrumb: [], // Array of {id, name} for navigation history
  });

  // Set default account on mount
  useEffect(() => {
    async function setDefaultAccount() {
      if (visibleAccounts.length === 1) {
        setQuickAddValues(v => ({ ...v, accountId: visibleAccounts[0].id }));
      } else if (visibleAccounts.length > 1) {
        const lastId = await getLastAccessedAccount();
        if (lastId && visibleAccounts.some(acc => acc.id === lastId)) {
          setQuickAddValues(v => ({ ...v, accountId: lastId }));
        } else {
          const defaultId = visibleAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0].id;
          setQuickAddValues(v => ({ ...v, accountId: defaultId }));
        }
      }
    }
    setDefaultAccount();
  }, [visibleAccounts]);

  const handleEditOperation = (operation) => {
    setEditingOperation(operation);
    setIsNew(false);
    setModalVisible(true);
  };

  const handleDeleteOperation = (operation) => {
    showDialog(
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

  // Quick add handlers
  const openPicker = useCallback((type, data) => {
    Keyboard.dismiss();
    if (type === 'category') {
      // For categories, show root folders and root entry categories
      // Root folders have type='folder' and no parentId
      // Root entries have type='entry' and no parentId (like income categories)
      const rootItems = data.filter(cat => !cat.parentId);
      setPickerState({ visible: true, type, data: rootItems, allCategories: data });
      setCategoryNavigation({ currentFolderId: null, breadcrumb: [] });
    } else {
      setPickerState({ visible: true, type, data, allCategories: [] });
    }
  }, []);

  const closePicker = useCallback(() => {
    setPickerState({ visible: false, type: null, data: [], allCategories: [] });
    setCategoryNavigation({ currentFolderId: null, breadcrumb: [] });
  }, []);

  // Navigate into a category folder
  const navigateIntoFolder = useCallback((folder) => {
    setPickerState(prev => {
      const folderName = folder.nameKey ? t(folder.nameKey) : folder.name;
      const children = prev.allCategories.filter(cat => cat.parentId === folder.id);

      setCategoryNavigation(prevNav => ({
        currentFolderId: folder.id,
        breadcrumb: [...prevNav.breadcrumb, { id: folder.id, name: folderName }],
      }));

      return { ...prev, data: children };
    });
  }, [t]);

  // Navigate back to previous folder level
  const navigateBack = useCallback(() => {
    setPickerState(prev => {
      const newBreadcrumb = categoryNavigation.breadcrumb.slice(0, -1);
      const newFolderId = newBreadcrumb.length > 0
        ? newBreadcrumb[newBreadcrumb.length - 1].id
        : null;

      // Get the appropriate categories for this level
      let newData;
      if (newFolderId === null) {
        // Back to root - show all root items (folders and entries without parentId)
        newData = prev.allCategories.filter(cat => !cat.parentId);
      } else {
        // Back to parent folder - show its children
        newData = prev.allCategories.filter(cat => cat.parentId === newFolderId);
      }

      setCategoryNavigation({
        currentFolderId: newFolderId,
        breadcrumb: newBreadcrumb,
      });

      return { ...prev, data: newData };
    });
  }, [categoryNavigation.breadcrumb]);

  const handleQuickAdd = useCallback(async () => {
    const operationData = {
      ...quickAddValues,
      date: new Date().toISOString().split('T')[0],
    };

    const error = validateOperation(operationData, t);
    if (error) {
      showDialog(t('error'), error, [{ text: 'OK' }]);
      return;
    }

    try {
      await addOperation(operationData);

      // Save last accessed account
      if (quickAddValues.accountId) {
        setLastAccessedAccount(quickAddValues.accountId);
      }

      // Reset form but keep account and type
      setQuickAddValues({
        type: quickAddValues.type,
        amount: '',
        accountId: quickAddValues.accountId,
        categoryId: '',
        description: '',
        toAccountId: '',
      });

      Keyboard.dismiss();
    } catch (error) {
      // Error already shown in addOperation
    }
  }, [quickAddValues, validateOperation, addOperation, t]);

  // Get account name
  const getAccountName = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account ? account.name : 'Unknown';
  }, [accounts]);

  // Get account balance with currency symbol
  const getAccountBalance = useCallback((accountId) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) return '';
    const symbol = getCurrencySymbol(account.currency);
    return `${symbol}${account.balance}`;
  }, [accounts]);

  // Get category info
  const getCategoryInfo = useCallback((categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return { name: t('unknown_category'), icon: 'help-circle' };
    return {
      name: category.nameKey ? t(category.nameKey) : category.name,
      icon: category.icon || 'help-circle',
    };
  }, [categories, t]);

  // Get category name for form
  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return t('select_category');
    return category.nameKey ? t(category.nameKey) : category.name;
  }, [categories, t]);

  // Filtered categories for quick add form (excluding shadow categories)
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      if (quickAddValues.type === 'transfer') return false;
      // Exclude shadow categories from selection
      if (cat.isShadow) return false;
      // Include both folders and entries that match the operation type
      return cat.categoryType === quickAddValues.type;
    });
  }, [categories, quickAddValues.type]);

  // Calculate spending sums by currency for a group of operations
  const calculateSpendingSums = useCallback((operations) => {
    const sumsByCurrency = {};

    operations.forEach((operation) => {
      if (operation.type === 'expense') {
        const account = accounts.find(acc => acc.id === operation.accountId);
        if (account) {
          const currency = account.currency || 'USD';
          const amount = parseFloat(operation.amount);
          if (!isNaN(amount)) {
            if (!sumsByCurrency[currency]) {
              sumsByCurrency[currency] = 0;
            }
            sumsByCurrency[currency] += amount;
          }
        }
      }
    });

    return sumsByCurrency;
  }, [accounts]);

  // Group operations by date and create flat list with separators
  const groupedOperations = useMemo(() => {
    const sorted = [...operations].sort((a, b) => new Date(b.date) - new Date(a.date));
    const grouped = [];
    let currentDate = null;
    let currentDateOperations = [];

    sorted.forEach((operation, index) => {
      if (operation.date !== currentDate) {
        // If we have accumulated operations for previous date, calculate sums
        if (currentDate !== null && currentDateOperations.length > 0) {
          const spendingSums = calculateSpendingSums(currentDateOperations);
          // Update the separator that was already added with the spending sums
          const separatorIndex = grouped.findIndex(
            item => item.type === 'separator' && item.date === currentDate
          );
          if (separatorIndex !== -1) {
            grouped[separatorIndex].spendingSums = spendingSums;
          }
        }

        // Start new date group
        currentDate = operation.date;
        currentDateOperations = [operation];

        // Add date separator (sums will be added later)
        grouped.push({
          type: 'separator',
          date: operation.date,
          id: `separator-${operation.date}`,
        });
      } else {
        currentDateOperations.push(operation);
      }

      // Add operation
      grouped.push({
        type: 'operation',
        ...operation,
      });

      // Handle last date group
      if (index === sorted.length - 1 && currentDateOperations.length > 0) {
        const spendingSums = calculateSpendingSums(currentDateOperations);
        const separatorIndex = grouped.findIndex(
          item => item.type === 'separator' && item.date === currentDate
        );
        if (separatorIndex !== -1) {
          grouped[separatorIndex].spendingSums = spendingSums;
        }
      }
    });

    return grouped;
  }, [operations, calculateSpendingSums]);

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

    // Get currency-specific decimal places
    const currency = currencies[account.currency];
    const decimals = currency?.decimal_digits ?? 2;

    // Always use symbol instead of Intl.NumberFormat to ensure consistent symbol display
    const symbol = getCurrencySymbol(account.currency || 'USD');
    return `${symbol}${numAmount.toFixed(decimals)}`;
  }, [accounts]);

  const TYPES = useMemo(() => [
    { key: 'expense', label: t('expense'), icon: 'minus-circle' },
    { key: 'income', label: t('income'), icon: 'plus-circle' },
    { key: 'transfer', label: t('transfer'), icon: 'swap-horizontal' },
  ], [t]);

  const quickAddFormComponent = useMemo(() => (
    <QuickAddForm
      colors={colors}
      t={t}
      quickAddValues={quickAddValues}
      setQuickAddValues={setQuickAddValues}
      accounts={visibleAccounts}
      filteredCategories={filteredCategories}
      getAccountName={getAccountName}
      getAccountBalance={getAccountBalance}
      getCategoryName={getCategoryName}
      openPicker={openPicker}
      handleQuickAdd={handleQuickAdd}
      TYPES={TYPES}
    />
  ), [colors, t, quickAddValues, visibleAccounts, filteredCategories, getAccountName, getAccountBalance, getCategoryName, openPicker, handleQuickAdd, TYPES]);

  // Handle end reached for lazy loading
  const handleEndReached = useCallback(() => {
    if (!loadingMore && hasMoreOperations) {
      loadMoreOperations();
    }
  }, [loadingMore, hasMoreOperations, loadMoreOperations]);

  // Footer component showing loading indicator
  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingMoreText, { color: colors.mutedText }]}>
          {t('loading_more')}
        </Text>
      </View>
    );
  }, [loadingMore, colors, t]);

  const renderItem = useCallback(({ item }) => {
    // Render date separator
    if (item.type === 'separator') {
      const hasSpending = item.spendingSums && Object.keys(item.spendingSums).length > 0;

      return (
        <View style={[styles.dateSeparator, { backgroundColor: colors.background }]}>
          <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
          <View style={styles.dateSeparatorContent}>
            <Text style={[styles.dateSeparatorText, { color: colors.mutedText }]}>
              {formatDate(item.date)}
            </Text>
            {hasSpending && (
              <Text style={[styles.dateSeparatorSpent, { color: colors.expense }]}>
                {t('spent_amount')}: {Object.entries(item.spendingSums)
                  .map(([currency, amount]) => {
                    const symbol = getCurrencySymbol(currency);
                    const currencyInfo = currencies[currency];
                    const decimals = currencyInfo?.decimal_digits ?? 2;
                    return `${symbol}${amount.toFixed(decimals)}`;
                  })
                  .join(', ')}
              </Text>
            )}
          </View>
          <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
        </View>
      );
    }

    // Render operation
    const operation = item;
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
            {isMultiCurrencyTransfer ? (
              <Text style={[styles.exchangeRate, { color: colors.mutedText }]} numberOfLines={1}>
                {getCurrencySymbol(operation.sourceCurrency)} → {getCurrencySymbol(operation.destinationCurrency)}: {parseFloat(operation.exchangeRate).toFixed(4)}
              </Text>
            ) : operation.description ? (
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
              {formatCurrency(operation.accountId, operation.amount)}
            </Text>
            {isMultiCurrencyTransfer && operation.toAccountId && (
              <Text style={[styles.destinationAmount, { color: colors.mutedText }]} numberOfLines={1}>
                → {formatCurrency(operation.toAccountId, operation.destinationAmount)}
              </Text>
            )}
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
        contentInsetAdjustmentBehavior="automatic"
        data={groupedOperations}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        extraData={[accounts, categories]}
        ListHeaderComponent={quickAddFormComponent}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="cash-multiple" size={64} color={colors.mutedText} />
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {t('no_operations')}
            </Text>
          </View>
        }
        contentContainerStyle={groupedOperations.length === 0 ? styles.emptyList : null}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        windowSize={10}
        maxToRenderPerBatch={10}
        initialNumToRender={15}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
      />

      {/* Picker Modal for Account/Category selection */}
      <Modal
        visible={pickerState.visible}
        animationType="slide"
        transparent
        onRequestClose={closePicker}
      >
        <Pressable style={styles.modalOverlay} onPress={closePicker}>
          <Pressable style={[styles.pickerModalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            {/* Breadcrumb navigation for categories */}
            {pickerState.type === 'category' && categoryNavigation.breadcrumb.length > 0 && (
              <View style={[styles.breadcrumbContainer, { borderBottomColor: colors.border }]}>
                <Pressable onPress={navigateBack} style={styles.backButton}>
                  <Icon name="arrow-left" size={24} color={colors.primary} />
                </Pressable>
                <Text style={[styles.breadcrumbText, { color: colors.text }]} numberOfLines={1}>
                  {categoryNavigation.breadcrumb[categoryNavigation.breadcrumb.length - 1].name}
                </Text>
              </View>
            )}

            <FlatList
              data={pickerState.data}
              keyExtractor={(item) => item.id || item.key}
              renderItem={({ item }) => {
                if (pickerState.type === 'account' || pickerState.type === 'toAccount') {
                  return (
                    <Pressable
                      onPress={() => {
                        if (pickerState.type === 'account') {
                          setQuickAddValues(v => ({ ...v, accountId: item.id }));
                        } else {
                          setQuickAddValues(v => ({ ...v, toAccountId: item.id }));
                        }
                        closePicker();
                      }}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                      ]}
                    >
                      <View style={styles.accountOption}>
                        <Text style={[styles.pickerOptionText, { color: colors.text }]}>{item.name}</Text>
                        <Text style={{ color: colors.mutedText, fontSize: 14 }}>
                          {getCurrencySymbol(item.currency)}{item.balance}
                        </Text>
                      </View>
                    </Pressable>
                  );
                } else if (pickerState.type === 'category') {
                  // Determine if this is a folder or entry
                  const isFolder = item.type === 'folder';

                  return (
                    <Pressable
                      onPress={() => {
                        if (isFolder) {
                          // Navigate into folder
                          navigateIntoFolder(item);
                        } else {
                          // Select entry category and keep picker open
                          setQuickAddValues(v => ({ ...v, categoryId: item.id }));
                        }
                      }}
                      style={({ pressed }) => [
                        styles.pickerOption,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.selected },
                        // Highlight selected category
                        !isFolder && quickAddValues.categoryId === item.id && { backgroundColor: colors.selected },
                      ]}
                    >
                      <View style={styles.categoryOption}>
                        <Icon name={item.icon} size={24} color={colors.text} />
                        <Text style={[styles.pickerOptionText, { color: colors.text, marginLeft: 12, flex: 1 }]}>
                          {item.nameKey ? t(item.nameKey) : item.name}
                        </Text>
                        {isFolder && <Icon name="chevron-right" size={24} color={colors.mutedText} />}
                      </View>
                    </Pressable>
                  );
                }
                return null;
              }}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedText, textAlign: 'center', padding: 20 }}>
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            {/* Action buttons - different for category vs account/toAccount */}
            {pickerState.type === 'category' ? (
              <View style={styles.pickerActions}>
                <TouchableOpacity
                  style={[styles.pickerActionButton, styles.cancelButton, { borderColor: colors.border }]}
                  onPress={closePicker}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>{t('close')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.pickerActionButton,
                    styles.addButton,
                    { backgroundColor: colors.primary },
                    // Disable if no amount entered
                    (!quickAddValues.amount || quickAddValues.amount.trim() === '') && styles.disabledButton,
                  ]}
                  onPress={() => {
                    if (quickAddValues.amount && quickAddValues.amount.trim() !== '') {
                      closePicker();
                      // Automatically trigger add operation
                      handleQuickAdd();
                    }
                  }}
                  disabled={!quickAddValues.amount || quickAddValues.amount.trim() === ''}
                >
                  <Text style={[
                    styles.addButtonText,
                    (!quickAddValues.amount || quickAddValues.amount.trim() === '') && styles.disabledButtonText,
                  ]}>{t('add')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Pressable style={styles.closeButton} onPress={closePicker}>
                <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Filter FAB */}
      {!operationsLoading && (
        <>
          <FAB
            icon="filter-variant"
            style={[
              styles.filterFab,
              { backgroundColor: filtersActive ? colors.primary : colors.surface }
            ]}
            color={filtersActive ? '#fff' : colors.text}
            onPress={() => setFilterModalVisible(true)}
            label={filtersActive ? String(getActiveFilterCount()) : undefined}
            small={false}
          />

          {/* Reset Filters Button - only show when filters are active */}
          {filtersActive && (
            <TouchableOpacity
              style={[styles.resetFilterButton, { backgroundColor: colors.surface }]}
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel={t('clear_filters')}
              accessibilityHint={t('clear_filters')}
            >
              <Icon name="filter-off" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Filter Modal */}
      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={activeFilters}
        onApplyFilters={updateFilters}
        accounts={visibleAccounts}
        categories={categories}
        t={t}
        colors={colors}
      />

      <OperationModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        operation={editingOperation}
        isNew={isNew}
        onDelete={handleDeleteOperation}
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
  exchangeRate: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  destinationAmount: {
    fontSize: 12,
    marginBottom: 2,
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
  quickAddForm: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickAddTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  formInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  accountPickersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  formInputHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  formInputText: {
    flex: 1,
    fontSize: 15,
  },
  accountBalanceText: {
    fontSize: 12,
    marginTop: 2,
  },
  formTextInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  categoryAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  formInputCategory: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  quickAddButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  quickAddButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModalContent: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 12,
    padding: 12,
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  pickerOptionText: {
    fontSize: 18,
  },
  accountOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  breadcrumbText: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  closeButton: {
    marginTop: 16,
    alignSelf: 'center',
    minHeight: 48,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
    paddingHorizontal: 8,
  },
  pickerActionButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    // backgroundColor set dynamically from colors.primary
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disabledButton: {
    opacity: 0.4,
  },
  disabledButtonText: {
    opacity: 0.6,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
  },
  dateSeparatorContent: {
    alignItems: 'center',
  },
  dateSeparatorText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateSeparatorSpent: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  loadingMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreText: {
    marginTop: 8,
    fontSize: 14,
  },
  filterFab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  resetFilterButton: {
    position: 'absolute',
    right: 80,
    bottom: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default OperationsScreen;
