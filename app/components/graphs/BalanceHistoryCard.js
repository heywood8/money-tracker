import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import {
  CartesianChart,
  Line,
  Area,
  AreaRange,
  useChartPressState,
  useChartTransformState,
} from 'victory-native';
import {
  matchFont,
  DashPathEffect,
  LinearGradient,
  Circle,
  Line as SkiaLine,
  vec,
} from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction, useDerivedValue } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import SimplePicker from '../SimplePicker';
import currencies from '../../../assets/currencies.json';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { balanceLineColors } from '../../styles/chartPalette';
import BalanceHistoryCalendarView from './BalanceHistoryCalendarView';
import { MONTH_ABBREVIATIONS } from './monthLabels';
import { CARD_SURFACE } from '../../styles/componentStyles';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../../styles/designTokens';

// Helper to format numbers compactly (e.g., 10K, 1.5M)
const formatCompact = (value, currency) => {
  if (value === null || value === undefined) return '-';
  const currencyInfo = currencies[currency];
  const decimals = currencyInfo?.decimal_digits ?? 2;

  const absValue = Math.abs(value);
  let formatted;
  if (absValue >= 1000000) {
    formatted = (value / 1000000).toFixed(1) + 'M';
  } else if (absValue >= 1000) {
    formatted = (value / 1000).toFixed(1) + 'K';
  } else {
    formatted = value.toFixed(Math.min(decimals, 2));
  }
  return formatted;
};

// Helper function to calculate nice Y-axis scale
// Returns max value and interval for 4 evenly spaced segments
const calculateNiceScale = (maxValue) => {
  if (maxValue === 0) return { max: 0, interval: 0 };

  // Calculate rough interval for 4 segments
  const roughInterval = maxValue / 4;

  // Get the order of magnitude
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughInterval)));

  // Normalize to range [1, 10)
  const normalized = roughInterval / magnitude;

  // Round to nearest nice number: 1, 2, or 5
  let niceNormalized;
  if (normalized <= 1.5) {
    niceNormalized = 1;
  } else if (normalized <= 3.5) {
    niceNormalized = 2;
  } else if (normalized <= 7.5) {
    niceNormalized = 5;
  } else {
    niceNormalized = 10;
  }

  const niceInterval = niceNormalized * magnitude;
  const niceMax = niceInterval * 4;

  return { max: niceMax, interval: niceInterval };
};

// Format balance for card header: symbol-prefixed, compact (e.g. ֏322.6K, $11.5M)
const formatBalanceCompact = (amount, currency) => {
  const currencyInfo = currencies[currency];
  const symbol = currencyInfo?.symbol ?? currency;
  const absValue = Math.abs(amount);
  let formatted;
  if (absValue >= 1_000_000_000) {
    formatted = (amount / 1_000_000_000).toFixed(1) + 'B';
  } else if (absValue >= 1_000_000) {
    formatted = (amount / 1_000_000).toFixed(1) + 'M';
  } else if (absValue >= 1_000) {
    formatted = (amount / 1_000).toFixed(1) + 'K';
  } else {
    formatted = Math.round(amount).toString();
  }
  return `${symbol}${formatted}`;
};

// Compact Y-axis tick formatter. Exported so it can be unit-tested directly
// (Victory Native XL consumes it via axisOptions.formatYLabel, whose output is
// rendered on the Skia canvas and therefore not inspectable from the test tree).
export const formatYAxisLabel = (value, hideBalances) => {
  if (hideBalances) return '';
  const numValue = parseFloat(value);
  if (numValue === 0) return '';
  const absValue = Math.abs(numValue);
  const isNegative = numValue < 0;

  if (absValue >= 1000000) {
    const result = `${(absValue / 1000000).toFixed(0)}M`;
    return isNegative ? `-${result}` : result;
  } else if (absValue >= 1000) {
    const result = `${(absValue / 1000).toFixed(0)}K`;
    return isNegative ? `-${result}` : result;
  }
  return numValue.toFixed(0);
};

// X-axis tick formatter: only label the milestone days (1/5/10/15/20/25 + last).
const formatXAxisLabel = (value, lastDay) => {
  const day = parseInt(value, 10);
  if (day === 1 || day === 5 || day === 10 || day === 15 ||
    day === 20 || day === 25 || day === lastDay) {
    return String(day);
  }
  return '';
};

// First day-of-year of each month, i.e. where the year view's month ticks go.
// Exported for unit testing.
export const monthStartDaysOfYear = (year) => {
  const days = [];
  let day = 1;
  for (let month = 0; month < 12; month++) {
    days.push(day);
    day += new Date(year, month + 1, 0).getDate();
  }
  return days;
};

// Comparison line the user cycles through with the header toggle. 'none' drops
// the third line and its legend row entirely.
export const THIRD_LINE_MODES = ['prevMonth', 'yearAvg', 'none'];

// The year view compares against one thing only — the same year before it. The
// 12-month median *is* a year, so offering it here would plot a year against
// itself, and "prev month" has no meaning on a year-long axis.
export const YEAR_THIRD_LINE_MODES = ['prevYear', 'none'];

export const thirdLineModesFor = (granularity) =>
  (granularity === 'year' ? YEAR_THIRD_LINE_MODES : THIRD_LINE_MODES);

export const nextThirdLineMode = (mode, granularity = 'month') => {
  const modes = thirdLineModesFor(granularity);
  const index = modes.indexOf(mode);
  // An unknown mode (e.g. a monthly one left over from before a period switch)
  // steps to the first valid one rather than wrapping off the end of the list.
  if (index === -1) return modes[0];
  return modes[(index + 1) % modes.length];
};

// Line colours come from the chart palette, which steps them per mode: the old
// half-transparent hexes composited to near-identical greys against both
// surfaces (plain-avg vs the zero baseline measured ΔE 4 — indistinguishable).
// The default here is the light set, for the pure-builder unit tests.
const DEFAULT_LINE_COLORS = balanceLineColors({ surface: '#ffffff' });
// The zero rule is chrome, not a series: it takes the grid's colour so it never
// competes with a real line for the reader's attention.
const DEFAULT_BASELINE_COLOR = '#e6e6e6';

const THIRD_LINE_ICONS = {
  prevMonth: 'calendar-arrow-left',
  prevYear: 'calendar-arrow-left',
  yearAvg: 'chart-bell-curve',
  none: 'eye-off-outline',
};

