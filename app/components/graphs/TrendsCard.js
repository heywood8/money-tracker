import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import PropTypes from 'prop-types';
import { CartesianChart, Bar, BarGroup } from 'victory-native';
import { matchFont, RoundedRect } from '@shopify/react-native-skia';
import { runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import currencies from '../../../assets/currencies.json';
import useMonthlyTrendSeries, { ALL_CATEGORIES } from '../../hooks/useMonthlyTrendSeries';
import { BORDER_RADIUS, FONT_SIZE, HORIZONTAL_PADDING, SPACING } from '../../styles/designTokens';
import { comparisonSeriesColor, ledgerSeriesColors } from '../../styles/chartPalette';
import {
  getMonthAbbreviations,
  labelGapFor,
  measureLabelWidth,
  measureWidestLabel,
  resolveLabelStride,
} from './monthLabels';
import ModalBlurOverlay from '../ModalBlurOverlay';
import CategoryGridSelector from '../CategoryGridSelector';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useSwipeNavigationGesture } from '../../contexts/SwipeNavigationContext';
import { CARD_SURFACE, SECTION_LABEL } from '../../styles/componentStyles';
import EmptyState from '../EmptyState';

const screenWidth = Dimensions.get('window').width;

// Collapsed to K/M above a thousand, the same way the expense/income tabs
// directly above this card write theirs. Spelled out in full, a seven-digit
// total ran the width of the card and disagreed with the figure sitting one row
// higher on the same screen.
const formatCurrency = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;
  const symbol = currencyInfo?.symbol ?? currency;
  const value = parseFloat(amount);
  if (!Number.isFinite(value)) return `${symbol}${(0).toFixed(decimals)}`;
  const magnitude = Math.abs(value);
  // The crossing point is where the K form *rounds* to a million, not where the
  // value reaches one: 999,950 written to one decimal is "1000.0K", which is
  // wider than the "1.0M" it turns into a cent later.
  if (magnitude >= 999950) return `${symbol}${(value / 1000000).toFixed(1)}M`;
  if (magnitude >= 1000) return `${symbol}${(value / 1000).toFixed(1)}K`;
  return `${symbol}${value.toFixed(decimals)}`;
};

const BAR_HEIGHT = 90;
const LABEL_HEIGHT = 18;
const TOP_PADDING = 8;
// The x-axis labels now live on the Skia canvas, so the canvas owns their height too.
const CHART_HEIGHT = TOP_PADDING + BAR_HEIGHT + LABEL_HEIGHT;
const CORNER = 4;
const BAR_ANIMATION = { type: 'spring' };
// TalkBack can still step through months now that the RN hit slots are gone.
const ACCESSIBILITY_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

// The history is as long as the user's, so months are laid out at a fixed pitch
// and scrolled through rather than squeezed into the card. 36px is the resting
// pitch: the card holds two bars per month now, and at the old 48px a phone
// showed six months of a comparison that only starts to read as a trend around
// nine. The pinch still reaches 96px for anyone who wants the old width back.
//
// The pitch is also the month's tap slot (see `resolveTapIndex`), so this puts
// the target under Android's 48dp guidance — 36dp at rest, 18dp fully pinched
// out. Accepted rather than overlooked: selecting a month is a non-destructive,
// self-evident action whose mis-tap costs one more tap, the pinch widens the
// slot for anyone who needs it, and the chart carries `accessibilityRole
//="adjustable"` so a screen reader steps month to month without aiming at all.
const DEFAULT_MONTH_WIDTH = 36;
const MIN_MONTH_WIDTH = 18;
const MAX_MONTH_WIDTH = 96;
// Size the axis labels are drawn at, and the size their widths are estimated
// against when the font cannot measure itself.
const AXIS_FONT_SIZE = 9;
// Stands in for any year in the width measurement — the digits are the same
// width whichever year it is.
const YEAR_SAMPLE = "'00";
// Gutter for the pinned y-axis. It sits outside the scroller, so the scale stays
// readable however far back the user has scrolled.
const Y_AXIS_WIDTH = 34;
// The axis canvas draws no series — it exists only to place the y labels, and
// borrows the plot geometry from the same Victory layout code as the real chart.
const AXIS_GUIDE_DATA = [{ x: 0, amount: 0 }];
const AXIS_GUIDE_KEYS = ['amount'];
const AXIS_GUIDE_PADDING = { left: 0, right: 0, top: TOP_PADDING };
const renderNothing = () => null;
// Labels are drawn beside the pinned axis instead, but the space they would take
// still has to be reserved so both canvases resolve the same plot height.
const hideYLabel = () => '';
const spacerXLabel = () => 'Jan';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Where the scroller should sit for a pending move, or null while there is
 * nothing to move to (no move queued, or the content not measured yet).
 *
 * `{ mode: 'end' }` is "open on the current month" — the newest month is the
 * last one laid out, so the card's resting position is the far right rather
 * than the twelve-month-old left edge.
 */
