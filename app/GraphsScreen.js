import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useAccounts } from './AccountsContext';
import { getSpendingByCategoryAndCurrency, getIncomeByCategoryAndCurrency, getAvailableMonths } from './services/OperationsDB';
import { getAllCategories } from './services/CategoriesDB';
import SimplePicker from './components/SimplePicker';

// Currency formatting helper
const formatCurrency = (amount, currency) => {
  return `${parseFloat(amount).toFixed(2)} ${currency}`;
};

const GraphsScreen = () => {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const { accounts } = useAccounts();

  // Get current month and year
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState('all');
  const [chartData, setChartData] = useState([]);
  const [incomeChartData, setIncomeChartData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [topLevelIncomeCategories, setTopLevelIncomeCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingIncome, setLoadingIncome] = useState(true);
  const [availableMonths, setAvailableMonths] = useState([]);

  // Month names translation keys
  const monthKeys = [
    'month_january', 'month_february', 'month_march', 'month_april',
    'month_may', 'month_june', 'month_july', 'month_august',
    'month_september', 'month_october', 'month_november', 'month_december'
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

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await getAllCategories();
        setCategories(cats);

        // Filter top-level expense categories (no parent, expense type)
        const topLevel = cats.filter(cat =>
          cat.parentId === null && cat.categoryType === 'expense'
        );
        setTopLevelCategories(topLevel);

        // Filter top-level income categories (no parent, income type)
        const topLevelIncome = cats.filter(cat =>
          cat.parentId === null && cat.categoryType === 'income'
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

    // If current selected month is not available for this year, select the first available month
    if (monthsForYear.length > 0 && !monthsForYear.includes(selectedMonth)) {
      const sortedMonths = monthsForYear.sort((a, b) => b - a); // Sort descending
      setSelectedMonth(sortedMonths[0]);
    }
  }, [selectedYear, availableMonths, selectedMonth]);

  // Load expense data
  const loadExpenseData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoading(true);

      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get spending data
      const spending = await getSpendingByCategoryAndCurrency(
        selectedCurrency,
        startDateStr,
        endDateStr
      );

      // Create a map of category ID to category name
      const categoryMap = new Map();
      categories.forEach(cat => {
        categoryMap.set(cat.id, cat.name);
      });

      // Filter data by selected category if not "all"
      let filteredSpending = spending;
      if (selectedCategory !== 'all') {
        // Get all descendant category IDs for the selected category
        const descendantIds = new Set([selectedCategory]);
        const findDescendants = (parentId) => {
          categories.forEach(cat => {
            if (cat.parentId === parentId) {
              descendantIds.add(cat.id);
              findDescendants(cat.id); // Recursive
            }
          });
        };
        findDescendants(selectedCategory);

        // Filter spending to only include categories in the descendant set
        filteredSpending = spending.filter(item =>
          descendantIds.has(item.category_id)
        );
      }

      // Chart colors (vibrant palette)
      const chartColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
        '#FFCE56', '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0'
      ];

      // Transform data for pie chart
      const data = filteredSpending.map((item, index) => ({
        name: categoryMap.get(item.category_id) || t('unknown_category'),
        amount: parseFloat(item.total),
        color: chartColors[index % chartColors.length],
        legendFontColor: colors.text,
        legendFontSize: 13
      }));

      setChartData(data);
    } catch (error) {
      console.error('Failed to load expense data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors.text, t]);

  // Load income data
  const loadIncomeData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoadingIncome(true);

      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get income data
      const income = await getIncomeByCategoryAndCurrency(
        selectedCurrency,
        startDateStr,
        endDateStr
      );

      // Create a map of category ID to category name
      const categoryMap = new Map();
      categories.forEach(cat => {
        categoryMap.set(cat.id, cat.name);
      });

      // Filter data by selected income category if not "all"
      let filteredIncome = income;
      if (selectedIncomeCategory !== 'all') {
        // Get all descendant category IDs for the selected category
        const descendantIds = new Set([selectedIncomeCategory]);
        const findDescendants = (parentId) => {
          categories.forEach(cat => {
            if (cat.parentId === parentId) {
              descendantIds.add(cat.id);
              findDescendants(cat.id); // Recursive
            }
          });
        };
        findDescendants(selectedIncomeCategory);

        // Filter income to only include categories in the descendant set
        filteredIncome = income.filter(item =>
          descendantIds.has(item.category_id)
        );
      }

      // Chart colors (vibrant palette - different from expenses)
      const chartColors = [
        '#4BC0C0', '#36A2EB', '#9966FF', '#FF9F40', '#FFCE56',
        '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40', '#FFCE56',
        '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0', '#FF9F40'
      ];

      // Transform data for pie chart
      const data = filteredIncome.map((item, index) => ({
        name: categoryMap.get(item.category_id) || t('unknown_category'),
        amount: parseFloat(item.total),
        color: chartColors[index % chartColors.length],
        legendFontColor: colors.text,
        legendFontSize: 13
      }));

      setIncomeChartData(data);
    } catch (error) {
      console.error('Failed to load income data:', error);
    } finally {
      setLoadingIncome(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors.text, t]);

  // Reload data when filters change
  useEffect(() => {
    if (categories.length > 0) {
      loadExpenseData();
      loadIncomeData();
    }
  }, [loadExpenseData, loadIncomeData, categories.length]);

  // Memoize unique currencies from accounts
  const currencies = useMemo(() =>
    [...new Set(accounts.map(acc => acc.currency))],
    [accounts]
  );

  // Prepare picker items
  const categoryItems = useMemo(() => [
    { label: t('all'), value: 'all' },
    ...topLevelCategories.map(cat => ({ label: cat.name, value: cat.id }))
  ], [topLevelCategories, t]);

  const incomeCategoryItems = useMemo(() => [
    { label: t('all'), value: 'all' },
    ...topLevelIncomeCategories.map(cat => ({ label: cat.name, value: cat.id }))
  ], [topLevelIncomeCategories, t]);

  const currencyItems = useMemo(() =>
    currencies.map(cur => ({ label: cur, value: cur })),
    [currencies]
  );

  const yearItems = useMemo(() =>
    availableYears.map(year => ({ label: year.toString(), value: year })),
    [availableYears]
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

  const monthItems = useMemo(() =>
    availableMonthsForYear.map(monthIndex => ({
      label: t(monthKeys[monthIndex]),
      value: monthIndex
    })),
    [availableMonthsForYear, t, monthKeys]
  );

  // Calculate total expenses
  const totalExpenses = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.amount, 0);
  }, [chartData]);

  // Calculate total income
  const totalIncome = useMemo(() => {
    return incomeChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [incomeChartData]);

  const screenWidth = Dimensions.get('window').width;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('expenses_by_category')}
        </Text>

        {/* Filters Row */}
        <View style={styles.filtersRow}>
          {/* Category Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SimplePicker
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              items={categoryItems}
              colors={colors}
            />
          </View>

          {/* Currency Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SimplePicker
              value={selectedCurrency}
              onValueChange={setSelectedCurrency}
              items={currencyItems}
              colors={colors}
            />
          </View>

          {/* Year Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SimplePicker
              value={selectedYear}
              onValueChange={setSelectedYear}
              items={yearItems}
              colors={colors}
            />
          </View>

          {/* Month Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SimplePicker
              value={selectedMonth}
              onValueChange={setSelectedMonth}
              items={monthItems}
              colors={colors}
            />
          </View>
        </View>

        {/* Total Expenses Display */}
        {!loading && chartData.length > 0 && (
          <View style={[styles.totalContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.mutedText }]}>
              {t('total_expenses')}:
            </Text>
            <Text style={[styles.totalAmount, { color: colors.text }]}>
              {formatCurrency(totalExpenses, selectedCurrency)}
            </Text>
          </View>
        )}

        {/* Pie Chart */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedText }]}>
              {t('loading_operations')}
            </Text>
          </View>
        ) : chartData.length > 0 ? (
          <View style={styles.chartContainer}>
            <PieChart
              data={chartData}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              center={[0, 0]}
            />
          </View>
        ) : (
          <Text style={[styles.noData, { color: colors.mutedText }]}>
            {t('no_expense_data')}
          </Text>
        )}

        {/* Income Section */}
        <Text style={[styles.title, { color: colors.text, marginTop: 40 }]}>
          {t('income_by_category')}
        </Text>

        {/* Income Category Picker */}
        <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 16 }]}>
          <SimplePicker
            value={selectedIncomeCategory}
            onValueChange={setSelectedIncomeCategory}
            items={incomeCategoryItems}
            colors={colors}
          />
        </View>

        {/* Total Income Display */}
        {!loadingIncome && incomeChartData.length > 0 && (
          <View style={[styles.totalContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.mutedText }]}>
              {t('total_income')}:
            </Text>
            <Text style={[styles.totalAmount, { color: colors.text }]}>
              {formatCurrency(totalIncome, selectedCurrency)}
            </Text>
          </View>
        )}

        {/* Income Pie Chart */}
        {loadingIncome ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedText }]}>
              {t('loading_operations')}
            </Text>
          </View>
        ) : incomeChartData.length > 0 ? (
          <View style={styles.chartContainer}>
            <PieChart
              data={incomeChartData}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              center={[0, 0]}
            />
          </View>
        ) : (
          <Text style={[styles.noData, { color: colors.mutedText }]}>
            {t('no_income_data')}
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  pickerWrapper: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    height: 40,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  chartContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  noData: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});

export default GraphsScreen;