// Pure builder for the balance-history chart. Returns the derived legend data
// (`computed`), the Victory Native XL record array (`data`, xKey = day, one
// numeric field per series) and the per-series descriptors (`series`). Kept as a
// standalone export so the date-sensitive actual/forecast split and series
// composition can be unit-tested without rendering the Skia canvas.
export const computeBalanceChart = ({
  balanceHistoryData,
  spendingPrediction,
  isCurrentMonth,
  selectedYear,
  selectedMonth,
  primaryColor,
  lineColors = DEFAULT_LINE_COLORS,
  baselineColor = DEFAULT_BASELINE_COLOR,
  thirdLine = 'prevMonth',
  showPlainAvg = true,
}) => {
  if (!balanceHistoryData.actual || balanceHistoryData.actual.length === 0) {
    return { computed: null, data: [], series: [] };
  }

  const currentDay = new Date().getDate();

  const calculateForecastData = () => {
    if (!spendingPrediction || !isCurrentMonth) return [];
    const actualPoints = (balanceHistoryData.actual || []).filter(p => p.x <= currentDay);
    if (actualPoints.length === 0) return [];
    const lastActualPoint = actualPoints[actualPoints.length - 1];
    const predictions = [];
    for (let day = currentDay; day <= spendingPrediction.daysInMonth; day++) {
      const daysFromNow = day - currentDay;
      const predictedBalance = lastActualPoint.y - (spendingPrediction.dailyAverage * daysFromNow);
      predictions.push({ x: day, y: predictedBalance });
    }
    return predictions;
  };

  const forecastData = calculateForecastData();
  const hasForecast = forecastData.length > 0;

  const combinedActualForecast = balanceHistoryData.labels.map((day, index) => {
    if (!isCurrentMonth || day <= currentDay) {
      return balanceHistoryData.actualForChart[index];
    } else if (hasForecast) {
      const point = forecastData.find(p => p.x === day);
      return point ? point.y : undefined;
    }
    return undefined;
  });

  const actualValues = balanceHistoryData.actualForChart.filter(v => v !== undefined);
  const maxBalance = actualValues.length > 0 ? Math.max(...actualValues) : 0;
  const daysInMonth = balanceHistoryData.labels[balanceHistoryData.labels.length - 1];

  // Burndown ("plain avg") line starts from the month's spendable ceiling
  // (day-1 balance + post-day-1 inflows − outgoing transfers), computed in the
  // hook. Fall back to the peak-actual max when it's unavailable so older data /
  // accounts younger than the month keep the previous behaviour.
  const rawPlainAvgMax = balanceHistoryData.plainAvgMax;
  const plainAvgMax = (rawPlainAvgMax != null && Number.isFinite(rawPlainAvgMax))
    ? rawPlainAvgMax
    : maxBalance;

  const plainAvgData = balanceHistoryData.labels.map(day =>
    plainAvgMax * (1 - (day - 1) / (daysInMonth - 1)),
  );

  const forecastValues = combinedActualForecast.filter(v => v !== undefined);
  // Only the comparison line actually on screen may stretch the y-axis — a
  // hidden series must not leave the chart zoomed out around it.
  const comparisonSource = thirdLine === 'yearAvg'
    ? balanceHistoryData.yearAvg
    : (thirdLine === 'prevMonth' ? balanceHistoryData.prevMonth : []);
  const comparisonValues = (comparisonSource || []).filter(v => v !== undefined && v !== null);
  // Same rule for the burndown norm: when it is switched off it must not keep the
  // y-axis stretched up to the month's spendable ceiling.
  const allValues = [
    ...actualValues,
    ...forecastValues,
    ...comparisonValues,
    ...(showPlainAvg ? plainAvgData : []),
  ];
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const hasNegativeValues = minValue < 0;

  const { max: niceMax, interval: niceInterval } = calculateNiceScale(maxValue);
  const lastDay = balanceHistoryData.labels[balanceHistoryData.labels.length - 1];

  // Legend table values
  const now = new Date();
  const isCurrentMonthLocal = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  const displayDay = isCurrentMonthLocal
    ? now.getDate()
    : (balanceHistoryData.labels && balanceHistoryData.labels.length > 0
      ? balanceHistoryData.labels[balanceHistoryData.labels.length - 1]
      : null);

  const findActualAtDay = (day) => {
    if (!day) return undefined;
    const point = (balanceHistoryData.actual || []).find(p => p.x === day);
    if (point) return point.y;
    const prior = (balanceHistoryData.actual || []).filter(p => p.x <= day);
    if (prior.length > 0) return prior[prior.length - 1].y;
    return undefined;
  };

  const actualCurrent = findActualAtDay(displayDay);
  const actualEnd = findActualAtDay(daysInMonth);

  let actualDailyAvg = null;
  if (spendingPrediction && isCurrentMonth) {
    actualDailyAvg = -spendingPrediction.dailyAverage;
  } else if (actualValues.length >= 1) {
    const actualDataPoints = balanceHistoryData.actual || [];
    if (actualDataPoints.length >= 2) {
      const firstPoint = actualDataPoints[0];
      const lastPoint = actualDataPoints[actualDataPoints.length - 1];
      const daySpan = lastPoint.x - firstPoint.x;
      actualDailyAvg = daySpan > 0 ? (lastPoint.y - firstPoint.y) / daySpan : 0;
    } else {
      actualDailyAvg = 0;
    }
  }

  const plainAvgDaily = daysInMonth > 1 ? -plainAvgMax / (daysInMonth - 1) : 0;
  const plainAvgCurrent = displayDay ? plainAvgMax * (1 - (displayDay - 1) / (daysInMonth - 1)) : null;

  let forecastEnd = null;
  let forecastDailyAvg = null;
  const hasForecastData = spendingPrediction && isCurrentMonth;
  if (hasForecastData && actualCurrent !== undefined) {
    const daysRemaining = spendingPrediction.daysInMonth - now.getDate();
    forecastEnd = actualCurrent - (spendingPrediction.dailyAverage * daysRemaining);
    forecastDailyAvg = -spendingPrediction.dailyAverage;
  }

  const hasPrevMonthData = thirdLine === 'prevMonth'
    && !!balanceHistoryData.prevMonth
    && balanceHistoryData.prevMonth.some(v => v !== undefined);
  let prevMonthMax = null;
  let prevMonthCurrent = null;
  let prevMonthEnd = null;
  let prevMonthDailyAvg = null;
  if (hasPrevMonthData) {
    const prevMonthAllValues = balanceHistoryData.prevMonth || [];
    const prevMonthActualValues = prevMonthAllValues.filter(v => v !== undefined);
    prevMonthMax = prevMonthActualValues.length > 0 ? Math.max(...prevMonthActualValues) : null;

    const prevMonthAtDay = (day) => {
      if (!day) return null;
      const idx = Math.min(day - 1, prevMonthAllValues.length - 1);
      for (let i = idx; i >= 0; i--) {
        if (prevMonthAllValues[i] !== undefined) return prevMonthAllValues[i];
      }
      return null;
    };

    const prevMonthDaysCount = balanceHistoryData.prevMonthDaysCount || new Date(selectedYear, selectedMonth, 0).getDate();
    prevMonthCurrent = prevMonthAtDay(displayDay);
    prevMonthEnd = prevMonthAtDay(prevMonthDaysCount);

    const prevTotalExpenses = balanceHistoryData.prevMonthTotalExpenses;
    if (prevTotalExpenses != null && prevMonthDaysCount > 0) {
      prevMonthDailyAvg = -parseFloat(prevTotalExpenses) / prevMonthDaysCount;
    }
  }

  // Year-average row: the median-of-12-months line built in useBalanceHistory.
  // Values mirror the prev-month row so the legend columns stay comparable.
  const yearAvgSeries = balanceHistoryData.yearAvg || [];
  const hasYearAvgData = thirdLine === 'yearAvg'
    && yearAvgSeries.some(v => v !== undefined && v !== null);
  let yearAvgMax = null;
  let yearAvgCurrent = null;
  let yearAvgEnd = null;
  let yearAvgDailyAvg = null;
  if (hasYearAvgData) {
    const definedValues = yearAvgSeries.filter(v => v !== undefined && v !== null);
    yearAvgMax = definedValues.length > 0 ? Math.max(...definedValues) : null;

    const yearAvgAtDay = (day) => {
      if (!day) return null;
      const idx = Math.min(day - 1, yearAvgSeries.length - 1);
      for (let i = idx; i >= 0; i--) {
        const value = yearAvgSeries[i];
        if (value !== undefined && value !== null) return value;
      }
      return null;
    };

    yearAvgCurrent = yearAvgAtDay(displayDay);
    yearAvgEnd = yearAvgAtDay(daysInMonth);
    const rawYearDailyAvg = balanceHistoryData.yearAvgDailyAvg;
    yearAvgDailyAvg = (rawYearDailyAvg != null && Number.isFinite(rawYearDailyAvg))
      ? rawYearDailyAvg
      : null;
  }

  const computed = {
    thirdLine,
    showPlainAvg,
    hasYearAvgData,
    yearAvgMax,
    yearAvgCurrent,
    yearAvgEnd,
    yearAvgDailyAvg,
    currentDay,
    hasForecast,
    forecastData,
    combinedActualForecast,
    actualValues,
    maxBalance,
    plainAvgMax,
    daysInMonth,
    plainAvgData,
    hasNegativeValues,
    niceMax,
    niceInterval,
    lastDay,
    displayDay,
    actualCurrent,
    actualEnd,
    actualDailyAvg,
    plainAvgDaily,
    plainAvgCurrent,
    hasForecastData,
    forecastEnd,
    forecastDailyAvg,
    hasPrevMonthData,
    prevMonthMax,
    prevMonthCurrent,
    prevMonthEnd,
    prevMonthDailyAvg,
  };

  // Victory Native XL consumes an array of records (xKey = day + one numeric
  // field per series) instead of the legacy parallel { labels, datasets } shape.
  // The actual line is split into a solid "actual" series (up to today) and a
  // dashed "forecast" series (today onward), which makes the "today" boundary
  // self-evident — replacing the old hand-drawn vertical decorator line.
  const prevMonth = balanceHistoryData.prevMonth || [];
  const showForecast = isCurrentMonth && hasForecast;
  const data = balanceHistoryData.labels.map((day, i) => {
    const raw = combinedActualForecast[i];
    const value = raw === undefined ? null : raw;
    const isForecastDay = showForecast && day > currentDay;
    const isBoundaryDay = showForecast && day === currentDay;
    return {
      day,
      actual: isForecastDay ? null : value,
      // include the boundary day in the forecast series too so the segments touch
      forecast: (isForecastDay || isBoundaryDay) ? value : null,
      plainAvg: showPlainAvg ? (plainAvgData[i] ?? null) : null,
      prevMonth: prevMonth[i] ?? null,
      yearAvg: yearAvgSeries[i] ?? null,
      zero: 0,
    };
  });

  const series = [
    { yKey: 'actual', color: primaryColor, strokeWidth: 3, curveType: 'monotoneX', dashed: false },
  ];
  if (showForecast) {
    series.push({ yKey: 'forecast', color: primaryColor, strokeWidth: 2, curveType: 'monotoneX', dashed: true });
  }
  if (showPlainAvg) {
    series.push({ yKey: 'plainAvg', color: lineColors.norm, strokeWidth: 2, curveType: 'linear', dashed: false });
  }
  if (hasPrevMonthData) {
    series.push({ yKey: 'prevMonth', color: lineColors.prevMonth, strokeWidth: 2, curveType: 'monotoneX', dashed: false });
  }
  if (hasYearAvgData) {
    series.push({ yKey: 'yearAvg', color: lineColors.yearAvg, strokeWidth: 2, curveType: 'monotoneX', dashed: false });
  }
  series.push({ yKey: 'zero', color: baselineColor, strokeWidth: 1, curveType: 'linear', dashed: false });

  return { computed, data, series };
};

