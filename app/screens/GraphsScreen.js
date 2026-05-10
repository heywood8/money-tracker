import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, UIManager, Platform } from 'react-native';
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

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const GraphsScreen = () => {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { accounts } = useAccountsData();

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
  const [incomeChartExpanded, setIncomeChartExpanded] = useState(false);
  const [expenseChartExpanded, setExpenseChartExpanded] = useState(false);

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

  // Income chart inline expansion
  const toggleIncomeChart = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIncomeChartExpanded(prev => !prev);
  }, []);

  const handleBackToIncomeParent = useCallback(() => {
    setSelectedIncomeCategory(prev => getParentCategoryId(prev));
  }, [getParentCategoryId]);

  // Expense chart inline expansion
  const toggleExpenseChart = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpenseChartExpanded(prev => !prev);
  }, []);

  const handleBackToExpenseParent = useCallback(() => {
    setSelectedCategory(prev => getParentCategoryId(prev));
  }, [getParentCategoryId]);

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

          {/* Income and Expenses Summary Cards - side by side */}
          <View style={styles.summaryCardsRow}>
            <IncomeSummaryCard
              colors={colors}
              t={t}
              loadingIncome={loadingIncome}
              totalIncome={totalIncome}
              selectedCurrency={selectedCurrency}
              onPress={toggleIncomeChart}
              expanded={incomeChartExpanded}
            />
            <ExpenseSummaryCard
              colors={colors}
              t={t}
              loading={loading}
              totalExpenses={totalExpenses}
              selectedCurrency={selectedCurrency}
              onPress={toggleExpenseChart}
              expanded={expenseChartExpanded}
            />
          </View>

          {/* Inline Income Pie Chart (expands on card tap) */}
          {incomeChartExpanded && (
            <View style={[styles.incomeChartPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {selectedIncomeCategory !== 'all' && (
                <View style={styles.incomePanelHeader}>
                  <TouchableOpacity
                    onPress={handleBackToIncomeParent}
                    style={styles.incomePanelBackButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('back')}
                  >
                    <Icon name="arrow-left" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={[styles.incomePanelPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
            </View>
          )}

          {/* Inline Expense Pie Chart (expands on card tap) */}
          {expenseChartExpanded && (
            <View style={[styles.expenseChartPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {selectedCategory !== 'all' && (
                <View style={styles.expensePanelHeader}>
                  <TouchableOpacity
                    onPress={handleBackToExpenseParent}
                    style={styles.expensePanelBackButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('back')}
                  >
                    <Icon name="arrow-left" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <View style={[styles.expensePanelPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
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
            </View>
          )}

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
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  incomeChartPanel: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  incomePanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  incomePanelBackButton: {
    marginRight: 8,
    padding: 4,
  },
  incomePanelPicker: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 40,
    overflow: 'hidden',
  },
  expenseChartPanel: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  expensePanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  expensePanelBackButton: {
    marginRight: 8,
    padding: 4,
  },
  expensePanelPicker: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 40,
    overflow: 'hidden',
  },
});

export default GraphsScreen;
