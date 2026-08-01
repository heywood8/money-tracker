import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import { CartesianChart, Bar, BarGroup, StackedBar, useChartPressState } from 'victory-native';
import { matchFont, Paint, RoundedRect } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencies from '../../../assets/currencies.json';
import useCategoryMonthlySpending, { ALL_EXPENSE_CATEGORIES } from '../../hooks/useCategoryMonthlySpending';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';
import { comparisonSeriesColor } from '../../styles/chartPalette';
import { MONTH_ABBREVIATIONS } from './monthLabels';
import ModalBlurOverlay from '../ModalBlurOverlay';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { CARD_SURFACE, SECTION_LABEL } from '../../styles/componentStyles';
import EmptyState from '../EmptyState';

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
// The x-axis labels now live on the Skia canvas, so the canvas owns their height too.
const CHART_HEIGHT = TOP_PADDING + BAR_HEIGHT + LABEL_HEIGHT;
const CORNER = 4;
const BAR_ANIMATION = { type: 'spring' };
// Stacked segments are separated by a gap in the card's own colour, not by a
// border: a stroke in the surface colour reads as breathing room, an outline
// reads as one more piece of chrome. 2px total (1px either side of the seam).
const STACK_GAP = 2;
// Press state key sets must match the chart's yKeys, so the canvas remounts
// (via `key`) whenever the vs-series is added or removed.
const PRESS_INIT_SINGLE = { x: 0, y: { amount: 0 } };
const PRESS_INIT_VS = { x: 0, y: { primary: 0, vs: 0 } };
// TalkBack can still step through months now that the RN hit slots are gone.
const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

export const formatYTick = (value) => {
  const num = Number(value);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toFixed(0);
};

export const formatPctTick = (value) => `${Math.round(Number(value))}%`;

