import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import currencies from '../../../assets/currencies.json';
import useCategoryMonthlySpending from '../../hooks/useCategoryMonthlySpending';
import { HORIZONTAL_PADDING } from '../../styles/layout';
import ModalBlurOverlay from '../ModalBlurOverlay';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';

const screenWidth = Dimensions.get('window').width;

const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  const symbol = currencyInfo?.symbol ?? currency;
  return `${symbol}${parseFloat(amount).toFixed(decimals)}`;
};

const BAR_HEIGHT = 90;
const LABEL_HEIGHT = 18;
const TOP_PADDING = 8;
const Y_AXIS_WIDTH = 32;

const formatYTick = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
};

const BarChart = ({ data, monthAbbreviations, colors, width, selectedIndex, onBarPress }) => {
  const max = Math.max(...data.map(d => d.total), 1);
  const count = data.length;
  const chartW = width - Y_AXIS_WIDTH;
  const slotW = chartW / count;
  const barW = slotW * 0.55;
  const gap = slotW * 0.45;
  const totalHeight = TOP_PADDING + BAR_HEIGHT + LABEL_HEIGHT;

  const niceStep = (() => {
    const raw = max / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / mag;
    let nice;
    if (normalized < 1.5) nice = 1;
    else if (normalized < 3.5) nice = 2;
    else if (normalized < 7.5) nice = 5;
    else nice = 10;
    return nice * mag;
  })();

  const axisMax = Math.ceil(max / niceStep) * niceStep;
  const tickCount = Math.round(axisMax / niceStep);

  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => ({
    value: niceStep * i,
    y: TOP_PADDING + BAR_HEIGHT - (niceStep * i / axisMax) * BAR_HEIGHT,
  }));

  return (
    <Svg width={width} height={totalHeight} style={styles.barChartSvg}>
      {/* Y axis ticks */}
      {yTicks.map(({ value, y }) => (
        <SvgText
          key={value}
          x={Y_AXIS_WIDTH - 4}
          y={y + 3.5}
          fontSize={8}
          fontFamily="Inter"
          fill={colors.mutedText}
          textAnchor="end"
          opacity={0.7}
        >
          {formatYTick(value)}
        </SvgText>
      ))}

      {/* Selected bar dotted line */}
      {selectedIndex !== null && selectedIndex !== undefined && data[selectedIndex] && (() => {
        const selH = Math.max((data[selectedIndex].total / axisMax) * BAR_HEIGHT, data[selectedIndex].total > 0 ? 2 : 0);
        const lineY = TOP_PADDING + BAR_HEIGHT - selH;
        return (
          <Line
            x1={Y_AXIS_WIDTH}
            y1={lineY}
            x2={width}
            y2={lineY}
            stroke={colors.primary}
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.5}
          />
        );
      })()}

      {/* Bars */}
      {data.map((d, i) => {
        const h = Math.max((d.total / axisMax) * BAR_HEIGHT, d.total > 0 ? 2 : 0);
        const x = Y_AXIS_WIDTH + i * slotW + gap / 2;
        const y = TOP_PADDING + BAR_HEIGHT - h;
        const isSelected = i === selectedIndex;
        const label = monthAbbreviations[d.month];
        return (
          <React.Fragment key={i}>
            <Rect
              x={x}
              y={TOP_PADDING}
              width={barW}
              height={BAR_HEIGHT}
              fill="transparent"
              onPress={() => onBarPress(i)}
            />
            <Rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={3}
              fill={isSelected ? colors.primary : colors.surface}
              stroke={isSelected ? 'none' : colors.border}
              strokeWidth={1}
              onPress={() => onBarPress(i)}
            />
            <SvgText
              x={x + barW / 2}
              y={TOP_PADDING + BAR_HEIGHT + 13}
              fontSize={9.5}
              fontFamily="Inter"
              fill={colors.mutedText}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
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
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);

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

  // Get display info for selected category
  const selectedCategoryName = useMemo(() => {
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat ? cat.name : '';
  }, [allExpenseCategories, effectiveCategory]);

  const selectedCategoryIcon = useMemo(() => {
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat?.icon ?? null;
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
  } = useCategoryMonthlySpending(selectedCurrency, effectiveCategory, categories);

  const { hideBalances } = useDisplaySettings();

  // Two-letter month abbreviations (for bar labels)
  const monthAbbreviations = ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'];
  const monthKeys = ['month_january', 'month_february', 'month_march', 'month_april', 'month_may', 'month_june', 'month_july', 'month_august', 'month_september', 'month_october', 'month_november', 'month_december'];

  // Check if there's any data to display
  const hasData = monthlyData.some(item => item.total > 0);

  // Reset bar selection when data changes (e.g. category switch)
  const prevDataRef = React.useRef(monthlyData);
  if (prevDataRef.current !== monthlyData) {
    prevDataRef.current = monthlyData;
    if (selectedBarIndex !== null) setSelectedBarIndex(null);
  }

  const effectiveBarIndex = selectedBarIndex !== null ? selectedBarIndex : monthlyData.length - 1;
  const displayedTotal = monthlyData.length > 0 ? (monthlyData[effectiveBarIndex]?.total ?? 0) : 0;

  // Don't render if no parent categories available
  if (parentExpenseCategories.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
      <View style={styles.header}>
        {/* Left: label + category selector */}
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('category_spending_trend').toUpperCase()}
          </Text>
          <TouchableOpacity
            style={styles.categorySelector}
            onPress={() => setPickerVisible(true)}
          >
            {selectedCategoryIcon && (
              <Icon name={selectedCategoryIcon} size={18} color={colors.primary} />
            )}
            <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
              {selectedCategoryName}
            </Text>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </TouchableOpacity>
        </View>
        {/* Right: current month amount */}
        <View style={styles.headerRight}>
          {!hideBalances && (
            <Text style={[styles.currentAmount, { color: colors.text }]}>
              {formatCurrency(displayedTotal, selectedCurrency)}
            </Text>
          )}
          <Text style={[styles.thisMonthLabel, { color: colors.mutedText }]}>
            {effectiveBarIndex === monthlyData.length - 1 ? t('this_month') : monthlyData[effectiveBarIndex] ? `${t(monthKeys[monthlyData[effectiveBarIndex].month])} ${monthlyData[effectiveBarIndex].year}` : ''}
          </Text>
        </View>
      </View>

      {/* Custom Category Picker Modal */}
      {pickerVisible && <ModalBlurOverlay />}
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
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
        <BarChart
          data={monthlyData}
          monthAbbreviations={monthAbbreviations}
          colors={colors}
          width={screenWidth - 64}
          selectedIndex={effectiveBarIndex}
          onBarPress={setSelectedBarIndex}
        />
      )}
    </View>
  );
};

BarChart.propTypes = {
  colors: PropTypes.object.isRequired,
  data: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })).isRequired,
  monthAbbreviations: PropTypes.arrayOf(PropTypes.string).isRequired,
  onBarPress: PropTypes.func.isRequired,
  selectedIndex: PropTypes.number,
  width: PropTypes.number.isRequired,
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
  barChartSvg: {
    marginTop: 12,
  },
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
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  categorySelector: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: '500',
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
  currentAmount: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    height: 120,
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: 44,
  },
  expandPlaceholder: {
    width: 44,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  loadingContainer: {
    alignItems: 'center',
    height: 120,
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
    flex: 1,
    justifyContent: 'center',
  },
  parentRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  thisMonthLabel: {
    fontSize: 11,
    marginTop: 2,
  },
});

export default CategorySpendingCard;