/**
 * Pure builder for the whole-year variant of the chart. Same return shape as
 * computeBalanceChart, but a deliberately thinner chart:
 *
 * - **no burndown ("plain avg") line and no deviation band.** That line is the
 *   month's spendable ceiling drawn down to zero; stretched across a year it
 *   would claim you plan to end December at nothing, which nobody does.
 * - **no forecast.** The month's prediction has no year-scale counterpart.
 * - x is day-of-year, sampled weekly by the hook, so the axis stays linear in
 *   time and the month ticks land on the actual 1sts.
 *
 * Exported for unit testing.
 */
export const computeYearBalanceChart = ({
  balanceHistoryData,
  selectedYear,
  primaryColor,
  lineColors = DEFAULT_LINE_COLORS,
  baselineColor = DEFAULT_BASELINE_COLOR,
  thirdLine = 'prevYear',
}) => {
  if (!balanceHistoryData.actual || balanceHistoryData.actual.length === 0) {
    return { computed: null, data: [], series: [] };
  }

  const labels = balanceHistoryData.labels || [];
  const actualForChart = balanceHistoryData.actualForChart || [];
  const actualPoints = balanceHistoryData.actual || [];
  const prevYearSeries = balanceHistoryData.prevYear || [];

  const actualValues = actualForChart.filter(v => v !== undefined && v !== null);
  const maxBalance = actualValues.length > 0 ? Math.max(...actualValues) : 0;

  const hasPrevYearData = thirdLine === 'prevYear'
    && prevYearSeries.some(v => v !== undefined && v !== null);
  // Only the line actually on screen may stretch the y-axis.
  const comparisonValues = hasPrevYearData
    ? prevYearSeries.filter(v => v !== undefined && v !== null)
    : [];

  const allValues = [...actualValues, ...comparisonValues];
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const hasNegativeValues = minValue < 0;
  const { max: niceMax, interval: niceInterval } = calculateNiceScale(maxValue);

  const lastDay = labels.length > 0 ? labels[labels.length - 1] : null;
  const firstPoint = actualPoints[0];
  const lastPoint = actualPoints[actualPoints.length - 1];
  // "Current" is the last sample that has data (today, in the running year);
  // "End" is the final sample of the year, which for the running year has not
  // happened yet and correctly reads as "—" rather than repeating Current.
  const displayDay = lastPoint ? lastPoint.x : null;
  const actualCurrent = lastPoint ? lastPoint.y : undefined;
  const lastIndex = labels.length - 1;
  const actualEnd = actualForChart[lastIndex] === undefined ? null : actualForChart[lastIndex];

  let actualDailyAvg = null;
  if (actualPoints.length >= 2) {
    const daySpan = lastPoint.x - firstPoint.x;
    actualDailyAvg = daySpan > 0 ? (lastPoint.y - firstPoint.y) / daySpan : 0;
  } else if (actualPoints.length === 1) {
    actualDailyAvg = 0;
  }

  let prevYearMax = null;
  let prevYearCurrent = null;
  let prevYearEnd = null;
  let prevYearDailyAvg = null;
  if (hasPrevYearData) {
    prevYearMax = Math.max(...comparisonValues);

    // Read the comparison at the same day-of-year the actual line stops at, so
    // the Current column compares like with like.
    const currentIndex = labels.indexOf(displayDay);
    for (let i = currentIndex >= 0 ? currentIndex : labels.length - 1; i >= 0; i--) {
      const value = prevYearSeries[i];
      if (value !== undefined && value !== null) { prevYearCurrent = value; break; }
    }
    for (let i = prevYearSeries.length - 1; i >= 0; i--) {
      const value = prevYearSeries[i];
      if (value !== undefined && value !== null) { prevYearEnd = value; break; }
    }

    // Mirrors the prev-month row: spending per day, not the balance delta, so the
    // comparison column answers "what did a day cost me last year".
    const prevTotalExpenses = balanceHistoryData.prevYearTotalExpenses;
    const prevDaysCount = balanceHistoryData.prevYearDaysCount;
    if (prevTotalExpenses != null && prevDaysCount > 0) {
      const parsed = parseFloat(prevTotalExpenses);
      if (Number.isFinite(parsed)) prevYearDailyAvg = -parsed / prevDaysCount;
    }
  }

  // Month ticks: 12 values, one per 1st of the month. Passed to the axis as
  // explicit tickValues so the labels sit on the real month boundaries instead of
  // on whatever evenly-spaced positions a tickCount would produce.
  const monthTicks = monthStartDaysOfYear(selectedYear);
  const monthByDay = {};
  monthTicks.forEach((day, month) => { monthByDay[day] = month; });

  const computed = {
    granularity: 'year',
    thirdLine,
    labels,
    maxBalance,
    actualCurrent,
    actualEnd,
    actualDailyAvg,
    displayDay,
    hasNegativeValues,
    niceMax,
    niceInterval,
    lastDay,
    hasPrevYearData,
    prevYearMax,
    prevYearCurrent,
    prevYearEnd,
    prevYearDailyAvg,
    monthTicks,
    monthByDay,
  };

  const data = labels.map((day, i) => ({
    day,
    actual: actualForChart[i] === undefined ? null : actualForChart[i],
    prevYear: prevYearSeries[i] === undefined ? null : prevYearSeries[i],
    zero: 0,
  }));

  const series = [
    { yKey: 'actual', color: primaryColor, strokeWidth: 3, curveType: 'monotoneX', dashed: false },
  ];
  if (hasPrevYearData) {
    // Same slot the prev-month line uses: it is the same idea (the period before
    // this one), and the two never appear together.
    series.push({ yKey: 'prevYear', color: lineColors.prevMonth, strokeWidth: 2, curveType: 'monotoneX', dashed: false });
  }
  series.push({ yKey: 'zero', color: baselineColor, strokeWidth: 1, curveType: 'linear', dashed: false });

  return { computed, data, series };
};

