import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, interpolate, Easing, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { BORDER_RADIUS, FONT_SIZE, SPACING, TOP_CONTENT_SPACING } from '../styles/designTokens';
import { getUnconvertibleCurrencies } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatAmount } from '../services/currency';
import currenciesJson from '../../assets/currencies.json';
import EmptyState from '../components/EmptyState';
import MonthPickerSheet from '../components/budgets/MonthPickerSheet';
import PeriodHeader from '../components/PeriodHeader';
import CurrencySheet from '../components/CurrencySheet';
import {
  currentMonthKey, addMonths, formatMonthLabel, yearOf, monthIndexOf,
  fullYearKeyOf, isFullYearKey,
} from '../utils/monthUtils';
import { TIMING_ENTER } from '../utils/motion';
import BalanceHistoryCard from '../components/graphs/BalanceHistoryCard';
import CategoryBackChip from '../components/graphs/CategoryBackChip';
import { chartTransition, CHART_DROP } from '../components/graphs/chartTransitions';
import TrendsCard from '../components/graphs/TrendsCard';
import OperationsHeatmapCard from '../components/graphs/OperationsHeatmapCard';
import ExpenseSummaryCard from '../components/graphs/ExpenseSummaryCard';
import IncomeSummaryCard from '../components/graphs/IncomeSummaryCard';
import IncomePieChart from '../components/graphs/IncomePieChart';
import ExpensePieChart from '../components/graphs/ExpensePieChart';
import useExpenseData from '../hooks/useExpenseData';
import useIncomeData from '../hooks/useIncomeData';
import useCategoryOperations from '../hooks/useCategoryOperations';
import useBalanceHistory from '../hooks/useBalanceHistory';
import { CARD_SURFACE } from '../styles/componentStyles';

const CARD_HEADER_HEIGHT = 56;
const MAX_CHART_HEIGHT = 500;
// Chart-level timings live in chartTransitions.js — these two are the panel's
// own height animation, which runs regardless of which chart is moving.
const PANEL_OPEN_DURATION = 280;
const PANEL_CLOSE_DURATION = 220;

// How far the charts travel when the period changes, and for how long. Same
// values and the same reasoning as the Budgets screen's month transition
// (BudgetScreen.js): a 20dp directional hint, not a page-width slide that would
// read as a second pager on the axis the tab strip already swipes along.
const PERIOD_SHIFT = 20;
const PERIOD_TRANSITION_DURATION = 280;

