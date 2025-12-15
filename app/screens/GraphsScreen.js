import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Platform, ActivityIndicator, TouchableOpacity, Modal, PanResponder, Switch, TextInput } from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAccounts } from '../contexts/AccountsContext';
import { getSpendingByCategoryAndCurrency, getIncomeByCategoryAndCurrency, getAvailableMonths } from '../services/OperationsDB';
import { getAllCategories } from '../services/CategoriesDB';
import { getBalanceHistory, upsertBalanceHistory, deleteBalanceHistory } from '../services/BalanceHistoryDB';
import SimplePicker from '../components/SimplePicker';

// Currency formatting helper
import currencies from '../../assets/currencies.json';

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

// Custom Legend Component
const CustomLegend = ({ data, currency, colors, onItemPress, isClickable }) => {
  const total = data.reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={styles.legendContainer}>
      {data.map((item, index) => {
        const percentage = total > 0 ? ((item.amount / total) * 100).toFixed(1) : 0;
        const ItemWrapper = isClickable && item.categoryId ? TouchableOpacity : View;
        const wrapperProps = isClickable && item.categoryId ? {
          onPress: () => onItemPress(item.categoryId),
          activeOpacity: 0.7,
          accessibilityRole: 'button',
          accessibilityLabel: `View details for ${item.name}`,
          accessibilityHint: 'Double tap to filter by this category'
        } : {};

        return (
          <ItemWrapper
            key={index}
            style={[
              styles.legendItem,
              { borderBottomColor: colors.border },
              isClickable && item.categoryId && styles.legendItemClickable
            ]}
            {...wrapperProps}
          >
            <View style={styles.legendLeft}>
              <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
              {item.icon && (
                <Icon
                  name={item.icon}
                  size={18}
                  color={colors.text}
                  style={styles.legendIcon}
                />
              )}
              <Text style={[styles.legendName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {isClickable && item.categoryId && (
                <Icon
                  name="chevron-right"
                  size={16}
                  color={colors.mutedText}
                  style={styles.legendChevron}
                />
              )}
            </View>
            <View style={styles.legendRight}>
              <Text style={[styles.legendAmount, { color: colors.text }]}>
                {formatCurrency(item.amount, currency)}
              </Text>
              <Text style={[styles.legendPercentage, { color: colors.mutedText }]}>
                {percentage}%
              </Text>
            </View>
          </ItemWrapper>
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
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11, or null for full year
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

  // Balance history state
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balanceHistoryData, setBalanceHistoryData] = useState([]);
  const [loadingBalanceHistory, setLoadingBalanceHistory] = useState(true);
  const [balanceHistoryModalVisible, setBalanceHistoryModalVisible] = useState(false);
  const [balanceHistoryTableData, setBalanceHistoryTableData] = useState([]);
  const [editingBalanceRow, setEditingBalanceRow] = useState(null);
  const [editingBalanceValue, setEditingBalanceValue] = useState('');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('expense'); // 'expense' or 'income'

  // Pan Responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal swipes from the left edge when not viewing "All"
        const isExpenseMode = modalType === 'expense';
        const currentCategory = isExpenseMode ? selectedCategory : selectedIncomeCategory;
        return currentCategory !== 'all' && gestureState.dx > 20 && Math.abs(gestureState.dy) < 80;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Swipe right to go back to "All"
        if (gestureState.dx > 100) {
          if (modalType === 'expense') {
            setSelectedCategory('all');
          } else {
            setSelectedIncomeCategory('all');
          }
        }
      },
    })
  ).current;

  // Handlers for legend item clicks
  const handleExpenseLegendItemPress = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
  }, []);

  const handleIncomeLegendItemPress = useCallback((categoryId) => {
    setSelectedIncomeCategory(categoryId);
  }, []);

  const handleBackToAll = useCallback(() => {
    if (modalType === 'expense') {
      setSelectedCategory('all');
    } else {
      setSelectedIncomeCategory('all');
    }
  }, [modalType]);

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

    // If current selected month is not available for this year and not "Full Year", select the first available month
    if (selectedMonth !== null && monthsForYear.length > 0 && !monthsForYear.includes(selectedMonth)) {
      const sortedMonths = monthsForYear.sort((a, b) => b - a); // Sort descending
      setSelectedMonth(sortedMonths[0]);
    }
  }, [selectedYear, availableMonths, selectedMonth]);

  // Load expense data
  const loadExpenseData = useCallback(async () => {
    if (!selectedCurrency) return;

    try {
      setLoading(true);

      // Calculate start and end dates for the selected month or full year
      let startDate, endDate;
      if (selectedMonth === null) {
        // Full year view
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else {
        // Single month view
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get spending data
      const spending = await getSpendingByCategoryAndCurrency(
        selectedCurrency,
        startDateStr,
        endDateStr
      );

      // Create a map of category ID to category object
      const categoryMap = new Map();
      categories.forEach(cat => {
        categoryMap.set(cat.id, cat);
      });

      // Create a Set of shadow category IDs for easy lookup
      const shadowCategoryIds = new Set();
      categories.forEach(cat => {
        if (cat.isShadow) {
          shadowCategoryIds.add(cat.id);
        }
      });

      // Helper function to get the root parent (top-level folder) of a category
      const getRootParent = (categoryId) => {
        let current = categoryMap.get(categoryId);
        if (!current) return null;

        while (current.parentId) {
          current = categoryMap.get(current.parentId);
          if (!current) return null;
        }
        return current;
      };

      // Separate shadow categories from regular categories
      const regularSpending = [];
      let shadowCategoryTotal = 0;

      spending.forEach(item => {
        if (shadowCategoryIds.has(item.category_id)) {
          // Accumulate shadow category amounts
          shadowCategoryTotal += parseFloat(item.total);
        } else {
          // Keep regular categories
          regularSpending.push(item);
        }
      });

      // Helper function to check if a category is excluded from forecast
      const isCategoryExcludedFromForecast = (categoryId) => {
        let current = categoryMap.get(categoryId);
        while (current) {
          if (current.excludeFromForecast) {
            return true;
          }
          current = current.parentId ? categoryMap.get(current.parentId) : null;
        }
        return false;
      };

      // Aggregate spending based on selected category
      let aggregatedSpending = {};

      if (selectedCategory === 'all') {
        // When "All categories" is selected, aggregate by root folders
        regularSpending.forEach(item => {
          const rootParent = getRootParent(item.category_id);
          if (rootParent) {
            const rootId = rootParent.id;
            const isExcluded = isCategoryExcludedFromForecast(item.category_id);
            const amount = parseFloat(item.total);

            if (!aggregatedSpending[rootId]) {
              aggregatedSpending[rootId] = {
                category: rootParent,
                total: 0,
                forecastTotal: 0, // Total excluding excluded categories
              };
            }
            aggregatedSpending[rootId].total += amount;

            // Only add to forecastTotal if not excluded
            if (!isExcluded) {
              aggregatedSpending[rootId].forecastTotal += amount;
            }
          }
        });
      } else {
        // When a specific folder is selected, show only immediate children
        regularSpending.forEach(item => {
          const category = categoryMap.get(item.category_id);
          if (!category) return;

          const isExcluded = isCategoryExcludedFromForecast(item.category_id);
          const amount = parseFloat(item.total);

          // Check if this category is a direct child of the selected folder
          if (category.parentId === selectedCategory) {
            if (!aggregatedSpending[category.id]) {
              aggregatedSpending[category.id] = {
                category: category,
                total: 0,
                forecastTotal: 0,
              };
            }
            aggregatedSpending[category.id].total += amount;
            if (!isExcluded) {
              aggregatedSpending[category.id].forecastTotal += amount;
            }
          } else {
            // Check if this category is a descendant of the selected folder
            // If so, aggregate it under its direct parent (immediate child of selected folder)
            let current = category;
            while (current.parentId) {
              const parent = categoryMap.get(current.parentId);
              if (!parent) break;

              if (parent.id === selectedCategory) {
                // Current is a direct child of the selected folder
                if (!aggregatedSpending[current.id]) {
                  aggregatedSpending[current.id] = {
                    category: current,
                    total: 0,
                    forecastTotal: 0,
                  };
                }
                aggregatedSpending[current.id].total += amount;
                if (!isExcluded) {
                  aggregatedSpending[current.id].forecastTotal += amount;
                }
                break;
              }
              current = parent;
            }
          }
        });
      }

      // Chart colors (vibrant palette)
      const chartColors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
        '#FFCE56', '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0'
      ];

      // Transform aggregated data for pie chart
      const data = Object.values(aggregatedSpending).map((item, index) => {
        return {
          name: item.category.name,
          amount: item.total,
          color: chartColors[index % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: item.category.icon || null,
          categoryId: item.category.id, // For clickable legend navigation
          forecastAmount: item.forecastTotal !== undefined ? item.forecastTotal : item.total, // Amount to use for forecast (excluding excluded categories)
        };
      });

      // Sort by amount descending
      data.sort((a, b) => b.amount - a.amount);

      // Add aggregated balance adjustments if there are any (amounts are already positive for expenses)
      if (shadowCategoryTotal > 0) {
        data.push({
          name: t('balance_adjustments'),
          amount: shadowCategoryTotal,
          color: chartColors[data.length % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: null,
          forecastAmount: shadowCategoryTotal, // Balance adjustments are included in forecast
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

      // Calculate start and end dates for the selected month or full year
      let startDate, endDate;
      if (selectedMonth === null) {
        // Full year view
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      } else {
        // Single month view
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get income data
      const income = await getIncomeByCategoryAndCurrency(
        selectedCurrency,
        startDateStr,
        endDateStr
      );

      // Create a map of category ID to category object
      const categoryMap = new Map();
      categories.forEach(cat => {
        categoryMap.set(cat.id, cat);
      });

      // Helper function to get the root parent (top-level folder) of a category
      const getRootParent = (categoryId) => {
        let current = categoryMap.get(categoryId);
        if (!current) return null;

        while (current.parentId) {
          current = categoryMap.get(current.parentId);
          if (!current) return null;
        }
        return current;
      };

      // Aggregate income based on selected category
      let aggregatedIncome = {};

      if (selectedIncomeCategory === 'all') {
        // When "All categories" is selected, aggregate by root folders
        income.forEach(item => {
          const rootParent = getRootParent(item.category_id);
          if (rootParent) {
            const rootId = rootParent.id;
            if (!aggregatedIncome[rootId]) {
              aggregatedIncome[rootId] = {
                category: rootParent,
                total: 0,
              };
            }
            aggregatedIncome[rootId].total += parseFloat(item.total);
          }
        });
      } else {
        // When a specific folder is selected, show only immediate children
        income.forEach(item => {
          const category = categoryMap.get(item.category_id);
          if (!category) return;

          // Check if this category is a direct child of the selected folder
          if (category.parentId === selectedIncomeCategory) {
            if (!aggregatedIncome[category.id]) {
              aggregatedIncome[category.id] = {
                category: category,
                total: 0,
              };
            }
            aggregatedIncome[category.id].total += parseFloat(item.total);
          } else {
            // Check if this category is a descendant of the selected folder
            // If so, aggregate it under its direct parent (immediate child of selected folder)
            let current = category;
            while (current.parentId) {
              const parent = categoryMap.get(current.parentId);
              if (!parent) break;

              if (parent.id === selectedIncomeCategory) {
                // Current is a direct child of the selected folder
                if (!aggregatedIncome[current.id]) {
                  aggregatedIncome[current.id] = {
                    category: current,
                    total: 0,
                  };
                }
                aggregatedIncome[current.id].total += parseFloat(item.total);
                break;
              }
              current = parent;
            }
          }
        });
      }

      // Chart colors (vibrant palette - different from expenses)
      const chartColors = [
        '#4BC0C0', '#36A2EB', '#9966FF', '#FF9F40', '#FFCE56',
        '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40', '#FFCE56',
        '#36A2EB', '#9966FF', '#FF6384', '#4BC0C0', '#FF9F40'
      ];

      // Transform aggregated data for pie chart
      const data = Object.values(aggregatedIncome).map((item, index) => {
        return {
          name: item.category.name,
          amount: item.total,
          color: chartColors[index % chartColors.length],
          legendFontColor: colors.text,
          legendFontSize: 13,
          icon: item.category.icon || null,
          categoryId: item.category.id, // For clickable legend navigation
        };
      });

      // Sort by amount descending
      data.sort((a, b) => b.amount - a.amount);

      setIncomeChartData(data);
    } catch (error) {
      console.error('Failed to load income data:', error);
    } finally {
      setLoadingIncome(false);
    }
  }, [selectedYear, selectedMonth, selectedCurrency, selectedIncomeCategory, categories, colors.text, t]);

  // Load balance history data
  const loadBalanceHistory = useCallback(async () => {
    if (!selectedAccount || selectedMonth === null) {
      setBalanceHistoryData([]);
      setLoadingBalanceHistory(false);
      return;
    }

    try {
      setLoadingBalanceHistory(true);

      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get balance history from database
      const history = await getBalanceHistory(selectedAccount, startDateStr, endDateStr);

      // Helper function to calculate linear regression
      const calculateTrendLine = (data) => {
        if (data.length < 2) return null;

        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        data.forEach((point, index) => {
          sumX += index;
          sumY += point.y;
          sumXY += index * point.y;
          sumX2 += index * index;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
      };

      // Transform history data for chart
      const dataPoints = history.map(item => ({
        date: item.date,
        balance: parseFloat(item.balance),
      }));

      // Get current day of month
      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
      const currentDay = isCurrentMonth ? now.getDate() : endDate.getDate();

      // Generate all days in month for x-axis
      const daysInMonth = endDate.getDate();
      const allDays = [];
      for (let day = 1; day <= daysInMonth; day++) {
        allDays.push(day);
      }

      // Map balance history to days
      const balanceByDay = {};
      dataPoints.forEach(point => {
        const day = new Date(point.date).getDate();
        balanceByDay[day] = point.balance;
      });

      // Create actual data line (only up to current day or last available data)
      const actualData = allDays.map(day => {
        if (balanceByDay[day] !== undefined) {
          return { x: day, y: balanceByDay[day] };
        }
        return null;
      }).filter(p => p && p.x <= currentDay);

      // Calculate trend line
      let trendData = [];
      if (actualData.length >= 2) {
        const trend = calculateTrendLine(actualData);
        if (trend) {
          // Extend trend line to end of month
          trendData = allDays.map(day => ({
            x: day,
            y: Math.max(0, trend.intercept + trend.slope * (day - 1)),
          }));
        }
      }

      // Calculate burndown line (from highest balance to 0)
      let burndownData = [];
      if (actualData.length > 0) {
        const maxBalance = Math.max(...actualData.map(p => p.y));
        const slope = -maxBalance / (daysInMonth - 1);
        burndownData = allDays.map(day => ({
          x: day,
          y: Math.max(0, maxBalance + slope * (day - 1)),
        }));
      }

      setBalanceHistoryData({
        actual: actualData,
        trend: trendData,
        burndown: burndownData,
        labels: allDays,
      });
    } catch (error) {
      console.error('Failed to load balance history:', error);
      setBalanceHistoryData([]);
    } finally {
      setLoadingBalanceHistory(false);
    }
  }, [selectedAccount, selectedYear, selectedMonth]);

  // Open balance history modal with table data
  const handleBalanceHistoryPress = useCallback(async () => {
    if (!selectedAccount || selectedMonth === null) return;

    try {
      // Calculate start and end dates for the selected month
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);
      const daysInMonth = endDate.getDate();

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get balance history from database
      const history = await getBalanceHistory(selectedAccount, startDateStr, endDateStr);

      // Create map of existing balances
      const balanceByDate = {};
      history.forEach(item => {
        balanceByDate[item.date] = item.balance;
      });

      // Generate table data for all days in month
      const tableData = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth, day);
        const dateStr = date.toISOString().split('T')[0];
        tableData.push({
          date: dateStr,
          displayDate: `${day}`,
          balance: balanceByDate[dateStr] || null,
        });
      }

      setBalanceHistoryTableData(tableData);
      setBalanceHistoryModalVisible(true);
    } catch (error) {
      console.error('Failed to load balance history table:', error);
    }
  }, [selectedAccount, selectedYear, selectedMonth]);

  // Start editing a balance row
  const handleEditBalance = useCallback((date, currentBalance) => {
    setEditingBalanceRow(date);
    setEditingBalanceValue(currentBalance || '');
  }, []);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingBalanceRow(null);
    setEditingBalanceValue('');
  }, []);

  // Save edited balance
  const handleSaveBalance = useCallback(async (date) => {
    if (!selectedAccount || !editingBalanceValue) return;

    try {
      await upsertBalanceHistory(selectedAccount, date, editingBalanceValue);

      // Update table data
      setBalanceHistoryTableData(prevData =>
        prevData.map(item =>
          item.date === date ? { ...item, balance: editingBalanceValue } : item
        )
      );

      // Reload the chart
      await loadBalanceHistory();

      setEditingBalanceRow(null);
      setEditingBalanceValue('');
    } catch (error) {
      console.error('Failed to save balance:', error);
    }
  }, [selectedAccount, editingBalanceValue, loadBalanceHistory]);

  // Delete balance entry
  const handleDeleteBalance = useCallback(async (date) => {
    if (!selectedAccount) return;

    try {
      await deleteBalanceHistory(selectedAccount, date);

      // Update table data
      setBalanceHistoryTableData(prevData =>
        prevData.map(item =>
          item.date === date ? { ...item, balance: null } : item
        )
      );

      // Reload the chart
      await loadBalanceHistory();
    } catch (error) {
      console.error('Failed to delete balance:', error);
    }
  }, [selectedAccount, loadBalanceHistory]);

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

  const accountItems = useMemo(() =>
    accounts.map(acc => ({ label: acc.name, value: acc.id })),
    [accounts]
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

  const monthItems = useMemo(() => {
    const items = [
      { label: t('full_year'), value: null }
    ];
    availableMonthsForYear.forEach(monthIndex => {
      items.push({
        label: t(monthKeys[monthIndex]),
        value: monthIndex
      });
    });
    return items;
  }, [availableMonthsForYear, t, monthKeys]);

  // Calculate total expenses
  const totalExpenses = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.amount, 0);
  }, [chartData]);

  // Calculate total income
  const totalIncome = useMemo(() => {
    return incomeChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [incomeChartData]);

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

    // Calculate days elapsed (from 1st to today)
    const currentDay = now.getDate();
    const daysElapsed = currentDay;

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
      dailyAverage,
      daysElapsed,
      daysInMonth,
      percentElapsed,
    };
  }, [chartData, categories, selectedYear, selectedMonth]);

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

          {/* Balance History Card */}
          {selectedMonth !== null && selectedAccount && (
            <View style={[styles.balanceHistoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.balanceHistoryHeader}>
                <View style={styles.balanceHistoryTitleContainer}>
                  <Icon name="chart-line" size={24} color={colors.primary} />
                  <Text style={[styles.balanceHistoryTitle, { color: colors.text }]}>
                    {t('balance_history') || 'Balance History'}
                  </Text>
                </View>
                {/* Account Picker */}
                <View style={[styles.accountPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <SimplePicker
                    value={selectedAccount}
                    onValueChange={setSelectedAccount}
                    items={accountItems}
                    colors={colors}
                  />
                </View>
              </View>

              {loadingBalanceHistory ? (
                <View style={styles.balanceHistoryLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : balanceHistoryData.actual && balanceHistoryData.actual.length > 0 ? (
                <TouchableOpacity
                  style={styles.balanceHistoryChartContainer}
                  onPress={handleBalanceHistoryPress}
                  activeOpacity={0.7}
                >
                  <LineChart
                    data={{
                      labels: balanceHistoryData.labels.map(d => d.toString()),
                      datasets: [
                        {
                          data: balanceHistoryData.actual.map(p => p.y),
                          color: () => colors.primary,
                          strokeWidth: 3,
                        },
                        {
                          data: balanceHistoryData.trend.map(p => p.y),
                          color: () => 'rgba(75, 192, 192, 0.6)',
                          strokeWidth: 2,
                          withDots: false,
                        },
                        {
                          data: balanceHistoryData.burndown.map(p => p.y),
                          color: () => 'rgba(255, 99, 132, 0.4)',
                          strokeWidth: 2,
                          withDots: false,
                        },
                      ],
                      legend: [t('actual') || 'Actual', t('trend') || 'Trend', t('burndown') || 'Burndown'],
                    }}
                    width={screenWidth - 64}
                    height={220}
                    yAxisLabel=""
                    yAxisSuffix=""
                    formatXLabel={(value) => {
                      // Show every 5th label to avoid crowding
                      const day = parseInt(value);
                      return day % 5 === 1 ? value : '';
                    }}
                    chartConfig={{
                      backgroundColor: colors.surface,
                      backgroundGradientFrom: colors.surface,
                      backgroundGradientTo: colors.surface,
                      decimalPlaces: 0,
                      color: (opacity = 1) => colors.text,
                      labelColor: (opacity = 1) => colors.mutedText,
                      style: {
                        borderRadius: 16,
                      },
                      propsForDots: {
                        r: '2',
                        strokeWidth: '2',
                      },
                      propsForBackgroundLines: {
                        strokeWidth: 1,
                        stroke: colors.border,
                        strokeDasharray: '0',
                      },
                    }}
                    bezier
                    withInnerLines={true}
                    withOuterLines={true}
                    withVerticalLines={false}
                    withHorizontalLines={true}
                    style={{
                      marginVertical: 8,
                      borderRadius: 16,
                    }}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.balanceHistoryNoData}>
                  <Text style={[styles.balanceHistoryNoDataText, { color: colors.mutedText }]}>
                    {t('no_balance_history') || 'No balance history available for this month'}
                  </Text>
                </View>
              )}
            </View>
          )}

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

          {/* Spending Prediction Card */}
          {spendingPrediction && (
            <View style={[styles.predictionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.predictionHeader}>
                <Icon name="chart-line" size={24} color={colors.primary} />
                <Text style={[styles.predictionTitle, { color: colors.text }]}>
                  {t('spending_prediction')}
                </Text>
              </View>

              {/* Current vs Predicted */}
              <View style={styles.predictionStats}>
                <View style={styles.predictionStat}>
                  <Text style={[styles.predictionStatLabel, { color: colors.mutedText }]}>
                    {t('current_spending')}
                  </Text>
                  <Text style={[styles.predictionStatValue, { color: colors.expense || '#ff4444' }]}>
                    {formatCurrency(spendingPrediction.currentSpending, selectedCurrency)}
                  </Text>
                </View>
                <Icon name="arrow-right" size={20} color={colors.mutedText} style={styles.predictionArrow} />
                <View style={styles.predictionStat}>
                  <Text style={[styles.predictionStatLabel, { color: colors.mutedText }]}>
                    {t('predicted_spending')}
                  </Text>
                  <Text style={[styles.predictionStatValue, { color: colors.text }]}>
                    {formatCurrency(spendingPrediction.predictedTotal, selectedCurrency)}
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.predictionProgressContainer}>
                <View style={[styles.predictionProgressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.predictionProgressBar,
                      {
                        width: `${Math.min(spendingPrediction.percentElapsed, 100)}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.predictionProgressText, { color: colors.mutedText }]}>
                  {spendingPrediction.daysElapsed} / {spendingPrediction.daysInMonth} {t('days_elapsed').toLowerCase()}
                </Text>
              </View>

              {/* Daily Average */}
              <View style={styles.predictionFooter}>
                <Text style={[styles.predictionFooterLabel, { color: colors.mutedText }]}>
                  {t('daily_average')}:{' '}
                  <Text style={[styles.predictionFooterValue, { color: colors.text }]}>
                    {formatCurrency(spendingPrediction.dailyAverage, selectedCurrency)}
                  </Text>
                </Text>
              </View>
            </View>
          )}

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
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]} {...panResponder.panHandlers}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                {((modalType === 'expense' && selectedCategory !== 'all') ||
                  (modalType === 'income' && selectedIncomeCategory !== 'all')) && (
                  <TouchableOpacity
                    onPress={handleBackToAll}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('back') || 'Back to all categories'}
                    accessibilityHint="Returns to viewing all categories"
                  >
                    <Icon name="arrow-left" size={24} color={colors.primary} />
                  </TouchableOpacity>
                )}
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {modalType === 'expense' ? t('expenses_by_category') : t('income_by_category')}
                </Text>
              </View>
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
                {/* Expense Category Picker - Only show when not viewing "All" */}
                {selectedCategory !== 'all' && (
                  <View style={[styles.modalPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <SimplePicker
                      value={selectedCategory}
                      onValueChange={setSelectedCategory}
                      items={categoryItems}
                      colors={colors}
                    />
                  </View>
                )}

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
                      <CustomLegend
                        data={chartData}
                        currency={selectedCurrency}
                        colors={colors}
                        onItemPress={handleExpenseLegendItemPress}
                        isClickable={selectedCategory === 'all'}
                      />
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
                {/* Income Category Picker - Only show when not viewing "All" */}
                {selectedIncomeCategory !== 'all' && (
                  <View style={[styles.modalPickerWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <SimplePicker
                      value={selectedIncomeCategory}
                      onValueChange={setSelectedIncomeCategory}
                      items={incomeCategoryItems}
                      colors={colors}
                    />
                  </View>
                )}

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
                      <CustomLegend
                        data={incomeChartData}
                        currency={selectedCurrency}
                        colors={colors}
                        onItemPress={handleIncomeLegendItemPress}
                        isClickable={selectedIncomeCategory === 'all'}
                      />
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

      {/* Balance History Details Modal */}
      <Modal
        visible={balanceHistoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBalanceHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalHeaderLeft}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t('balance_history_details') || 'Balance History Details'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setBalanceHistoryModalVisible(false)}
              >
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Table */}
            <ScrollView style={styles.modalScrollView}>
              <View style={styles.balanceTable}>
                {/* Table Header */}
                <View style={[styles.balanceTableHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.balanceTableHeaderText, { color: colors.text }]}>
                    {t('date') || 'Date'}
                  </Text>
                  <Text style={[styles.balanceTableHeaderText, { color: colors.text }]}>
                    {t('balance') || 'Balance'}
                  </Text>
                  <Text style={[styles.balanceTableHeaderText, { color: colors.text }]}>
                    {t('actions') || 'Actions'}
                  </Text>
                </View>

                {/* Table Rows */}
                {balanceHistoryTableData.map((row, index) => (
                  <View
                    key={row.date}
                    style={[
                      styles.balanceTableRow,
                      index % 2 === 0 && { backgroundColor: colors.altRow },
                      { borderBottomColor: colors.border }
                    ]}
                  >
                    <Text style={[styles.balanceTableCell, { color: colors.text }]}>
                      {row.displayDate}
                    </Text>

                    {editingBalanceRow === row.date ? (
                      <>
                        <TextInput
                          style={[
                            styles.balanceTableInput,
                            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }
                          ]}
                          value={editingBalanceValue}
                          onChangeText={setEditingBalanceValue}
                          keyboardType="decimal-pad"
                          autoFocus
                        />
                        <View style={styles.balanceTableActions}>
                          <TouchableOpacity
                            style={[styles.balanceActionButton, { backgroundColor: colors.primary }]}
                            onPress={() => handleSaveBalance(row.date)}
                          >
                            <Icon name="check" size={16} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.balanceActionButton, { backgroundColor: colors.mutedText }]}
                            onPress={handleCancelEdit}
                          >
                            <Icon name="close" size={16} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.balanceTableCell, { color: row.balance ? colors.text : colors.mutedText }]}>
                          {row.balance || '-'}
                        </Text>
                        <View style={styles.balanceTableActions}>
                          <TouchableOpacity
                            style={[styles.balanceActionButton, { backgroundColor: colors.primary }]}
                            onPress={() => handleEditBalance(row.date, row.balance)}
                          >
                            <Icon name="pencil" size={16} color="#fff" />
                          </TouchableOpacity>
                          {row.balance && (
                            <TouchableOpacity
                              style={[styles.balanceActionButton, { backgroundColor: '#f44336' }]}
                              onPress={() => handleDeleteBalance(row.date)}
                            >
                              <Icon name="delete" size={16} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
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
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
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
  legendItemClickable: {
    paddingHorizontal: 8,
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
  legendChevron: {
    marginLeft: 4,
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
  predictionCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  predictionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  predictionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  predictionStat: {
    flex: 1,
  },
  predictionStatLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  predictionStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  predictionArrow: {
    marginHorizontal: 8,
  },
  predictionProgressContainer: {
    marginBottom: 12,
  },
  predictionProgressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  predictionProgressBar: {
    height: '100%',
    borderRadius: 4,
  },
  predictionProgressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  predictionFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: 12,
  },
  predictionFooterLabel: {
    fontSize: 14,
  },
  predictionFooterValue: {
    fontWeight: '600',
  },
  balanceHistoryCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  balanceHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceHistoryTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  balanceHistoryTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  accountPickerWrapper: {
    minWidth: 140,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    height: 40,
  },
  balanceHistoryLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  balanceHistoryChartContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  balanceHistoryNoData: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  balanceHistoryNoDataText: {
    fontSize: 14,
  },
  balanceTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  balanceTableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
  },
  balanceTableHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  balanceTableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  balanceTableCell: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
  },
  balanceTableInput: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  balanceTableActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  balanceActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default GraphsScreen;