// Skia needs concrete colour strings for gradient stops, and theme colours may be
// hex or rgb(a). Normalising here keeps the gradient from throwing on an unexpected
// format. Exported for unit testing.
export const toRgba = (color, alpha) => {
  if (typeof color !== 'string') return `rgba(0, 0, 0, ${alpha})`;
  const value = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const int = parseInt(hex[1], 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((part) => parseFloat(part));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return value;
};

const CHART_ANIMATION = { type: 'timing', duration: 300 };
// A plain drag scrubs values, so panning/zooming only starts after a long press —
// otherwise the chart would fight the vertical ScrollView it lives in.
const TRANSFORM_CONFIG = {
  pan: { dimensions: 'x', activateAfterLongPress: 200 },
  pinch: { dimensions: 'x' },
};

// Skia cursor drawn at the pressed x position: a dashed vertical rule plus a dot
// on the actual-balance line. Both take Reanimated shared values, so tracking the
// finger never crosses back into JS.
const ChartCursor = ({ x, y, color, top, bottom }) => {
  const start = useDerivedValue(() => vec(x.value, top), [x, top]);
  const end = useDerivedValue(() => vec(x.value, bottom), [x, bottom]);
  return (
    <>
      <SkiaLine p1={start} p2={end} color={color} strokeWidth={1} opacity={0.6}>
        <DashPathEffect intervals={[4, 4]} />
      </SkiaLine>
      <Circle cx={x} cy={y} r={5} color={color} />
    </>
  );
};

ChartCursor.propTypes = {
  bottom: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  top: PropTypes.number.isRequired,
  x: PropTypes.object.isRequired,
  y: PropTypes.object.isRequired,
};

// Shaded band between the actual balance and the burndown norm: it reads as
// "how far ahead of / behind plan you are" without a second axis. Points are
// paired by index and gaps (forecast days) dropped so the band never collapses.
const DeviationBand = ({ actualPoints, normPoints, color }) => {
  const { upper, lower } = useMemo(() => {
    const up = [];
    const low = [];
    (actualPoints || []).forEach((point, index) => {
      const norm = normPoints?.[index];
      if (!point || !norm) return;
      if (point.yValue == null || norm.yValue == null) return;
      up.push(point);
      low.push(norm);
    });
    return { upper: up, lower: low };
  }, [actualPoints, normPoints]);

  if (upper.length < 2) return null;

  return (
    <AreaRange
      upperPoints={upper}
      lowerPoints={lower}
      color={color}
      opacity={0.1}
      animate={CHART_ANIMATION}
    />
  );
};

DeviationBand.propTypes = {
  actualPoints: PropTypes.array,
  color: PropTypes.string.isRequired,
  normPoints: PropTypes.array,
};

/**
 * The Skia canvas itself. Split out from the card so it can be remounted (via a
 * `key` on the series signature) whenever the set of yKeys changes — the press
 * state is allocated per series key and cannot change shape in place.
 */
const BalanceChart = ({
  chartData,
  chartYKeys,
  chartSeries,
  yDomain,
  colors,
  axisFont,
  hideBalances,
  lastDay,
  onScrub,
  xTickValues,
  monthByDay,
  showDeviationBand = true,
}) => {
  const pressInit = useRef({
    x: 0,
    y: Object.fromEntries(chartYKeys.map((key) => [key, 0])),
  }).current;
  const { state: pressState, isActive } = useChartPressState(pressInit);
  const { state: transformState } = useChartTransformState();

  useAnimatedReaction(
    () => pressState.x.value.value,
    (current, previous) => {
      if (current !== previous) runOnJS(onScrub)(Math.round(current));
    },
    [onScrub],
  );

  useEffect(() => {
    if (!isActive) onScrub(null);
  }, [isActive, onScrub]);

  // Year view: explicit month ticks (the 1st of each month, in day-of-year
  // coordinates) labelled with the month, so 53 weekly samples produce 12 labels
  // instead of a smear of day numbers.
  const xAxis = useMemo(() => {
    const base = {
      font: axisFont,
      lineColor: colors.border,
      labelColor: colors.mutedText,
      enableRescaling: true,
    };
    if (xTickValues) {
      return {
        ...base,
        tickValues: xTickValues,
        formatXLabel: (value) => MONTH_ABBREVIATIONS[monthByDay?.[Math.round(value)]] ?? '',
      };
    }
    return { ...base, formatXLabel: (value) => formatXAxisLabel(value, lastDay) };
  }, [axisFont, colors.border, colors.mutedText, lastDay, xTickValues, monthByDay]);

  const yAxis = useMemo(() => ([{
    font: axisFont,
    lineColor: colors.border,
    labelColor: colors.mutedText,
    formatYLabel: (value) => formatYAxisLabel(value, hideBalances),
    // Solid hairline grid: dashes read as a threshold line, and this is a grid.
    enableRescaling: true,
  }]), [axisFont, colors.border, colors.mutedText, hideBalances]);

  return (
    <CartesianChart
      data={chartData}
      xKey="day"
      yKeys={chartYKeys}
      domain={yDomain}
      domainPadding={{ top: 16, bottom: 16 }}
      chartPressState={pressState}
      transformState={transformState}
      transformConfig={TRANSFORM_CONFIG}
      xAxis={xAxis}
      yAxis={yAxis}
      frame={{ lineWidth: 0 }}
    >
      {({ points, chartBounds }) => (
        <>
          {showDeviationBand && (
            <DeviationBand
              actualPoints={points.actual}
              normPoints={points.plainAvg}
              color={colors.primary}
            />
          )}
          {/* Gradient fill under the actual balance, fading to transparent at the axis. */}
          <Area
            points={points.actual}
            y0={chartBounds.bottom}
            curveType="monotoneX"
            animate={CHART_ANIMATION}
            connectMissingData
          >
            <LinearGradient
              start={vec(0, chartBounds.top)}
              end={vec(0, chartBounds.bottom)}
              colors={[toRgba(colors.primary, 0.35), toRgba(colors.primary, 0)]}
            />
          </Area>
          {chartSeries.map((s) => (
            <Line
              key={s.yKey}
              points={points[s.yKey]}
              color={s.color}
              strokeWidth={s.strokeWidth}
              curveType={s.curveType}
              animate={CHART_ANIMATION}
              connectMissingData
            >
              {/* DashPathEffect is a Skia paint child; guarded so the
                  system stays robust if the effect is unavailable. */}
              {s.dashed && DashPathEffect ? (
                <DashPathEffect intervals={[6, 6]} />
              ) : null}
            </Line>
          ))}
          {isActive && (
            <ChartCursor
              x={pressState.x.position}
              y={pressState.y.actual.position}
              color={colors.primary}
              top={chartBounds.top}
              bottom={chartBounds.bottom}
            />
          )}
        </>
      )}
    </CartesianChart>
  );
};

BalanceChart.propTypes = {
  axisFont: PropTypes.object,
  chartData: PropTypes.array.isRequired,
  chartSeries: PropTypes.array.isRequired,
  chartYKeys: PropTypes.arrayOf(PropTypes.string).isRequired,
  colors: PropTypes.object.isRequired,
  hideBalances: PropTypes.bool,
  lastDay: PropTypes.number,
  monthByDay: PropTypes.object,
  onScrub: PropTypes.func.isRequired,
  showDeviationBand: PropTypes.bool,
  xTickValues: PropTypes.arrayOf(PropTypes.number),
  yDomain: PropTypes.object,
};

const BalanceHistoryCard = ({
  colors,
  t,
  selectedAccount,
  onAccountChange,
  accountItems,
  loadingBalanceHistory,
  balanceHistoryData,
  selectedYear,
  selectedMonth,
  accounts,
  spendingPrediction,
  isCurrentMonth,
  closeLabel,
  balanceHistoryTableData,
  editingBalanceValue,
  onEditingBalanceValueChange,
  onEditBalance,
  onCancelEdit,
  onSaveBalance,
  onDeleteBalance,
  onShowCalendar,
}) => {
  const { hideBalances } = useDisplaySettings();
  // `showCalendar` is the user's intent; `calendarVisible` below is whether it
  // can be honoured — the year view has no calendar and hides the toggle, so a
  // calendar left open across a period switch would otherwise strand the user in
  // a month grid with no way back to the chart.
  const [showCalendar, setShowCalendar] = useState(false);
  // Which comparison line rides along with the actual balance: last month, the
  // 12-month median, or nothing at all (the year view offers last year / nothing).
  const [thirdLine, setThirdLine] = useState('prevMonth');
  // The burndown norm ("plain avg") is a second opinion on the same month, not a
  // reading of it — off by default so the chart opens with just the actual line,
  // and switched on from the header when the reader wants the comparison.
  const [showPlainAvg, setShowPlainAvg] = useState(false);
  const [contentHeight, setContentHeight] = useState(340);
  // Day currently under the finger while scrubbing the chart (null when idle).
  const [scrubDay, setScrubDay] = useState(null);
  // Comparison-line steps for the current mode — the legend dots below read from
  // the same object, so a swatch can never drift from the line it stands for.
  const chartLineColors = useMemo(() => balanceLineColors(colors), [colors]);

  // No month selected = the whole-year view. Derived rather than passed so the
  // card cannot disagree with the data the hook loaded for the same period.
  const isYearView = selectedMonth === null;
  const granularity = isYearView ? 'year' : 'month';
  const calendarVisible = showCalendar && !isYearView;
  // The mode is kept across a period switch when it still exists there, and
  // otherwise falls back to that period's first mode — switching to the year view
  // must not leave a stale 'yearAvg' selected and no line drawn.
  const thirdLineModes = thirdLineModesFor(granularity);
  const effectiveThirdLine = thirdLineModes.includes(thirdLine) ? thirdLine : thirdLineModes[0];

  const selectedAccountData = accounts.find(acc => acc.id === selectedAccount);
  const currency = selectedAccountData?.currency || 'USD';
  const currentBalance = balanceHistoryData.actual && balanceHistoryData.actual.length > 0
    ? balanceHistoryData.actual[balanceHistoryData.actual.length - 1].y
    : null;
  const headerDayNum = new Date().getDate();
  const headerDaysInMonth = selectedMonth !== null
    ? new Date(selectedYear, selectedMonth + 1, 0).getDate()
    : null;

  const { computed: chartComputed, data: chartData, series: chartSeries } = useMemo(
    () => (isYearView
      ? computeYearBalanceChart({
        balanceHistoryData,
        selectedYear,
        primaryColor: colors.primary,
        lineColors: chartLineColors,
        baselineColor: colors.border,
        thirdLine: effectiveThirdLine,
      })
      : computeBalanceChart({
        balanceHistoryData,
        spendingPrediction,
        isCurrentMonth,
        selectedYear,
        selectedMonth,
        primaryColor: colors.primary,
        lineColors: chartLineColors,
        baselineColor: colors.border,
        thirdLine: effectiveThirdLine,
        showPlainAvg,
      })),
    [isYearView, balanceHistoryData, spendingPrediction, isCurrentMonth, selectedYear, selectedMonth, colors.primary, colors.border, chartLineColors, effectiveThirdLine, showPlainAvg],
  );

  // yKeys drive Victory's shared y-domain (the always-present "zero" key keeps the
  // baseline in range). Only the keys with a rendered <Line> are listed.
  const chartYKeys = useMemo(() => chartSeries.map(s => s.yKey), [chartSeries]);

  // Fixed [0, niceMax] domain unless the data dips negative (then let Victory
  // auto-scale to include the negative portion), mirroring the old yDomain logic.
  const yDomain = useMemo(() => {
    if (!chartComputed) return undefined;
    if (chartComputed.hasNegativeValues || !chartComputed.niceMax) return undefined;
    return { y: [0, chartComputed.niceMax] };
  }, [chartComputed]);

  // System-font axis labels (the project ships no .ttf). Guarded because matchFont
  // returns a stub under Jest and a real SkFont on device.
  const axisFont = useMemo(() => {
    try {
      return matchFont({ fontFamily: 'sans-serif', fontSize: 11 }) || null;
    } catch (e) {
      return null;
    }
  }, []);

  const handleScrub = useCallback((day) => setScrubDay(day), []);

  // While scrubbing, the header reports the balance under the finger instead of
  // the latest one — the chart itself carries no numbers. The year view is
  // sampled weekly, so the scrubbed day rarely lands exactly on a record: take
  // the nearest sample rather than reporting nothing.
  const scrubbedBalance = useMemo(() => {
    if (scrubDay == null) return null;
    let point = chartData.find((d) => d.day === scrubDay);
    if (!point && isYearView && chartData.length > 0) {
      point = chartData.reduce((closest, candidate) =>
        (Math.abs(candidate.day - scrubDay) < Math.abs(closest.day - scrubDay) ? candidate : closest));
    }
    if (!point) return null;
    return point.actual ?? point.forecast ?? null;
  }, [scrubDay, chartData, isYearView]);

  const headerBalance = scrubbedBalance != null ? scrubbedBalance : currentBalance;
  const headerDay = scrubDay != null ? scrubDay : headerDayNum;
  const showDayContext = !isYearView && (isCurrentMonth || scrubDay != null) && headerDaysInMonth !== null;
  // Year view: name the month under the finger instead of a day-of-month counter
  // that would be meaningless on a year-long axis.
  const scrubMonthLabel = useMemo(() => {
    if (!isYearView || scrubDay == null) return null;
    const monthStarts = monthStartDaysOfYear(selectedYear);
    let month = 0;
    monthStarts.forEach((start, index) => { if (scrubDay >= start) month = index; });
    return MONTH_ABBREVIATIONS[month];
  }, [isYearView, scrubDay, selectedYear]);

  // Series composition drives the press-state shape; remount the canvas when it changes.
  const chartKey = chartYKeys.join('|');

  const thirdLineLabel = effectiveThirdLine === 'prevMonth'
    ? (t('prev_month') || 'Prev Month')
    : effectiveThirdLine === 'prevYear'
      ? (t('prev_year') || 'Prev Year')
      : effectiveThirdLine === 'yearAvg'
        ? (t('year_avg') || 'Year avg')
        : (t('comparison_none') || 'No comparison');

  return (
    <View style={[styles.balanceHistoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.balanceHistoryHeader}>
        <View style={styles.balanceHistoryTitleContainer}>
          <Text style={[styles.balanceHistoryLabel, { color: colors.mutedText }]}>
            {(t('balance') || 'Balance').toUpperCase()}
          </Text>
          {headerBalance !== null && (
            <View style={styles.balanceAmountRow}>
              <Text style={[styles.balanceAmount, { color: colors.text }]} numberOfLines={1}>
                {hideBalances ? '••••' : formatBalanceCompact(headerBalance, currency)}
              </Text>
              {showDayContext && (
                <Text style={[styles.balanceDayContext, { color: colors.mutedText }]}>
                  {`day ${headerDay}/${headerDaysInMonth}`}
                </Text>
              )}
              {scrubMonthLabel !== null && (
                <Text style={[styles.balanceDayContext, { color: colors.mutedText }]}>
                  {`${scrubMonthLabel} ${selectedYear}`}
                </Text>
              )}
            </View>
          )}
        </View>
        {/* Burndown-norm toggle. Month view only — the year chart never draws
            that line (see computeYearBalanceChart). */}
        {!calendarVisible && !isYearView && balanceHistoryData.actual && balanceHistoryData.actual.length > 0 && (
          <TouchableOpacity
            testID="plain-avg-toggle-btn"
            style={[styles.calendarToggleBtn, { backgroundColor: colors.surface }]}
            onPress={() => setShowPlainAvg(prev => !prev)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: showPlainAvg }}
            accessibilityLabel={t('plain_avg') || 'Plain avg'}
          >
            {/* One icon in both states, muted when off: the comparison toggle
                next to it already uses eye-off for its own "none" step, and two
                identical eye-off glyphs side by side say nothing about which
                line each button owns. */}
            <Icon
              name="trending-down"
              size={18}
              color={showPlainAvg ? chartLineColors.norm : colors.mutedText}
            />
          </TouchableOpacity>
        )}
        {/* Comparison line toggle: month view steps prev month → year average →
            off, year view steps prev year → off. */}
        {!calendarVisible && balanceHistoryData.actual && balanceHistoryData.actual.length > 0 && (
          <TouchableOpacity
            testID="third-line-toggle-btn"
            style={[styles.calendarToggleBtn, { backgroundColor: colors.surface }]}
            onPress={() => setThirdLine(nextThirdLineMode(effectiveThirdLine, granularity))}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={thirdLineLabel}
          >
            <Icon
              name={THIRD_LINE_ICONS[effectiveThirdLine]}
              size={18}
              color={effectiveThirdLine === 'none' ? colors.mutedText : colors.primary}
            />
          </TouchableOpacity>
        )}
        {/* Calendar / Chart toggle. The calendar is a month grid, so the year
            view has nothing to switch to. */}
        {!isYearView && balanceHistoryData.actual && balanceHistoryData.actual.length > 0 && (
          <TouchableOpacity
            testID="calendar-toggle-btn"
            style={[styles.calendarToggleBtn, { backgroundColor: colors.surface }]}
            onPress={() => {
              const next = !showCalendar;
              setShowCalendar(next);
              if (next) onShowCalendar();
            }}
            activeOpacity={0.7}
          >
            <Icon
              name={showCalendar ? 'chart-line' : 'calendar-month'}
              size={18}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}
        {/* Account Pill Picker */}
        <View style={[styles.accountPickerWrapper, { backgroundColor: colors.card }]}>
          <SimplePicker
            value={selectedAccount}
            onValueChange={onAccountChange}
            items={accountItems}
            colors={colors}
            leftIcon="bank"
            style={styles.accountPickerInner}
            closeLabel={closeLabel}
          />
        </View>
      </View>

      {loadingBalanceHistory ? (
        <View style={styles.balanceHistoryLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : balanceHistoryData.actual && balanceHistoryData.actual.length > 0 ? (
        <>
          {calendarVisible ? (
            <View style={[styles.calendarContainer, { minHeight: contentHeight }]}>
              <BalanceHistoryCalendarView
                colors={colors}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                balanceHistoryTableData={balanceHistoryTableData}
                editingBalanceValue={editingBalanceValue}
                onEditingBalanceValueChange={onEditingBalanceValueChange}
                onEditBalance={onEditBalance}
                onCancelEdit={onCancelEdit}
                onSaveBalance={onSaveBalance}
                onDeleteBalance={onDeleteBalance}
                currency={currency}
              />
            </View>
          ) : (
            <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>
              <View style={styles.balanceHistoryChartContainer}>
                {chartComputed && (
                  <View
                    style={[styles.balanceHistoryChart, { backgroundColor: colors.altRow }]}
                    accessibilityRole="image"
                    accessibilityLabel={t('balance_history') || 'Balance history chart'}
                  >
                    <BalanceChart
                      key={chartKey}
                      chartData={chartData}
                      chartYKeys={chartYKeys}
                      chartSeries={chartSeries}
                      yDomain={yDomain}
                      colors={colors}
                      axisFont={axisFont}
                      hideBalances={hideBalances}
                      lastDay={chartComputed.lastDay}
                      onScrub={handleScrub}
                      xTickValues={isYearView ? chartComputed.monthTicks : undefined}
                      monthByDay={isYearView ? chartComputed.monthByDay : undefined}
                      showDeviationBand={!isYearView && showPlainAvg}
                    />
                  </View>
                )}
              </View>

              {/* Compact Table Legend */}
              {!hideBalances && chartComputed && (
                <View style={styles.legendTableContainer}>
                  {/* Header row */}
                  <View style={styles.legendTableRow}>
                    <View style={styles.legendTableLabelCell} />
                    <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('max') || 'Max'}</Text>
                    <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('current') || 'Current'}</Text>
                    <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('daily_avg') || 'Daily Avg'}</Text>
                    <Text style={[styles.legendTableHeader, { color: colors.mutedText }]}>{t('end') || 'End'}</Text>
                  </View>

                  {/* Actual + Forecast row (combined line) */}
                  <View style={styles.legendTableRow}>
                    <View style={styles.legendTableLabelCell}>
                      <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('actual') || 'Actual'}</Text>
                    </View>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.maxBalance, currency)}</Text>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.actualCurrent, currency)}</Text>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.actualDailyAvg, currency)}</Text>
                    <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.hasForecastData ? chartComputed.forecastEnd : chartComputed.actualEnd, currency)}</Text>
                  </View>

                  {/* Plain avg row — the burndown norm, month view only (see
                      computeYearBalanceChart for why a year has none) */}
                  {!isYearView && showPlainAvg && (
                    <View style={styles.legendTableRow} testID="legend-row-plain-avg">
                      <View style={styles.legendTableLabelCell}>
                        <View style={[styles.legendDot, { backgroundColor: chartLineColors.norm }]} />
                        <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('plain_avg') || 'Plain avg'}</Text>
                      </View>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.plainAvgMax, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.plainAvgCurrent, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.plainAvgDaily, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(0, currency)}</Text>
                    </View>
                  )}

                  {/* Prev year row (year view's only comparison) */}
                  {chartComputed.hasPrevYearData && (
                    <View style={styles.legendTableRow} testID="legend-row-prev-year">
                      <View style={styles.legendTableLabelCell}>
                        <View style={[styles.legendDot, { backgroundColor: chartLineColors.prevMonth }]} />
                        <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('prev_year') || 'Prev Year'}</Text>
                      </View>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevYearMax, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevYearCurrent, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevYearDailyAvg, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevYearEnd, currency)}</Text>
                    </View>
                  )}

                  {/* Prev month row */}
                  {chartComputed.hasPrevMonthData && (
                    <View style={styles.legendTableRow}>
                      <View style={styles.legendTableLabelCell}>
                        <View style={[styles.legendDot, { backgroundColor: chartLineColors.prevMonth }]} />
                        <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('prev_month') || 'Prev Month'}</Text>
                      </View>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevMonthMax, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevMonthCurrent, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevMonthDailyAvg, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.prevMonthEnd, currency)}</Text>
                    </View>
                  )}

                  {/* Year average row (median across the previous 12 months) */}
                  {chartComputed.hasYearAvgData && (
                    <View style={styles.legendTableRow}>
                      <View style={styles.legendTableLabelCell}>
                        <View style={[styles.legendDot, { backgroundColor: chartLineColors.yearAvg }]} />
                        <Text style={[styles.legendTableLabel, { color: colors.text }]}>{t('year_avg') || 'Year avg'}</Text>
                      </View>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.yearAvgMax, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.yearAvgCurrent, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.yearAvgDailyAvg, currency)}</Text>
                      <Text style={[styles.legendTableValue, { color: colors.text }]}>{formatCompact(chartComputed.yearAvgEnd, currency)}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </>
      ) : (
        <View style={styles.balanceHistoryNoData}>
          <Text style={[styles.balanceHistoryNoDataText, { color: colors.mutedText }]}>
            {isYearView
              ? (t('no_balance_history_year') || 'No balance history available for this year')
              : (t('no_balance_history') || 'No balance history available for this month')}
          </Text>
        </View>
      )}
    </View>
  );
};

