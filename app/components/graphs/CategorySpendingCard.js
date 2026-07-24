import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import { CartesianChart, Bar } from 'victory-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
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
const CHART_HEIGHT = TOP_PADDING + BAR_HEIGHT;
const CORNER = 4;
const VS_COLOR = '#FF7043';

const formatYTick = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
};

const formatPctTick = (value) => value + '%';

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
 * Three layouts, all driven by the same <CartesianChart>/<Bar> primitives:
 *  - single:  one series, selected bar highlighted in `primary`, rest dimmed `mutedText`
 *  - grouped: primary (wide) + vs (narrow) bars overlaid per month for comparison
 *  - stacked: `vs` full-height behind + `primary` bottom portion in front → 100%-normalized stack
 *
 * Axis labels, month ticks, the selection reference line and bar-press hit areas are
 * rendered as React Native views (not Skia) so they stay themeable, queryable and font-free.
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
  const chartW = width - Y_AXIS_WIDTH;

  const { axisMax, yTicks } = useMemo(() => {
    if (isStacked) {
      return {
        axisMax: 100,
        yTicks: [0, 25, 50, 75, 100].map((v) => ({
          value: v,
          label: formatPctTick(v),
          y: TOP_PADDING + BAR_HEIGHT - (v / 100) * BAR_HEIGHT,
        })),
      };
    }
    const max = Math.max(
      ...data.map((d) => d.total),
      ...(hasVs ? vsData.map((d) => d.total) : []),
      1,
    );
    const step = niceStepFor(max);
    const aMax = Math.ceil(max / step) * step;
    const tickCount = Math.round(aMax / step);
    return {
      axisMax: aMax,
      yTicks: Array.from({ length: tickCount + 1 }, (_, i) => ({
        value: step * i,
        label: formatYTick(step * i),
        y: TOP_PADDING + BAR_HEIGHT - ((step * i) / aMax) * BAR_HEIGHT,
      })),
    };
  }, [isStacked, data, vsData, hasVs]);

  // Per-month field bundle consumed by Victory Native. Every series we draw must be a
  // field here AND listed in yKeys, otherwise VN never computes points for it.
  const chartData = useMemo(() => {
    return data.map((d, i) => {
      const isSel = i === selectedIndex;
      if (isStacked) {
        const vsD = vsData[i];
        const totalAmt = d.total + vsD.total;
        const primaryPct = totalAmt > 0 ? (d.total / totalAmt) * 100 : 0;
        // `back` (vs) is full height and sits behind; `front` (primary) covers the
        // bottom portion, so the exposed top slice reads as the vs share.
        const back = totalAmt > 0 ? 100 : 0;
        const front = totalAmt > 0 ? primaryPct : 0;
        return {
          x: i,
          track: totalAmt > 0 ? 0 : 100,
          back,
          front,
          backSel: isSel ? back : 0,
          frontSel: isSel ? front : 0,
        };
      }
      if (hasVs) {
        const vsD = vsData[i];
        return {
          x: i,
          primary: d.total,
          primarySel: isSel ? d.total : 0,
          vs: vsD.total,
          vsSel: isSel ? vsD.total : 0,
        };
      }
      return {
        x: i,
        amount: d.total,
        amountSel: isSel ? d.total : 0,
      };
    });
  }, [data, vsData, hasVs, isStacked, selectedIndex]);

  const yKeys = useMemo(() => {
    if (isStacked) return ['track', 'back', 'front', 'backSel', 'frontSel'];
    if (hasVs) return ['primary', 'primarySel', 'vs', 'vsSel'];
    return ['amount', 'amountSel'];
  }, [isStacked, hasVs]);

  const domain = useMemo(() => ({ y: [0, axisMax] }), [axisMax]);

  // Dotted reference line at the selected bar's top (single/grouped only, matching the
  // original which omitted it in stacked mode).
  const selLineTop = useMemo(() => {
    if (isStacked) return null;
    if (selectedIndex == null || !data[selectedIndex]) return null;
    const sel = data[selectedIndex];
    const h = Math.max((sel.total / axisMax) * BAR_HEIGHT, sel.total > 0 ? 2 : 0);
    return TOP_PADDING + BAR_HEIGHT - h;
  }, [isStacked, selectedIndex, data, axisMax]);

  const renderBars = useCallback(
    ({ points, chartBounds }) => {
      const slot = (chartBounds.right - chartBounds.left) / Math.max(count, 1);
      const wideW = slot * 0.5;
      const narrowW = slot * 0.28;

      if (isStacked) {
        const barW = slot * 0.6;
        return (
          <>
            <Bar points={points.track} chartBounds={chartBounds} color={colors.mutedText} opacity={0.12} barWidth={barW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
            <Bar points={points.back} chartBounds={chartBounds} color={VS_COLOR} opacity={0.3} barWidth={barW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
            <Bar points={points.front} chartBounds={chartBounds} color={colors.primary} opacity={0.3} barWidth={barW} roundedCorners={{ bottomLeft: CORNER, bottomRight: CORNER }} />
            <Bar points={points.backSel} chartBounds={chartBounds} color={VS_COLOR} opacity={1} barWidth={barW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
            <Bar points={points.frontSel} chartBounds={chartBounds} color={colors.primary} opacity={1} barWidth={barW} roundedCorners={{ bottomLeft: CORNER, bottomRight: CORNER }} />
          </>
        );
      }

      if (hasVs) {
        return (
          <>
            <Bar points={points.primary} chartBounds={chartBounds} color={colors.primary} opacity={0.3} barWidth={wideW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
            <Bar points={points.primarySel} chartBounds={chartBounds} color={colors.primary} opacity={1} barWidth={wideW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
            <Bar points={points.vs} chartBounds={chartBounds} color={VS_COLOR} opacity={0.3} barWidth={narrowW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
            <Bar points={points.vsSel} chartBounds={chartBounds} color={VS_COLOR} opacity={1} barWidth={narrowW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
          </>
        );
      }

      return (
        <>
          <Bar points={points.amount} chartBounds={chartBounds} color={colors.mutedText} opacity={0.3} barWidth={wideW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
          <Bar points={points.amountSel} chartBounds={chartBounds} color={colors.primary} opacity={1} barWidth={wideW} roundedCorners={{ topLeft: CORNER, topRight: CORNER }} />
        </>
      );
    },
    [isStacked, hasVs, colors.primary, colors.mutedText, count],
  );

  return (
    <View style={[styles.chartWrap, { width }]}>
      <View style={styles.chartRow}>
        {/* Y axis labels */}
        <View style={styles.yAxis}>
          {yTicks.map((tick) => (
            <Text
              key={tick.value}
              style={[styles.yTick, { top: tick.y - 5, color: colors.mutedText }]}
              numberOfLines={1}
            >
              {tick.label}
            </Text>
          ))}
        </View>

        {/* Bars */}
        <View style={[styles.barsArea, { width: chartW }]}>
          <CartesianChart
            data={chartData}
            xKey="x"
            yKeys={yKeys}
            domain={domain}
            domainPadding={{ left: 6, right: 6, top: TOP_PADDING }}
          >
            {renderBars}
          </CartesianChart>

          {/* Selection reference line */}
          {selLineTop != null && (
            <View
              pointerEvents="none"
              style={[styles.selLine, { top: selLineTop, borderColor: colors.primary }]}
            />
          )}

          {/* Transparent hit areas for bar selection */}
          <View style={styles.touchRow} pointerEvents="box-none">
            {data.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={styles.touchSlot}
                activeOpacity={0.6}
                onPress={() => onBarPress(i)}
                accessibilityRole="button"
                accessibilityLabel={`${monthAbbreviations[d.month]} ${formatYTick(d.total)}`}
              />
            ))}
          </View>
        </View>
      </View>

      {/* Month labels */}
      <View style={styles.monthRow}>
        {data.map((d, i) => (
          <Text
            key={i}
            style={[styles.monthLabel, { color: colors.mutedText }]}
            numberOfLines={1}
          >
            {monthAbbreviations[d.month]}
          </Text>
        ))}
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

  const effectiveCategory = useMemo(() => {
    if (selectedCategory && allExpenseCategories.some(c => c.id === selectedCategory)) {
      return selectedCategory;
    }
    return parentExpenseCategories.length > 0 ? parentExpenseCategories[0].id : null;
  }, [selectedCategory, allExpenseCategories, parentExpenseCategories]);

  const effectiveVsCategory = useMemo(() => {
    if (!vsCategory) return null;
    return allExpenseCategories.some(c => c.id === vsCategory) ? vsCategory : null;
  }, [vsCategory, allExpenseCategories]);

  const selectedCategoryName = useMemo(() => {
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat ? cat.name : '';
  }, [allExpenseCategories, effectiveCategory]);

  const selectedCategoryIcon = useMemo(() => {
    const cat = allExpenseCategories.find(c => c.id === effectiveCategory);
    return cat?.icon ?? null;
  }, [allExpenseCategories, effectiveCategory]);

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

  const monthAbbreviations = ['Ja', 'Fe', 'Mr', 'Ap', 'My', 'Jn', 'Jl', 'Au', 'Se', 'Oc', 'No', 'De'];
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
                  {vsCategoryIcon && (
                    <Icon name={vsCategoryIcon} size={14} color={VS_COLOR} />
                  )}
                  <Text style={[styles.vsCategoryName, { color: VS_COLOR }]} numberOfLines={1}>
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
              <Text style={[styles.currentAmount, { color: effectiveVsCategory ? colors.primary : colors.text }]}>
                {formatCurrency(displayedTotal, selectedCurrency)}
              </Text>
              {effectiveVsCategory && (
                <Text style={[styles.currentAmount, { color: VS_COLOR }]}>
                  {vsLoading ? '...' : formatCurrency(vsDisplayedTotal, selectedCurrency)}
                </Text>
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
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.mutedText }]}>
            {t('no_spending_data')}
          </Text>
        </View>
      ) : (
        <SpendingBarChart
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
  barsArea: {
    height: CHART_HEIGHT,
    position: 'relative',
  },
  card: {
    borderRadius: 16,
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
  chartRow: {
    flexDirection: 'row',
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
  monthLabel: {
    flex: 1,
    fontSize: 9.5,
    textAlign: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    height: LABEL_HEIGHT,
    marginLeft: Y_AXIS_WIDTH,
    paddingTop: 2,
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
  selLine: {
    borderStyle: 'dashed',
    borderTopWidth: 2,
    left: 0,
    position: 'absolute',
    right: 0,
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
  touchRow: {
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  touchSlot: {
    flex: 1,
  },
  vsCategoryName: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  vsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  vsSelector: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  vsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  yAxis: {
    height: CHART_HEIGHT,
    position: 'relative',
    width: Y_AXIS_WIDTH,
  },
  yTick: {
    fontSize: 8,
    opacity: 0.7,
    position: 'absolute',
    right: 4,
    textAlign: 'right',
  },
});

export default CategorySpendingCard;
