import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, interpolate, runOnJS, Easing, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { TOP_CONTENT_SPACING } from '../styles/layout';
import { getAvailableMonths, getUnconvertibleCurrencies } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatAmount } from '../services/currency';
import currenciesJson from '../../assets/currencies.json';
import EmptyState from '../components/EmptyState';
import BalanceHistoryCard from '../components/graphs/BalanceHistoryCard';
import CategoryBackChip from '../components/graphs/CategoryBackChip';
import { chartTransition, CHART_DROP } from '../components/graphs/chartTransitions';
import CategorySpendingCard from '../components/graphs/CategorySpendingCard';
import ExpenseSummaryCard from '../components/graphs/ExpenseSummaryCard';
import IncomeSummaryCard from '../components/graphs/IncomeSummaryCard';
import IncomePieChart from '../components/graphs/IncomePieChart';
import ExpensePieChart from '../components/graphs/ExpensePieChart';
import useExpenseData from '../hooks/useExpenseData';
import useIncomeData from '../hooks/useIncomeData';
import useCategoryOperations from '../hooks/useCategoryOperations';
import useBalanceHistory from '../hooks/useBalanceHistory';

const CARD_HEADER_HEIGHT = 56;
const MAX_CHART_HEIGHT = 500;
// Chart-level timings live in chartTransitions.js — these two are the panel's
// own height animation, which runs regardless of which chart is moving.
const PANEL_OPEN_DURATION = 280;
const PANEL_CLOSE_DURATION = 220;