export const resolveScrollTarget = (pending, contentWidth, viewportWidth) => {
  if (!pending || !(contentWidth > 0)) return null;
  const maxX = Math.max(0, contentWidth - viewportWidth);
  return pending.mode === 'end' ? maxX : clamp(pending.x, 0, maxX);
};

/**
 * Which month a tap at `x` (in scroll-content pixels) landed on, or -1 when it
 * fell outside the plotted months.
 *
 * Months are laid out at a fixed pitch with half a slot of domain padding at
 * either end, so a bar's slot is exactly `[i * pitch, (i + 1) * pitch)` and the
 * hit test is a division — no Skia hit region, no RN overlay per bar.
 */
export const resolveTapIndex = (x, monthWidth, count) => {
  'worklet';
  if (!(monthWidth > 0) || count <= 0) return -1;
  const index = Math.floor(x / monthWidth);
  if (index < 0 || index >= count) return -1;
  return index;
};

/**
 * Whether a January tick has room to carry its year.
 *
 * Its neighbours are ordinary month labels one slot away, so what has to fit in
 * a slot is half of each label plus a gap. The gap it is held to is half the one
 * the repeating labels get: this is one tick in twelve, and losing the only
 * marker that tells one January from the next costs more than its tighter
 * spacing does.
 */
export const canLabelYear = (slot, yearWidth, monthWidth, fontSize) => (
  slot >= (yearWidth + monthWidth) / 2 + labelGapFor(fontSize) / 2
);

export const formatYTick = (value) => {
  const num = Number(value);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toFixed(0);
};

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
 * Two layouts, both driven by Victory's own bar primitives:
 *  - single:  one <Bar> series
 *  - grouped: <BarGroup> with primary + vs bars side by side per month
 *
 * The months are laid out at a fixed pitch inside a horizontal scroller and the
 * y-axis is pinned beside it, so the window opens on the current month and the
 * whole history is a swipe away instead of twelve bars fighting for one screen.
 *
 * Gestures, in the order a finger resolves them: a tap selects the month it
 * landed on, a horizontal drag scrolls the months (and blocks the screen-swipe
 * navigation for as long as it can scroll), and a pinch re-pitches the months so
 * more or fewer fit at once.
 */
