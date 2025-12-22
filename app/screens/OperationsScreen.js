import React, { useState, useMemo, useCallback, useEffect, memo, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Pressable, Modal, Keyboard, ScrollView } from 'react-native';
import { FAB } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperations } from '../contexts/OperationsContext';
import { useAccounts } from '../contexts/AccountsContext';
import { useCategories } from '../contexts/CategoriesContext';
import { getLastAccessedAccount, setLastAccessedAccount } from '../services/LastAccount';
import { formatDate as toDateString } from '../services/BalanceHistoryDB';
import OperationModal from '../modals/OperationModal';
import FilterModal from '../components/FilterModal';
import Calculator from '../components/Calculator';
import ListCard from '../components/ListCard';
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

// Note: dynamic createStyles removed to keep linting stable.

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
  TYPES,
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
              },
            ]}
            onPress={() => setQuickAddValues(v => ({
              ...v,
              type: type.key,
              categoryId: type.key === 'transfer' ? '' : v.categoryId,
              toAccountId: '',
            }))}
          >
            <Icon
              name={type.icon}
              size={18}
              color={quickAddValues.type === type.key ? '#fff' : colors.text}
            />
            <Text style={quickAddValues.type === type.key ? [styles.typeButtonText, { color: '#fff' }] : [styles.typeButtonText, { color: colors.text }]}>
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
            <View style={styles.flex1}>
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
            <View style={styles.flex1}>
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
          <View style={styles.flex1}>
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

