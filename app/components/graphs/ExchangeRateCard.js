import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Linking } from 'react-native';
import PropTypes from 'prop-types';
import { CartesianChart, Line, Area, useChartPressState } from 'victory-native';
import { matchFont, LinearGradient, Circle, vec } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { getCurrencySymbol } from '../../services/currency';
import {
  RANGE_LABEL_KEYS,
  RATE_RANGES,
  axisDecimals,
  fetchRateSeries,
  formatAxisDate,
  formatRateChange,
  rateChangeColor,
  shownRateChange,
  formatRateDate,
  formatRateValue,
  rateDecimals,
  summarizeRateSeries,
} from '../../services/ExchangeRateHistory';
import { googleRateSearchUrl, rateChartTitle } from '../../services/ExchangeRateCharts';
import { useTabFocused } from '../../contexts/TabFocusContext';
import useOnForeground from '../../hooks/useOnForeground';
import { withAlpha } from '../../utils/colorUtils';
import { BUTTON_COMPACT, BUTTON_TEXT, CARD_SURFACE, SECTION_LABEL } from '../../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, HEIGHTS, ICON_SIZE, SPACING } from '../../styles/designTokens';

const CHART_HEIGHT = 160;
const AXIS_FONT_SIZE = FONT_SIZE.xs;
// The balance card's headline size, so the two figures on one screen match.
const VALUE_FONT_SIZE = 22;
const CHART_ANIMATION = { type: 'timing', duration: 300 };
// Four labels fit a phone-width axis at this size without colliding.
const X_TICKS = 4;

/**
 * Evenly spread integer indices for the x-axis ticks, first and last included.
 *
 * @param {number} count - Number of points
 * @returns {number[]}
 */
export const xTickIndices = (count) => {
  if (count <= 0) return [];
  if (count <= X_TICKS) return [...Array(count).keys()];
  const last = count - 1;
  const ticks = new Set();
  for (let i = 0; i < X_TICKS; i += 1) ticks.add(Math.round((last * i) / (X_TICKS - 1)));
  return [...ticks];
};

// Skia dot that follows the finger along the line. Shared values in, so
// tracking never crosses back into JS.
const ScrubDot = ({ x, y, color }) => <Circle cx={x} cy={y} r={5} color={color} />;

ScrubDot.propTypes = {
  color: PropTypes.string.isRequired,
  x: PropTypes.object.isRequired,
  y: PropTypes.object.isRequired,
};

/**
 * The Skia canvas: the rate as a line over a fading fill, with a dot while
 * scrubbing. Reports the index under the finger (null when lifted).
 */
const RateChart = ({ data, axisLabels, colors, axisFont, language, yDecimals, onScrub }) => {
  const { state: pressState, isActive } = useChartPressState({ x: 0, y: { value: 0 } });

  // Gated on the shared isActive, as on the balance card: the press state
  // starts at x = 0 and the reaction fires on mount, so an ungated one would
  // report the first day before the chart had been touched.
  useAnimatedReaction(
    () => (pressState.isActive.value ? Math.round(pressState.x.value.value) : null),
    (current, previous) => {
      if (current !== previous) runOnJS(onScrub)(current);
    },
    [onScrub],
  );

  useEffect(() => {
    if (!isActive) onScrub(null);
  }, [isActive, onScrub]);

  const tickValues = useMemo(() => xTickIndices(data.length), [data.length]);

  const xAxis = useMemo(() => ({
    font: axisFont,
    lineColor: colors.border,
    labelColor: colors.mutedText,
    tickValues,
    tickCount: tickValues.length,
    formatXLabel: (value) => axisLabels[Math.round(value)] ?? '',
  }), [axisFont, colors.border, colors.mutedText, tickValues, axisLabels]);

  const yAxis = useMemo(() => ([{
    font: axisFont,
    lineColor: colors.border,
    labelColor: colors.mutedText,
    tickCount: 4,
    formatYLabel: (value) => formatRateValue(Number(value), language, yDecimals),
  }]), [axisFont, colors.border, colors.mutedText, language, yDecimals]);

  return (
    <CartesianChart
      data={data}
      xKey="x"
      yKeys={['value']}
      domainPadding={{ top: 12, bottom: 12 }}
      chartPressState={pressState}
      xAxis={xAxis}
      yAxis={yAxis}
      frame={{ lineWidth: 0 }}
    >
      {({ points, chartBounds }) => (
        <>
          <Area points={points.value} y0={chartBounds.bottom} curveType="monotoneX" animate={CHART_ANIMATION}>
            <LinearGradient
              start={vec(0, chartBounds.top)}
              end={vec(0, chartBounds.bottom)}
              colors={[withAlpha(colors.primary, 0.3), withAlpha(colors.primary, 0)]}
            />
          </Area>
          <Line
            points={points.value}
            color={colors.primary}
            strokeWidth={2}
            curveType="monotoneX"
            animate={CHART_ANIMATION}
          />
          {isActive && (
            <ScrubDot x={pressState.x.position} y={pressState.y.value.position} color={colors.primary} />
          )}
        </>
      )}
    </CartesianChart>
  );
};