const TrendBarChart = ({
  data,
  vsData,
  monthAbbreviations,
  colors,
  seriesColor,
  vsSeriesColor,
  width,
  selectedIndex,
  onBarPress,
}) => {
  const count = data.length;
  const hasVs = vsData != null && vsData.length === count;

  const axisMax = useMemo(() => {
    const max = Math.max(
      ...data.map((d) => d.total),
      ...(hasVs ? vsData.map((d) => d.total) : []),
      1,
    );
    const step = niceStepFor(max);
    return Math.ceil(max / step) * step;
  }, [data, vsData, hasVs]);

  // Per-month field bundle consumed by Victory Native. Every series we draw must be a
  // field here AND listed in yKeys, otherwise VN never computes points for it.
  const chartData = useMemo(() => {
    return data.map((d, i) => {
      if (hasVs) {
        return { x: i, primary: d.total, vs: vsData[i].total };
      }
      return { x: i, amount: d.total };
    });
  }, [data, vsData, hasVs]);

  const yKeys = useMemo(() => (hasVs ? ['primary', 'vs'] : ['amount']), [hasVs]);

  const domain = useMemo(() => ({ y: [0, axisMax] }), [axisMax]);

  // System-font axis labels (the project ships no .ttf). matchFont returns a stub
  // under Jest and a real SkFont on device, so the call is guarded.
  const axisFont = useMemo(() => {
    try {
      return matchFont({ fontFamily: 'sans-serif', fontSize: AXIS_FONT_SIZE }) || null;
    } catch (e) {
      return null;
    }
  }, []);

  // --- Horizontal layout -------------------------------------------------
  // `monthWidth` is the pitch the user has pinched to; the pitch actually drawn
  // never goes below "fill the viewport", so a three-month history still spans
  // the card instead of huddling on the left.
  const [monthWidth, setMonthWidth] = useState(DEFAULT_MONTH_WIDTH);
  const viewportWidth = Math.max(width - Y_AXIS_WIDTH, 1);
  const fillWidth = viewportWidth / Math.max(count, 1);
  const pitch = Math.max(monthWidth, fillWidth);
  const contentWidth = pitch * count;

  const scrollRef = useRef(null);
  const scrollXRef = useRef(0);
  // Offset to move to once the scroller can act on it — the content has to be
  // measured before an offset into it means anything.
  const pendingScrollRef = useRef({ mode: 'end' });
  const measuredContentRef = useRef(0);
  const layoutReadyRef = useRef(false);
  const monthWidthRef = useRef(monthWidth);
  const pinchBaseRef = useRef(monthWidth);

  // A longer (or shorter) history is a different chart — open it on the current
  // month, the same way the card opens on mount.
  const prevCountRef = useRef(count);
  if (prevCountRef.current !== count) {
    prevCountRef.current = count;
    pendingScrollRef.current = { mode: 'end' };
  }

  const handleScroll = useCallback((event) => {
    scrollXRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  // Content size and layout arrive in either order, and a scrollTo issued before
  // both is dropped — so the move is replayed on each until one sticks.
  const flushPendingScroll = useCallback(() => {
    const x = resolveScrollTarget(
      pendingScrollRef.current,
      measuredContentRef.current,
      viewportWidth,
    );
    if (x == null) return;
    scrollRef.current?.scrollTo({ x, y: 0, animated: false });
    scrollXRef.current = x;
    if (layoutReadyRef.current) pendingScrollRef.current = null;
  }, [viewportWidth]);

  const handleContentSizeChange = useCallback((newContentWidth) => {
    measuredContentRef.current = newContentWidth;
    flushPendingScroll();
  }, [flushPendingScroll]);

  const handleLayout = useCallback(() => {
    layoutReadyRef.current = true;
    flushPendingScroll();
  }, [flushPendingScroll]);

  const scrollIndexIntoView = useCallback((index) => {
    const target = index * pitch + pitch / 2 - viewportWidth / 2;
    scrollRef.current?.scrollTo({
      x: clamp(target, 0, Math.max(0, contentWidth - viewportWidth)),
      y: 0,
      animated: true,
    });
  }, [pitch, viewportWidth, contentWidth]);

  const beginPinch = useCallback(() => {
    pinchBaseRef.current = monthWidthRef.current;
  }, []);

  const applyPinch = useCallback((scale) => {
    const next = clamp(
      Math.round(pinchBaseRef.current * scale),
      MIN_MONTH_WIDTH,
      MAX_MONTH_WIDTH,
    );
    const current = monthWidthRef.current;
    if (next === current) return;
    // Zoom around the middle of what is on screen, so the months the user is
    // looking at are the ones that stay put.
    const from = Math.max(current, fillWidth);
    const to = Math.max(next, fillWidth);
    const centreMonths = (scrollXRef.current + viewportWidth / 2) / from;
    pendingScrollRef.current = { mode: 'x', x: centreMonths * to - viewportWidth / 2 };
    monthWidthRef.current = next;
    setMonthWidth(next);
  }, [fillWidth, viewportWidth]);

  // --- Gestures ----------------------------------------------------------
  // The screen-swipe Pan owns horizontal drags everywhere else on the tab; the
  // native scroller claims them over the chart for as long as it has room left.
  const swipeGesture = useSwipeNavigationGesture();
  const scrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return swipeGesture ? native.blocksExternalGesture(swipeGesture) : native;
  }, [swipeGesture]);

  const pinchGesture = useMemo(
    () => Gesture.Pinch()
      .onStart(() => {
        runOnJS(beginPinch)();
      })
      .onUpdate((event) => {
        runOnJS(applyPinch)(event.scale);
      }),
    [beginPinch, applyPinch],
  );

  const containerGesture = useMemo(
    () => Gesture.Simultaneous(scrollGesture, pinchGesture),
    [scrollGesture, pinchGesture],
  );

  // Tap coordinates are relative to the scrolled content, which is exactly the
  // space the month pitch is measured in.
  const tapGesture = useMemo(
    () => Gesture.Tap().onEnd((event) => {
      const index = resolveTapIndex(event.x, pitch, count);
      if (index >= 0) {
        runOnJS(onBarPress)(index);
      }
    }),
    [pitch, count, onBarPress],
  );

  const handleAccessibilityAction = useCallback(
    (event) => {
      const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
      const base = selectedIndex == null ? count - 1 : selectedIndex;
      const next = Math.min(count - 1, Math.max(0, base + step));
      onBarPress(next);
      scrollIndexIntoView(next);
    },
    [count, selectedIndex, onBarPress, scrollIndexIntoView],
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
      if (hasVs) {
        return (
          <BarGroup
            chartBounds={chartBounds}
            betweenGroupPadding={0.35}
            withinGroupPadding={0.1}
            roundedCorners={{ topLeft: CORNER, topRight: CORNER }}
          >
            <BarGroup.Bar points={points.primary} color={seriesColor} animate={BAR_ANIMATION} />
            <BarGroup.Bar points={points.vs} color={vsSeriesColor} animate={BAR_ANIMATION} />
          </BarGroup>
        );
      }

      return (
        <Bar
          points={points.amount}
          chartBounds={chartBounds}
          color={seriesColor}
          barWidth={slot * 0.5}
          roundedCorners={{ topLeft: CORNER, topRight: CORNER }}
          animate={BAR_ANIMATION}
        />
      );
    },
    [hasVs, seriesColor, vsSeriesColor],
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

  // Half a slot of padding at either end puts every bar in the middle of its own
  // slot — which is what keeps the newest month clear of the right edge, and what
  // makes a tap's slot arithmetic exact.
  const domainPadding = useMemo(
    () => ({ left: pitch / 2, right: pitch / 2, top: TOP_PADDING }),
    [pitch],
  );

  // How many months a label is actually allowed to claim. A locale's own
  // abbreviations are not all the same width — "Июл" is half again as wide as
  // "Jul" — so the axis measures them rather than assuming a character count,
  // and thins the labels out when a month cannot hold one with room to spare.
  const labelWidths = useMemo(() => {
    const month = measureWidestLabel(monthAbbreviations, axisFont, AXIS_FONT_SIZE);
    const january = monthAbbreviations[0] ?? '';
    return {
      month,
      year: measureLabelWidth(`${january}${YEAR_SAMPLE}`, axisFont, AXIS_FONT_SIZE),
    };
  }, [monthAbbreviations, axisFont]);

  const labelStride = resolveLabelStride(pitch, labelWidths.month, AXIS_FONT_SIZE);
  // Twelve months no longer fit in one window, so a bare "Jan" cannot say which
  // January it is. Each January carries its year, where its slot has room.
  const showYear = canLabelYear(
    pitch * labelStride,
    labelWidths.year,
    labelWidths.month,
    AXIS_FONT_SIZE,
  );

  const formatXLabel = useCallback((value) => {
    const item = data[Math.round(value)];
    if (!item) return '';
    // Phased on the month, so January is labelled at every stride and the same
    // months stay labelled as the window scrolls or a new month rolls in.
    if (item.month % labelStride !== 0) return '';
    const abbreviation = monthAbbreviations[item.month] ?? '';
    if (item.month === 0 && showYear) {
      return `${abbreviation}'${String(item.year).slice(2)}`;
    }
    return abbreviation;
  }, [data, labelStride, monthAbbreviations, showYear]);

  return (
    <View
      style={[styles.chartWrap, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${selectedMonthLabel} ${formatYTick(data[selectedIndex]?.total ?? 0)}`}
      accessibilityActions={ACCESSIBILITY_ACTIONS}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <View style={styles.chartRow}>
        {/* Pinned scale. Its own canvas, sharing the height, y-domain and x-label
            metrics of the scrolling one so Victory resolves both plots to the
            same vertical geometry and the labels line up with the gridlines. */}
        <View style={styles.axisColumn} pointerEvents="none" testID="trend-chart-axis">
          <CartesianChart
            data={AXIS_GUIDE_DATA}
            xKey="x"
            yKeys={AXIS_GUIDE_KEYS}
            domain={domain}
            domainPadding={AXIS_GUIDE_PADDING}
            xAxis={{
              font: axisFont,
              lineWidth: 0,
              // Reserves the month-label strip without drawing over it.
              labelColor: colors.altRow,
              tickCount: 2,
              formatXLabel: spacerXLabel,
            }}
            yAxis={[{
              font: axisFont,
              lineWidth: 0,
              labelColor: colors.mutedText,
              tickCount: 5,
              formatYLabel: formatYTick,
            }]}
            frame={{ lineWidth: 0 }}
          >
            {renderNothing}
          </CartesianChart>
        </View>

        <GestureDetector gesture={containerGesture}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
            onLayout={handleLayout}
            style={styles.scrollArea}
            testID="trend-chart-scroll"
          >
            <GestureDetector gesture={tapGesture}>
              <View
                style={[styles.chartCanvas, { width: contentWidth }]}
                testID="trend-chart-canvas"
              >
                <CartesianChart
                  data={chartData}
                  xKey="x"
                  yKeys={yKeys}
                  domain={domain}
                  domainPadding={domainPadding}
                  xAxis={{
                    font: axisFont,
                    lineWidth: 0,
                    labelColor: colors.mutedText,
                    tickCount: count,
                    formatXLabel,
                  }}
                  yAxis={[{
                    font: axisFont,
                    lineColor: colors.border,
                    labelColor: colors.mutedText,
                    tickCount: 5,
                    // The labels live on the pinned axis; suppressing them here
                    // also gives up the gutter Victory would reserve for them,
                    // so the plot starts at the canvas edge and a month's slot
                    // is exactly one pitch wide.
                    formatYLabel: hideYLabel,
                    // Solid hairline: a dashed grid reads as a threshold or a
                    // projection when all it is is the grid.
                  }]}
                  frame={{ lineWidth: 0 }}
                >
                  {renderChart}
                </CartesianChart>
              </View>
            </GestureDetector>
          </ScrollView>
        </GestureDetector>
      </View>
    </View>
  );
};

/**
 * The two series the card opens on: income against expenses, both across every
 * category. The card is a comparison first and a category drill-down second —
 * "how much came in against how much went out" is the question a month has, and
 * it should not take two taps to ask it.
 */
const DEFAULT_PRIMARY_SERIES = { type: 'income', categoryId: ALL_CATEGORIES };
const DEFAULT_VS_SERIES = { type: 'expense', categoryId: ALL_CATEGORIES };

// The "every category" pseudo-entry borrows each side's arrow from the summary
// cards at the top of the same screen, so one glyph means one thing per screen.
const ALL_SERIES_ICON = { income: 'arrow-bottom-left', expense: 'arrow-top-right' };

const TrendsCard = ({
  colors,
  t,
  selectedCurrency,
  selectedSeries,
  onSeriesChange,
  categories,
  convertAllCurrencies = false,
}) => {
  // null = closed, 'primary' = picking the primary series, 'vs' = picking the
  // comparison one.
  const [pickerMode, setPickerMode] = useState(null);
  // Which side of the ledger the open picker is showing. Seeded from the series
  // being edited so the picker opens on what is already selected.
  const [pickerType, setPickerType] = useState('expense');
  const [vsSeries, setVsSeries] = useState(DEFAULT_VS_SERIES);
  const [selectedBarIndex, setSelectedBarIndex] = useState(null);

  const visibleCategories = useMemo(
    () => categories.filter(cat => !cat.isShadow),
    [categories],
  );

  const categoriesByType = useMemo(() => ({
    expense: visibleCategories.filter(cat => cat.categoryType === 'expense'),
    income: visibleCategories.filter(cat => cat.categoryType === 'income'),
  }), [visibleCategories]);

  /**
   * A series with its category checked against the categories that actually
   * exist. A stale id (a category deleted since it was picked) falls back to the
   * whole side of the ledger rather than to an empty chart.
   */
  const resolveSeries = useCallback((series, fallback) => {
    if (!series) return fallback;
    const type = series.type === 'income' ? 'income' : 'expense';
    if (series.categoryId === ALL_CATEGORIES) return { type, categoryId: ALL_CATEGORIES };
    const exists = categoriesByType[type].some(c => c.id === series.categoryId);
    return exists ? { type, categoryId: series.categoryId } : { type, categoryId: ALL_CATEGORIES };
  }, [categoriesByType]);

  const primary = useMemo(
    () => resolveSeries(selectedSeries, DEFAULT_PRIMARY_SERIES),
    [selectedSeries, resolveSeries],
  );

  const vs = useMemo(
    () => (vsSeries ? resolveSeries(vsSeries, DEFAULT_VS_SERIES) : null),
    [vsSeries, resolveSeries],
  );

  // Two series on opposite sides of the ledger are money in against money out,
  // which is the one comparison this app has a colour convention for. Two series
  // on the same side (two expense categories, say) are a categorical question,
  // and keep the neutral primary/comparison pair — green and red would be
  // asserting a meaning the chart does not carry.
  const crossLedger = vs !== null && vs.type !== primary.type;
  const ledgerColors = ledgerSeriesColors(colors);
  const seriesColor = crossLedger ? ledgerColors[primary.type] : colors.primary;
  const vsColor = crossLedger ? ledgerColors[vs.type] : comparisonSeriesColor(colors);

  const seriesLabel = useCallback((series) => {
    if (!series) return '';
    if (series.categoryId === ALL_CATEGORIES) {
      return series.type === 'income' ? t('all_income') : t('all_expenses');
    }
    const cat = categoriesByType[series.type].find(c => c.id === series.categoryId);
    return cat ? cat.name : '';
  }, [categoriesByType, t]);

  const seriesIcon = useCallback((series) => {
    if (!series) return null;
    if (series.categoryId === ALL_CATEGORIES) return ALL_SERIES_ICON[series.type];
    const cat = categoriesByType[series.type].find(c => c.id === series.categoryId);
    return cat?.icon ?? null;
  }, [categoriesByType]);

  const primaryLabel = seriesLabel(primary);
  const primaryIcon = seriesIcon(primary);
  const vsLabel = seriesLabel(vs);
  const vsIcon = seriesIcon(vs);

  const openPicker = useCallback((mode) => {
    setPickerType((mode === 'vs' ? vs : primary)?.type ?? 'expense');
    setPickerMode(mode);
  }, [primary, vs]);

  const commitSeries = useCallback((series) => {
    if (pickerMode === 'primary') {
      onSeriesChange(series);
    } else if (pickerMode === 'vs') {
      setVsSeries(series);
    }
    setPickerMode(null);
  }, [pickerMode, onSeriesChange]);

  const handleSelectCategory = useCallback((categoryId) => {
    commitSeries({ type: pickerType, categoryId });
  }, [commitSeries, pickerType]);

  const handleSelectAll = useCallback(() => {
    commitSeries({ type: pickerType, categoryId: ALL_CATEGORIES });
  }, [commitSeries, pickerType]);

  const clearVsSeries = useCallback(() => {
    setVsSeries(null);
  }, []);

  const { monthlyData, loading } = useMonthlyTrendSeries(
    selectedCurrency,
    primary.categoryId,
    convertAllCurrencies,
    primary.type,
  );
  const { monthlyData: vsMonthlyData, loading: vsLoading } = useMonthlyTrendSeries(
    selectedCurrency,
    vs ? vs.categoryId : null,
    convertAllCurrencies,
    vs ? vs.type : 'expense',
  );

  const { hideBalances } = useDisplaySettings();

  const monthAbbreviations = useMemo(() => getMonthAbbreviations(t), [t]);
  const monthKeys = ['month_january', 'month_february', 'month_march', 'month_april', 'month_may', 'month_june', 'month_july', 'month_august', 'month_september', 'month_october', 'month_november', 'month_december'];

  const hasVsData = vs !== null && !vsLoading && vsMonthlyData.length > 0;
  // A card showing two series has data when *either* of them does: an empty
  // income series next to a full expense one is still a chart worth drawing.
  const hasData = monthlyData.some(item => item.total > 0)
    || (hasVsData && vsMonthlyData.some(item => item.total > 0));

  const prevDataRef = React.useRef(monthlyData);
  if (prevDataRef.current !== monthlyData) {
    prevDataRef.current = monthlyData;
    if (selectedBarIndex !== null) setSelectedBarIndex(null);
  }

  const effectiveBarIndex = selectedBarIndex !== null ? selectedBarIndex : monthlyData.length - 1;
  const displayedTotal = monthlyData.length > 0 ? (monthlyData[effectiveBarIndex]?.total ?? 0) : 0;
  const vsDisplayedTotal = vs && vsMonthlyData.length > 0
    ? (vsMonthlyData[effectiveBarIndex]?.total ?? 0)
    : 0;

  // Which month the two figures are for. The newest bar is "this month"; any
  // other selected bar names itself.
  const selectedMonth = monthlyData[effectiveBarIndex];
  const periodLabel = effectiveBarIndex === monthlyData.length - 1
    ? t('this_month')
    : selectedMonth
      ? `${t(monthKeys[selectedMonth.month])} ${selectedMonth.year}`
      : '';

  const editingSeries = pickerMode === 'vs' ? vs : primary;
  const pickerSelectedId = editingSeries && editingSeries.type === pickerType
    ? editingSeries.categoryId
    : null;
  const allRowSelected = pickerSelectedId === ALL_CATEGORIES;

  if (categoriesByType.expense.length === 0 && categoriesByType.income.length === 0) {
    return null;
  }

  const pickerContent = (
    <ScrollView contentContainerStyle={styles.pickerBody}>
      {/* Which side of the ledger, before which category on it — the two sides
          are separate trees, not one list with a type column. */}
      <View style={[styles.typeToggle, { borderColor: colors.border }]}>
        {['expense', 'income'].map(type => {
          const active = pickerType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.typeToggleItem, active && { backgroundColor: colors.selected }]}
              onPress={() => setPickerType(type)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              testID={`trend-type-${type}`}
            >
              <Icon name={ALL_SERIES_ICON[type]} size={16} color={active ? colors.text : colors.mutedText} />
              <Text style={[styles.typeToggleText, { color: active ? colors.text : colors.mutedText }]}>
                {type === 'income' ? t('income') : t('expense')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.allRow,
          { borderColor: colors.border },
          allRowSelected && { backgroundColor: colors.selected },
        ]}
        onPress={handleSelectAll}
        testID="trend-all-categories"
      >
        <Icon name={ALL_SERIES_ICON[pickerType]} size={18} color={colors.text} />
        <Text style={[styles.allRowText, { color: colors.text }]}>
          {pickerType === 'income' ? t('all_income') : t('all_expenses')}
        </Text>
      </TouchableOpacity>

      {/* The whole list, not the slice: the grid walks the tree itself and
          filters by type and shadow flag on the way down.

          Keyed by type so switching sides remounts it: the grid keeps its own
          breadcrumb, and a grid left standing inside an expense folder shows
          none of the income categories it has just been handed. */}
      <CategoryGridSelector
        key={pickerType}
        categories={categories}
        categoryType={pickerType}
        selectedCategoryId={allRowSelected ? null : pickerSelectedId}
        onSelect={handleSelectCategory}
        colors={colors}
        t={t}
        selectableFolders
        testIDPrefix="trend-category-option"
      />
    </ScrollView>
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.altRow, borderColor: colors.border }]}>
      {/* The header is one column: each figure sits at the end of its own
          series' row, so the number and the name it belongs to are read
          together instead of across the card. Nothing stacks on the right. */}
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
            {t('trends').toUpperCase()}
          </Text>
          {/* The period rides the eyebrow line, which already exists — it costs
              no height, and it labels both figures at once. The separator is its
              own node so the period stays one uninterrupted string. */}
          <Text style={[styles.periodLabel, { color: colors.mutedText }]}>{'\u00B7'}</Text>
          <Text style={[styles.periodLabel, { color: colors.mutedText }]} numberOfLines={1}>
            {periodLabel}
          </Text>
        </View>

        {/* Primary series: selector + its own total */}
        <View style={styles.seriesRow}>
          <TouchableOpacity
            style={styles.categorySelector}
            onPress={() => openPicker('primary')}
            testID="trend-primary-selector"
          >
            {/* In vs mode the two rows need telling apart, so each carries the
                mark of its series; the labels and figures stay in text ink. */}
            {vs && (
              <View style={[styles.seriesDot, { backgroundColor: seriesColor }]} />
            )}
            {primaryIcon && (
              <Icon name={primaryIcon} size={18} color={colors.text} />
            )}
            <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
              {primaryLabel}
            </Text>
            <Icon name="chevron-down" size={18} color={colors.mutedText} />
          </TouchableOpacity>
          {!hideBalances && (
            <Text style={[styles.currentAmount, { color: colors.text }]} numberOfLines={1}>
              {formatCurrency(displayedTotal, selectedCurrency)}
            </Text>
          )}
        </View>

        {/* VS series: selector + its own total */}
        <View style={styles.vsRow}>
          <TouchableOpacity
            style={styles.vsSelector}
            onPress={() => openPicker('vs')}
            testID="trend-vs-selector"
          >
            {vs ? (
              <>
                <Text style={[styles.vsText, { color: colors.mutedText }]}>vs</Text>
                <View style={[styles.seriesDot, { backgroundColor: vsColor }]} />
                {vsIcon && (
                  <Icon name={vsIcon} size={14} color={colors.text} />
                )}
                <Text style={[styles.vsCategoryName, { color: colors.text }]} numberOfLines={1}>
                  {vsLabel}
                </Text>
              </>
            ) : (
              <>
                <Icon name="plus-circle-outline" size={13} color={colors.mutedText} />
                <Text style={[styles.vsText, { color: colors.mutedText }]}>vs</Text>
              </>
            )}
          </TouchableOpacity>
          {vs && (
            <TouchableOpacity
              onPress={clearVsSeries}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="trend-vs-clear"
            >
              <Icon name="close" size={14} color={colors.mutedText} />
            </TouchableOpacity>
          )}
          {vs && !hideBalances && (
            <Text style={[styles.vsAmount, { color: colors.text }]} numberOfLines={1}>
              {vsLoading ? '...' : formatCurrency(vsDisplayedTotal, selectedCurrency)}
            </Text>
          )}
        </View>
      </View>

      {/* Series Picker Modal (shared for primary and vs) */}
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

      {/* Both series gate the chart: the primary can resolve to all zeros while
          the comparison one is still in flight, and gating on the primary alone
          flashed the empty state before the bars arrived. */}
      {loading || vsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !hasData ? (
        <EmptyState
          message={t('no_trend_data')}
          fill={false}
          style={styles.emptyContainer}
        />
      ) : (
        <TrendBarChart
          // No remount when the vs-series appears or disappears: the press state
          // that used to be keyed by series is gone, and holding the mount keeps
          // the zoom and scroll position the user has arrived at.
          data={monthlyData}
          vsData={hasVsData ? vsMonthlyData : null}
          monthAbbreviations={monthAbbreviations}
          colors={colors}
          seriesColor={seriesColor}
          vsSeriesColor={vsColor}
          width={screenWidth - 64}
          selectedIndex={effectiveBarIndex}
          onBarPress={setSelectedBarIndex}
        />
      )}
    </View>
  );
};

TrendBarChart.propTypes = {
  colors: PropTypes.object.isRequired,
  seriesColor: PropTypes.string.isRequired,
  vsSeriesColor: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(PropTypes.shape({
    month: PropTypes.number,
    total: PropTypes.number,
    year: PropTypes.number,
  })).isRequired,
  monthAbbreviations: PropTypes.arrayOf(PropTypes.string).isRequired,
  onBarPress: PropTypes.func.isRequired,
  selectedIndex: PropTypes.number,
  vsData: PropTypes.arrayOf(PropTypes.shape({ total: PropTypes.number, month: PropTypes.number })),
  width: PropTypes.number.isRequired,
};

TrendsCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  selectedSeries: PropTypes.shape({
    type: PropTypes.oneOf(['expense', 'income']),
    categoryId: PropTypes.string,
  }),
  onSeriesChange: PropTypes.func.isRequired,
  categories: PropTypes.array.isRequired,
  convertAllCurrencies: PropTypes.bool,
};

const styles = StyleSheet.create({
  allRow: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  allRowText: {
    fontSize: FONT_SIZE.base,
    fontWeight: '500',
  },
  axisColumn: {
    height: CHART_HEIGHT,
    width: Y_AXIS_WIDTH,
  },
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
  },
  categoryName: {
    flexShrink: 1,
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  categorySelector: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: SPACING.xs,
  },
  chartCanvas: {
    height: CHART_HEIGHT,
  },
  chartRow: {
    flexDirection: 'row',
  },
  chartWrap: {
    marginTop: 12,
  },
  currentAmount: {
    flexShrink: 0,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    marginLeft: 'auto',
    paddingLeft: SPACING.sm,
    textAlign: 'right',
  },
  emptyContainer: {
    height: 120,
    paddingHorizontal: SPACING.xxl,
  },
  header: {
    marginBottom: 4,
  },
  labelRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.xs,
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
  periodLabel: {
    flexShrink: 1,
    fontSize: FONT_SIZE.xs,
  },
  pickerBody: {
    padding: SPACING.md,
  },
  scrollArea: {
    flex: 1,
  },
  sectionLabel: SECTION_LABEL,
  seriesDot: {
    borderRadius: BORDER_RADIUS.pill,
    height: 8,
    width: 8,
  },
  seriesRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  typeToggle: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  typeToggleItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  typeToggleText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  vsAmount: {
    flexShrink: 0,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    marginLeft: 'auto',
    paddingLeft: SPACING.sm,
    textAlign: 'right',
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
    flexShrink: 1,
    gap: 3,
  },
  vsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
});

export default TrendsCard;