QuickAddForm.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  quickAddValues: PropTypes.object.isRequired,
  setQuickAddValues: PropTypes.func.isRequired,
  accounts: PropTypes.array,
  filteredCategories: PropTypes.array,
  getAccountName: PropTypes.func.isRequired,
  getAccountBalance: PropTypes.func.isRequired,
  getCategoryName: PropTypes.func.isRequired,
  openPicker: PropTypes.func.isRequired,
  handleQuickAdd: PropTypes.func.isRequired,
  TYPES: PropTypes.array.isRequired,
};

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
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Ref for FlatList to enable scrolling to top
  const flatListRef = useRef(null);

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

  // Auto-prefill "To Account" for transfers with same currency
  useEffect(() => {
    if (quickAddValues.type === 'transfer' && quickAddValues.accountId) {
      const fromAccount = accounts.find(acc => acc.id === quickAddValues.accountId);
      if (fromAccount) {
        // Find first account with same currency that is not the from account
        const toAccount = visibleAccounts.find(
          acc => acc.currency === fromAccount.currency && acc.id !== quickAddValues.accountId,
        );
        if (toAccount) {
          setQuickAddValues(v => ({ ...v, toAccountId: toAccount.id }));
        }
      }
    }
  }, [quickAddValues.type, quickAddValues.accountId, accounts, visibleAccounts]);

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
      ],
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

  const handleQuickAdd = useCallback(async (overrideCategoryId) => {
    const operationData = {
      ...quickAddValues,
      // Use override categoryId if provided (for auto-add from category selection)
      categoryId: overrideCategoryId !== undefined ? overrideCategoryId : quickAddValues.categoryId,
      date: toDateString(new Date()),
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
            item => item.type === 'separator' && item.date === currentDate,
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
          item => item.type === 'separator' && item.date === currentDate,
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
        day: 'numeric',
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

  // Handle scroll event to show/hide scroll-to-top button
  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    // Show button when scrolled down past the calculator (roughly 250px)
    setShowScrollToTop(offsetY > 250);
  }, []);

  // Scroll to top handler
  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

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
      <ListCard
        variant={operation.type}
        onPress={() => handleEditOperation(operation)}
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
        ref={flatListRef}
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
        onScroll={handleScroll}
        scrollEventThrottle={16}
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
                        <Text style={styles.pickerOptionText}>{item.name}</Text>
                        <Text style={[styles.pickerSmallText, { color: colors.mutedText }]}>
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
                      onPress={async () => {
                        if (isFolder) {
                          // Navigate into folder
                          navigateIntoFolder(item);
                        } else {
                          // Select entry category
                          setQuickAddValues(v => ({ ...v, categoryId: item.id }));
                          closePicker();

                          // Check if amount is valid and auto-add operation
                          const hasValidAmount = quickAddValues.amount &&
                            quickAddValues.amount.trim() !== '';

                          if (hasValidAmount) {
                            // Pass the selected categoryId directly to avoid race conditions
                            await handleQuickAdd(item.id);
                          }
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
                        <Text style={[styles.pickerOptionText, styles.pickerOptionTextExpanded, { color: colors.text }]}> 
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
                <Text style={[styles.centeredPaddedText, { color: colors.mutedText }]}>                  
                  {pickerState.type === 'category' ? t('no_categories') : t('no_accounts')}
                </Text>
              }
            />
            {/* Action buttons - only show Close button for non-category pickers */}
            {pickerState.type !== 'category' && (
              <Pressable style={styles.closeButton} onPress={closePicker}>
                <Text style={[styles.closeButtonText, { color: colors.primary }]}>{t('close')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Scroll to Top Button - only show when scrolled down */}
      {showScrollToTop && !operationsLoading && (
        <TouchableOpacity
          style={[styles.scrollToTopButton, { backgroundColor: colors.surface }]}
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
          accessibilityHint="Scroll to the top of the list"
        >
          <Icon name="chevron-up" size={24} color={colors.text} />
        </TouchableOpacity>
      )}

      {/* Filter FAB */}
      {!operationsLoading && (
        <>
          <FAB
            icon="filter-variant"
            style={[
              styles.filterFab,
              { backgroundColor: filtersActive ? colors.primary : colors.surface },
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
  accountBalanceText: {
    fontSize: 12,
    marginTop: 2,
  },
  accountName: {
    fontSize: 13,
    marginBottom: 2,
  },
  accountOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accountPickersRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  backButton: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
  },
  breadcrumbContainer: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    paddingHorizontal: HORIZONTAL_PADDING / 2,
    paddingVertical: SPACING.md,
  },
  breadcrumbText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  categoryAddRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryOption: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  centeredPaddedText: {
    padding: SPACING.xl,
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    marginTop: SPACING.lg,
    minHeight: 48,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  date: {
    fontSize: 12,
  },
  dateSeparator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.md,
  },
  dateSeparatorContent: {
    alignItems: 'center',
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
  },
  dateSeparatorSpent: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  dateSeparatorText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 12,
  },
  destinationAmount: {
    fontSize: 12,
    marginBottom: 2,
  },
  
  
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: TOP_CONTENT_SPACING,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.lg,
  },
  exchangeRate: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  filterFab: {
    bottom: 0,
    margin: SPACING.lg,
    position: 'absolute',
    right: 0,
  },
  flex1: {
    flex: 1,
  },
  formInput: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  formInputCategory: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 2,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  formInputHalf: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },

  formInputText: {
    flex: 1,
    fontSize: 15,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  loadingMoreText: {
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  loadingText: {
    fontSize: 16,
    marginTop: SPACING.md,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'center',
  },
  operationContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
  operationInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  operationRight: {
    alignItems: 'flex-end',
  },
  
  pickerModalContent: {
    borderRadius: BORDER_RADIUS.lg,
    maxHeight: '70%',
    padding: HORIZONTAL_PADDING,
    width: '90%',
  },
  pickerOption: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  pickerOptionText: {
    fontSize: 18,
  },
  pickerOptionTextExpanded: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  pickerSmallText: {
    fontSize: 14,
  },
  quickAddButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  quickAddButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  quickAddForm: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    marginHorizontal: HORIZONTAL_PADDING,
    marginTop: SPACING.md,
    padding: HORIZONTAL_PADDING,
  },
  
  resetFilterButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg + 8,
    bottom: SPACING.lg,
    elevation: 4,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 40,
  },
  scrollToTopButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg + 8,
    elevation: 4,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    top: 16,
    width: 40,
  },
  typeButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
});

export default OperationsScreen;
