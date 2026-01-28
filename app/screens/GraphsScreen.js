import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccountsData } from '../contexts/AccountsDataContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING } from '../styles/layout';
import { getAvailableMonths } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import SimplePicker from '../components/SimplePicker';
import BalanceHistoryCard from '../components/graphs/BalanceHistoryCard';
import CategorySpendingCard from '../components/graphs/CategorySpendingCard';
import ExpenseSummaryCard from '../components/graphs/ExpenseSummaryCard';
import IncomeSummaryCard from '../components/graphs/IncomeSummaryCard';
import ChartModal from '../components/graphs/ChartModal';
import BalanceHistoryModal from '../components/graphs/BalanceHistoryModal';
import useExpenseData from '../hooks/useExpenseData';
import useIncomeData from '../hooks/useIncomeData';
import useBalanceHistory from '../hooks/useBalanceHistory';

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
  const [balanceHistoryModalVisible, setBalanceHistoryModalVisible] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' or 'income'

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
    editingBalanceRow,
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

  // Initialize default account (display_order=0)
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      const defaultAccount = accounts.find(acc => acc.displayOrder === 0) || accounts[0];
      setSelectedAccount(defaultAccount.id);
    } else if (accounts.length === 0 && selectedAccount) {
      setSelectedAccount(null);
    }
  }, [accounts, selectedAccount]);

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
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
    };
    loadCategories();
  }, []);

  // Load available months from database
  useEffect(() => {
    const loadAvailableMonths = async () => {
      try {
        const months = await getAvailableMonths();
        setAvailableMonths(months);
      } catch (error) {
        console.error('Failed to load available months:', error);
      }
    };
    loadAvailableMonths();
  }, []);





  // Open balance history modal with table data
  const handleBalanceHistoryPress = useCallback(async () => {
    const result = await loadBalanceHistoryTable();
    if (result) {
      setBalanceHistoryModalVisible(true);
    }
  }, [loadBalanceHistoryTable]);

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

  const accountItems = useMemo(() =>
    accounts.map(acc => ({ label: acc.name, value: acc.id })),
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

  // Calculate spending prediction (excluding categories marked as excluded from forecast)
  const spendingPrediction = useMemo(() => {
    // Filter out expenses from categories that are excluded from forecast
    const categoryMap = new Map();
    categories.forEach(cat => {
      categoryMap.set(cat.id, cat);
    });

    // Calculate total expenses for forecast using forecastAmount (which excludes excluded categories)
    const totalExpensesForForecast = chartData.reduce((sum, item) => {
      // Use forecastAmount if available (which already has excluded categories removed),
      // otherwise use amount (for items like balance adjustments that don't have forecastAmount)
      return sum + (item.forecastAmount !== undefined ? item.forecastAmount : item.amount);
    }, 0);

    if (totalExpensesForForecast === 0) {
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
    const dailyAverage = totalExpensesForForecast / daysElapsed;

    // Predict total spending by month end
    const predictedTotal = dailyAverage * daysInMonth;

    // Calculate percentage of month elapsed
    const percentElapsed = (daysElapsed / daysInMonth) * 100;

    return {
      currentSpending: totalExpensesForForecast,
      predictedTotal,
      predictedRemaining: predictedTotal - totalExpensesForForecast,
      dailyAverage,
      daysElapsed,
      daysInMonth,
      percentElapsed,
    };
  }, [chartData, categories, selectedYear, selectedMonth]);

  // Calculate if the selected period is the current month
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  }, [selectedYear, selectedMonth]);

  // Handlers for opening modals
  const openExpenseModal = useCallback(() => {
    setModalType('expense');
    setModalVisible(true);
  }, []);

  const openIncomeModal = useCallback(() => {
    setModalType('income');
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const closeBalanceHistoryModal = useCallback(() => {
    setBalanceHistoryModalVisible(false);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Filters Row */}
          <View style={styles.filtersRow}>
            {/* Currency Picker */}
            <View style={[styles.pickerWrapper, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
              <SimplePicker
                value={selectedCurrency}
                onValueChange={setSelectedCurrency}
                items={currencyItems}
                colors={colors}
              />
            </View>

            {/* Period Picker (Combined Month + Year) */}
            <View style={[styles.periodPickerWrapper, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
              <SimplePicker
                value={selectedPeriod}
                onValueChange={setSelectedPeriod}
                items={periodItems}
                colors={colors}
              />
            </View>
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
              onChartPress={handleBalanceHistoryPress}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              accounts={accounts}
              spendingPrediction={spendingPrediction}
              isCurrentMonth={isCurrentMonth}
            />
          )}

          {/* Expenses and Income Summary Cards - side by side */}
          <View style={styles.summaryCardsRow}>
            <ExpenseSummaryCard
              colors={colors}
              t={t}
              loading={loading}
              totalExpenses={totalExpenses}
              selectedCurrency={selectedCurrency}
              onPress={openExpenseModal}
            />
            <IncomeSummaryCard
              colors={colors}
              t={t}
              loadingIncome={loadingIncome}
              totalIncome={totalIncome}
              selectedCurrency={selectedCurrency}
              onPress={openIncomeModal}
            />
          </View>

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

      {/* Chart Modal */}
      <ChartModal
        visible={modalVisible}
        modalType={modalType}
        colors={colors}
        t={t}
        onClose={closeModal}
        selectedCategory={selectedCategory}
        selectedIncomeCategory={selectedIncomeCategory}
        categoryItems={categoryItems}
        incomeCategoryItems={incomeCategoryItems}
        onCategoryChange={setSelectedCategory}
        onIncomeCategoryChange={setSelectedIncomeCategory}
        categories={categories}
        loading={loading}
        chartData={chartData}
        selectedCurrency={selectedCurrency}
        onExpenseLegendItemPress={handleExpenseLegendItemPress}
        loadingIncome={loadingIncome}
        incomeChartData={incomeChartData}
        onIncomeLegendItemPress={handleIncomeLegendItemPress}
      />

      {/* Balance History Details Modal */}
      <BalanceHistoryModal
        visible={balanceHistoryModalVisible}
        colors={colors}
        t={t}
        onClose={closeBalanceHistoryModal}
        balanceHistoryTableData={balanceHistoryTableData}
        editingBalanceRow={editingBalanceRow}
        editingBalanceValue={editingBalanceValue}
        onEditingBalanceValueChange={setEditingBalanceValue}
        onEditBalance={handleEditBalance}
        onCancelEdit={handleCancelEdit}
        onSaveBalance={handleSaveBalance}
        onDeleteBalance={handleDeleteBalance}
      />
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
    marginBottom: 20,
  },
  periodPickerWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 2,
    height: 40,
    overflow: 'hidden',
  },
  pickerWrapper: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 40,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  summaryCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
});

export default GraphsScreen;