const GraphsScreen = () => {
  const { colors } = useThemeColors();
  const { t, language } = useLocalization();
  const { accounts } = useAccountsData();

  // Get current month and year
  const now = new Date();
  // Combined period state: "YYYY-MM" for specific month or "YYYY-full" for full year
  const [selectedPeriod, setSelectedPeriod] = useState(`${now.getFullYear()}-${now.getMonth()}`);
  const [selectedCurrency, setSelectedCurrency] = useState('');
  // When on, operations in other currencies are converted to selectedCurrency at
  // the current rate and folded into the expense/income pie charts and the
  // spending trend, instead of showing only same-currency operations. On by
  // default so multi-currency totals are complete out of the box.
  const [convertAllCurrencies, setConvertAllCurrencies] = useState(true);
  // Account currencies that have no rate (offline or live) to selectedCurrency —
  // their operations are silently excluded from converted totals, so warn.
  const [unconvertedCurrencies, setUnconvertedCurrencies] = useState([]);
  // Long-press hint bubble explaining the convert-currencies corner toggle.
  const [hintVisible, setHintVisible] = useState(false);
  const hintOpacity = useSharedValue(0);
  const hintTimerRef = useRef(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [topLevelIncomeCategories, setTopLevelIncomeCategories] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedCategoryForTrend, setSelectedCategoryForTrend] = useState(null);


  // Account selection state
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Income/expense live in one panel with two tabs. Collapsed, the panel is just
  // the tab strip; tapping a tab drops its chart down underneath it.
  // null = collapsed, 'income' | 'expense' = that tab is open
  const [expandedCard, setExpandedCard] = useState(null);
  // Reanimated shared values — all run on UI thread, immune to JS contention
  // Panel height: header only when collapsed, header + chart when open
  const panelHeight = useSharedValue(CARD_HEADER_HEIGHT);
  // 0=hidden, 1=visible; drives each chart's opacity, drop and scale. Both
  // charts stay mounted and overlap absolutely, so switching tabs is a fade
  // through: one progress runs to 0 before the other starts climbing to 1.
  const incomeChartProgress = useSharedValue(0);
  const expenseChartProgress = useSharedValue(0);
  // Where each chart sits at progress 0. Opening drops it down from under the
  // strip at full size; switching tabs holds it in place and scales it instead.
  const incomeChartOffset = useSharedValue({ y: CHART_DROP, scale: 1 });
  const expenseChartOffset = useSharedValue({ y: CHART_DROP, scale: 1 });
  // Bumped every time a tab is opened so the donut replays its intro — the
  // charts are always mounted, so mounting alone can't drive that animation.
  // The delay travels with it: on a fade through the donut must not spin up
  // while the chart it is replacing is still on screen.
  const [chartIntro, setChartIntro] = useState({ key: 0, delay: 0 });
  // Measured chart heights, kept in refs so the expand handler can read them
  // synchronously (they are written from the JS-side onContentSizeChange).
  const expenseChartHeightRef = useRef(0);
  const incomeChartHeightRef = useRef(0);
  // dir + target bundled so a single setState triggers a render that refreshes
  // the exiting prop on the old component BEFORE the key changes in the next render
  const [expenseDrillReq, setExpenseDrillReq] = useState({ dir: 'in', target: null });
  const [incomeDrillReq, setIncomeDrillReq] = useState({ dir: 'in', target: null });

  // Derive selectedYear and selectedMonth from combined selectedPeriod
  // This must be defined before the hooks that use these values
  const { selectedYear, selectedMonth } = useMemo(() => {
    const [yearStr, monthStr] = selectedPeriod.split('-');
    const year = parseInt(yearStr, 10);
    const month = monthStr === 'full' ? null : parseInt(monthStr, 10);
    return { selectedYear: year, selectedMonth: month };
  }, [selectedPeriod]);

  // Custom hooks for data management
  const {
    chartData,
    loading,
    loadExpenseData,
    totalExpenses,
  } = useExpenseData(selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors, t, convertAllCurrencies);

  const {
    incomeChartData,
    loadingIncome,
    loadIncomeData,
    totalIncome,
  } = useIncomeData(selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors, t, convertAllCurrencies);

  const {
    balanceHistoryData,
    loadingBalanceHistory,
    loadBalanceHistory,
    balanceHistoryTableData,
    loadBalanceHistoryTable,
    editingBalanceValue,
    setEditingBalanceValue,
    handleEditBalance,
    handleCancelEdit,
    handleSaveBalance,
    handleDeleteBalance,
  } = useBalanceHistory(selectedAccount, selectedYear, selectedMonth);

  // Phase 2: apply the pending category change after the old component has
  // re-rendered with the correct exiting prop (useLayoutEffect fires before paint)
  useLayoutEffect(() => {
    if (expenseDrillReq.target !== null) {
      setSelectedCategory(expenseDrillReq.target);
      setExpenseDrillReq(prev => ({ ...prev, target: null }));
    }
  }, [expenseDrillReq]);

  useLayoutEffect(() => {
    if (incomeDrillReq.target !== null) {
      setSelectedIncomeCategory(incomeDrillReq.target);
      setIncomeDrillReq(prev => ({ ...prev, target: null }));
    }
  }, [incomeDrillReq]);

  // Handlers for legend item clicks
  const handleExpenseLegendItemPress = useCallback((categoryId) => {
    setExpenseDrillReq({ dir: 'in', target: categoryId });
  }, []);

  const handleIncomeLegendItemPress = useCallback((categoryId) => {
    setIncomeDrillReq({ dir: 'in', target: categoryId });
  }, []);

  const handleShowCalendar = useCallback(async () => {
    await loadBalanceHistoryTable();
  }, [loadBalanceHistoryTable]);

  // Month names translation keys
  const monthKeys = [
    'month_january', 'month_february', 'month_march', 'month_april',
    'month_may', 'month_june', 'month_july', 'month_august',
    'month_september', 'month_october', 'month_november', 'month_december',
  ];

  // Get available years from database (extract unique years from availableMonths)
  const availableYears = useMemo(() => {
    if (availableMonths.length === 0) {
      // If no operations, return current year as fallback
      return [now.getFullYear()];
    }
    const uniqueYears = [...new Set(availableMonths.map(m => m.year))];
    return uniqueYears.sort((a, b) => b - a); // Sort descending
  }, [availableMonths]);

  // Initialize default currency from first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedCurrency) {
      setSelectedCurrency(accounts[0].currency);
    } else if (accounts.length === 0 && selectedCurrency) {
      setSelectedCurrency('');
    }
  }, [accounts, selectedCurrency]);

  // Initialize default account (display_order=0, non-hidden)
  useEffect(() => {
    const visibleAccounts = accounts.filter(acc => !acc.hidden);
    if (visibleAccounts.length > 0 && !selectedAccount) {
      const defaultAccount = visibleAccounts.find(acc => acc.displayOrder === 0) || visibleAccounts[0];
      setSelectedAccount(defaultAccount.id);
    } else if (visibleAccounts.length === 0 && selectedAccount) {
      setSelectedAccount(null);
    }
  }, [accounts, selectedAccount]);

  // Load categories function
  const loadCategories = useCallback(async () => {
    try {
      const cats = await getAllCategories(true); // Include shadow categories
      setCategories(cats);

      // Filter top-level expense categories (no parent, expense type, not shadow)
      const topLevel = cats.filter(cat =>
        cat.parentId === null && cat.categoryType === 'expense' && !cat.isShadow,
      );
      setTopLevelCategories(topLevel);

      // Filter top-level income categories (no parent, income type)
      const topLevelIncome = cats.filter(cat =>
        cat.parentId === null && cat.categoryType === 'income',
      );
      setTopLevelIncomeCategories(topLevelIncome);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  // Load available months function
  const loadAvailableMonthsData = useCallback(async () => {
    try {
      const months = await getAvailableMonths();
      setAvailableMonths(months);
    } catch (error) {
      console.error('Failed to load available months:', error);
    }
  }, []);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load available months on mount
  useEffect(() => {
    loadAvailableMonthsData();
  }, [loadAvailableMonthsData]);

  // Listen for DATABASE_RESET event to clear data
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('GraphsScreen: Database reset detected, clearing data');
      setCategories([]);
      setTopLevelCategories([]);
      setTopLevelIncomeCategories([]);
      setAvailableMonths([]);
      setSelectedCategory('all');
      setSelectedIncomeCategory('all');
    });

    return unsubscribe;
  }, []);

  // Listen for RELOAD_ALL event to reload data
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.RELOAD_ALL, () => {
      console.log('GraphsScreen: Reloading data due to RELOAD_ALL event');
      loadCategories();
      loadAvailableMonthsData();
    });

    return unsubscribe;
  }, [loadCategories, loadAvailableMonthsData]);

  // Reload data when filters change
  useEffect(() => {
    if (categories.length > 0) {
      loadExpenseData();
      loadIncomeData();
    }
  }, [loadExpenseData, loadIncomeData, categories.length]);

  // Load balance history when account or month changes
  useEffect(() => {
    loadBalanceHistory();
  }, [loadBalanceHistory]);

  // Memoize unique currencies from accounts
  const currencies = useMemo(() =>
    [...new Set(accounts.map(acc => acc.currency))],
  [accounts],
  );

  // When converting, detect account currencies that cannot be expressed in the
  // selected currency (no offline and no live rate) so the UI can flag that some
  // operations are excluded rather than silently dropping them.
  // Functional guards keep the empty state referentially stable: setting a fresh
  // `[]` on every run would re-render, and since `currencies` gets a new identity
  // whenever `accounts` does, that render would re-fire this effect — an infinite
  // loop. Returning `prev` when already empty lets React bail out.
  useEffect(() => {
    if (!convertAllCurrencies || !selectedCurrency) {
      setUnconvertedCurrencies(prev => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    getUnconvertibleCurrencies(currencies, selectedCurrency)
      .then(list => { if (!cancelled) setUnconvertedCurrencies(list); })
      .catch(() => { if (!cancelled) setUnconvertedCurrencies(prev => (prev.length === 0 ? prev : [])); });
    return () => { cancelled = true; };
  }, [convertAllCurrencies, selectedCurrency, currencies]);

  // Prepare picker items
  const currencyItems = useMemo(() =>
    currencies.map(cur => ({ label: cur, value: cur })),
  [currencies],
  );

  const selectedCurrencySymbol = useMemo(() => {
    const info = currenciesJson[selectedCurrency];
    return info ? info.symbol : selectedCurrency;
  }, [selectedCurrency]);

  const accountItems = useMemo(() =>
    accounts
      .filter(acc => !acc.hidden)
      .map(acc => {
        const currencyInfo = currenciesJson[acc.currency];
        const symbol = currencyInfo ? currencyInfo.symbol : acc.currency;
        return {
          label: acc.name,
          value: acc.id,
          subLabel: `${symbol}${formatAmount(acc.balance, acc.currency)}`,
        };
      }),
  [accounts],
  );

  // Combined period picker items: months and "Full Year" for each year, sorted descending
  const periodItems = useMemo(() => {
    const items = [];

    // Group available months by year, sorted descending
    availableYears.forEach(year => {
      const monthsForYear = availableMonths
        .filter(m => m.year === year)
        .map(m => m.month)
        .sort((a, b) => b - a); // Dec to Jan

      // If no months available for this year (fallback case), use current month
      const monthsList = monthsForYear.length > 0 ? monthsForYear : [now.getMonth()];

      monthsList.forEach(monthIndex => {
        items.push({
          label: `${t(monthKeys[monthIndex])} ${year}`,
          value: `${year}-${monthIndex}`,
        });
      });

      // Add "Full Year" after all months of this year (before previous year)
      items.push({
        label: `${t('full_year')} ${year}`,
        value: `${year}-full`,
      });
    });

    // The picker defaults to the current month, so it must always be present —
    // early in a new month (no operations yet) the wheel would otherwise display
    // one period while the charts query another.
    const currentPeriodValue = `${now.getFullYear()}-${now.getMonth()}`;
    if (!items.some(item => item.value === currentPeriodValue)) {
      items.unshift({
        label: `${t(monthKeys[now.getMonth()])} ${now.getFullYear()}`,
        value: currentPeriodValue,
      });
    }

    return items;
  }, [availableYears, availableMonths, t, monthKeys]);

  // Use account-specific expenses from balance history for the prediction.
  // totalExpenses from useExpenseData covers all accounts in the currency (by design),
  // but the forecast line on the balance history chart must reflect only the selected account.
  const accountTotalExpenses = parseFloat(balanceHistoryData.currentMonthTotalExpenses ?? 0) || 0;

  // Calculate spending prediction
  const spendingPrediction = useMemo(() => {
    if (accountTotalExpenses === 0) {
      return null; // No spending data yet
    }

    // Don't show prediction for full year view
    if (selectedMonth === null) {
      return null;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // If viewing a past month, don't show prediction
    if (selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth)) {
      return null;
    }

    // If viewing a future month, don't show prediction
    if (selectedYear > currentYear || (selectedYear === currentYear && selectedMonth > currentMonth)) {
      return null;
    }

    // Calculate days in the selected month
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    // Days elapsed includes today: the expense total feeding this prediction
    // covers the 1st through today, so the denominator must span the same days
    // (dividing by currentDay - 1 would inflate the average every day).
    const currentDay = now.getDate();
    const daysElapsed = currentDay;

    if (daysElapsed < 1) {
      return null;
    }

    // Calculate daily average
    const dailyAverage = accountTotalExpenses / daysElapsed;

    // Predict total spending by month end
    const predictedTotal = dailyAverage * daysInMonth;

    // Calculate percentage of month elapsed
    const percentElapsed = (daysElapsed / daysInMonth) * 100;

    return {
      currentSpending: accountTotalExpenses,
      predictedTotal,
      predictedRemaining: predictedTotal - accountTotalExpenses,
      dailyAverage,
      daysElapsed,
      daysInMonth,
      percentElapsed,
    };
  }, [accountTotalExpenses, selectedYear, selectedMonth]);

  // Calculate if the selected period is the current month
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  }, [selectedYear, selectedMonth]);

  // Derive display name for selected category (null when 'all')
  const selectedCategoryName = useMemo(() => {
    if (selectedCategory === 'all') return null;
    const cat = categories.find(c => c.id === selectedCategory);
    return cat ? cat.name : null;
  }, [selectedCategory, categories]);

  const selectedIncomeCategoryName = useMemo(() => {
    if (selectedIncomeCategory === 'all') return null;
    const cat = categories.find(c => c.id === selectedIncomeCategory);
    return cat ? cat.name : null;
  }, [selectedIncomeCategory, categories]);

  // A selected category with no sub-categories is a "leaf": the drill-down has
  // bottomed out, so the pie chart shows its operations instead of a breakdown.
  const expenseCategoryIsLeaf = useMemo(() => {
    if (selectedCategory === 'all') return false;
    return !categories.some(c => c.parentId === selectedCategory);
  }, [selectedCategory, categories]);

  const incomeCategoryIsLeaf = useMemo(() => {
    if (selectedIncomeCategory === 'all') return false;
    return !categories.some(c => c.parentId === selectedIncomeCategory);
  }, [selectedIncomeCategory, categories]);

  const {
    operations: expenseOperations,
    loadingOperations: loadingExpenseOperations,
  } = useCategoryOperations(
    selectedYear,
    selectedMonth,
    selectedCurrency,
    expenseCategoryIsLeaf ? selectedCategory : null,
    'expense',
    convertAllCurrencies,
  );

  const {
    operations: incomeOperations,
    loadingOperations: loadingIncomeOperations,
  } = useCategoryOperations(
    selectedYear,
    selectedMonth,
    selectedCurrency,
    incomeCategoryIsLeaf ? selectedIncomeCategory : null,
    'income',
    convertAllCurrencies,
  );

  // Shared category parent lookup
  const getParentCategoryId = useCallback((categoryId) => {
    if (categoryId === 'all') return 'all';
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return 'all';
    if (category.parentId === null) return 'all';
    return category.parentId;
  }, [categories]);

  const handleBackToIncomeParent = useCallback(() => {
    setIncomeDrillReq({ dir: 'back', target: getParentCategoryId(selectedIncomeCategory) });
  }, [getParentCategoryId, selectedIncomeCategory]);

  const handleBackToExpenseParent = useCallback(() => {
    setExpenseDrillReq({ dir: 'back', target: getParentCategoryId(selectedCategory) });
  }, [getParentCategoryId, selectedCategory]);

  const resetExpenseCategory = useCallback(() => setExpenseDrillReq({ dir: 'none', target: 'all' }), []);
  const resetIncomeCategory = useCallback(() => setIncomeDrillReq({ dir: 'none', target: 'all' }), []);

  const toggleCard = useCallback((card) => {
    const progressOf = (tab) => (tab === 'income' ? incomeChartProgress : expenseChartProgress);
    const offsetOf = (tab) => (tab === 'income' ? incomeChartOffset : expenseChartOffset);

    const closing = expandedCard === card;
    const nextTab = closing ? null : card;
    const { enter, exit } = chartTransition(expandedCard, nextTab);

    // Leaving a tab always drops its drill-down so it reopens at the top level
    if (expandedCard) {
      if (expandedCard === 'expense') {
        resetExpenseCategory();
      } else {
        resetIncomeCategory();
      }
      offsetOf(expandedCard).value = { y: exit.y, scale: exit.scale };
      progressOf(expandedCard).value = withTiming(0, { duration: exit.duration, easing: Easing.in(Easing.quad) });
    }

    setExpandedCard(nextTab);

    if (closing) {
      panelHeight.value = withTiming(CARD_HEADER_HEIGHT, { duration: PANEL_CLOSE_DURATION, easing: Easing.in(Easing.quad) });
      return;
    }

    offsetOf(card).value = { y: enter.y, scale: enter.scale };
    setChartIntro(prev => ({ key: prev.key + 1, delay: enter.delay }));
    const chartHeight = card === 'income'
      ? incomeChartHeightRef.current
      : expenseChartHeightRef.current;
    panelHeight.value = withTiming(CARD_HEADER_HEIGHT + chartHeight, { duration: PANEL_OPEN_DURATION, easing: Easing.out(Easing.cubic) });
    // withDelay, not Animated.delay: this is a reanimated shared value, so the
    // whole chain stays on the UI thread.
    progressOf(card).value = withDelay(
      enter.delay,
      withTiming(1, { duration: enter.duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [expandedCard, panelHeight, incomeChartProgress, expenseChartProgress,
    incomeChartOffset, expenseChartOffset, resetExpenseCategory, resetIncomeCategory]);

  const handleToggleIncome = useCallback(() => toggleCard('income'), [toggleCard]);
  const handleToggleExpense = useCallback(() => toggleCard('expense'), [toggleCard]);

  // Convert-toggle hint bubble: fade in on long-press, auto-dismiss after a beat.
  const hideToggleHint = useCallback(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    hintOpacity.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(setHintVisible)(false);
    });
  }, [hintOpacity]);

  const showToggleHint = useCallback(() => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHintVisible(true);
    hintOpacity.value = withTiming(1, { duration: 160 });
    hintTimerRef.current = setTimeout(hideToggleHint, 2600);
  }, [hintOpacity, hideToggleHint]);

  useEffect(() => () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
  }, []);

  const hintAnimStyle = useAnimatedStyle(() => ({ opacity: hintOpacity.value }));


  // Chart heights are re-reported by onContentSizeChange whenever the content or
  // the available width changes, so rotation needs no special handling here.
  const panelAnimStyle = useAnimatedStyle(() => ({ height: panelHeight.value }));

  const incomeChartAnimStyle = useAnimatedStyle(() => {
    const p = incomeChartProgress.value;
    const { y, scale } = incomeChartOffset.value;
    return {
      opacity: p,
      transform: [
        { translateY: interpolate(p, [0, 1], [y, 0]) },
        { scale: interpolate(p, [0, 1], [scale, 1]) },
      ],
    };
  });

  const expenseChartAnimStyle = useAnimatedStyle(() => {
    const p = expenseChartProgress.value;
    const { y, scale } = expenseChartOffset.value;
    return {
      opacity: p,
      transform: [
        { translateY: interpolate(p, [0, 1], [y, 0]) },
        { scale: interpolate(p, [0, 1], [scale, 1]) },
      ],
    };
  });

  // Keeps the panel sized to whatever the visible chart currently measures —
  // covers the first measurement and every drill-down that changes its height.
  const handleChartMeasured = useCallback((card, contentHeight) => {
    const target = Math.min(contentHeight, MAX_CHART_HEIGHT);
    const ref = card === 'income' ? incomeChartHeightRef : expenseChartHeightRef;
    if (ref.current === target) return;
    ref.current = target;
    if (expandedCard === card) {
      panelHeight.value = withTiming(CARD_HEADER_HEIGHT + target, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [expandedCard, panelHeight]);

  // The drill-down chips live inside their chart (under the donut), not over the
  // tab strip where they used to cover the tab's own title. They stay outside the
  // tab button regardless — a button nested in a button reads as two controls to
  // a screen reader. Each chart decides where to place the node it is handed.
  const incomeCategoryChip = selectedIncomeCategoryName ? (
    <CategoryBackChip
      testID="income-category-chip"
      colors={colors}
      label={selectedIncomeCategoryName}
      backLabel={t('back')}
      onPress={handleBackToIncomeParent}
    />
  ) : null;

  const expenseCategoryChip = selectedCategoryName ? (
    <CategoryBackChip
      testID="expense-category-chip"
      colors={colors}
      label={selectedCategoryName}
      backLabel={t('back')}
      onPress={handleBackToExpenseParent}
    />
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Warn when some account currencies can't be converted to the selected one */}
          {convertAllCurrencies && unconvertedCurrencies.length > 0 && (
            <View style={[styles.convertWarning, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
              <Icon name="alert-outline" size={16} color={colors.mutedText} />
              <Text style={[styles.convertWarningText, { color: colors.mutedText }]}>
                {`${t('graphs_currencies_not_converted')}: ${unconvertedCurrencies.join(', ')}`}
              </Text>
            </View>
          )}

          {/* Income/expense summary — one panel, two tabs. Collapsed by default:
              only the tab strip shows, each tab tappable across its full width. */}
          <Animated.View
            style={[
              styles.summaryPanel,
              panelAnimStyle,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.tabsRow}>
              <IncomeSummaryCard
                colors={colors}
                t={t}
                loadingIncome={loadingIncome}
                totalIncome={totalIncome}
                selectedCurrency={selectedCurrency}
                onPress={handleToggleIncome}
                expanded={expandedCard === 'income'}
              />
              <View style={[styles.tabDivider, { backgroundColor: colors.border }]} />
              <ExpenseSummaryCard
                colors={colors}
                t={t}
                loading={loading}
                totalExpenses={totalExpenses}
                selectedCurrency={selectedCurrency}
                onPress={handleToggleExpense}
                expanded={expandedCard === 'expense'}
              />
            </View>

            {/* Both charts stay mounted and overlap, so they stay measured and
                switching tabs fades through instead of remounting. The closed one is
                pulled out of the accessibility tree too — opacity 0 alone still
                lets TalkBack read its legend. */}
            <Animated.View
              testID="income-chart-content"
              pointerEvents={expandedCard === 'income' ? 'auto' : 'none'}
              accessibilityElementsHidden={expandedCard !== 'income'}
              importantForAccessibility={expandedCard === 'income' ? 'auto' : 'no-hide-descendants'}
              style={[styles.chartContent, incomeChartAnimStyle]}
            >
              <ScrollView
                style={styles.chartScrollView}
                contentContainerStyle={styles.chartScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                onContentSizeChange={(_, h) => handleChartMeasured('income', h)}
              >
                <Animated.View
                  key={selectedIncomeCategory}
                  entering={incomeDrillReq.dir === 'none' ? undefined : incomeDrillReq.dir === 'in' ? SlideInRight.duration(280) : SlideInLeft.duration(280)}
                  exiting={incomeDrillReq.dir === 'none' ? undefined : incomeDrillReq.dir === 'in' ? SlideOutLeft.duration(220) : SlideOutRight.duration(220)}
                >
                  <IncomePieChart
                    colors={colors}
                    t={t}
                    language={language}
                    loadingIncome={loadingIncome}
                    incomeChartData={incomeChartData}
                    selectedCurrency={selectedCurrency}
                    onLegendItemPress={handleIncomeLegendItemPress}
                    isLeafCategory={incomeCategoryIsLeaf}
                    operations={incomeOperations}
                    loadingOperations={loadingIncomeOperations}
                    introKey={chartIntro.key}
                    introDelay={chartIntro.delay}
                    categoryChip={incomeCategoryChip}
                  />
                </Animated.View>
              </ScrollView>
            </Animated.View>

            <Animated.View
              testID="expense-chart-content"
              pointerEvents={expandedCard === 'expense' ? 'auto' : 'none'}
              accessibilityElementsHidden={expandedCard !== 'expense'}
              importantForAccessibility={expandedCard === 'expense' ? 'auto' : 'no-hide-descendants'}
              style={[styles.chartContent, expenseChartAnimStyle]}
            >
              <ScrollView
                style={styles.chartScrollView}
                contentContainerStyle={styles.chartScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                onContentSizeChange={(_, h) => handleChartMeasured('expense', h)}
              >
                <Animated.View
                  key={selectedCategory}
                  entering={expenseDrillReq.dir === 'none' ? undefined : expenseDrillReq.dir === 'in' ? SlideInRight.duration(280) : SlideInLeft.duration(280)}
                  exiting={expenseDrillReq.dir === 'none' ? undefined : expenseDrillReq.dir === 'in' ? SlideOutLeft.duration(220) : SlideOutRight.duration(220)}
                >
                  <ExpensePieChart
                    colors={colors}
                    t={t}
                    language={language}
                    loading={loading}
                    chartData={chartData}
                    selectedCurrency={selectedCurrency}
                    onLegendItemPress={handleExpenseLegendItemPress}
                    isLeafCategory={expenseCategoryIsLeaf}
                    operations={expenseOperations}
                    loadingOperations={loadingExpenseOperations}
                    introKey={chartIntro.key}
                    introDelay={chartIntro.delay}
                    categoryChip={expenseCategoryChip}
                  />
                </Animated.View>
              </ScrollView>
            </Animated.View>
          </Animated.View>

          {/* Balance History Card — shown for a specific month. When no account is
              available, render an explicit empty state instead of silently dropping
              the card, so the user sees an explanation rather than a blank gap
              (QoL-11). Full-year selection intentionally omits this monthly card. */}
          {selectedMonth !== null && (
            selectedAccount ? (
              <BalanceHistoryCard
                colors={colors}
                t={t}
                selectedAccount={selectedAccount}
                onAccountChange={setSelectedAccount}
                accountItems={accountItems}
                loadingBalanceHistory={loadingBalanceHistory}
                balanceHistoryData={balanceHistoryData}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                accounts={accounts}
                spendingPrediction={spendingPrediction}
                isCurrentMonth={isCurrentMonth}
                closeLabel={t('close')}
                onShowCalendar={handleShowCalendar}
                balanceHistoryTableData={balanceHistoryTableData}
                editingBalanceValue={editingBalanceValue}
                onEditingBalanceValueChange={setEditingBalanceValue}
                onEditBalance={handleEditBalance}
                onCancelEdit={handleCancelEdit}
                onSaveBalance={handleSaveBalance}
                onDeleteBalance={handleDeleteBalance}
              />
            ) : (
              <EmptyState
                icon="chart-line-variant"
                message={t('no_balance_history')}
                testID="balance-history-empty"
              />
            )
          )}

          {/* Category Spending Trend Card - Last 12 Months */}
          <CategorySpendingCard
            colors={colors}
            t={t}
            selectedCurrency={selectedCurrency}
            selectedCategory={selectedCategoryForTrend}
            onCategoryChange={setSelectedCategoryForTrend}
            categories={categories}
            convertAllCurrencies={convertAllCurrencies}
          />
        </View>
      </ScrollView>

      {/* Floating currency wheel FAB */}
      {currencyItems.length > 0 && (
        <View style={[styles.fabWheel, styles.fabWheelLeft, { backgroundColor: colors.surface + 'DE', borderColor: colors.border + '80' }]}>
          <WheelPicker
            data={currencyItems}
            value={selectedCurrency}
            onValueChanged={({ item }) => item && setSelectedCurrency(item.value)}
            itemHeight={28}
            visibleItemCount={3}
            itemTextStyle={[styles.wheelItemText, { color: colors.text }]}
            overlayItemStyle={[styles.wheelOverlayItem, { backgroundColor: colors.selected }]}
            enableScrollByTapOnItem
            keyExtractor={(item, index) => `currency-${index}`}
          />
        </View>
      )}

      {/* Convert-other-currencies toggle — a badge tucked into the currency
          wheel's bottom-right corner. Only useful with more than one currency. */}
      {currencyItems.length > 1 && (
        <TouchableOpacity
          style={[
            styles.fabToggle,
            {
              backgroundColor: convertAllCurrencies ? colors.primary : colors.surface,
              borderColor: convertAllCurrencies ? colors.primary : colors.border,
            },
          ]}
          onPress={() => {
            hideToggleHint();
            setConvertAllCurrencies(v => !v);
          }}
          onLongPress={showToggleHint}
          delayLongPress={280}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: convertAllCurrencies }}
          accessibilityLabel={t('graphs_convert_currencies')}
        >
          <Icon
            name="cash-sync"
            size={18}
            color={convertAllCurrencies ? colors.surface : colors.mutedText}
          />
        </TouchableOpacity>
      )}

      {/* Floating period wheel FAB with chevron navigation (QoL-9) */}
      {periodItems.length > 0 && (() => {
        const currentIndex = periodItems.findIndex((i) => i.value === selectedPeriod);
        const currentPeriodValue = `${now.getFullYear()}-${now.getMonth()}`;
        // periodItems is sorted newest-first, so a newer period is a lower index
        // and an older one a higher index. Chevron-up steps newer, down steps older.
        const canGoNewer = currentIndex > 0;
        const canGoOlder = currentIndex >= 0 && currentIndex < periodItems.length - 1;
        const isCurrentPeriod = selectedPeriod === currentPeriodValue;
        return (
          <View style={[styles.fabWheel, styles.fabWheelRight, { backgroundColor: colors.surface + 'DE', borderColor: colors.border + '80' }]}>
            <TouchableOpacity
              style={styles.periodChevron}
              onPress={() => { if (canGoNewer) setSelectedPeriod(periodItems[currentIndex - 1].value); }}
              disabled={!canGoNewer}
              testID="period-chevron-newer"
              accessibilityRole="button"
              accessibilityLabel={t('next_period')}
              accessibilityState={{ disabled: !canGoNewer }}
            >
              <Icon name="chevron-up" size={22} color={canGoNewer ? colors.text : colors.mutedText + '55'} />
            </TouchableOpacity>

            <WheelPicker
              data={periodItems}
              value={selectedPeriod}
              onValueChanged={({ item }) => item && setSelectedPeriod(item.value)}
              itemHeight={28}
              visibleItemCount={3}
              itemTextStyle={[styles.wheelItemText, { color: colors.text }]}
              overlayItemStyle={[styles.wheelOverlayItem, { backgroundColor: colors.selected }]}
              enableScrollByTapOnItem
              keyExtractor={(item, index) => `period-${index}`}
            />

            <TouchableOpacity
              style={styles.periodChevron}
              onPress={() => { if (canGoOlder) setSelectedPeriod(periodItems[currentIndex + 1].value); }}
              disabled={!canGoOlder}
              testID="period-chevron-older"
              accessibilityRole="button"
              accessibilityLabel={t('previous_period')}
              accessibilityState={{ disabled: !canGoOlder }}
            >
              <Icon name="chevron-down" size={22} color={canGoOlder ? colors.text : colors.mutedText + '55'} />
            </TouchableOpacity>

            {!isCurrentPeriod && (
              <TouchableOpacity
                style={[styles.periodTodayButton, { borderTopColor: colors.border + '80' }]}
                onPress={() => setSelectedPeriod(currentPeriodValue)}
                testID="period-jump-current"
                accessibilityRole="button"
                accessibilityLabel={t('jump_to_current_period')}
              >
                <Icon name="calendar-today" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        );
      })()}

      {/* Long-press hint for the convert-currencies toggle */}
      {hintVisible && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toggleHint, hintAnimStyle, { backgroundColor: colors.text }]}
        >
          <Text style={[styles.toggleHintText, { color: colors.background }]} numberOfLines={2}>
            {t('graphs_convert_currencies')}
          </Text>
        </Animated.View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  chartContent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: CARD_HEADER_HEIGHT,
  },
  chartScrollContent: {
    paddingBottom: 24,
    paddingLeft: 3,
    paddingRight: 9,
    paddingTop: 4,
  },
  chartScrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: TOP_CONTENT_SPACING,
    paddingTop: TOP_CONTENT_SPACING + 4,
  },
  convertWarning: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  convertWarningText: {
    flex: 1,
    fontSize: 12,
  },
  fabToggle: {
    // A compact badge tucked into the currency wheel's bottom-right corner —
    // rendered after the wheel with higher elevation/zIndex so it sits on top.
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    bottom: 104,
    elevation: 12,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 146,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    width: 32,
    zIndex: 2,
  },
  fabWheel: {
    borderRadius: 16,
    borderWidth: 1,
    bottom: 116,
    elevation: 8,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabWheelLeft: {
    borderRadius: 40,
    right: 152,
    width: 80,
  },
  fabWheelRight: {
    borderRadius: 40,
    right: 16,
    width: 120,
  },
  periodChevron: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  periodTodayButton: {
    alignItems: 'center',
    borderTopWidth: 1,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  scrollContent: {
    paddingBottom: 180,
  },
  scrollView: {
    flex: 1,
  },
  summaryPanel: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  tabDivider: {
    marginVertical: 10,
    width: StyleSheet.hairlineWidth,
  },
  tabsRow: {
    flexDirection: 'row',
    height: CARD_HEADER_HEIGHT,
  },
  toggleHint: {
    borderRadius: 10,
    bottom: 210,
    elevation: 14,
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    zIndex: 3,
  },
  toggleHintText: {
    fontSize: 13,
    fontWeight: '500',
  },
  wheelItemText: {
    fontSize: 14,
  },
  wheelOverlayItem: {
    borderRadius: 8,
  },
});

export default GraphsScreen;
