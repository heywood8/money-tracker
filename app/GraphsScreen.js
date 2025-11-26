import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Platform, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
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

// Custom Legend Component
const CustomLegend = ({ data, currency, colors }) => {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={styles.legendContainer}>
      {data.map((item, index) => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        return (
          <View key={index} style={[styles.legendItem, { borderBottomColor: colors.border }]}>
            <View style={styles.legendLeft}>
              <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
              {item.icon && <Text style={styles.legendIcon}>{item.icon}</Text>}
              <Text style={[styles.legendName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <View style={styles.legendRight}>
              <Text style={[styles.legendAmount, { color: colors.text }]}>
                {formatCurrency(item.amount, currency)}
              </Text>
              <Text style={[styles.legendPercentage, { color: colors.mutedText }]}>
                {percentage}%
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
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

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' or 'income'

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
        const cats = await getAllCategories(true); // Include shadow categories
        setCategories(cats);

        // Filter top-level expense categories (no parent, expense type, not shadow)
        const topLevel = cats.filter(cat =>
          cat.parentId === null && cat.categoryType === 'expense' && !cat.isShadow
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

      // Create a Set of shadow category IDs for easy lookup
      const shadowCategoryIds = new Set();
      categories.forEach(cat => {
        if (cat.isShadow) {
          shadowCategoryIds.add(cat.id);
        }
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

      // Separate shadow categories from regular categories
      const regularSpending = [];
      let shadowCategoryTotal = 0;

      filteredSpending.forEach(item => {
        if (shadowCategoryIds.has(item.category_id)) {
          // Accumulate shadow category amounts
          shadowCategoryTotal += parseFloat(item.total);
        } else {
          // Keep regular categories
          regularSpending.push(item);
        }
      });

      // Chart colors (vibrant palette)
      const chartColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
        '#FFCE56', '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0'
      ];

      // Transform regular categories for pie chart
      const data = regularSpending.map((item, index) => {
        const category = categories.find(cat => cat.id === item.category_id);
        return {
          name: categoryMap.get(item.category_id) || t('unknown_category'),
          amount: parseFloat(item.total),
          color: chartColors[index % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: category?.icon || null,
        };
      });

      // Add aggregated balance adjustments if there are any (amounts are already positive for expenses)
      if (shadowCategoryTotal > 0) {
        data.push({
          name: t('balance_adjustments'),
          amount: shadowCategoryTotal,
          color: chartColors[data.length % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: null,
        });
      }

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
      const data = filteredIncome.map((item, index) => {
        const category = categories.find(cat => cat.id === item.category_id);
        return {
          name: categoryMap.get(item.category_id) || t('unknown_category'),
          amount: parseFloat(item.total),
          color: chartColors[index % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: category?.icon || null,
        };
      });

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

  // Handlers for opening modals
  const openExpenseModal = () => {
    setModalType('expense');
    setModalVisible(true);
  };

  const openIncomeModal = () => {
    setModalType('income');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView}>
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

          {/* Expenses Summary Card */}
          <TouchableOpacity
            style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={openExpenseModal}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('expenses_by_category')}
          >
            <View style={styles.summaryCardContent}>
              <View style={styles.summaryInfo}>
                <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
                  {t('total_expenses')}
                </Text>
                <Text style={[styles.summaryAmount, { color: colors.text }]}>
                  {loading ? '...' : formatCurrency(totalExpenses, selectedCurrency)}
                </Text>
              </View>
              <View style={styles.miniChartContainer}>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : chartData.length > 0 ? (
                  <PieChart
                    data={chartData}
                    width={80}
                    height={80}
                    chartConfig={{
                      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    }}
                    accessor="amount"
                    backgroundColor="transparent"
                    paddingLeft="0"
                    hasLegend={false}
                    center={[20, 0]}
                  />
                ) : (
                  <View style={styles.noDataPlaceholder}>
                    <Text style={[styles.noDataText, { color: colors.mutedText }]}>—</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* Income Summary Card */}
          <TouchableOpacity
            style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={openIncomeModal}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('income_by_category')}
          >
            <View style={styles.summaryCardContent}>
              <View style={styles.summaryInfo}>
                <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>
                  {t('total_income')}
                </Text>
                <Text style={[styles.summaryAmount, { color: colors.text }]}>
                  {loadingIncome ? '...' : formatCurrency(totalIncome, selectedCurrency)}
                </Text>
              </View>
              <View style={styles.miniChartContainer}>
                {loadingIncome ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : incomeChartData.length > 0 ? (
                  <PieChart
                    data={incomeChartData}
                    width={80}
                    height={80}
                    chartConfig={{
                      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    }}
                    accessor="amount"
                    backgroundColor="transparent"
                    paddingLeft="0"
                    hasLegend={false}
                    center={[20, 0]}
                  />
                ) : (
                  <View style={styles.noDataPlaceholder}>
                    <Text style={[styles.noDataText, { color: colors.mutedText }]}>—</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Chart Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {modalType === 'expense' ? t('expenses_by_category') : t('income_by_category')}
              </Text>
              <TouchableOpacity
                onPress={closeModal}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
              >
                <Text style={[styles.closeButtonText, { color: colors.primary }]}>
                  {t('close')}
                </Text>
              </TouchableOpacity>
            </View>

            {modalType === 'expense' && (
              <>
                {/* Expense Category Picker */}
                <View style={[styles.modalPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <SimplePicker
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                    items={categoryItems}
                    colors={colors}
                  />
                </View>

                <ScrollView style={styles.modalScrollView}>
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={[styles.loadingText, { color: colors.mutedText }]}>
                        {t('loading_operations')}
                      </Text>
                    </View>
                  ) : chartData.length > 0 ? (
                    <>
                      <View style={styles.chartContainer}>
                        <PieChart
                          data={chartData}
                          width={screenWidth - 64}
                          height={220}
                          chartConfig={{
                            color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                          }}
                          accessor="amount"
                          backgroundColor="transparent"
                          paddingLeft="15"
                          center={[0, 0]}
                          hasLegend={false}
                        />
                      </View>
                      <CustomLegend data={chartData} currency={selectedCurrency} colors={colors} />
                    </>
                  ) : (
                    <Text style={[styles.noData, { color: colors.mutedText }]}>
                      {t('no_expense_data')}
                    </Text>
                  )}
                </ScrollView>
              </>
            )}

            {modalType === 'income' && (
              <>
                {/* Income Category Picker */}
                <View style={[styles.modalPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <SimplePicker
                    value={selectedIncomeCategory}
                    onValueChange={setSelectedIncomeCategory}
                    items={incomeCategoryItems}
                    colors={colors}
                  />
                </View>

                <ScrollView style={styles.modalScrollView}>
                  {loadingIncome ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={[styles.loadingText, { color: colors.mutedText }]}>
                        {t('loading_operations')}
                      </Text>
                    </View>
                  ) : incomeChartData.length > 0 ? (
                    <>
                      <View style={styles.chartContainer}>
                        <PieChart
                          data={incomeChartData}
                          width={screenWidth - 64}
                          height={220}
                          chartConfig={{
                            color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                          }}
                          accessor="amount"
                          backgroundColor="transparent"
                          paddingLeft="15"
                          center={[0, 0]}
                          hasLegend={false}
                        />
                      </View>
                      <CustomLegend data={incomeChartData} currency={selectedCurrency} colors={colors} />
                    </>
                  ) : (
                    <Text style={[styles.noData, { color: colors.mutedText }]}>
                      {t('no_income_data')}
                    </Text>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  pickerWrapper: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    height: 40,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  summaryCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  miniChartContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataPlaceholder: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalPickerWrapper: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    height: 40,
  },
  modalScrollView: {
    padding: 20,
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
  legendContainer: {
    marginTop: 20,
  },
  legendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  legendName: {
    fontSize: 15,
    flex: 1,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendAmount: {
    fontSize: 15,
    fontWeight: '500',
  },
  legendPercentage: {
    fontSize: 14,
    minWidth: 45,
    textAlign: 'right',
  },
});

export default GraphsScreen;
