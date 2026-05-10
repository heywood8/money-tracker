import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform, Animated, Easing, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { TOP_CONTENT_SPACING } from '../styles/layout';
import { getAvailableMonths } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { formatAmount } from '../services/currency';
import currenciesJson from '../../assets/currencies.json';
import SimplePicker from '../components/SimplePicker';
import BalanceHistoryCard from '../components/graphs/BalanceHistoryCard';
import CategorySpendingCard from '../components/graphs/CategorySpendingCard';
import ExpenseSummaryCard from '../components/graphs/ExpenseSummaryCard';
import IncomeSummaryCard from '../components/graphs/IncomeSummaryCard';
import IncomePieChart from '../components/graphs/IncomePieChart';
import ExpensePieChart from '../components/graphs/ExpensePieChart';
import useExpenseData from '../hooks/useExpenseData';
import useIncomeData from '../hooks/useIncomeData';
import useBalanceHistory from '../hooks/useBalanceHistory';

const CARD_HEADER_HEIGHT = 56;
const CHART_HEIGHT = 300;
const CARD_GAP = 8;

const GraphsScreen = () => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
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
  // animValue: 0 = collapsed, 1 = expanded (drives width, height, opacity on JS thread)
  const animValue = useRef(new Animated.Value(0)).current;
  // chartContentAnim: 0 = hidden, 1 = visible (drives chart content on native thread)
  const chartContentAnim = useRef(new Animated.Value(0)).current;

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
  } = useExpenseData(selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors, t, selectedAccount);

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

  // Handlers for legend item clicks
  const handleExpenseLegendItemPress = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
  }, []);

  const handleIncomeLegendItemPress = useCallback((categoryId) => {
    setSelectedIncomeCategory(categoryId);
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
  const categoryItems = useMemo(() => [
    { label: t('all'), value: 'all' },
    ...topLevelCategories.map(cat => ({ label: cat.name, value: cat.id })),
  ], [topLevelCategories, t]);

  const incomeCategoryItems = useMemo(() => [
    { label: t('all'), value: 'all' },
    ...topLevelIncomeCategories.map(cat => ({ label: cat.name, value: cat.id })),
  ], [topLevelIncomeCategories, t]);

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

    return items;
  }, [availableYears, availableMonths, t, monthKeys]);

  // Calculate spending prediction
  const spendingPrediction = useMemo(() => {
    if (totalExpenses === 0) {
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

    // Calculate days elapsed (from 1st to today, excluding current day)
    const currentDay = now.getDate();
    const daysElapsed = currentDay - 1;

    // If it's the first day, we can't make a good prediction yet
    if (daysElapsed < 1) {
      return null;
    }

    // Calculate daily average
    const dailyAverage = totalExpenses / daysElapsed;

    // Predict total spending by month end
    const predictedTotal = dailyAverage * daysInMonth;

    // Calculate percentage of month elapsed
    const percentElapsed = (daysElapsed / daysInMonth) * 100;

    return {
      currentSpending: totalExpenses,
      predictedTotal,
      predictedRemaining: predictedTotal - totalExpenses,
      dailyAverage,
      daysElapsed,
      daysInMonth,
      percentElapsed,
    };
  }, [totalExpenses, selectedYear, selectedMonth]);

  // Calculate if the selected period is the current month
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  }, [selectedYear, selectedMonth]);

  // Shared category parent lookup
  const getParentCategoryId = useCallback((categoryId) => {
    if (categoryId === 'all') return 'all';
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return 'all';
    if (category.parentId === null) return 'all';
    return category.parentId;
  }, [categories]);

  const handleBackToIncomeParent = useCallback(() => {
    setSelectedIncomeCategory(prev => getParentCategoryId(prev));
  }, [getParentCategoryId]);

  const handleBackToExpenseParent = useCallback(() => {
    setSelectedCategory(prev => getParentCategoryId(prev));
  }, [getParentCategoryId]);

  const toggleCard = useCallback((card) => {
    if (expandedCard === card) {
      // Collapse: fade chart content first (native thread), then shrink layout (JS thread)
      Animated.parallel([
        Animated.timing(chartContentAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(animValue, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ]).start(() => setExpandedCard(null));
    } else {
      // Expand: reset anim values, set the new expanded card, let useEffect trigger animation
      animValue.setValue(0);
      chartContentAnim.setValue(0);
      setExpandedCard(card);
    }
  }, [expandedCard, animValue, chartContentAnim]);

  const handleToggleIncome = useCallback(() => toggleCard('income'), [toggleCard]);
  const handleToggleExpense = useCallback(() => toggleCard('expense'), [toggleCard]);

  // Trigger expand animation after expandedCard state and interpolations are in place
  useEffect(() => {
    if (expandedCard !== null) {
      Animated.parallel([
        Animated.timing(animValue, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(chartContentAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [expandedCard]); // intentionally omit animValue/chartContentAnim — stable refs

  // Reset expansion if screen dimensions change (orientation change) to avoid stale widths
  useEffect(() => {
    animValue.setValue(0);
    chartContentAnim.setValue(0);
    setExpandedCard(null);
  }, [windowWidth]); // intentionally omit animValue/chartContentAnim — stable refs

  // Animated style values for the two card containers
  const incomeCardAnimStyle = {
    width: expandedCard === 'expense'
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, 0] })
      : expandedCard === 'income'
        ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, rowWidth - CARD_GAP] })
        : halfWidth,
    height: expandedCard === 'income'
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [CARD_HEADER_HEIGHT, CARD_HEADER_HEIGHT + CHART_HEIGHT] })
      : CARD_HEADER_HEIGHT,
    opacity: expandedCard === 'expense'
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
      : 1,
  };

  const expenseCardAnimStyle = {
    width: expandedCard === 'income'
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, 0] })
      : expandedCard === 'expense'
        ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, rowWidth - CARD_GAP] })
        : halfWidth,
    height: expandedCard === 'expense'
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [CARD_HEADER_HEIGHT, CARD_HEADER_HEIGHT + CHART_HEIGHT] })
      : CARD_HEADER_HEIGHT,
    opacity: expandedCard === 'income'
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
      : 1,
  };

  const spacerAnimStyle = {
    width: expandedCard !== null
      ? animValue.interpolate({ inputRange: [0, 1], outputRange: [CARD_GAP, 0] })
      : CARD_GAP,
  };

  const chartContentAnimStyle = {
    opacity: chartContentAnim,
    transform: [{ translateY: chartContentAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Filters Row */}
          <View style={styles.filtersRow}>
            {/* Currency Picker */}
            <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SimplePicker
                value={selectedCurrency}
                onValueChange={setSelectedCurrency}
                items={currencyItems}
                colors={colors}
                leftText={selectedCurrencySymbol}
              />
            </View>

            {/* Period Picker (Combined Month + Year) */}
            <View style={[styles.periodPickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SimplePicker
                value={selectedPeriod}
                onValueChange={setSelectedPeriod}
                items={periodItems}
                colors={colors}
                leftIcon="calendar-month"
              />
            </View>
          </View>

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
                />
              </View>
              <Animated.View
                testID="income-chart-content"
                style={[styles.chartContent, chartContentAnimStyle]}
              >
                {selectedIncomeCategory !== 'all' && (
                  <View style={styles.chartNavRow}>
                    <TouchableOpacity
                      onPress={handleBackToIncomeParent}
                      style={styles.chartNavBack}
                      accessibilityRole="button"
                      accessibilityLabel={t('back')}
                    >
                      <Icon name="arrow-left" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <View style={[styles.chartNavPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <SimplePicker
                        value={selectedIncomeCategory}
                        onValueChange={setSelectedIncomeCategory}
                        items={incomeCategoryItems}
                        colors={colors}
                      />
                    </View>
                  </View>
                )}
                <IncomePieChart
                  colors={colors}
                  t={t}
                  loadingIncome={loadingIncome}
                  incomeChartData={incomeChartData}
                  selectedCurrency={selectedCurrency}
                  onLegendItemPress={handleIncomeLegendItemPress}
                  selectedIncomeCategory={selectedIncomeCategory}
                />
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
                />
              </View>
              <Animated.View
                testID="expense-chart-content"
                style={[styles.chartContent, chartContentAnimStyle]}
              >
                {selectedCategory !== 'all' && (
                  <View style={styles.chartNavRow}>
                    <TouchableOpacity
                      onPress={handleBackToExpenseParent}
                      style={styles.chartNavBack}
                      accessibilityRole="button"
                      accessibilityLabel={t('back')}
                    >
                      <Icon name="arrow-left" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <View style={[styles.chartNavPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <SimplePicker
                        value={selectedCategory}
                        onValueChange={setSelectedCategory}
                        items={categoryItems}
                        colors={colors}
                      />
                    </View>
                  </View>
                )}
                <ExpensePieChart
                  colors={colors}
                  t={t}
                  loading={loading}
                  chartData={chartData}
                  selectedCurrency={selectedCurrency}
                  onLegendItemPress={handleExpenseLegendItemPress}
                  selectedCategory={selectedCategory}
                />
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
    paddingBottom: 8,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
    top: CARD_HEADER_HEIGHT,
  },
  chartNavBack: {
    marginRight: 8,
    padding: 4,
  },
  chartNavPicker: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 40,
    overflow: 'hidden',
  },
  chartNavRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
    marginTop: 4,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: TOP_CONTENT_SPACING,
    paddingTop: TOP_CONTENT_SPACING + 4,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodPickerWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 44,
    overflow: 'hidden',
  },
  pickerWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    minWidth: 110,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingBottom: 180,
  },
  scrollView: {
    flex: 1,
  },
  summaryCardBase: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryCardsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
});

export default GraphsScreen;