// "Nice" y-axis step so ticks land on round numbers.
const niceStepFor = (max) => {
  const raw = max / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / mag;
  let nice;
  if (normalized < 1.5) nice = 1;
  else if (normalized < 3.5) nice = 2;
  else if (normalized < 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
};

/**
 * Category-spending bar chart backed by Victory Native XL.
 *
 * Three layouts, all driven by Victory's own bar primitives:
 *  - single:  one <Bar> series
 *  - grouped: <BarGroup> with primary + vs bars side by side per month
 *  - stacked: <StackedBar> over 100%-normalized shares of primary vs vs
 *
 * Axes are drawn by Victory on the Skia canvas (xAxis/yAxis/frame). Month selection
 * runs through `useChartPressState`, so dragging across the chart scrubs months on
 * the UI thread; the selected month is marked by a translucent column highlight.
 */
const SpendingBarChart = ({
  data,
  vsData,
  stacked,
  monthAbbreviations,
  colors,
  width,
  selectedIndex,
  onBarPress,
}) => {
  const count = data.length;
  const hasVs = vsData != null && vsData.length === count;
  const isStacked = stacked && hasVs;
  const vsColor = comparisonSeriesColor(colors);

  const axisMax = useMemo(() => {
    if (isStacked) return 100;
    const max = Math.max(
      ...data.map((d) => d.total),
      ...(hasVs ? vsData.map((d) => d.total) : []),
      1,
    );
    const step = niceStepFor(max);
    return Math.ceil(max / step) * step;
  }, [isStacked, data, vsData, hasVs]);

  // Per-month field bundle consumed by Victory Native. Every series we draw must be a
  // field here AND listed in yKeys, otherwise VN never computes points for it.
  const chartData = useMemo(() => {
    return data.map((d, i) => {
      if (isStacked) {
        // 100%-normalized stack: the two shares always add up to a full-height bar.
        const totalAmt = d.total + vsData[i].total;
        return {
          x: i,
          primary: totalAmt > 0 ? (d.total / totalAmt) * 100 : 0,
          vs: totalAmt > 0 ? (vsData[i].total / totalAmt) * 100 : 0,
        };
      }
      if (hasVs) {
        return { x: i, primary: d.total, vs: vsData[i].total };
      }
      return { x: i, amount: d.total };
    });
  }, [data, vsData, hasVs, isStacked]);

  const yKeys = useMemo(() => (hasVs ? ['primary', 'vs'] : ['amount']), [hasVs]);

  const domain = useMemo(() => ({ y: [0, axisMax] }), [axisMax]);

  // System-font axis labels (the project ships no .ttf). matchFont returns a stub
  // under Jest and a real SkFont on device, so the call is guarded.
  const axisFont = useMemo(() => {
    try {
      return matchFont({ fontFamily: 'sans-serif', fontSize: 9 }) || null;
    } catch (e) {
      return null;
    }
  }, []);

  // Dragging across the canvas scrubs the selected month. x values are the month
  // indices themselves, so the pressed x rounds straight to a data index.
  const { state: pressState } = useChartPressState(
    hasVs ? PRESS_INIT_VS : PRESS_INIT_SINGLE,
  );

  useAnimatedReaction(
    () => pressState.x.value.value,
    (current, previous) => {
      if (current === previous) return;
      const index = Math.round(current);
      if (index >= 0 && index < count) {
        runOnJS(onBarPress)(index);
      }
    },
    [count, onBarPress],
  );

  const handleAccessibilityAction = useCallback(
    (event) => {
      const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
      const base = selectedIndex == null ? count - 1 : selectedIndex;
      const next = Math.min(count - 1, Math.max(0, base + step));
      onBarPress(next);
    },
    [count, selectedIndex, onBarPress],
  );

  // Translucent column behind the selected month — replaces the old dashed RN
  // overlay and works identically in all three layouts.
  const renderHighlight = useCallback(
    (points, chartBounds, slot) => {
      const anchor = points[hasVs ? 'primary' : 'amount']?.[selectedIndex];
      if (selectedIndex == null || !anchor) return null;
      return (
        <RoundedRect
          x={anchor.x - slot / 2}
          y={chartBounds.top}
          width={slot}
          height={chartBounds.bottom - chartBounds.top}
          r={6}
          color={colors.primary}
          opacity={0.12}
        />
      );
    },
    [hasVs, selectedIndex, colors.primary],
  );

  const renderSeries = useCallback(
    (points, chartBounds, slot) => {
      if (isStacked) {
        return (
          <StackedBar
            chartBounds={chartBounds}
            points={[points.primary, points.vs]}
            colors={[colors.primary, vsColor]}
            barWidth={slot * 0.6}
            animate={BAR_ANIMATION}
            barOptions={({ isTop, isBottom }) => {
              const gap = (
                <Paint
                  key="stack-gap"
                  style="stroke"
                  strokeWidth={STACK_GAP}
                  color={colors.altRow}
                />
              );
              if (isTop) return { roundedCorners: { topLeft: CORNER, topRight: CORNER }, children: gap };
              if (isBottom) return { roundedCorners: { bottomLeft: CORNER, bottomRight: CORNER }, children: gap };
              return { children: gap };
            }}
          />
        );
      }

      if (hasVs) {
        return (
          <BarGroup
            chartBounds={chartBounds}
            betweenGroupPadding={0.35}
            withinGroupPadding={0.1}
            roundedCorners={{ topLeft: CORNER, topRight: CORNER }}
          >
            <BarGroup.Bar points={points.primary} color={colors.primary} animate={BAR_ANIMATION} />
            <BarGroup.Bar points={points.vs} color={vsColor} animate={BAR_ANIMATION} />
          </BarGroup>
        );
      }

      return (
        <Bar
          points={points.amount}
          chartBounds={chartBounds}
          color={colors.primary}
          barWidth={slot * 0.5}
          roundedCorners={{ topLeft: CORNER, topRight: CORNER }}
          animate={BAR_ANIMATION}
        />
      );
    },
    [isStacked, hasVs, colors.primary, colors.altRow, vsColor],
  );

  const renderChart = useCallback(
    ({ points, chartBounds }) => {
      const slot = (chartBounds.right - chartBounds.left) / Math.max(count, 1);
      return (
        <>
          {renderHighlight(points, chartBounds, slot)}
          {renderSeries(points, chartBounds, slot)}
        </>
      );
    },
    [count, renderHighlight, renderSeries],
  );

  const selectedMonthLabel = selectedIndex != null && data[selectedIndex]
    ? monthAbbreviations[data[selectedIndex].month]
    : '';

  return (
    <View
      style={[styles.chartWrap, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${selectedMonthLabel} ${formatYTick(data[selectedIndex]?.total ?? 0)}`}
      accessibilityActions={ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <View style={styles.chartCanvas}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={yKeys}
          domain={domain}
          domainPadding={{ left: 6, right: 6, top: TOP_PADDING }}
          chartPressState={pressState}
          xAxis={{
            font: axisFont,
            lineWidth: 0,
            labelColor: colors.mutedText,
            tickCount: count,
            formatXLabel: (value) => monthAbbreviations[data[Math.round(value)]?.month] ?? '',
          }}
          yAxis={[{
            font: axisFont,
            lineColor: colors.border,
            labelColor: colors.mutedText,
            tickCount: 5,
            formatYLabel: isStacked ? formatPctTick : formatYTick,
            // Solid hairline: a dashed grid reads as a threshold or a projection
            // when all it is is the grid.
          }]}
          frame={{ lineWidth: 0 }}
        >
          {renderChart}
        </CartesianChart>
      </View>
    </View>
  );
};

const CategorySpendingCard = ({
  colors,
  t,
  selectedCurrency,
  selectedCategory,
  onCategoryChange,
  categories,
  convertAllCurrencies = false,
}) => {
  // null = closed, 'primary' = picking primary, 'vs' = picking vs category
  const [pickerMode, setPickerMode] = useState(null);
  const [vsCategory, setVsCategory] = useState(null);
  const [expandedParents, setExpandedParents] = useState(new Set());
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);
  const [showStackedBar, setShowStackedBar] = useState(false);
  const vsColor = comparisonSeriesColor(colors);

  const allExpenseCategories = useMemo(() => {
    return categories.filter(cat =>
      cat.categoryType === 'expense' &&
      !cat.isShadow,
    );
  }, [categories]);

  const parentExpenseCategories = useMemo(() => {
    return allExpenseCategories.filter(cat => cat.parentId === null);
  }, [allExpenseCategories]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    parentExpenseCategories.forEach(parent => {
      const children = allExpenseCategories.filter(cat => cat.parentId === parent.id);
      map.set(parent.id, children);
    });
    return map;
  }, [parentExpenseCategories, allExpenseCategories]);

  // No pick (or a stale one) means the whole expense trend, not an arbitrary
  // first category — the default view should describe all spending.
  const effectiveCategory = useMemo(() => {
    if (selectedCategory && allExpenseCategories.some(c => c.id === selectedCategory)) {
      return selectedCategory;
    }
    return ALL_EXPENSE_CATEGORIES;
  }, [selectedCategory, allExpenseCategories]);

  const effectiveVsCategory = useMemo(() => {
    if (!vsCategory) return null;
    return allExpenseCategories.some(c => c.id === vsCategory) ? vsCategory : null;
  }, [vsCategory, allExpenseCategories]);

  const isAllCategories = effectiveCategory === ALL_EXPENSE_CATEGORIES;

  const selectedCategoryName = useMemo(() => {
    if (isAllCategories) return t('all_categories');
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat ? cat.name : '';
  }, [allExpenseCategories, effectiveCategory, isAllCategories, t]);

  const selectedCategoryIcon = useMemo(() => {
    if (isAllCategories) return 'shape-outline';
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat?.icon ?? null;
  }, [allExpenseCategories, effectiveCategory, isAllCategories]);

  const vsCategoryName = useMemo(() => {
    if (!effectiveVsCategory) return '';
    const cat = allExpenseCategories.find(c => c.id === effectiveVsCategory);
    return cat ? cat.name : '';
  }, [allExpenseCategories, effectiveVsCategory]);

  const vsCategoryIcon = useMemo(() => {
    if (!effectiveVsCategory) return null;
    const cat = allExpenseCategories.find(c => c.id === effectiveVsCategory);
    return cat?.icon ?? null;
  }, [allExpenseCategories, effectiveVsCategory]);

  const toggleParent = useCallback((parentId) => {
    setExpandedParents(prev => {
      if (prev.has(parentId)) return new Set();
      return new Set([parentId]);
    });
  }, []);

  const openPicker = useCallback((mode) => {
    setExpandedParents(new Set());
    setPickerMode(mode);
  }, []);

  const handleSelectCategory = useCallback((categoryId) => {
    if (pickerMode === 'primary') {
      onCategoryChange(categoryId);
    } else if (pickerMode === 'vs') {
      setVsCategory(categoryId);
    }
    setPickerMode(null);
  }, [pickerMode, onCategoryChange]);

  const clearVsCategory = useCallback(() => {
    setVsCategory(null);
    setShowStackedBar(false);
  }, []);

  const { monthlyData, loading } = useCategoryMonthlySpending(selectedCurrency, effectiveCategory, categories, convertAllCurrencies);
  const { monthlyData: vsMonthlyData, loading: vsLoading } = useCategoryMonthlySpending(selectedCurrency, effectiveVsCategory, categories, convertAllCurrencies);

  const { hideBalances } = useDisplaySettings();

  const monthAbbreviations = MONTH_ABBREVIATIONS;
  const monthKeys = ['month_january', 'month_february', 'month_march', 'month_april', 'month_may', 'month_june', 'month_july', 'month_august', 'month_september', 'month_october', 'month_november', 'month_december'];

  const hasData = monthlyData.some(item => item.total > 0);
  const hasVsData = effectiveVsCategory !== null && !vsLoading && vsMonthlyData.length > 0;

  const prevDataRef = React.useRef(monthlyData);
  if (prevDataRef.current !== monthlyData) {
    prevDataRef.current = monthlyData;
    if (selectedBarIndex !== null) setSelectedBarIndex(null);
  }

  const effectiveBarIndex = selectedBarIndex !== null ? selectedBarIndex : monthlyData.length - 1;
  const displayedTotal = monthlyData.length > 0 ? (monthlyData[effectiveBarIndex]?.total ?? 0) : 0;
  const vsDisplayedTotal = effectiveVsCategory && vsMonthlyData.length > 0
    ? (vsMonthlyData[effectiveBarIndex]?.total ?? 0)
    : 0;

  if (parentExpenseCategories.length === 0) {
    return null;
  }

  const pickerContent = (
    <ScrollView>
      {/* "All categories" is only offered for the primary series — comparing a
          category against the total it is part of is not a meaningful vs. */}
      {pickerMode === 'primary' && (
        <View style={[styles.parentRow, { borderBottomColor: colors.border }]}>
          <View style={styles.expandPlaceholder} />
          <TouchableOpacity
            style={[
              styles.categoryItem,
              isAllCategories && { backgroundColor: colors.selected },
            ]}
            onPress={() => handleSelectCategory(ALL_EXPENSE_CATEGORIES)}
          >
            <Text style={[styles.categoryText, { color: colors.text }]}>
              {t('all_categories')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {parentExpenseCategories.map(parent => {
        const children = childrenByParent.get(parent.id) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedParents.has(parent.id);
        const isSelected = pickerMode === 'primary'
          ? effectiveCategory === parent.id
          : effectiveVsCategory === parent.id;

        return (
          <View key={parent.id}>
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

            {hasChildren && isExpanded && children.map(child => {
              const isChildSelected = pickerMode === 'primary'
                ? effectiveCategory === child.id
                : effectiveVsCategory === child.id;
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
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
      <View style={styles.header}>
        {/* Left: label + primary category selector + vs selector */}
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('category_spending_trend').toUpperCase()}
          </Text>
          <TouchableOpacity
            style={styles.categorySelector}
            onPress={() => openPicker('primary')}
          >
            {selectedCategoryIcon && (
              <Icon name={selectedCategoryIcon} size={18} color={colors.text} />
            )}
            <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
              {selectedCategoryName}
            </Text>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </TouchableOpacity>

          {/* VS category selector row */}
          <View style={styles.vsRow}>
            <TouchableOpacity
              style={styles.vsSelector}
              onPress={() => openPicker('vs')}
            >
              {effectiveVsCategory ? (
                <>
                  <Text style={[styles.vsText, { color: colors.mutedText }]}>vs</Text>
                  {/* The mark beside the label carries the series identity; the
                      label itself stays in ink, so it is never a colour-only cue. */}
                  <View style={[styles.seriesDot, { backgroundColor: vsColor }]} />
                  {vsCategoryIcon && (
                    <Icon name={vsCategoryIcon} size={14} color={colors.text} />
                  )}
                  <Text style={[styles.vsCategoryName, { color: colors.text }]} numberOfLines={1}>
                    {vsCategoryName}
                  </Text>
                </>
              ) : (
                <>
                  <Icon name="plus-circle-outline" size={13} color={colors.mutedText} />
                  <Text style={[styles.vsText, { color: colors.mutedText }]}>vs</Text>
                </>
              )}
            </TouchableOpacity>
            {effectiveVsCategory && (
              <TouchableOpacity
                onPress={clearVsCategory}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={14} color={colors.mutedText} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Right: stacked toggle (vs mode only) + amount(s) + month label */}
        <View style={styles.headerRight}>
          {hasVsData && (
            <TouchableOpacity
              style={styles.stackedToggleBtn}
              onPress={() => setShowStackedBar(v => !v)}
              activeOpacity={0.7}
              testID="stacked-bar-toggle-btn"
            >
              <Icon
                name={showStackedBar ? 'chart-bar' : 'chart-bar-stacked'}
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
          {!hideBalances && (
            <>
              {/* In vs mode the two figures need telling apart, so each gets the
                  dot of its series — the number itself stays in text ink. */}
              <View style={styles.amountRow}>
                {effectiveVsCategory && (
                  <View style={[styles.seriesDot, { backgroundColor: colors.primary }]} />
                )}
                <Text style={[styles.currentAmount, { color: colors.text }]}>
                  {formatCurrency(displayedTotal, selectedCurrency)}
                </Text>
              </View>
              {effectiveVsCategory && (
                <View style={styles.amountRow}>
                  <View style={[styles.seriesDot, { backgroundColor: vsColor }]} />
                  <Text style={[styles.currentAmount, { color: colors.text }]}>
                    {vsLoading ? '...' : formatCurrency(vsDisplayedTotal, selectedCurrency)}
                  </Text>
                </View>
              )}
            </>
          )}
          <Text style={[styles.thisMonthLabel, { color: colors.mutedText }]}>
            {effectiveBarIndex === monthlyData.length - 1
              ? t('this_month')
              : monthlyData[effectiveBarIndex]
                ? `${t(monthKeys[monthlyData[effectiveBarIndex].month])} ${monthlyData[effectiveBarIndex].year}`
                : ''}
          </Text>
        </View>
      </View>

      {/* Category Picker Modal (shared for primary and vs) */}
      {pickerMode !== null && <ModalBlurOverlay />}
      <Modal
        visible={pickerMode !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerMode(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerMode(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {pickerContent}
          </View>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !hasData ? (
        <EmptyState
          message={t('no_spending_data')}
          fill={false}
          style={styles.emptyContainer}
        />
      ) : (
        <SpendingBarChart
          // Remount when the vs-series appears/disappears: the chart press state
          // is keyed by series and cannot change shape in place.
          key={hasVsData ? 'vs' : 'single'}
          data={monthlyData}
          vsData={hasVsData ? vsMonthlyData : null}
          stacked={showStackedBar && hasVsData}
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

SpendingBarChart.propTypes = {
  colors: PropTypes.object.isRequired,
  data: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })).isRequired,
  monthAbbreviations: PropTypes.arrayOf(PropTypes.string).isRequired,
  onBarPress: PropTypes.func.isRequired,
  selectedIndex: PropTypes.number,
  stacked: PropTypes.bool,
  vsData: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })),
  width: PropTypes.number.isRequired,
};

CategorySpendingCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  selectedCategory: PropTypes.string,
  onCategoryChange: PropTypes.func.isRequired,
  categories: PropTypes.array.isRequired,
  convertAllCurrencies: PropTypes.bool,
};

const styles = StyleSheet.create({
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
  },
  categoryItem: {
    borderRadius: BORDER_RADIUS.sm,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  categoryName: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  categorySelector: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: 4,
  },
  categoryText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '500',
  },
  chartCanvas: {
    height: CHART_HEIGHT,
  },
  chartWrap: {
    marginTop: 12,
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
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    textAlign: 'right',
  },
  emptyContainer: {
    height: 120,
    paddingHorizontal: SPACING.xxl,
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
    borderRadius: BORDER_RADIUS.md,
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
  sectionLabel: SECTION_LABEL,
  seriesDot: {
    borderRadius: BORDER_RADIUS.pill,
    height: 8,
    width: 8,
  },
  stackedToggleBtn: {
    alignSelf: 'flex-end',
    height: 28,
    justifyContent: 'center',
    marginBottom: 2,
    width: 28,
  },
  thisMonthLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  vsCategoryName: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  vsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: 4,
  },
  vsSelector: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  vsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
});

export default CategorySpendingCard;