RateChart.propTypes = {
  axisFont: PropTypes.object,
  // One x-axis label per point; only the ticked ones are drawn.
  axisLabels: PropTypes.arrayOf(PropTypes.string).isRequired,
  colors: PropTypes.object.isRequired,
  data: PropTypes.array.isRequired,
  language: PropTypes.string,
  onScrub: PropTypes.func.isRequired,
  yDecimals: PropTypes.number.isRequired,
};

/**
 * One exchange-rate chart on the Graphs tab: the price of `amount` units of
 * `from` in `to`, its move over the chosen range, and the line behind it.
 *
 * Not scoped by the period header above it — a rate's range is its own, picked
 * from the chip row under the chart and opening on the one the chart was set
 * up with in Settings → Graphs.
 */
const ExchangeRateCard = ({ chart, colors, t, language }) => {
  const { from, to, amount } = chart;
  const [range, setRange] = useState(chart.range);
  // A new default from Settings wins over the range picked here.
  useEffect(() => { setRange(chart.range); }, [chart.range]);

  const requestKey = `${from}|${to}|${range}`;
  const [result, setResult] = useState({ key: null, points: [], stale: false, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [scrubIndex, setScrubIndex] = useState(null);

  // The tab stays mounted all session, so the rates are only asked for while
  // it is on screen; coming back reads the saved copy and tops it up if it is
  // an hour old.
  const focused = useTabFocused('Graphs');
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  useOnForeground(reload);

  useEffect(() => {
    if (!focused) return undefined;
    let cancelled = false;
    fetchRateSeries(from, to, range)
      .then(({ points, stale }) => {
        if (!cancelled) setResult({ key: requestKey, points, stale, error: null });
      })
      .catch((error) => {
        if (!cancelled) setResult({ key: requestKey, points: [], stale: false, error: error?.code || 'network' });
      });
    return () => { cancelled = true; };
  }, [from, to, range, requestKey, focused, reloadKey]);

  // What is drawn belongs to the request on screen; a range switch shows the
  // spinner until its own series arrives rather than the previous range's line.
  const current = result.key === requestKey ? result : null;
  const points = current ? current.points : [];
  const loading = current === null;

  const summary = useMemo(() => summarizeRateSeries(points, amount), [points, amount]);
  const data = useMemo(() => points.map((point, index) => ({ x: index, value: point.rate * amount })), [points, amount]);
  // Formatted once per series rather than per tick per frame.
  const axisLabels = useMemo(
    () => points.map((point) => formatAxisDate(point.date, range, language)),
    [points, range, language],
  );

  const axisFont = useMemo(() => {
    try {
      return matchFont({ fontFamily: 'sans-serif', fontSize: AXIS_FONT_SIZE }) || null;
    } catch {
      return null;
    }
  }, []);

  const handleScrub = useCallback((index) => setScrubIndex(index), []);
  const handleRetry = useCallback(() => reload(), [reload]);
  // The pair on Google, to check the line against the rate people swap at.
  const handleOpenGoogle = useCallback(() => {
    Linking.openURL(googleRateSearchUrl({ amount, from, to })).catch(() => {});
  }, [amount, from, to]);

  // The header reads the point under the finger while scrubbing, the latest
  // one otherwise; the change is always against the start of the range.
  const shownIndex = scrubIndex != null && scrubIndex >= 0 && scrubIndex < points.length
    ? scrubIndex
    : points.length - 1;
  const shownPoint = points[shownIndex];
  const shownValue = shownPoint ? shownPoint.rate * amount : null;
  const decimals = summary ? rateDecimals(summary.current) : 2;
  const rawChange = summary && shownValue != null ? shownValue - summary.first : 0;
  const { change, changePercent } = shownRateChange(
    rawChange,
    summary && summary.first > 0 ? (rawChange / summary.first) * 100 : 0,
    decimals,
  );
  const changeIcon = change > 0 ? 'arrow-up' : change < 0 ? 'arrow-down' : 'minus';
  const changeColor = rateChangeColor(change, colors);
  // A monthly average stands for its month, so it is not dated to a day; the
  // all-time line's last point is the latest daily rate and is.
  const shownIsMonthly = range === 'all' && shownIndex < points.length - 1;
  const shownDate = shownPoint ? formatRateDate(shownPoint.date, language, shownIsMonthly) : '';
  const sinceDate = points.length > 0 ? formatRateDate(points[0].date, language, range === 'all') : '';
  const yDecimals = summary ? axisDecimals(summary.min, summary.max) : 2;

  const changeText = formatRateChange(change, changePercent, language, decimals);
  const symbol = getCurrencySymbol(to);
  const valueText = shownValue != null ? `${symbol}${formatRateValue(shownValue, language, decimals)}` : '';
  const title = rateChartTitle(chart);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={`exchange-rate-card-${chart.id}`}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.mutedText }]} numberOfLines={1}>{title}</Text>
        <Pressable
          onPress={handleOpenGoogle}
          hitSlop={SPACING.md}
          accessibilityRole="link"
          accessibilityLabel={t('rate_open_google')}
          testID="exchange-rate-google"
        >
          <Icon name="google" size={ICON_SIZE.xs} color={colors.mutedText} />
        </Pressable>
      </View>

      <View style={styles.valueRow}>
        <Text
          style={[styles.value, { color: colors.text }]}
          numberOfLines={1}
          testID="exchange-rate-value"
        >
          {loading ? ' ' : valueText}
        </Text>
        {summary && (
          <View style={styles.changeRow} testID="exchange-rate-change">
            <Icon name={changeIcon} size={14} color={changeColor} />
            <Text style={[styles.changeText, { color: changeColor }]} numberOfLines={1}>{changeText}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.caption, { color: colors.mutedText }]} numberOfLines={1}>
        {summary
          ? `${shownDate} · ${t('rate_change_since')} ${sinceDate}${current?.stale ? ` · ${t('rate_offline')}` : ''}`
          : ' '}
      </Text>

      <View
        style={[styles.chartArea, { backgroundColor: colors.altRow }]}
        accessibilityRole="image"
        accessibilityLabel={summary ? `${title}: ${valueText}, ${changeText}` : title}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} testID="exchange-rate-loading" />
        ) : current.error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { color: colors.mutedText }]} testID="exchange-rate-error">
              {current.error === 'unsupported' || current.error === 'empty'
                ? t('rate_not_available_pair')
                : t('rate_load_failed')}
            </Text>
            <Pressable
              onPress={handleRetry}
              style={[styles.retryButton, { borderColor: colors.border }]}
              accessibilityRole="button"
              testID="exchange-rate-retry"
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <RateChart
            data={data}
            axisLabels={axisLabels}
            colors={colors}
            axisFont={axisFont}
            language={language}
            yDecimals={yDecimals}
            onScrub={handleScrub}
          />
        )}
      </View>

      <View style={[styles.rangeRow, { backgroundColor: colors.altRow, borderColor: colors.border }]} accessibilityRole="tablist">
        {RATE_RANGES.map((key) => {
          const selected = key === range;
          return (
            <Pressable
              key={key}
              onPress={() => setRange(key)}
              style={[styles.rangeSegment, selected && { backgroundColor: colors.surface }]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              testID={`exchange-rate-range-${key}`}
            >
              <Text
                style={[
                  styles.rangeText,
                  { color: selected ? colors.primaryStrong : colors.mutedText },
                  selected && styles.rangeTextSelected,
                ]}
                numberOfLines={1}
              >
                {t(RANGE_LABEL_KEYS[key])}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

ExchangeRateCard.propTypes = {
  chart: PropTypes.shape({
    id: PropTypes.string.isRequired,
    from: PropTypes.string.isRequired,
    to: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
    range: PropTypes.string.isRequired,
  }).isRequired,
  colors: PropTypes.object.isRequired,
  language: PropTypes.string,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  caption: {
    fontSize: FONT_SIZE.sm,
    marginBottom: SPACING.sm,
  },
  card: {
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    padding: SPACING.lg,
  },
  changeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: SPACING.xs,
  },
  changeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  chartArea: {
    alignItems: 'stretch',
    height: CHART_HEIGHT,
    justifyContent: 'center',
    marginHorizontal: -SPACING.lg,
  },
  errorBox: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },
  rangeRow: {
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginTop: SPACING.md,
    padding: SPACING.xs,
  },
  // The segment and the row's padding together reach the compact touch floor.
  rangeSegment: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: HEIGHTS.buttonCompact - SPACING.xs * 2,
    paddingHorizontal: SPACING.xs,
  },
  rangeText: {
    fontSize: FONT_SIZE.sm,
  },
  rangeTextSelected: {
    fontWeight: FONT_WEIGHT.semibold,
  },
  retryButton: {
    ...BUTTON_COMPACT,
    borderWidth: 1,
  },
  retryText: BUTTON_TEXT,
  title: {
    ...SECTION_LABEL,
    flexShrink: 1,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  value: {
    flexShrink: 1,
    fontSize: VALUE_FONT_SIZE,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.4,
  },
  valueRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
});

export default ExchangeRateCard;
