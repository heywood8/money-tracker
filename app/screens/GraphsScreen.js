import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS, Easing, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { TOP_CONTENT_SPACING } from '../styles/layout';
import { getAvailableMonths } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatAmount } from '../services/currency';
import currenciesJson from '../../assets/currencies.json';
import BalanceHistoryCard from '../components/graphs/BalanceHistoryCard';
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
const CARD_GAP = 8;

const GraphsScreen = () => {
  const { colors } = useThemeColors();
  const { t, language } = useLocalization();
  const { accounts } = useAccountsData();

  const { width: windowWidth } = useWindowDimensions();
  const rowWidth = windowWidth - TOP_CONTENT_SPACING * 2;
  const halfWidth = (rowWidth - CARD_GAP) / 2;

  // Get current month and year
  const now = new Date();
  // Combined period state: "YYYY-MM" for specific month or "YYYY-full" for full year
  const [selectedPeriod, setSelectedPeriod] = useState(`${now.getFullYear()}-${now.getMonth()}`);
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [topLevelIncomeCategories, setTopLevelIncomeCategories] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedCategoryForTrend, setSelectedCategoryForTrend] = useState(null);


  // Account selection state
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Inline chart expansion state
  // null = neither expanded, 'income' | 'expense' = that card is expanded/expanding
  const [expandedCard, setExpandedCard] = useState(null);
  // Reanimated shared values — all run on UI thread, immune to JS contention
  // Sequential animation: width first, then height
  // 0=collapsed, 1=expanded; drives width/opacity (phase 1)
  const widthProgress = useSharedValue(0);
  // 0=collapsed, 1=expanded; drives height (phase 2)
  const heightProgress = useSharedValue(0);
  // 0=hidden, 1=visible; drives chart content opacity + slide (phase 2)
  const chartProgress = useSharedValue(0);
  // 0=none, 1=income expanding, 2=expense expanding
  const expandingCard = useSharedValue(0);
  // Dimension values updated on orientation change
  const halfWidthSV = useSharedValue(halfWidth);
  const rowWidthSV = useSharedValue(rowWidth);
  // Dynamic chart heights — updated by onContentSizeChange on each chart's ScrollView
  const expenseChartHeightSV = useSharedValue(0);
  const incomeChartHeightSV = useSharedValue(0);
  const expenseHeightInitialized = useRef(false);
  const incomeHeightInitialized = useRef(false);
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
  } = useExpenseData(selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors, t);

  const {
    incomeChartData,
    loadingIncome,
    loadIncomeData,
    totalIncome,
  } = useIncomeData(selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors, t);

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
    if (expandedCard === card) {
      // Reset category first, then collapse
      if (card === 'expense') {
        resetExpenseCategory();
      } else {
        resetIncomeCategory();
      }
      // Collapse: fade chart + shrink height first (180ms), then restore width (200ms)
      chartProgress.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) });
      heightProgress.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) {
          widthProgress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (done) => {
            if (done) {
              expandingCard.value = 0;
              runOnJS(setExpandedCard)(null);
            }
          });
        }
      });
    } else {
      // Expand phase 1: animate width (200ms), then phase 2: animate height + chart (280ms)
      widthProgress.value = 0;
      heightProgress.value = 0;
      chartProgress.value = 0;
      expandingCard.value = card === 'income' ? 1 : 2;
      setExpandedCard(card);
      widthProgress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) {
          heightProgress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
          chartProgress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
        }
      });
    }
  }, [expandedCard, widthProgress, heightProgress, chartProgress, expandingCard,
    resetExpenseCategory, resetIncomeCategory]);

  const handleToggleIncome = useCallback(() => toggleCard('income'), [toggleCard]);
  const handleToggleExpense = useCallback(() => toggleCard('expense'), [toggleCard]);


  // Reset expansion and update dimension shared values on orientation change
  useEffect(() => {
    halfWidthSV.value = halfWidth;
    rowWidthSV.value = rowWidth;
    widthProgress.value = 0;
    heightProgress.value = 0;
    chartProgress.value = 0;
    expandingCard.value = 0;
    setExpandedCard(null);
  }, [windowWidth]); // intentionally omit stable shared value refs

  // Animated styles via Reanimated — all run on UI thread, no JS contention
  const incomeCardAnimStyle = useAnimatedStyle(() => {
    const ev = expandingCard.value;
    const wp = widthProgress.value;
    const hp = heightProgress.value;
    const hw = halfWidthSV.value;
    const rw = rowWidthSV.value;
    const chartH = incomeChartHeightSV.value;
    if (ev === 1) {
      return {
        width: interpolate(wp, [0, 1], [hw, rw]),
        height: interpolate(hp, [0, 1], [CARD_HEADER_HEIGHT, CARD_HEADER_HEIGHT + chartH]),
        opacity: 1,
      };
    }
    if (ev === 2) {
      return {
        width: interpolate(wp, [0, 1], [hw, 0]),
        height: CARD_HEADER_HEIGHT,
        opacity: interpolate(wp, [0, 1], [1, 0]),
      };
    }
    return { width: hw, height: CARD_HEADER_HEIGHT, opacity: 1 };
  });

  const expenseCardAnimStyle = useAnimatedStyle(() => {
    const ev = expandingCard.value;
    const wp = widthProgress.value;
    const hp = heightProgress.value;
    const hw = halfWidthSV.value;
    const rw = rowWidthSV.value;
    const chartH = expenseChartHeightSV.value;
    if (ev === 2) {
      return {
        width: interpolate(wp, [0, 1], [hw, rw]),
        height: interpolate(hp, [0, 1], [CARD_HEADER_HEIGHT, CARD_HEADER_HEIGHT + chartH]),
        opacity: 1,
      };
    }
    if (ev === 1) {
      return {
        width: interpolate(wp, [0, 1], [hw, 0]),
        height: CARD_HEADER_HEIGHT,
        opacity: interpolate(wp, [0, 1], [1, 0]),
      };
    }
    return { width: hw, height: CARD_HEADER_HEIGHT, opacity: 1 };
  });

  const spacerAnimStyle = useAnimatedStyle(() => {
    if (expandingCard.value !== 0) {
      return { width: interpolate(widthProgress.value, [0, 1], [CARD_GAP, 0]) };
    }
    return { width: CARD_GAP };
  });

  const chartContentAnimStyle = useAnimatedStyle(() => ({
    opacity: chartProgress.value,
    transform: [{ translateY: interpolate(chartProgress.value, [0, 1], [16, 0]) }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Summary Cards Row — always-mounted, width/height driven by Animated */}
          <View style={styles.summaryCardsRow}>
            {/* Income card */}
            <Animated.View
              style={[
                styles.summaryCardBase,
                incomeCardAnimStyle,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <IncomeSummaryCard
                  colors={colors}
                  t={t}
                  loadingIncome={loadingIncome}
                  totalIncome={totalIncome}
                  selectedCurrency={selectedCurrency}
                  onPress={handleToggleIncome}
                  expanded={expandedCard === 'income'}
                  categoryName={selectedIncomeCategoryName}
                  onBack={handleBackToIncomeParent}
                />
              </View>
              <Animated.View
                testID="income-chart-content"
                style={[styles.chartContent, chartContentAnimStyle]}
              >
                <ScrollView
                  style={styles.chartScrollView}
                  contentContainerStyle={styles.chartScrollContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={(_, h) => {
                    const target = Math.min(h, MAX_CHART_HEIGHT);
                    if (!incomeHeightInitialized.current) {
                      incomeChartHeightSV.value = target;
                      incomeHeightInitialized.current = true;
                    } else {
                      incomeChartHeightSV.value = withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) });
                    }
                  }}
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
                    />
                  </Animated.View>
                </ScrollView>
              </Animated.View>
            </Animated.View>

            {/* Spacer that collapses as one card expands */}
            <Animated.View style={spacerAnimStyle} />

            {/* Expense card */}
            <Animated.View
              style={[
                styles.summaryCardBase,
                expenseCardAnimStyle,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <ExpenseSummaryCard
                  colors={colors}
                  t={t}
                  loading={loading}
                  totalExpenses={totalExpenses}
                  selectedCurrency={selectedCurrency}
                  onPress={handleToggleExpense}
                  expanded={expandedCard === 'expense'}
                  categoryName={selectedCategoryName}
                  onBack={handleBackToExpenseParent}
                />
              </View>
              <Animated.View
                testID="expense-chart-content"
                style={[styles.chartContent, chartContentAnimStyle]}
              >
                <ScrollView
                  style={styles.chartScrollView}
                  contentContainerStyle={styles.chartScrollContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={(_, h) => {
                    const target = Math.min(h, MAX_CHART_HEIGHT);
                    if (!expenseHeightInitialized.current) {
                      expenseChartHeightSV.value = target;
                      expenseHeightInitialized.current = true;
                    } else {
                      expenseChartHeightSV.value = withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) });
                    }
                  }}
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
                    />
                  </Animated.View>
                </ScrollView>
              </Animated.View>
            </Animated.View>
          </View>

          {/* Balance History Card */}
          {selectedMonth !== null && selectedAccount && (
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
          )}

          {/* Category Spending Trend Card - Last 12 Months */}
          <CategorySpendingCard
            colors={colors}
            t={t}
            selectedCurrency={selectedCurrency}
            selectedCategory={selectedCategoryForTrend}
            onCategoryChange={setSelectedCategoryForTrend}
            categories={categories}
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

      {/* Floating period wheel FAB */}
      {periodItems.length > 0 && (
        <View style={[styles.fabWheel, styles.fabWheelRight, { backgroundColor: colors.surface + 'DE', borderColor: colors.border + '80' }]}>
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
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  cardHeader: {
    height: CARD_HEADER_HEIGHT,
  },
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
  scrollContent: {
    paddingBottom: 180,
  },
  scrollView: {
    flex: 1,
  },
  summaryCardBase: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryCardsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  wheelItemText: {
    fontSize: 14,
  },
  wheelOverlayItem: {
    borderRadius: 8,
  },
});

export default GraphsScreen;
