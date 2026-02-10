import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Pressable, Modal, Keyboard, InteractionManager } from 'react-native';
import { FAB } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING, SPACING, BORDER_RADIUS } from '../styles/layout';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useOperationsData } from '../contexts/OperationsDataContext';
import { useOperationsActions } from '../contexts/OperationsActionsContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { useCategories } from '../contexts/CategoriesContext';
import { setLastAccessedAccount } from '../services/LastAccount';
import { formatDate as toDateString } from '../services/BalanceHistoryDB';
import OperationModal from '../modals/OperationModal';
import FilterModal from '../components/FilterModal';
import Calculator from '../components/Calculator';
import ListCard from '../components/ListCard';
import OperationsList from '../components/operations/OperationsList';
import QuickAddForm from '../components/operations/QuickAddForm';
import PickerModal from '../components/operations/PickerModal';
import * as Currency from '../services/currency';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useMultiCurrencyTransfer from '../hooks/useMultiCurrencyTransfer';
import useOperationPicker from '../hooks/useOperationPicker';
import useQuickAddForm from '../hooks/useQuickAddForm';

// Note: dynamic createStyles removed to keep linting stable.

const OperationsScreen = () => {
  const { colors } = useThemeColors();
  
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    operations,
    loading: operationsLoading,
    loadingMore,
    hasMoreOperations,
    activeFilters,
    filtersActive,
  } = useOperationsData();
  const {
    deleteOperation,
    addOperation,
    validateOperation,
    loadMoreOperations,
    jumpToDate,
    updateFilters,
    clearFilters,
    getActiveFilterCount,
  } = useOperationsActions();
  const { accounts, visibleAccounts, loading: accountsLoading } = useAccountsData();
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

  // Custom hooks for form and picker management
  const {
    quickAddValues,
    setQuickAddValues,
    getAccountName,
    getAccountBalance,
    getCategoryInfo,
    getCategoryName,
    filteredCategories,
    topCategoriesForType,
    resetForm,
  } = useQuickAddForm(visibleAccounts, accounts, categories, t);

  const {
    pickerState,
    categoryNavigation,
    openPicker,
    closePicker,
    navigateIntoFolder,
    navigateBack,
  } = useOperationPicker(t);

  const {
    sourceAccount,
    destinationAccount,
    isMultiCurrencyTransfer,
    lastEditedField,
    setLastEditedField,
    rateSource,
    setRateSource,
  } = useMultiCurrencyTransfer(quickAddValues, accounts);

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

  // Auto-populate exchange rate when multi-currency transfer accounts change (async with live rate)
  useEffect(() => {
    if (!isMultiCurrencyTransfer || !sourceAccount || !destinationAccount || quickAddValues.exchangeRate) {
      return;
    }

    let cancelled = false;
    setRateSource('loading');

    Currency.fetchLiveExchangeRate(sourceAccount.currency, destinationAccount.currency)
      .then(({ rate, source }) => {
        if (cancelled) return;
        if (rate) {
          setQuickAddValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource(source === 'live' ? 'live' : 'offline');
      })
      .catch(() => {
        if (cancelled) return;
        const rate = Currency.getExchangeRate(sourceAccount.currency, destinationAccount.currency);
        if (rate) {
          setQuickAddValues(v => ({ ...v, exchangeRate: rate }));
          setLastEditedField('exchangeRate');
        }
        setRateSource('offline');
      });

    return () => { cancelled = true; };
  }, [isMultiCurrencyTransfer, sourceAccount, destinationAccount, quickAddValues.exchangeRate]);

  // Auto-calculate multi-currency fields based on which field was last edited
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

  const handleEditOperation = useCallback((operation) => {
    setEditingOperation(operation);
    setIsNew(false);
    setModalVisible(true);
  }, []);

  const handleDeleteOperation = useCallback((operation) => {
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
  }, [t, showDialog, deleteOperation]);

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
      resetForm();

      Keyboard.dismiss();
    } catch (error) {
      // Error already shown in addOperation
    }
  }, [quickAddValues, validateOperation, addOperation, t, showDialog, isMultiCurrencyTransfer, sourceAccount, destinationAccount, resetForm]);

  // Handler for auto-add with category (from picker)
  const handleAutoAddWithCategory = useCallback(async (categoryId) => {
    // Clear form immediately to avoid showing old values during save
    resetForm();
    closePicker();

    // Pass the selected categoryId directly to avoid race conditions
    await handleQuickAdd(categoryId);
  }, [resetForm, closePicker, handleQuickAdd]);

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
    setRateSource('manual');
  }, [setRateSource]);

  const handleDestinationAmountChange = useCallback((text) => {
    setQuickAddValues(v => ({ ...v, destinationAmount: text }));
    setLastEditedField('destinationAmount');
    setRateSource('manual');
  }, [setRateSource]);

  const handleAmountChange = useCallback((text) => {
    setQuickAddValues(v => ({ ...v, amount: text }));
    setLastEditedField('amount');
  }, []);

  // Handlers for picker modal selections
  const handleSelectAccount = useCallback((id) => {
    setQuickAddValues(v => ({ ...v, accountId: id }));
  }, []);

  const handleSelectToAccount = useCallback((id) => {
    setQuickAddValues(v => ({ ...v, toAccountId: id }));
  }, []);

  const handleSelectCategory = useCallback((id) => {
    setQuickAddValues(v => ({ ...v, categoryId: id }));
  }, []);

  // Handlers for modal visibility
  const handleOpenFilterModal = useCallback(() => {
    setFilterModalVisible(true);
  }, []);

  const handleCloseFilterModal = useCallback(() => {
    setFilterModalVisible(false);
  }, []);

  const handleCloseOperationModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const quickAddFormComponent = useMemo(() => (
    <QuickAddForm
      colors={colors}
      t={t}
      quickAddValues={quickAddValues}
      setQuickAddValues={setQuickAddValues}
      accounts={visibleAccounts}
      filteredCategories={filteredCategories}
      topCategoriesForType={topCategoriesForType}
      getCategoryInfo={getCategoryInfo}
      getAccountName={getAccountName}
      getAccountBalance={getAccountBalance}
      getCategoryName={getCategoryName}
      openPicker={openPicker}
      handleQuickAdd={handleQuickAdd}
      handleAmountChange={handleAmountChange}
      handleExchangeRateChange={handleExchangeRateChange}
      handleDestinationAmountChange={handleDestinationAmountChange}
      onAutoAddWithCategory={handleAutoAddWithCategory}
      TYPES={TYPES}
      rateSource={rateSource}
    />
  ), [colors, t, quickAddValues, visibleAccounts, filteredCategories, topCategoriesForType, getCategoryInfo, getAccountName, getAccountBalance, getCategoryName, openPicker, handleQuickAdd, handleAmountChange, handleExchangeRateChange, handleDestinationAmountChange, handleAutoAddWithCategory, TYPES, rateSource]);

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
      <PickerModal
        visible={pickerState.visible}
        pickerType={pickerState.type}
        pickerData={pickerState.data}
        colors={colors}
        t={t}
        onClose={closePicker}
        onSelectAccount={handleSelectAccount}
        onSelectToAccount={handleSelectToAccount}
        categoryNavigation={categoryNavigation}
        quickAddValues={quickAddValues}
        onNavigateBack={navigateBack}
        onNavigateIntoFolder={navigateIntoFolder}
        onSelectCategory={handleSelectCategory}
        onAutoAddWithCategory={handleAutoAddWithCategory}
      />

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
            onPress={handleOpenFilterModal}
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
        onClose={handleCloseFilterModal}
        filters={activeFilters}
        onApplyFilters={updateFilters}
        accounts={visibleAccounts}
        categories={categories}
        t={t}
        colors={colors}
      />

      <OperationModal
        visible={modalVisible}
        onClose={handleCloseOperationModal}
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
  container: {
    flex: 1,
  },
  filterFab: {
    borderRadius: 28,
    bottom: 84,
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
  resetFilterButton: {
    alignItems: 'center',
    borderRadius: 20,
    bottom: 84 + SPACING.lg,
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
