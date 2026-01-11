import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccounts } from '../contexts/AccountsContext';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING } from '../styles/layout';
import { getAvailableMonths } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import SimplePicker from '../components/SimplePicker';
import BalanceHistoryCard from '../components/graphs/BalanceHistoryCard';
import SpendingPredictionCard from '../components/graphs/SpendingPredictionCard';
import ExpenseSummaryCard from '../components/graphs/ExpenseSummaryCard';
import IncomeSummaryCard from '../components/graphs/IncomeSummaryCard';
import ChartModal from '../components/graphs/ChartModal';
import BalanceHistoryModal from '../components/graphs/BalanceHistoryModal';
import useExpenseData from '../hooks/useExpenseData';
import useIncomeData from '../hooks/useIncomeData';
import useBalanceHistory from '../hooks/useBalanceHistory';

const GraphsScreen = () => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { accounts } = useAccounts();

  // Get current month and year
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11, or null for full year
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [topLevelIncomeCategories, setTopLevelIncomeCategories] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);

  // Account selection state
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balanceHistoryModalVisible, setBalanceHistoryModalVisible] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' or 'income'

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

  // Ensure selected month is valid for selected year
  useEffect(() => {
    if (availableMonths.length === 0) return;

    const monthsForYear = availableMonths
      .filter(m => m.year === selectedYear)
      .map(m => m.month);

    // If current selected month is not available for this year and not "Full Year", select the first available month
    if (selectedMonth !== null && monthsForYear.length > 0 && !monthsForYear.includes(selectedMonth)) {
      const sortedMonths = monthsForYear.sort((a, b) => b - a); // Sort descending
      setSelectedMonth(sortedMonths[0]);
    }
  }, [selectedYear, availableMonths, selectedMonth]);




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

  const yearItems = useMemo(() =>
    availableYears.map(year => ({ label: year.toString(), value: year })),
  [availableYears],
  );

  // Get available months for the selected year
  const availableMonthsForYear = useMemo(() => {
    if (availableMonths.length === 0) {
      // If no operations, return current month as fallback
      return [now.getMonth()];
    }
    const monthsForYear = availableMonths
      .filter(m => m.year === selectedYear)
      .map(m => m.month);
    return monthsForYear.sort((a, b) => b - a); // Sort descending
  }, [availableMonths, selectedYear]);

  const monthItems = useMemo(() => {
    const items = [
      { label: t('full_year'), value: null },
    ];
    availableMonthsForYear.forEach(monthIndex => {
      items.push({
        label: t(monthKeys[monthIndex]),
        value: monthIndex,
      });
    });
    return items;
  }, [availableMonthsForYear, t, monthKeys]);

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

            {/* Year Picker */}
            <View style={[styles.pickerWrapper, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
              <SimplePicker
                value={selectedYear}
                onValueChange={setSelectedYear}
                items={yearItems}
                colors={colors}
              />
            </View>

            {/* Month Picker */}
            <View style={[styles.pickerWrapper, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
              <SimplePicker
                value={selectedMonth}
                onValueChange={setSelectedMonth}
                items={monthItems}
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
            />
          )}

          {/* Spending Prediction Card */}
          <SpendingPredictionCard
            colors={colors}
            t={t}
            spendingPrediction={spendingPrediction}
            selectedCurrency={selectedCurrency}
          />

          {/* Expenses Summary Card */}
          <ExpenseSummaryCard
            colors={colors}
            t={t}
            loading={loading}
            totalExpenses={totalExpenses}
            selectedCurrency={selectedCurrency}
            chartData={chartData}
            onPress={openExpenseModal}
          />

          {/* Income Summary Card */}
          <IncomeSummaryCard
            colors={colors}
            t={t}
            loadingIncome={loadingIncome}
            totalIncome={totalIncome}
            selectedCurrency={selectedCurrency}
            incomeChartData={incomeChartData}
            onPress={openIncomeModal}
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
});

export default GraphsScreen;