BalanceHistoryCard.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  selectedAccount: PropTypes.string,
  onAccountChange: PropTypes.func.isRequired,
  accountItems: PropTypes.array.isRequired,
  loadingBalanceHistory: PropTypes.bool.isRequired,
  balanceHistoryData: PropTypes.shape({
    labels: PropTypes.array,
    actual: PropTypes.array,
    actualForChart: PropTypes.array,
    burndown: PropTypes.array,
    prevMonth: PropTypes.array,
    prevMonthTotalExpenses: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    prevMonthDaysCount: PropTypes.number,
    plainAvgMax: PropTypes.number,
    yearAvg: PropTypes.array,
    yearAvgDailyAvg: PropTypes.number,
    // Whole-year view (selectedMonth === null): weekly samples of this year and
    // the one before it, plus what the comparison row needs.
    granularity: PropTypes.oneOf(['month', 'year']),
    prevYear: PropTypes.array,
    prevYearTotalExpenses: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    prevYearDaysCount: PropTypes.number,
  }).isRequired,
  selectedYear: PropTypes.number.isRequired,
  selectedMonth: PropTypes.number,
  accounts: PropTypes.array.isRequired,
  spendingPrediction: PropTypes.shape({
    currentSpending: PropTypes.number,
    predictedTotal: PropTypes.number,
    predictedRemaining: PropTypes.number,
    dailyAverage: PropTypes.number,
    daysElapsed: PropTypes.number,
    daysInMonth: PropTypes.number,
    percentElapsed: PropTypes.number,
  }),
  isCurrentMonth: PropTypes.bool,
  closeLabel: PropTypes.string,
  balanceHistoryTableData: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      balance: PropTypes.string,
    }),
  ).isRequired,
  editingBalanceValue: PropTypes.string.isRequired,
  onEditingBalanceValueChange: PropTypes.func.isRequired,
  onEditBalance: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveBalance: PropTypes.func.isRequired,
  onDeleteBalance: PropTypes.func.isRequired,
  onShowCalendar: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  accountPickerInner: {
    height: 32,
    paddingHorizontal: 10,
  },
  accountPickerWrapper: {
    borderRadius: BORDER_RADIUS.pill,
    flexShrink: 0,
    width: 150,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  balanceAmountRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: 4,
  },
  balanceDayContext: {
    fontSize: 13,
    fontWeight: '500',
  },
  balanceHistoryCard: {
    ...CARD_SURFACE,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    padding: 16,
  },
  balanceHistoryChart: {
    height: 220,
  },
  balanceHistoryChartContainer: {
    marginHorizontal: -16,
  },
  balanceHistoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  balanceHistoryLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  balanceHistoryLoading: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
  },
  balanceHistoryNoData: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  balanceHistoryNoDataText: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
  },
  balanceHistoryTitleContainer: {
    flex: 1,
    marginRight: 8,
    overflow: 'hidden',
  },
  calendarContainer: {
    minHeight: 340,
  },
  calendarToggleBtn: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    height: 32,
    justifyContent: 'center',
    marginRight: 8,
    width: 32,
  },
  legendDot: {
    borderRadius: BORDER_RADIUS.pill,
    height: 12,
    marginRight: 6,
    width: 12,
  },
  legendTableContainer: {
    marginTop: 16,
  },
  legendTableHeader: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    textAlign: 'right',
  },
  legendTableLabel: {
    fontSize: FONT_SIZE.sm,
  },
  legendTableLabelCell: {
    alignItems: 'center',
    flexDirection: 'row',
    width: 80,
  },
  legendTableRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 4,
  },
  legendTableValue: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    textAlign: 'right',
  },
});

export default BalanceHistoryCard;
