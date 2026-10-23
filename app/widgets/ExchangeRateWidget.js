'use no memo';
// ↑ The widget tree is built by calling these functions directly, outside
// React's renderer, so they must stay plain functions: no hooks, and no React
// Compiler memoisation wrapping them should it ever be switched on.

import React from 'react';
import PropTypes from 'prop-types';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { lightTheme, darkTheme } from '../contexts/ThemeColorsContext';
import { getCurrencySymbol } from '../services/currency';
import {
  formatAxisDate,
  formatRateChange,
  formatRateValue,
  rateChangeColor,
  rateDecimals,
  shownRateChange,
  summarizeRateSeries,
} from '../services/ExchangeRateHistory';
import { rateChartTitle } from '../services/ExchangeRateCharts';
import { translate } from '../services/notifications/notificationStrings';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../styles/designTokens';
import { GRAPHS_DEEP_LINK } from './widgetConstants';

/**
 * The exchange-rate home-screen widget: one pair's current rate, its move over
 * the chart's range and, when the widget is tall enough, the line behind it.
 *
 * Widgets are drawn by the launcher from Android RemoteViews, not by React
 * Native, so this is built from the widget library's primitives. The line is
 * an SVG string the library rasterises, the chart canvas the Graphs tab uses
 * (Skia) does not exist there.
 */

const PADDING = SPACING.md;
// What the text rows above the line take, so the line gets the rest.
const HEADER_HEIGHT = 64;
// Below this the line is too flat to read; the widget shows the figures only.
const MIN_SPARKLINE_HEIGHT = 24;
// More points than a widget is wide only lengthens the SVG string.
const MAX_SPARKLINE_POINTS = 120;

const VALUE_FONT_SIZE = 22;

// Widget primitives take plain style objects (they are converted to
// RemoteViews attributes, not passed to React Native's StyleSheet).
const ROOT_STYLE = {
  height: 'match_parent',
  width: 'match_parent',
  flexDirection: 'column',
  borderRadius: BORDER_RADIUS.xl,
  padding: PADDING,
};
const CENTERED_STYLE = { height: 'match_parent', width: 'match_parent', justifyContent: 'center' };
// A row of a text that gives way and a short one pinned to the right. The
// first sits in a flexing box so it is the one truncated: a widget two cells
// wide has room for about 85dp of text per row.
const ROW_STYLE = { width: 'match_parent', flexDirection: 'row', alignItems: 'center' };
const ROW_GROW_STYLE = { flex: 1 };
const ROW_END_STYLE = { marginLeft: SPACING.xs };
const SMALL_TEXT = { fontSize: FONT_SIZE.sm };
const MESSAGE_TEXT = { fontSize: FONT_SIZE.md };
const VALUE_TEXT = { fontSize: VALUE_FONT_SIZE, fontWeight: 'bold' };

/**
 * Evenly thinned values, first and last kept.
 *
 * @param {number[]} values
 * @param {number} max
 * @returns {number[]}
 */
export const thinValues = (values, max = MAX_SPARKLINE_POINTS) => {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]);
};

/**
 * The line as an SVG document: a stroke with a faint fill under it, scaled to
 * fill `width` × `height` from the series' own minimum to its maximum.
 *
 * @param {number[]} values
 * @param {number} width
 * @param {number} height
 * @param {string} color - #rrggbb
 * @returns {string|null} Null when no value is finite
 */
export const buildSparklineSvg = (values, width, height, color) => {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const inset = 2;
  const series = thinValues(values.filter(Number.isFinite));
  // Nothing drawable: no SVG at all, rather than a path of NaN the
  // rasteriser might throw on (and leave the widget on its last frame).
  if (series.length === 0) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  const yOf = (value) => (span > 0
    ? inset + (1 - (value - min) / span) * (h - inset * 2)
    : h / 2);
  const points = series.length > 1
    ? series.map((value, i) => [(i / (series.length - 1)) * w, yOf(value)])
    : [[0, yOf(series[0])], [w, yOf(series[0])]];
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<path d="${area}" fill="${color}" fill-opacity="0.15"/>`
    + `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    + '</svg>';
};

/**
 * The figures the widget prints for a loaded series.
 *
 * @param {Object} chart - { from, to, amount }
 * @param {Array<{date: string, rate: number}>} points
 * @param {string} language
 * @returns {{title: string, value: string, change: string, delta: number, arrow: string,
 *   date: string}|null} `delta` is the move as a number, for its colour
 */
export const describeRate = (chart, points, language) => {
  const summary = summarizeRateSeries(points, chart.amount);
  if (!summary) return null;
  const decimals = rateDecimals(summary.current);
  const { change, changePercent } = shownRateChange(summary.change, summary.changePercent, decimals);
  return {
    title: rateChartTitle(chart),
    value: `${getCurrencySymbol(chart.to)}${formatRateValue(summary.current, language, decimals)}`,
    change: formatRateChange(change, changePercent, language, decimals),
    delta: change,
    arrow: change > 0 ? '▲' : change < 0 ? '▼' : '•',
    // The day and month, as the Graphs card labels a month's axis.
    date: formatAxisDate(summary.date, 'month', language),
  };
};

