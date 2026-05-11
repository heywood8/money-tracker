import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import Svg, { Line, Rect, Text as SvgText, Path } from 'react-native-svg';
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
const VS_COLOR = '#FF7043';

const formatYTick = (value) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
};

const formatPctTick = (value) => value + '%';

const BarChart = ({ data, vsData, monthAbbreviations, colors, width, selectedIndex, onBarPress }) => {
  const hasVs = vsData != null && vsData.length === data.length;
  const max = Math.max(
    ...data.map(d => d.total),
    ...(hasVs ? vsData.map(d => d.total) : []),
    1,
  );
  const count = data.length;
  const chartW = width - Y_AXIS_WIDTH;
  const slotW = chartW / count;
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

  // Single bar dimensions (original layout)
  const singleBarW = slotW * 0.55;
  const singleGap = slotW * 0.45;

  // Dual bar dimensions
  const dualGapBetween = Math.max(slotW * 0.04, 1);
  const dualOuterPad = slotW * 0.07;
  const dualBarW = (slotW - 2 * dualOuterPad - dualGapBetween) / 2;

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

      {/* Selected bar dotted reference line (primary category) */}
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
            strokeWidth={2}
            strokeDasharray="5,3"
            opacity={0.9}
          />
        );
      })()}

      {/* Bars */}
      {data.map((d, i) => {
        const isSelected = i === selectedIndex;
        const label = monthAbbreviations[d.month];

        if (hasVs) {
          const vsD = vsData[i];
          const h1 = Math.max((d.total / axisMax) * BAR_HEIGHT, d.total > 0 ? 2 : 0);
          const h2 = Math.max((vsD.total / axisMax) * BAR_HEIGHT, vsD.total > 0 ? 2 : 0);
          const bar1X = Y_AXIS_WIDTH + i * slotW + dualOuterPad;
          const bar2X = bar1X + dualBarW + dualGapBetween;
          const y1 = TOP_PADDING + BAR_HEIGHT - h1;
          const y2 = TOP_PADDING + BAR_HEIGHT - h2;

          return (
            <React.Fragment key={i}>
              {/* Full-slot transparent hit area */}
              <Rect
                x={Y_AXIS_WIDTH + i * slotW}
                y={TOP_PADDING}
                width={slotW}
                height={BAR_HEIGHT}
                fill="transparent"
                onPress={() => onBarPress(i)}
              />
              {/* Primary bar */}
              <Rect
                x={bar1X}
                y={y1}
                width={dualBarW}
                height={h1}
                rx={2}
                fill={colors.primary}
                fillOpacity={isSelected ? 1 : 0.3}
                onPress={() => onBarPress(i)}
              />
              {/* VS bar */}
              <Rect
                x={bar2X}
                y={y2}
                width={dualBarW}
                height={h2}
                rx={2}
                fill={VS_COLOR}
                fillOpacity={isSelected ? 1 : 0.3}
                onPress={() => onBarPress(i)}
              />
              {/* Month label centered in slot */}
              <SvgText
                x={Y_AXIS_WIDTH + i * slotW + slotW / 2}
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
        }

        // Single bar (original layout)
        const h = Math.max((d.total / axisMax) * BAR_HEIGHT, d.total > 0 ? 2 : 0);
        const x = Y_AXIS_WIDTH + i * slotW + singleGap / 2;
        const y = TOP_PADDING + BAR_HEIGHT - h;
        return (
          <React.Fragment key={i}>
            <Rect
              x={x}
              y={TOP_PADDING}
              width={singleBarW}
              height={BAR_HEIGHT}
              fill="transparent"
              onPress={() => onBarPress(i)}
            />
            <Rect
              x={x}
              y={y}
              width={singleBarW}
              height={h}
              rx={3}
              fill={isSelected ? colors.primary : colors.mutedText}
              fillOpacity={isSelected ? 1 : 0.3}
              onPress={() => onBarPress(i)}
            />
            <SvgText
              x={x + singleBarW / 2}
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

// Build an SVG path for a rect with rounded top corners only
const roundedTopPath = (x, y, w, h, r) => {
  const cr = Math.min(r, w / 2, Math.max(h, 0));
  return `M ${x + cr},${y} L ${x + w - cr},${y} Q ${x + w},${y} ${x + w},${y + cr} L ${x + w},${y + h} L ${x},${y + h} L ${x},${y + cr} Q ${x},${y} ${x + cr},${y} Z`;
};

// Build an SVG path for a rect with rounded bottom corners only
const roundedBottomPath = (x, y, w, h, r) => {
  const cr = Math.min(r, w / 2, Math.max(h, 0));
  return `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h - cr} Q ${x + w},${y + h} ${x + w - cr},${y + h} L ${x + cr},${y + h} Q ${x},${y + h} ${x},${y + h - cr} Z`;
};

const StackedBarChart = ({ data, vsData, monthAbbreviations, colors, width, selectedIndex, onBarPress }) => {
  const count = data.length;
  const chartW = width - Y_AXIS_WIDTH;
  const slotW = chartW / count;
  const totalHeight = TOP_PADDING + BAR_HEIGHT + LABEL_HEIGHT;
  const barW = slotW * 0.6;
  const barPad = (slotW - barW) / 2;
  const RADIUS = 3;

  const yTicks = [0, 25, 50, 75, 100].map(pct => ({
    value: pct,
    y: TOP_PADDING + BAR_HEIGHT - (pct / 100) * BAR_HEIGHT,
  }));

  return (
    <Svg width={width} height={totalHeight} style={styles.barChartSvg}>
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
          {formatPctTick(value)}
        </SvgText>
      ))}

      {data.map((d, i) => {
        const vsD = vsData[i];
        const totalAmt = d.total + vsD.total;
        const isSelected = i === selectedIndex;
        const label = monthAbbreviations[d.month];
        const barX = Y_AXIS_WIDTH + i * slotW + barPad;
        const opacity = isSelected ? 1 : 0.3;

        let vsH = 0;
        let primaryH = 0;
        if (totalAmt > 0) {
          vsH = (vsD.total / totalAmt) * BAR_HEIGHT;
          primaryH = BAR_HEIGHT - vsH;
        }

        return (
          <React.Fragment key={i}>
            <Rect
              x={Y_AXIS_WIDTH + i * slotW}
              y={TOP_PADDING}
              width={slotW}
              height={BAR_HEIGHT}
              fill="transparent"
              onPress={() => onBarPress(i)}
            />
            {totalAmt === 0 ? (
              <Rect
                x={barX}
                y={TOP_PADDING}
                width={barW}
                height={BAR_HEIGHT}
                rx={RADIUS}
                fill={colors.mutedText}
                fillOpacity={0.12}
              />
            ) : vsH === 0 ? (
              <Rect
                x={barX}
                y={TOP_PADDING}
                width={barW}
                height={BAR_HEIGHT}
                rx={RADIUS}
                fill={colors.primary}
                fillOpacity={opacity}
              />
            ) : primaryH === 0 ? (
              <Rect
                x={barX}
                y={TOP_PADDING}
                width={barW}
                height={BAR_HEIGHT}
                rx={RADIUS}
                fill={VS_COLOR}
                fillOpacity={opacity}
              />
            ) : (
              <>
                <Path
                  d={roundedTopPath(barX, TOP_PADDING, barW, vsH, RADIUS)}
                  fill={VS_COLOR}
                  fillOpacity={opacity}
                />
                <Path
                  d={roundedBottomPath(barX, TOP_PADDING + vsH, barW, primaryH, RADIUS)}
                  fill={colors.primary}
                  fillOpacity={opacity}
                />
              </>
            )}
            <SvgText
              x={Y_AXIS_WIDTH + i * slotW + slotW / 2}
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

  const { monthlyData, loading } = useCategoryMonthlySpending(selectedCurrency, effectiveCategory, categories);
  const { monthlyData: vsMonthlyData, loading: vsLoading } = useCategoryMonthlySpending(selectedCurrency, effectiveVsCategory, categories);

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
      ) : showStackedBar && hasVsData ? (
        <StackedBarChart
          data={monthlyData}
          vsData={vsMonthlyData}
          monthAbbreviations={monthAbbreviations}
          colors={colors}
          width={screenWidth - 64}
          selectedIndex={effectiveBarIndex}
          onBarPress={setSelectedBarIndex}
        />
      ) : (
        <BarChart
          data={monthlyData}
          vsData={hasVsData ? vsMonthlyData : null}
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
  vsData: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })),
  width: PropTypes.number.isRequired,
};

StackedBarChart.propTypes = {
  colors: PropTypes.object.isRequired,
  data: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })).isRequired,
  monthAbbreviations: PropTypes.arrayOf(PropTypes.string).isRequired,
  onBarPress: PropTypes.func.isRequired,
  selectedIndex: PropTypes.number,
  vsData: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })).isRequired,
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
});

export default CategorySpendingCard;
