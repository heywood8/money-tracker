import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Pressable, Modal, Keyboard, InteractionManager } from 'react-native';
import { FAB } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
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
import OperationsList from '../components/operations/OperationsList';
import QuickAddForm from '../components/operations/QuickAddForm';
import currencies from '../../assets/currencies.json';
import * as Currency from '../services/currency';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import { getCategoryDisplayName } from '../utils/categoryUtils';

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
    jumpToDate,
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scrollToDateString, setScrollToDateString] = useState(null);
  const [pendingScroll, setPendingScroll] = useState(false);

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
    exchangeRate: '',
    destinationAmount: '',
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

  // Scroll to date after operations are loaded
  useEffect(() => {
    if (scrollToDateString && !operationsLoading && groupedOperations.length > 0) {
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'separator' && item.date === scrollToDateString,
      );

      if (separatorIndex !== -1) {
        // Mark that we have a pending scroll
        setPendingScroll(true);
      } else {
        // Date not found, clear the scroll target
        setScrollToDateString(null);
        setPendingScroll(false);
      }
    }
  }, [scrollToDateString, operationsLoading, groupedOperations]);

  // Handle content size change - this fires after FlatList has laid out content
  // Wait for interactions/layout to finish, then perform a fast, graceful scroll to the target
  const handleContentSizeChange = useCallback((width, height) => {
    if (pendingScroll && scrollToDateString && !operationsLoading) {
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'separator' && item.date === scrollToDateString,
      );

      if (separatorIndex !== -1) {
        // Defer scroll until after interactions/layout have settled
        InteractionManager.runAfterInteractions(() => {
          try {
            // Use animated: false for instant, graceful jump to distant dates
            flatListRef.current?.scrollToIndex({
              index: separatorIndex,
              animated: false,
              viewPosition: 0,
            });
          } catch (error) {
            // Fallback to estimated offset if scrollToIndex fails
            const estimatedItemHeight = 75;
            const estimatedOffset = separatorIndex * estimatedItemHeight;
            flatListRef.current?.scrollToOffset({
              offset: estimatedOffset,
              animated: false,
            });
          } finally {
            setScrollToDateString(null);
            setPendingScroll(false);
          }
        });
      } else {
        setScrollToDateString(null);
        setPendingScroll(false);
      }
    }
  }, [pendingScroll, scrollToDateString, operationsLoading, groupedOperations]);

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

  const handleDateSeparatorPress = useCallback((dateString) => {
    // Parse the date and set it as the selected date
    const date = new Date(dateString);
    setSelectedDate(date);
    setShowDatePicker(true);
  }, []);

  const handleDatePickerChange = useCallback(async (event, date) => {
    setShowDatePicker(false);
    if (date) {
      const dateString = toDateString(date);

      // Find the index of the date separator for this date in current list
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'separator' && item.date === dateString,
      );

      if (separatorIndex !== -1) {
        // Date is in the current list - scroll to it immediately
        flatListRef.current?.scrollToIndex({
          index: separatorIndex,
          animated: true,
          viewPosition: 0, // Position at the top of the viewport
        });
      } else {
        // Date is not in current list - load from that date to today
        // Set the target date for scrolling after load completes
        setScrollToDateString(dateString);
        setPendingScroll(true);
        await jumpToDate(dateString);
      }
    }
  }, [groupedOperations, jumpToDate]);

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
    // Automatically evaluate any pending math operation before saving
    let finalAmount = quickAddValues.amount;

    if (hasOperation(finalAmount)) {
      const evaluated = evaluateExpression(finalAmount);
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    const operationData = {
      ...quickAddValues,
      amount: finalAmount, // Use the evaluated amount
      // Use override categoryId if provided (for auto-add from category selection)
      categoryId: overrideCategoryId !== undefined ? overrideCategoryId : quickAddValues.categoryId,
      date: toDateString(new Date()),
    };

    // Add currency information for multi-currency transfers
    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount) {
      operationData.sourceCurrency = sourceAccount.currency;
      operationData.destinationCurrency = destinationAccount.currency;
      // Format amounts based on currency decimal places
      operationData.amount = Currency.formatAmount(operationData.amount, sourceAccount.currency);
      if (operationData.destinationAmount) {
        operationData.destinationAmount = Currency.formatAmount(operationData.destinationAmount, destinationAccount.currency);
      }
    } else if (sourceAccount) {
      // Format amount for same-currency operations
      operationData.amount = Currency.formatAmount(operationData.amount, sourceAccount.currency);
    }

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
        exchangeRate: '',
        destinationAmount: '',
      });

      Keyboard.dismiss();
    } catch (error) {
      // Error already shown in addOperation
    }
  }, [quickAddValues, validateOperation, addOperation, t, showDialog, isMultiCurrencyTransfer, sourceAccount, destinationAccount]);

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
    return `${symbol}${Currency.formatAmount(account.balance, account.currency)}`;
  }, [accounts]);

  // Get category info
  const getCategoryInfo = useCallback((categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return { name: t('unknown_category'), icon: 'help-circle' };

    const categoryName = getCategoryDisplayName(categoryId, categories, t);

    return {
      name: categoryName || t('unknown_category'),
      icon: category.icon || 'help-circle',
    };
  }, [categories, t]);

  // Get category name for form
  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return t('select_category');
    const displayName = getCategoryDisplayName(categoryId, categories, t);
    return displayName || t('select_category');
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

  // Multi-currency transfer support
  const [lastEditedField, setLastEditedField] = useState(null);

  // Get source and destination accounts for multi-currency detection
  const sourceAccount = useMemo(() => {
    return accounts.find(acc => acc.id === quickAddValues.accountId);
  }, [accounts, quickAddValues.accountId]);

  const destinationAccount = useMemo(() => {
    return accounts.find(acc => acc.id === quickAddValues.toAccountId);
  }, [accounts, quickAddValues.toAccountId]);

  // Check if this is a multi-currency transfer
  const isMultiCurrencyTransfer = useMemo(() => {
    if (quickAddValues.type !== 'transfer') return false;
    if (!sourceAccount || !destinationAccount) return false;
    return sourceAccount.currency !== destinationAccount.currency;
  }, [quickAddValues.type, sourceAccount, destinationAccount]);

  // Auto-populate exchange rate when accounts change
  useEffect(() => {
    if (isMultiCurrencyTransfer && sourceAccount && destinationAccount && !quickAddValues.exchangeRate) {
      const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
      if (rate) {
        setQuickAddValues(v => ({ ...v, exchangeRate: rate }));
        setLastEditedField('exchangeRate');
      }
    }
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, quickAddValues.exchangeRate]);

  // Auto-calculate based on which field was last edited
  useEffect(() => {
    if (!isMultiCurrencyTransfer) {
      // Clear exchange rate fields for same-currency transfers
      if (quickAddValues.exchangeRate || quickAddValues.destinationAmount) {
        setQuickAddValues(v => ({ ...v, exchangeRate: '', destinationAmount: '' }));
        setLastEditedField(null);
      }
      return;
    }

    if (!sourceAccount || !destinationAccount) return;

    // If user edited destination amount, calculate the rate
    if (lastEditedField === 'destinationAmount') {
      if (quickAddValues.amount && quickAddValues.destinationAmount) {
        const sourceAmount = parseFloat(quickAddValues.amount);
        const destAmount = parseFloat(quickAddValues.destinationAmount);

        if (!isNaN(sourceAmount) && !isNaN(destAmount) && sourceAmount > 0) {
          const calculatedRate = (destAmount / sourceAmount).toFixed(6);
          const currentRate = parseFloat(quickAddValues.exchangeRate || '0');
          const newRate = parseFloat(calculatedRate);
          if (Math.abs(currentRate - newRate) > 0.000001) {
            setQuickAddValues(v => ({ ...v, exchangeRate: calculatedRate }));
          }
        }
      }
    }
    // If user edited amount or rate, calculate destination amount
    else if (lastEditedField === 'amount' || lastEditedField === 'exchangeRate') {
      if (quickAddValues.amount && quickAddValues.exchangeRate) {
        const converted = Currency.convertAmount(
          quickAddValues.amount,
          sourceAccount.currency,
          destinationAccount.currency,
          quickAddValues.exchangeRate,
        );
        if (converted && converted !== quickAddValues.destinationAmount) {
          setQuickAddValues(v => ({ ...v, destinationAmount: converted }));
        }
      }
    }
  }, [isMultiCurrencyTransfer, quickAddValues.amount, quickAddValues.exchangeRate, quickAddValues.destinationAmount, sourceAccount, destinationAccount, lastEditedField]);

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

  const TYPES = useMemo(() => [
    { key: 'expense', label: t('expense'), icon: 'minus-circle' },
    { key: 'income', label: t('income'), icon: 'plus-circle' },
    { key: 'transfer', label: t('transfer'), icon: 'swap-horizontal' },
  ], [t]);

  // Callbacks for multi-currency fields
  const handleExchangeRateChange = useCallback((text) => {
    setQuickAddValues(v => ({ ...v, exchangeRate: text }));
    setLastEditedField('exchangeRate');
  }, []);

  const handleDestinationAmountChange = useCallback((text) => {
    setQuickAddValues(v => ({ ...v, destinationAmount: text }));
    setLastEditedField('destinationAmount');
  }, []);

  const handleAmountChange = useCallback((text) => {
    setQuickAddValues(v => ({ ...v, amount: text }));
    setLastEditedField('amount');
  }, []);

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
      handleAmountChange={handleAmountChange}
      handleExchangeRateChange={handleExchangeRateChange}
      handleDestinationAmountChange={handleDestinationAmountChange}
      TYPES={TYPES}
    />
  ), [colors, t, quickAddValues, visibleAccounts, filteredCategories, getAccountName, getAccountBalance, getCategoryName, openPicker, handleQuickAdd, handleAmountChange, handleExchangeRateChange, handleDestinationAmountChange, TYPES]);

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

  // Handle scroll to index failures (when item is not rendered yet)
  const handleScrollToIndexFailed = useCallback((info) => {
    console.log('scrollToIndex failed for index:', info.index, 'Using offset fallback');

    // Scroll to approximate position using offset
    const estimatedItemHeight = 75;
    const estimatedOffset = info.index * estimatedItemHeight;

    flatListRef.current?.scrollToOffset({
      offset: estimatedOffset,
      animated: false,
    });

    // Try scrollToIndex again after a delay for precise positioning
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
          viewPosition: 0,
        });
      } catch (error) {
        console.log('Second scrollToIndex attempt failed');
      }
    }, 100);
  }, []);

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
      <OperationsList
        ref={flatListRef}
        groupedOperations={groupedOperations}
        accounts={accounts}
        categories={categories}
        colors={colors}
        t={t}
        loadingMore={loadingMore}
        hasMoreOperations={hasMoreOperations}
        onLoadMore={loadMoreOperations}
        onEditOperation={handleEditOperation}
        onDateSeparatorPress={handleDateSeparatorPress}
        onScroll={handleScroll}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onContentSizeChange={handleContentSizeChange}
        headerComponent={quickAddFormComponent}
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
                        <Text style={[styles.pickerSmallText, { color: colors.mutedText }]}>
                          {getCurrencySymbol(item.currency)}{Currency.formatAmount(item.balance, item.currency)}
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
                          // Check if amount is valid and auto-add operation
                          const hasValidAmount = quickAddValues.amount &&
                            quickAddValues.amount.trim() !== '';

                          if (hasValidAmount) {
                            // Capture values before clearing
                            const savedType = quickAddValues.type;
                            const savedAccountId = quickAddValues.accountId;

                            // Clear form immediately to avoid showing old values during save
                            setQuickAddValues({
                              type: savedType,
                              amount: '',
                              accountId: savedAccountId,
                              categoryId: '',
                              description: '',
                              toAccountId: '',
                              exchangeRate: '',
                              destinationAmount: '',
                            });
                            closePicker();

                            // Pass the selected categoryId directly to avoid race conditions
                            await handleQuickAdd(item.id);
                          } else {
                            // Just select the category without auto-add
                            setQuickAddValues(v => ({ ...v, categoryId: item.id }));
                            closePicker();
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

      {/* Date Picker for jumping to a specific date */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={handleDatePickerChange}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  accountOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  /* removed unused styles: description, exchangeRate, emptyContainer, emptyList, emptyText, loadingMoreContainer, loadingMoreText */
  filterFab: {
    bottom: 0,
    margin: SPACING.lg,
    position: 'absolute',
    right: 0,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
});

export default OperationsScreen;