const GraphsScreen = () => {
  const { colors } = useThemeColors();
  const { t, language } = useLocalization();
  const { accounts } = useAccountsData();

  // The screen is scoped to one period by the ‹ Period › header, which is the
  // Budgets tab's month header with one addition: a period here may be a whole
  // year ("YYYY-full") as well as a month ("YYYY-MM", the shared month-key
  // format from monthUtils).
  //
  // The direction of travel rides along with the key rather than living in its
  // own state, exactly as on Budgets: it is only meaningful for the render the
  // new period causes, and two separate setState calls could batch into an order
  // that animates the wrong way. `dir` is null on the first render, which is what
  // keeps the screen from animating on mount.
  const [periodState, setPeriodState] = useState(() => ({ key: currentMonthKey(), dir: null }));
  const selectedPeriod = periodState.key;
  const isCurrentPeriod = selectedPeriod === currentMonthKey();
  // Reported by the header as it lays out; the scroll content pads its top by
  // this so the charts start below the glass and scroll under it.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [selectedCurrency, setSelectedCurrency] = useState('');
  // When on, operations in other currencies are converted to selectedCurrency at
  // the current rate and folded into the expense/income pie charts and the
  // spending trend, instead of showing only same-currency operations. On by
  // default so multi-currency totals are complete out of the box.
  const [convertAllCurrencies, setConvertAllCurrencies] = useState(true);
  // Account currencies that have no rate (offline or live) to selectedCurrency —
  // their operations are silently excluded from converted totals, so warn.
  const [unconvertedCurrencies, setUnconvertedCurrencies] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [topLevelIncomeCategories, setTopLevelIncomeCategories] = useState([]);
  // null lets the trends card fall back to its own default pair (income vs
  // expenses). Lifted so the pick survives the card unmounting with the panel.
  const [trendSeries, setTrendSeries] = useState(null);


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

  // Derive selectedYear and the 0-based selectedMonth (null for a whole year)
  // from the period key. This must be defined before the hooks that use them.
  const { selectedYear, selectedMonth } = useMemo(() => ({
    selectedYear: yearOf(selectedPeriod),
    selectedMonth: isFullYearKey(selectedPeriod) ? null : monthIndexOf(selectedPeriod),
  }), [selectedPeriod]);

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

  // Stepping the period. A month steps by a month (crossing the year boundary
  // as it must), a whole year steps by a year — the arrows always move by the
  // unit the header currently names, which is the only reading under which
  // "next" means the same thing to the user in both scopes.
  const stepPeriod = useCallback((delta) => setPeriodState(s => ({
    key: isFullYearKey(s.key) ? fullYearKeyOf(yearOf(s.key) + delta) : addMonths(s.key, delta),
    dir: delta,
  })), []);
  const handlePrevPeriod = useCallback(() => stepPeriod(-1), [stepPeriod]);
  const handleNextPeriod = useCallback(() => stepPeriod(1), [stepPeriod]);

  // The screen stays mounted across tab switches, so a user who wanders
  // off-period and comes back later needs a visible way home rather than a
  // silent auto-reset. Direction is read off the keys — they sort as strings,
  // and returning the same object for a tap that changes nothing keeps the
  // charts from re-rendering and re-animating for it.
  const handleJumpToCurrentPeriod = useCallback(() => setPeriodState(s => {
    const key = currentMonthKey();
    return key === s.key ? s : { key, dir: key > s.key ? 1 : -1 };
  }), []);

  const [periodPickerVisible, setPeriodPickerVisible] = useState(false);
  const handleOpenPeriodPicker = useCallback(() => setPeriodPickerVisible(true), []);
  const handleClosePeriodPicker = useCallback(() => setPeriodPickerVisible(false), []);
  const handlePickPeriod = useCallback((key) => setPeriodState(s => (
    key === s.key ? s : { key, dir: key > s.key ? 1 : -1 }
  )), []);

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

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Listen for DATABASE_RESET event to clear data
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, () => {
      console.log('GraphsScreen: Database reset detected, clearing data');
      setCategories([]);
      setTopLevelCategories([]);
      setTopLevelIncomeCategories([]);
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
    });

    return unsubscribe;
  }, [loadCategories]);

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

  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  const handleOpenCurrencyPicker = useCallback(() => setCurrencySheetVisible(true), []);
  const handleCloseCurrencyPicker = useCallback(() => setCurrencySheetVisible(false), []);
  const handleToggleConvert = useCallback(() => setConvertAllCurrencies(v => !v), []);

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

  // Human-readable name of the selected period. It is both the header's title
  // and the scope named by surfaces further down (the heatmap header), so there
  // is one string and one place it is built.
  const selectedPeriodLabel = useMemo(() => (
    isFullYearKey(selectedPeriod)
      ? `${t('full_year')} ${selectedYear}`
      : formatMonthLabel(selectedPeriod, language)
  ), [selectedPeriod, selectedYear, t, language]);

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

  // Changing the period replaces every figure on the screen at once, and until
  // now it did so with no indication of which way through the calendar the user
  // had moved. Driven by a shared value rather than a keyed `entering` view, so
  // the scroll position and the measured chart heights survive the change —
  // remounting the content would reset both. One value drives the fade and the
  // travel; `periodDir` is set, never animated, and is which way this arrival
  // comes from.
  const periodProgress = useSharedValue(1);
  const periodDir = useSharedValue(0);
  useEffect(() => {
    if (periodState.dir === null) return;
    periodDir.value = periodState.dir;
    periodProgress.value = 0;
    periodProgress.value = withTiming(1, { ...TIMING_ENTER, duration: PERIOD_TRANSITION_DURATION });
  }, [periodState, periodProgress, periodDir]);

  const periodTransitionStyle = useAnimatedStyle(() => ({
    opacity: periodProgress.value,
    transform: [{ translateX: (1 - periodProgress.value) * periodDir.value * PERIOD_SHIFT }],
  }));

  // The charts start one gap below the header's solid part and scroll under it
  // from there. Measured rather than assumed: the header is one line whatever
  // it holds, but that line is taller at a large font scale.
  const scrollContentStyle = useMemo(
    () => [styles.content, { paddingTop: headerHeight + SPACING.md }],
    [headerHeight],
  );

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
      {/* The scrolling layer as a whole is what belongs to the period, so it is
          what moves. */}
      <Animated.View style={[styles.contentLayer, periodTransitionStyle]} testID="graphs-period-transition">
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={scrollContentStyle} testID="graphs-content">
            {/* Warn when some account currencies can't be converted to the selected one */}
            {convertAllCurrencies && unconvertedCurrencies.length > 0 && (
              <View style={[styles.convertWarning, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
                <Icon name="alert-outline" size={16} color={colors.mutedText} />
                <Text style={[styles.convertWarningText, { color: colors.mutedText }]}>
                  {`${t('graphs_currencies_not_converted')}: ${unconvertedCurrencies.join(', ')}`}
                </Text>
              </View>
            )}

            {/* Expense/income summary — one panel, two tabs (expense left, income
                right). Collapsed by default: only the tab strip shows, each tab
                tappable across its full width. */}
            <Animated.View
              style={[
                styles.summaryPanel,
                panelAnimStyle,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.tabsRow}>
                <ExpenseSummaryCard
                  colors={colors}
                  t={t}
                  loading={loading}
                  totalExpenses={totalExpenses}
                  selectedCurrency={selectedCurrency}
                  onPress={handleToggleExpense}
                  expanded={expandedCard === 'expense'}
                />
                <View style={[styles.tabDivider, { backgroundColor: colors.border }]} />
                <IncomeSummaryCard
                  colors={colors}
                  t={t}
                  loadingIncome={loadingIncome}
                  totalIncome={totalIncome}
                  selectedCurrency={selectedCurrency}
                  onPress={handleToggleIncome}
                  expanded={expandedCard === 'income'}
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

            {/* Balance History Card. A specific month draws the daily line with its
                burndown norm; a full-year selection draws the same card in its year
                form (weekly samples, month ticks, no norm — the card derives that
                from selectedMonth === null). When no account is available, render an
                explicit empty state instead of silently dropping the card, so the
                user sees an explanation rather than a blank gap (QoL-11). */}
            {selectedAccount ? (
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
                message={selectedMonth === null ? t('no_balance_history_year') : t('no_balance_history')}
                testID="balance-history-empty"
              />
            )}

            {/* Income/expense trends over the ledger's whole history */}
            <TrendsCard
              colors={colors}
              t={t}
              selectedCurrency={selectedCurrency}
              selectedSeries={trendSeries}
              onSeriesChange={setTrendSeries}
              categories={categories}
              convertAllCurrencies={convertAllCurrencies}
            />

            {/* Operations location heatmap — an inert row until tapped; the
                fullscreen map (and its DB/tile loading) mounts only on open. */}
            <OperationsHeatmapCard
              colors={colors}
              t={t}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              periodLabel={selectedPeriodLabel}
            />
          </View>
        </ScrollView>
      </Animated.View>
      {/* Sticky period header — the same one the Budgets tab wears
          (components/PeriodHeader), with the whole year added to what a period
          can be. A glass overlay outside the ScrollView, so the scope of
          everything below stays on screen while the charts scroll under it. It
          replaced the two floating wheels that used to state that scope: those
          sat over the content permanently, obscured the bottom of the last card,
          and put the screen's two most consequential controls in the corner
          farthest from where their effect was read. Rendered after the scroll
          layer because it draws over it. */}
      <PeriodHeader
        label={selectedPeriodLabel}
        onPrev={handlePrevPeriod}
        onNext={handleNextPeriod}
        prevLabel={t('previous_period')}
        nextLabel={t('next_period')}
        onPressTitle={handleOpenPeriodPicker}
        titleLabel={`${t('select_period')}: ${selectedPeriodLabel}`}
        titleActive={periodPickerVisible}
        showJumpToCurrent={!isCurrentPeriod}
        onJumpToCurrent={handleJumpToCurrentPeriod}
        jumpLabel={t('jump_to_current_period')}
        currencies={currencies}
        selectedCurrency={selectedCurrency}
        onPressCurrency={handleOpenCurrencyPicker}
        currencyActive={currencySheetVisible}
        currencyLabel={`${t('currency')}: ${selectedCurrency}`}
        colors={colors}
        onHeightChange={setHeaderHeight}
        testIDPrefix="graphs-period"
      />

      <MonthPickerSheet
        visible={periodPickerVisible}
        monthKey={selectedPeriod}
        onSelect={handlePickPeriod}
        onClose={handleClosePeriodPicker}
        colors={colors}
        t={t}
        language={language}
        allowFullYear
        testIDPrefix="graphs-period-picker"
      />

      <CurrencySheet
        visible={currencySheetVisible}
        codes={currencies}
        selectedCurrency={selectedCurrency}
        onSelect={setSelectedCurrency}
        onClose={handleCloseCurrencyPicker}
        colors={colors}
        t={t}
        title={t('currency')}
        convertAll={convertAllCurrencies}
        onToggleConvert={handleToggleConvert}
        testIDPrefix="graphs-currency"
      />

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
  },
  // The animated wrapper sits between the screen's column and the ScrollView, so
  // it has to pass the remaining height through or the list collapses to nothing.
  contentLayer: {
    flex: 1,
  },
  convertWarning: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  convertWarningText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
  },
  scrollContent: {
    paddingBottom: 180,
  },
  scrollView: {
    flex: 1,
  },
  summaryPanel: {
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
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
});

export default GraphsScreen;
