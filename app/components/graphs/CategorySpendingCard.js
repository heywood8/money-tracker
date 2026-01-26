import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import { BarChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import currencies from '../../../assets/currencies.json';
import useCategoryMonthlySpending from '../../hooks/useCategoryMonthlySpending';
import { HORIZONTAL_PADDING } from '../../styles/layout';

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
  selectedCurrency,
  selectedCategory,
  onCategoryChange,
  categories,
}) => {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [expandedParents, setExpandedParents] = useState(new Set());

  // Get all expense categories (parent and child)
  const allExpenseCategories = useMemo(() => {
    return categories.filter(cat =>
      cat.categoryType === 'expense' &&
      !cat.isShadow,
    );
  }, [categories]);

  // Get parent expense categories for default selection
  const parentExpenseCategories = useMemo(() => {
    return allExpenseCategories.filter(cat => cat.parentId === null);
  }, [allExpenseCategories]);

  // Get children for each parent
  const childrenByParent = useMemo(() => {
    const map = new Map();
    parentExpenseCategories.forEach(parent => {
      const children = allExpenseCategories.filter(cat => cat.parentId === parent.id);
      map.set(parent.id, children);
    });
    return map;
  }, [parentExpenseCategories, allExpenseCategories]);

  // Default to first parent category if none selected
  const effectiveCategory = useMemo(() => {
    if (selectedCategory && allExpenseCategories.some(c => c.id === selectedCategory)) {
      return selectedCategory;
    }
    return parentExpenseCategories.length > 0 ? parentExpenseCategories[0].id : null;
  }, [selectedCategory, allExpenseCategories, parentExpenseCategories]);

  // Get display name for selected category
  const selectedCategoryName = useMemo(() => {
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat ? cat.name : '';
  }, [allExpenseCategories, effectiveCategory]);

  // Toggle parent expansion (only one can be expanded at a time)
  const toggleParent = useCallback((parentId) => {
    setExpandedParents(prev => {
      if (prev.has(parentId)) {
        // Collapse if already expanded
        return new Set();
      } else {
        // Expand this one, collapse all others
        return new Set([parentId]);
      }
    });
  }, []);

  // Handle category selection
  const handleSelectCategory = useCallback((categoryId) => {
    onCategoryChange(categoryId);
    setPickerVisible(false);
  }, [onCategoryChange]);

  // Use the hook to get monthly spending data (last 12 months)
  const {
    monthlyData,
    loading,
    totalYearlySpending,
  } = useCategoryMonthlySpending(selectedCurrency, effectiveCategory, categories);

  // Two-letter month abbreviations
  const monthAbbreviations = ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'];

  // Generate month labels
  const monthLabels = useMemo(() => {
    return monthlyData.map(item => monthAbbreviations[item.month]);
  }, [monthlyData]);

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
        {/* Category Picker Button */}
        <TouchableOpacity
          style={[styles.pickerButton, { backgroundColor: colors.altRow, borderColor: colors.border }]}
          onPress={() => setPickerVisible(true)}
        >
          <Text style={[styles.pickerButtonText, { color: colors.text }]} numberOfLines={1}>
            {selectedCategoryName}
          </Text>
          <Icon name="chevron-down" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </View>

      {/* Custom Category Picker Modal */}
      <Modal
        visible={pickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <ScrollView>
              {parentExpenseCategories.map(parent => {
                const children = childrenByParent.get(parent.id) || [];
                const hasChildren = children.length > 0;
                const isExpanded = expandedParents.has(parent.id);
                const isSelected = effectiveCategory === parent.id;

                return (
                  <View key={parent.id}>
                    {/* Parent row */}
                    <View style={[styles.parentRow, { borderBottomColor: colors.border }]}>
                      {hasChildren && (
                        <TouchableOpacity
                          style={styles.expandButton}
                          onPress={() => toggleParent(parent.id)}
                        >
                          <Icon
                            name={isExpanded ? 'chevron-down' : 'chevron-right'}
                            size={20}
                            color={colors.mutedText}
                          />
                        </TouchableOpacity>
                      )}
                      {!hasChildren && <View style={styles.expandPlaceholder} />}
                      <TouchableOpacity
                        style={[
                          styles.categoryItem,
                          isSelected && { backgroundColor: colors.selected },
                        ]}
                        onPress={() => handleSelectCategory(parent.id)}
                      >
                        <Text style={[styles.categoryText, { color: colors.text }]}>
                          {parent.name}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Children (if expanded) */}
                    {hasChildren && isExpanded && children.map(child => {
                      const isChildSelected = effectiveCategory === child.id;
                      return (
                        <TouchableOpacity
                          key={child.id}
                          style={[
                            styles.childRow,
                            { borderBottomColor: colors.border },
                            isChildSelected && { backgroundColor: colors.selected },
                          ]}
                          onPress={() => handleSelectCategory(child.id)}
                        >
                          <Text style={[styles.childText, { color: colors.text }]}>
                            {child.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
              width={screenWidth - 50}
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
                propsForLabels: {
                  fontSize: 11,
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

          {/* 12-Month Total */}
          <View style={styles.totalContainer}>
            <Text style={[styles.totalLabel, { color: colors.mutedText }]}>
              {t('last_12_months_total')}
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
  categoryItem: {
    borderRadius: 4,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: '500',
  },
  chart: {
    borderRadius: 8,
  },
  chartContainer: {
    alignItems: 'center',
  },
  childRow: {
    borderBottomWidth: 1,
    marginLeft: 44,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 12,
  },
  childText: {
    fontSize: 15,
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
  expandButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    width: 36,
  },
  expandPlaceholder: {
    width: 36,
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
  modalContent: {
    borderRadius: 8,
    maxHeight: '60%',
    overflow: 'hidden',
    width: '80%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
  },
  parentRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  pickerButton: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    minWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
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
