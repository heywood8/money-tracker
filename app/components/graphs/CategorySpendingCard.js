import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import { BarChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import SimplePicker from '../SimplePicker';
import currencies from '../../../assets/currencies.json';
import useCategoryMonthlySpending from '../../hooks/useCategoryMonthlySpending';

const screenWidth = Dimensions.get('window').width;

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  return `${parseFloat(amount).toFixed(decimals)} ${currency}`;
};

const formatYLabel = (value) => {
  const numValue = parseFloat(value);
  if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(1)}M`;
  } else if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(0)}K`;
  }
  return numValue.toFixed(0);
};

const CategorySpendingCard = ({
  colors,
  t,
  selectedYear,
  selectedCurrency,
  selectedCategory,
  onCategoryChange,
  categories,
}) => {
  // Filter to get only parent expense categories (folders with no parent)
  const parentExpenseCategories = useMemo(() => {
    return categories.filter(cat =>
      cat.parentId === null &&
      cat.categoryType === 'expense' &&
      !cat.isShadow,
    );
  }, [categories]);

  // Build picker items
  const categoryItems = useMemo(() => {
    return parentExpenseCategories.map(cat => ({
      label: cat.name,
      value: cat.id,
    }));
  }, [parentExpenseCategories]);

  // Default to first parent category if none selected
  const effectiveCategory = useMemo(() => {
    if (selectedCategory && parentExpenseCategories.some(c => c.id === selectedCategory)) {
      return selectedCategory;
    }
    return parentExpenseCategories.length > 0 ? parentExpenseCategories[0].id : null;
  }, [selectedCategory, parentExpenseCategories]);

  // Get the selected category name for the title
  const selectedCategoryName = useMemo(() => {
    const cat = parentExpenseCategories.find(c => c.id === effectiveCategory);
    return cat ? cat.name : '';
  }, [parentExpenseCategories, effectiveCategory]);

  // Use the hook to get monthly spending data
  const {
    monthlyData,
    loading,
    totalYearlySpending,
  } = useCategoryMonthlySpending(selectedYear, selectedCurrency, effectiveCategory, categories);

  // Month abbreviations (1 character each)
  const monthLabels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  // Prepare chart data
  const chartData = useMemo(() => {
    return {
      labels: monthLabels,
      datasets: [
        {
          data: monthlyData.map(item => item.total),
        },
      ],
    };
  }, [monthlyData, monthLabels]);

  // Check if there's any data to display
  const hasData = monthlyData.some(item => item.total > 0);

  // Don't render if no parent categories available
  if (parentExpenseCategories.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Icon name="chart-bar" size={24} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>
            {t('category_spending_trend')}
          </Text>
        </View>
        {/* Category Picker */}
        <View style={[styles.pickerWrapper, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
          <SimplePicker
            value={effectiveCategory}
            onValueChange={onCategoryChange}
            items={categoryItems}
            colors={colors}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !hasData ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('no_spending_data')}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.chartContainer}>
            <BarChart
              data={chartData}
              width={screenWidth - 64}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero={true}
              showValuesOnTopOfBars={false}
              withInnerLines={true}
              flatColor={true}
              formatYLabel={formatYLabel}
              chartConfig={{
                backgroundColor: colors.altRow,
                backgroundGradientFrom: colors.altRow,
                backgroundGradientTo: colors.altRow,
                decimalPlaces: 0,
                color: () => colors.primary,
                labelColor: () => colors.mutedText,
                barPercentage: 0.6,
                style: {
                  borderRadius: 16,
                },
                propsForBackgroundLines: {
                  strokeWidth: 1,
                  stroke: colors.border,
                  strokeDasharray: '0',
                },
              }}
              style={styles.chart}
            />
          </View>

          {/* Yearly Total */}
          <View style={styles.totalContainer}>
            <Text style={[styles.totalLabel, { color: colors.mutedText }]}>
              {t('yearly_total')}
            </Text>
            <Text style={[styles.totalValue, { color: colors.expense || '#ff4444' }]}>
              {formatCurrency(totalYearlySpending, selectedCurrency)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

CategorySpendingCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedYear: PropTypes.number.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  selectedCategory: PropTypes.string,
  onCategoryChange: PropTypes.func.isRequired,
  categories: PropTypes.array.isRequired,
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  chart: {
    borderRadius: 8,
  },
  chartContainer: {
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
  },
  pickerWrapper: {
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 120,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  titleContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  totalContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CategorySpendingCard;
