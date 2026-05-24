import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, TextInput, Pressable, Modal, Keyboard, InteractionManager } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
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
import { getDistinctDescriptions } from '../services/OperationsDB';
import OperationModal from '../modals/OperationModal';
import Calculator from '../components/Calculator';
import ListCard from '../components/ListCard';
import OperationsList from '../components/operations/OperationsList';
import QuickAddForm from '../components/operations/QuickAddForm';
import PickerModal from '../components/operations/PickerModal';
import SearchOverlay from '../components/search/SearchOverlay';
import * as Currency from '../services/currency';
import { hasOperation, evaluateExpression } from '../utils/calculatorUtils';
import useMultiCurrencyTransfer from '../hooks/useMultiCurrencyTransfer';
import useOperationPicker from '../hooks/useOperationPicker';
import useQuickAddForm from '../hooks/useQuickAddForm';
import { useSearch } from '../contexts/SearchContext';

// Note: dynamic createStyles removed to keep linting stable.

const OperationsScreen = () => {
  console.log('[OperationsScreen] Component rendered');
  const { colors } = useThemeColors();

  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const {
    operations,
    loading: operationsLoading,
    loadingMore,
    hasMoreOperations,
  } = useOperationsData();
  const {
    deleteOperation,
    addOperation,
    updateOperation,
    validateOperation,
    loadMoreOperations,
    jumpToDate,
  } = useOperationsActions();
  const { accounts, visibleAccounts } = useAccountsData();
  const { categories } = useCategories();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingOperation, setEditingOperation] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scrollToDateString, setScrollToDateString] = useState(null);
  const [pendingScroll, setPendingScroll] = useState(false);
  const [pendingSuggestionId, setPendingSuggestionId] = useState(null);
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [filterPanelHeight, setFilterPanelHeight] = useState(0);

  const { searchMode, filtersExpanded } = useSearch();
  const scrollOffsetRef = useRef(0);
  const prevFiltersExpandedRef = useRef(false);
  const prevSearchModeRef = useRef(searchMode);
  const quickAddOpacity = useSharedValue(1);
  const quickAddMaxHeight = useSharedValue(1000); // Large enough to not clip

  // Animate when searchMode changes
  useEffect(() => {
    if (searchMode === 'open') {
      // Smooth hide when opening search
      quickAddMaxHeight.value = withTiming(0, { duration: 300 });
      quickAddOpacity.value = withTiming(0, { duration: 300 });
    } else {
      // Instant height restore on close (avoids JS/UI-thread race with scrollToOffset),
      // fade opacity in for a smooth visual.
      quickAddMaxHeight.value = 1000;
      quickAddOpacity.value = withTiming(1, { duration: 250 });
    }
  }, [searchMode]);

  const animatedQuickAddStyle = useAnimatedStyle(() => ({
    maxHeight: quickAddMaxHeight.value,
    opacity: quickAddOpacity.value,
    overflow: 'hidden',
  }));

  // Ref for FlatList to enable scrolling to top
  const flatListRef = useRef(null);
  // Synchronous guard: prevents multiple handleContentSizeChange firings from
  // each scheduling their own scroll before React re-renders with pendingScroll=false.
  const scrollScheduledRef = useRef(false);

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
    topTransferAccountsForForm,
    resetForm,
    foreignRateSource,
    foreignExchangeRate,
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

  // Group operations by date into date-group objects for the list.
  // Declared here (not after the unrelated effects below) because several hooks
  // reference it in their dependency arrays; declaring later would put it in
  // the Temporal Dead Zone when those arrays are evaluated during render.
  const groupedOperations = useMemo(() => {
    const sorted = [...operations].sort((a, b) => new Date(b.date) - new Date(a.date));
    const groups = [];
    let currentGroup = null;

    sorted.forEach((operation) => {
      if (!currentGroup || operation.date !== currentGroup.date) {
        currentGroup = {
          type: 'dateGroup',
          id: `group-${operation.date}`,
          date: operation.date,
          spendingSums: {},
          operations: [],
        };
        groups.push(currentGroup);
      }

      currentGroup.operations.push(operation);

      if (operation.type === 'expense') {
        const account = accounts.find(acc => acc.id === operation.accountId);
        if (account) {
          const currency = account.currency || 'USD';
          const amount = parseFloat(operation.amount);
          if (!isNaN(amount)) {
            currentGroup.spendingSums[currency] = (currentGroup.spendingSums[currency] || 0) + amount;
          }
        }
      }
    });

    return groups;
  }, [operations, accounts]);

  // Scroll to date after operations are loaded
  useEffect(() => {
    if (scrollToDateString && !operationsLoading) {
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'dateGroup' && item.date === scrollToDateString,
      );

      if (separatorIndex !== -1) {
        // Mark that we have a pending scroll
        setPendingScroll(true);
      } else {
        // Date not found (no operations on that date or empty result) — clear scroll target
        scrollScheduledRef.current = false;
        setScrollToDateString(null);
        setPendingScroll(false);
      }
    }
  }, [scrollToDateString, operationsLoading, groupedOperations]);

  // Handle content size change - this fires after FlatList has laid out content
  // Wait for interactions/layout to finish, then perform a fast, graceful scroll to the target
  const handleContentSizeChange = useCallback((width, height) => {
    // scrollScheduledRef gates re-entrant calls: between the first scheduling and the
    // next React re-render (where pendingScroll becomes false), this callback can fire
    // many times. Without the ref, each firing would queue another InteractionManager
    // scroll and cause snap-back whenever the user tries to scroll away.
    if (scrollScheduledRef.current) return;

    if (pendingScroll && scrollToDateString && !operationsLoading) {
      const separatorIndex = groupedOperations.findIndex(
        item => item.type === 'dateGroup' && item.date === scrollToDateString,
      );

      if (separatorIndex !== -1) {
        // Synchronously mark as handled before the async scroll so subsequent firings bail out
        scrollScheduledRef.current = true;

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

  // Track mount/unmount
  useEffect(() => {
    console.log('[OperationsScreen] MOUNTED');
    return () => {
      console.log('[OperationsScreen] UNMOUNTING');
    };
  }, []);


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
        item => item.type === 'dateGroup' && item.date === dateString,
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
        scrollScheduledRef.current = false;
        setScrollToDateString(dateString);
        setPendingScroll(true);
        await jumpToDate(dateString);
      }
    }
  }, [groupedOperations, jumpToDate]);

  // Quick add handlers
  const handleQuickAdd = useCallback(async (overrideCategoryId, overrideToAccountId) => {
    // Automatically evaluate any pending math operation before saving
    let finalAmount = quickAddValues.amount;

    if (hasOperation(finalAmount)) {
      const evaluated = evaluateExpression(finalAmount, Currency.getDecimalPlaces(sourceAccount?.currency));
      if (evaluated !== null) {
        finalAmount = evaluated;
      }
    }

    const operationData = {
      ...quickAddValues,
      amount: finalAmount, // Use the evaluated amount
      // Use override categoryId if provided (for auto-add from category selection)
      categoryId: overrideCategoryId !== undefined ? overrideCategoryId : quickAddValues.categoryId,
      // Use override toAccountId if provided (for auto-add from transfer target shortcuts)
      toAccountId: overrideToAccountId !== undefined ? overrideToAccountId : quickAddValues.toAccountId,
      date: toDateString(new Date()),
    };

    // Determine multi-currency status using effective account IDs (including overrides)
    const effectiveSourceAccount = accounts.find(acc => acc.id === operationData.accountId);
    const effectiveDestAccount = accounts.find(acc => acc.id === operationData.toAccountId);
    const effectiveIsMultiCurrency = operationData.type === 'transfer'
      && effectiveSourceAccount
      && effectiveDestAccount
      && effectiveSourceAccount.currency !== effectiveDestAccount.currency;

    // Add currency information for multi-currency transfers
    if (effectiveIsMultiCurrency) {
      operationData.sourceCurrency = effectiveSourceAccount.currency;
      operationData.destinationCurrency = effectiveDestAccount.currency;
      // Format amounts based on currency decimal places
      operationData.amount = Currency.formatAmount(operationData.amount, effectiveSourceAccount.currency);

      // If no exchange rate set (e.g., quick add via account button), fetch one
      if (!operationData.exchangeRate) {
        try {
          const { rate } = await Currency.fetchLiveExchangeRate(
            effectiveSourceAccount.currency,
            effectiveDestAccount.currency,
          );
          if (rate) {
            operationData.exchangeRate = rate;
          }
        } catch {
          // Fallback to offline rate
          const rate = Currency.getExchangeRate(effectiveSourceAccount.currency, effectiveDestAccount.currency);
          if (rate) {
            operationData.exchangeRate = rate;
          }
        }
      }

      // Calculate destination amount if we have a rate but no destination amount
      if (operationData.exchangeRate && !operationData.destinationAmount) {
        const converted = Currency.convertAmount(
          operationData.amount,
          effectiveSourceAccount.currency,
          effectiveDestAccount.currency,
          operationData.exchangeRate,
        );
        if (converted) {
          operationData.destinationAmount = converted;
        }
      }

      if (operationData.destinationAmount) {
        operationData.destinationAmount = Currency.formatAmount(operationData.destinationAmount, effectiveDestAccount.currency);
      }
    } else {
      // Check if this is a foreign currency expense/income
      const opCurrency = operationData.operationCurrency;
      const isForeignCurrencyOp = opCurrency
        && effectiveSourceAccount
        && opCurrency !== effectiveSourceAccount.currency;

      if (isForeignCurrencyOp) {
        const foreignCurrency = opCurrency;
        const homeCurrency = effectiveSourceAccount.currency;
        const foreignAmount = Currency.formatAmount(operationData.amount, foreignCurrency);

        // Fetch live rate with offline fallback
        let rateToUse = null;
        try {
          const { rate } = await Currency.fetchLiveExchangeRate(foreignCurrency, homeCurrency);
          rateToUse = rate;
        } catch {
          // fall through to offline
        }
        if (!rateToUse) {
          const offlineRate = Currency.getExchangeRate(foreignCurrency, homeCurrency);
          if (offlineRate) rateToUse = String(offlineRate);
        }

        if (!rateToUse) {
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: 'OK' }]);
          return;
        }

        const homeAmount = Currency.convertAmount(foreignAmount, foreignCurrency, homeCurrency, rateToUse);
        if (!homeAmount) {
          showDialog(t('error'), t('exchange_rate_unavailable'), [{ text: 'OK' }]);
          return;
        }

        // Store home-currency amount as the account deduction; foreign amount as destinationAmount
        operationData.amount = Currency.formatAmount(homeAmount, homeCurrency);
        operationData.sourceCurrency = foreignCurrency;
        operationData.destinationCurrency = homeCurrency;
        operationData.exchangeRate = rateToUse;
        operationData.destinationAmount = foreignAmount;
      } else if (effectiveSourceAccount) {
        // Format amount for same-currency operations
        operationData.amount = Currency.formatAmount(operationData.amount, effectiveSourceAccount.currency);
      }
    }

    // Strip operationCurrency — not a DB field
    delete operationData.operationCurrency;

    const error = validateOperation(operationData, t);
    if (error) {
      showDialog(t('error'), error, [{ text: 'OK' }]);
      return;
    }

    try {
      // Clear any previous suggestion before saving
      setPendingSuggestionId(null);
      setPendingSuggestions([]);

      const createdOperation = await addOperation(operationData);

      // Save last accessed account
      if (quickAddValues.accountId) {
        setLastAccessedAccount(quickAddValues.accountId);
      }

      // Reset form but keep account and type
      resetForm();

      Keyboard.dismiss();

      // Check for matching description suggestions for this category
      const effectiveCategoryId = operationData.categoryId;
      if (effectiveCategoryId && createdOperation?.id) {
        const suggestions = await getDistinctDescriptions(8, effectiveCategoryId);
        if (suggestions.length > 0) {
          setPendingSuggestionId(createdOperation.id);
          setPendingSuggestions(suggestions);
        }
      }
    } catch (error) {
      // Errors from addOperation are already shown via dialog.
      // Errors from getDistinctDescriptions are non-critical — suggestion row simply won't appear.
    }
  }, [quickAddValues, validateOperation, addOperation, t, showDialog, accounts, resetForm]);

  // Handler for auto-add with category (from picker)
  const handleAutoAddWithCategory = useCallback(async (categoryId) => {
    // Clear form immediately to avoid showing old values during save
    resetForm();
    closePicker();

    // Pass the selected categoryId directly to avoid race conditions
    await handleQuickAdd(categoryId);
  }, [resetForm, closePicker, handleQuickAdd]);

  // Handler for auto-add with target account (from transfer target shortcuts)
  const handleAutoAddWithAccount = useCallback(async (toAccountId) => {
    resetForm();
    closePicker();

    // Pass undefined for categoryId override, pass toAccountId override
    await handleQuickAdd(undefined, toAccountId);
  }, [resetForm, closePicker, handleQuickAdd]);

  const handleApplySuggestion = useCallback(async (description) => {
    if (!pendingSuggestionId) return;
    const idToUpdate = pendingSuggestionId;
    // Clear state optimistically before the await — if updateOperation fails,
    // the dialog from OperationsActionsContext will show the error, but the
    // suggestion row stays dismissed (intentional: avoids a broken retry loop).
    setPendingSuggestionId(null);
    setPendingSuggestions([]);
    await updateOperation(idToUpdate, { description });
  }, [pendingSuggestionId, updateOperation]);

  const handleDismissSuggestion = useCallback(() => {
    setPendingSuggestionId(null);
    setPendingSuggestions([]);
  }, []);

  // Auto-dismiss suggestion if the pending operation gets a description (e.g. via edit modal)
  useEffect(() => {
    if (!pendingSuggestionId) return;
    const op = operations.find(o => o.id === pendingSuggestionId);
    if (op?.description) {
      setPendingSuggestionId(null);
      setPendingSuggestions([]);
    }
  }, [operations, pendingSuggestionId]);

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

  const handleOperationCurrencyChange = useCallback((currencyCode) => {
    setQuickAddValues(v => ({ ...v, operationCurrency: currencyCode }));
  }, []);

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
  const handleCloseOperationModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const quickAddFormComponent = useMemo(() => (
    <>
      <Animated.View style={animatedQuickAddStyle}>
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
          topTransferAccounts={topTransferAccountsForForm}
          onAutoAddWithAccount={handleAutoAddWithAccount}
          TYPES={TYPES}
          rateSource={rateSource}
          onOperationCurrencyChange={handleOperationCurrencyChange}
          foreignRateSource={foreignRateSource}
          foreignExchangeRate={foreignExchangeRate}
        />
      </Animated.View>
      {filtersExpanded && filterPanelHeight > 0 && <View style={{ height: filterPanelHeight }} />}
    </>
  ), [animatedQuickAddStyle, colors, t, quickAddValues, visibleAccounts, filteredCategories, topCategoriesForType, getCategoryInfo, getAccountName, getAccountBalance, getCategoryName, openPicker, handleQuickAdd, handleAmountChange, handleExchangeRateChange, handleDestinationAmountChange, handleAutoAddWithCategory, topTransferAccountsForForm, handleAutoAddWithAccount, TYPES, rateSource, handleOperationCurrencyChange, foreignRateSource, foreignExchangeRate, filterPanelHeight, filtersExpanded]);

  // Auto-scroll to top when filter panel closes, but only if the user is still
  // near the top (hasn't scrolled into past dates). The threshold is filterPanelHeight:
  // if the offset is within the spacer region the user was viewing recent entries.
  useEffect(() => {
    const wasExpanded = prevFiltersExpandedRef.current;
    prevFiltersExpandedRef.current = filtersExpanded;

    if (wasExpanded && !filtersExpanded) {
      if (scrollOffsetRef.current <= filterPanelHeight) {
        InteractionManager.runAfterInteractions(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        });
      }
    }
  }, [filtersExpanded, filterPanelHeight]);

  // Auto-scroll to top when search closes (open → closed/collapsed).
  // The user is returning to the normal view and should land on the QuickAdd form.
  // Deferred via InteractionManager so the scroll runs after the close animation settles.
  useEffect(() => {
    const wasOpen = prevSearchModeRef.current === 'open';
    prevSearchModeRef.current = searchMode;

    if (wasOpen && searchMode !== 'open') {
      // Defer one animation frame so FlatList layout has settled after the
      // React commit, then scroll to the top before the QuickAdd form
      // finishes re-expanding.
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }
  }, [searchMode]);

  // Handle scroll event to show/hide scroll-to-top button
  const handleScroll = useCallback((event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = offsetY;
    // Show button when scrolled down past the calculator (roughly 250px)
    setShowScrollToTop(offsetY > 250);
  }, []);

  // Scroll to top handler
  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // Handle scroll to index failures (when item is not rendered yet)
  const handleScrollToIndexFailed = useCallback((info) => {
    console.warn('scrollToIndex failed for index:', info.index, 'Using offset fallback');

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
        console.warn('Second scrollToIndex attempt failed');
      }
    }, 100);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OperationsList
        ref={flatListRef}
        groupedOperations={groupedOperations}
        accounts={accounts}
        categories={categories}
        colors={colors}
        t={t}
        initialLoading={operationsLoading}
        loadingMore={loadingMore}
        hasMoreOperations={hasMoreOperations}
        onLoadMore={loadMoreOperations}
        onEditOperation={handleEditOperation}
        onDateSeparatorPress={handleDateSeparatorPress}
        onScroll={handleScroll}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onContentSizeChange={handleContentSizeChange}
        headerComponent={quickAddFormComponent}
        pendingSuggestionId={pendingSuggestionId}
        pendingSuggestions={pendingSuggestions}
        onApplySuggestion={handleApplySuggestion}
        onDismissSuggestion={handleDismissSuggestion}
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
        onAutoAddWithAccount={handleAutoAddWithAccount}
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

      {/* Search Overlay - renders filters when search is open */}
      <SearchOverlay
        visible={searchMode === 'open'}
        onClose={() => {}}
        onHeightChange={setFilterPanelHeight}
        colors={colors}
        t={t}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