const Root = ({ colors, label, children }) => (
  <FlexWidget
    clickAction="OPEN_URI"
    clickActionData={{ uri: GRAPHS_DEEP_LINK }}
    accessibilityLabel={label}
    style={{ ...ROOT_STYLE, backgroundColor: colors.surface }}
  >
    {children}
  </FlexWidget>
);

Root.propTypes = {
  children: PropTypes.node,
  colors: PropTypes.object.isRequired,
  label: PropTypes.string.isRequired,
};

const Message = ({ colors, label, text }) => (
  <Root colors={colors} label={label}>
    <FlexWidget style={CENTERED_STYLE}>
      <TextWidget
        text={text}
        maxLines={3}
        truncate="END"
        style={{ ...MESSAGE_TEXT, color: colors.mutedText }}
      />
    </FlexWidget>
  </Root>
);

Message.propTypes = {
  colors: PropTypes.object.isRequired,
  label: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
};

/**
 * @param {Object} props
 * @param {{status: 'ready'|'error'|'empty', chart?: Object, points?: Array, stale?: boolean, language: string}} props.model
 * @param {'light'|'dark'} props.theme
 * @param {number} props.width - Widget width in dp
 * @param {number} props.height - Widget height in dp
 */
export function ExchangeRateWidget({ model, theme, width, height }) {
  const colors = (theme === 'dark' ? darkTheme : lightTheme).colors;
  const { language } = model;

  if (model.status === 'empty') {
    const text = translate(language, 'widget_rate_empty');
    return <Message colors={colors} label={text} text={text} />;
  }

  const figures = model.status === 'ready' ? describeRate(model.chart, model.points, language) : null;
  if (!figures) {
    const title = rateChartTitle(model.chart);
    return (
      <Message
        colors={colors}
        label={title}
        text={`${title}\n${translate(language, 'rate_load_failed')}`}
      />
    );
  }

  const mutedText = { ...SMALL_TEXT, color: colors.mutedText };
  const sparkWidth = width - PADDING * 2;
  const sparkHeight = height - PADDING * 2 - HEADER_HEIGHT - SPACING.xs;
  const sparkline = sparkHeight >= MIN_SPARKLINE_HEIGHT && sparkWidth > 0
    ? buildSparklineSvg(
      model.points.map((point) => point.rate * model.chart.amount),
      sparkWidth,
      sparkHeight,
      colors.primary,
    )
    : null;

  // The date rides the title's row and the offline marker the change's, each
  // pinned right: the two together do not fit beside a title on a narrow
  // widget, and being cut off is exactly what the offline marker must not be.
  return (
    <Root colors={colors} label={`${figures.title}: ${figures.value}, ${figures.change}`}>
      <FlexWidget style={ROW_STYLE}>
        <FlexWidget style={ROW_GROW_STYLE}>
          <TextWidget text={figures.title} maxLines={1} truncate="END" style={mutedText} />
        </FlexWidget>
        <TextWidget text={figures.date} maxLines={1} style={{ ...mutedText, ...ROW_END_STYLE }} />
      </FlexWidget>
      <TextWidget
        text={figures.value}
        maxLines={1}
        truncate="END"
        style={{ ...VALUE_TEXT, color: colors.text }}
      />
      <FlexWidget style={ROW_STYLE}>
        <FlexWidget style={ROW_GROW_STYLE}>
          <TextWidget
            text={`${figures.arrow} ${figures.change}`}
            maxLines={1}
            truncate="END"
            style={{ ...SMALL_TEXT, color: rateChangeColor(figures.delta, colors) }}
          />
        </FlexWidget>
        {model.stale && (
          <TextWidget
            text={translate(language, 'rate_offline')}
            maxLines={1}
            style={{ ...mutedText, ...ROW_END_STYLE }}
          />
        )}
      </FlexWidget>
      {sparkline && (
        <SvgWidget
          svg={sparkline}
          style={{ width: sparkWidth, height: sparkHeight, marginTop: SPACING.xs }}
        />
      )}
    </Root>
  );
}

ExchangeRateWidget.propTypes = {
  height: PropTypes.number.isRequired,
  model: PropTypes.shape({
    status: PropTypes.oneOf(['ready', 'error', 'empty']).isRequired,
    chart: PropTypes.shape({
      from: PropTypes.string,
      to: PropTypes.string,
      amount: PropTypes.number,
    }),
    points: PropTypes.arrayOf(PropTypes.shape({
      date: PropTypes.string,
      rate: PropTypes.number,
    })),
    stale: PropTypes.bool,
    language: PropTypes.string,
  }).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  width: PropTypes.number.isRequired,
};
