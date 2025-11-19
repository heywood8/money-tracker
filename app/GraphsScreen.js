import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { PieChart } from 'react-native-chart-kit';
import { useTheme } from './ThemeContext';
import { useLocalization } from './LocalizationContext';
import { useAccounts } from './AccountsContext';
import { getSpendingByCategoryAndCurrency } from './services/OperationsDB';
import { getAllCategories } from './services/CategoriesDB';

// Import web-specific picker styles
if (Platform.OS === 'web') {
  require('./picker-styles.web');
}

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
  const [chartData, setChartData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [topLevelCategories, setTopLevelCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Month names translation keys
  const monthKeys = [
    'month_january', 'month_february', 'month_march', 'month_april',
    'month_may', 'month_june', 'month_july', 'month_august',
    'month_september', 'month_october', 'month_november', 'month_december'
  ];

  // Generate list of years (current year and 5 years back)
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  // Initialize default currency from first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedCurrency) {
      setSelectedCurrency(accounts[0].currency);
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
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };
    loadCategories();
  }, []);

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
        name: categoryMap.get(item.category_id) || t('select_category'),
        amount: parseFloat(item.total),
        color: chartColors[index % chartColors.length],
        legendFontColor: colors.text,
        legendFontSize: 14
      }));

      setChartData(data);
    } catch (error) {
      console.error('Failed to load expense data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, selectedCategory, categories, colors.text, t]);

  // Reload data when filters change
  useEffect(() => {
    if (categories.length > 0) {
      loadExpenseData();
    }
  }, [loadExpenseData, categories.length]);

  // Get unique currencies from accounts
  const currencies = [...new Set(accounts.map(acc => acc.currency))];

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
            <Picker
              selectedValue={selectedCategory}
              onValueChange={(value) => setSelectedCategory(value)}
              style={[styles.picker, { color: colors.text }]}
              itemStyle={styles.pickerItem}
            >
              <Picker.Item label={t('all')} value="all" />
              {topLevelCategories.map(category => (
                <Picker.Item key={category.id} label={category.name} value={category.id} />
              ))}
            </Picker>
          </View>

          {/* Currency Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Picker
              selectedValue={selectedCurrency}
              onValueChange={(value) => setSelectedCurrency(value)}
              style={[styles.picker, { color: colors.text }]}
              itemStyle={styles.pickerItem}
            >
              {currencies.map(currency => (
                <Picker.Item key={currency} label={currency} value={currency} />
              ))}
            </Picker>
          </View>

          {/* Year Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Picker
              selectedValue={selectedYear}
              onValueChange={(value) => setSelectedYear(value)}
              style={[styles.picker, { color: colors.text }]}
              itemStyle={styles.pickerItem}
            >
              {years.map(year => (
                <Picker.Item key={year} label={year.toString()} value={year} />
              ))}
            </Picker>
          </View>

          {/* Month Picker */}
          <View style={[styles.pickerWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Picker
              selectedValue={selectedMonth}
              onValueChange={(value) => setSelectedMonth(value)}
              style={[styles.picker, { color: colors.text }]}
              itemStyle={styles.pickerItem}
            >
              {monthKeys.map((key, index) => (
                <Picker.Item key={index} label={t(key)} value={index} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Pie Chart */}
        {loading ? (
          <Text style={[styles.noData, { color: colors.mutedText }]}>
            {t('loading_operations')}
          </Text>
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
              absolute
            />
          </View>
        ) : (
          <Text style={[styles.noData, { color: colors.mutedText }]}>
            {t('no_expense_data')}
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
    ...Platform.select({
      web: {
        height: 38,
        display: 'flex',
        alignItems: 'center',
      },
      default: {
        height: 40,
        justifyContent: 'center',
      },
    }),
  },
  picker: {
    ...Platform.select({
      web: {
        height: 38,
        width: '100%',
        border: 'none',
        outline: 'none',
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 0,
        paddingBottom: 0,
        margin: 0,
        lineHeight: '38px',
        fontSize: 14,
        fontFamily: 'inherit',
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        background: 'transparent',
        backgroundImage: 'none !important',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right center',
        textIndent: 0,
        verticalAlign: 'middle',
      },
      android: {
        height: 40,
      },
      ios: {
        height: 40,
      },
    }),
  },
  pickerItem: {
    ...Platform.select({
      ios: {
        height: 40,
      },
    }),
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
