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
  formatCheckedAt,
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
import { GRAPHS_DEEP_LINK, REFRESH_RATES_ACTION } from './widgetConstants';

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
const HEADER_HEIGHT = 68;
// Below this the line is too flat to read; the widget shows the figures only.
const MIN_SPARKLINE_HEIGHT = 24;
// More points than a widget is wide only lengthens the SVG string.
const MAX_SPARKLINE_POINTS = 120;
// The line runs edge to edge and its fill down to the widget's bottom edge, so
// the SVG rounds its own bottom corners to the widget's.
const CORNER_RADIUS = BORDER_RADIUS.xl;
// Room left under the line's lowest point, so the fill still shows beneath it.
const LINE_BOTTOM_INSET = SPACING.sm;

const VALUE_FONT_SIZE = 22;

// Widget primitives take plain style objects (they are converted to
// RemoteViews attributes, not passed to React Native's StyleSheet).
const ROOT_STYLE = {
  height: 'match_parent',
  width: 'match_parent',
  flexDirection: 'column',
  borderRadius: CORNER_RADIUS,
  padding: PADDING,
};
// A rate's root carries no padding of its own: its text keeps the padding,
// its line runs to the edges.
const BLEED_ROOT_STYLE = { padding: 0 };
const PANEL_STYLE = { height: 'match_parent', flexDirection: 'column' };
const CENTERED_STYLE = { height: 'match_parent', width: 'match_parent', justifyContent: 'center' };
// A row of a text that gives way and a short one pinned to the right. The
// first sits in a flexing box so it is the one truncated: a widget two cells
// wide has room for about 85dp of text per row.
const ROW_STYLE = { width: 'match_parent', flexDirection: 'row', alignItems: 'center' };
const ROW_GROW_STYLE = { flex: 1 };
const ROW_END_STYLE = { marginLeft: SPACING.xs };
// The tap area around "↻ 14:05": wider and taller than the text, so a thumb
// finds it, and growing leftwards into the rate's row rather than past the
// card's padding.
const REFRESH_TAP_STYLE = {
  paddingLeft: SPACING.lg,
  paddingTop: SPACING.sm,
  paddingBottom: SPACING.sm,
};
const SMALL_TEXT = { fontSize: FONT_SIZE.sm };
const MESSAGE_TEXT = { fontSize: FONT_SIZE.md };
const VALUE_TEXT = { fontSize: VALUE_FONT_SIZE, fontWeight: 'bold' };

// The two-rate widget: one card holding two halves, a strip of the card's
// own background between them (no line), so neither half's fill runs into
// the other's.
const PAIR_GAP = SPACING.md;
// Text inset from a half's inner edge: the gap already separates the halves.
const PAIR_INNER_PADDING = PADDING / 2;
const PAIR_ROOT_STYLE = { flexDirection: 'row', padding: 0 };
const HALF_MESSAGE_STYLE = { ...PANEL_STYLE, justifyContent: 'center' };

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
 * `width` × `height` from the series' own minimum to its maximum. The fill
 * reaches the bottom edge, and the bottom corners can be rounded (clipping the
 * line too) so a line drawn edge to edge fits the widget's rounded corners.
 *
 * @param {number[]} values
 * @param {number} width
 * @param {number} height
 * @param {string} color - #rrggbb
 * @param {Object} [options]
 * @param {number} [options.bottomInset=2] - Space under the line's lowest point
 * @param {number} [options.radiusLeft=0] - Bottom-left corner radius
 * @param {number} [options.radiusRight=0] - Bottom-right corner radius
 * @returns {string|null} Null when no value is finite
 */
export const buildSparklineSvg = (values, width, height, color, {
  bottomInset = 2,
  radiusLeft = 0,
  radiusRight = 0,
} = {}) => {
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
  const bottom = Math.min(h - inset, Math.max(inset, h - bottomInset));
  const yOf = (value) => (span > 0
    ? inset + (1 - (value - min) / span) * (bottom - inset)
    : (inset + bottom) / 2);
  const points = series.length > 1
    ? series.map((value, i) => [(i / (series.length - 1)) * w, yOf(value)])
    : [[0, yOf(series[0])], [w, yOf(series[0])]];
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const left = Math.min(radiusLeft, h, w / 2);
  const right = Math.min(radiusRight, h, w / 2);
  const rounded = left > 0 || right > 0;
  // The widget's own outline at the bottom: square at the top (the text sits
  // above), the given radius at each bottom corner.
  const clip = rounded
    ? '<defs><clipPath id="c"><path d="'
      + `M0 0 H${w} V${h - right} A${right} ${right} 0 0 1 ${w - right} ${h} `
      + `H${left} A${left} ${left} 0 0 1 0 ${h - left} Z`
      + '"/></clipPath></defs>'
    : '';
  const clipAttr = rounded ? ' clip-path="url(#c)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + clip
    + `<g${clipAttr}>`
    + `<path d="${area}" fill="${color}" fill-opacity="0.15"/>`
    + `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    + '</g></svg>';
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

const Root = ({ colors, label, style, children }) => (
  <FlexWidget
    clickAction="OPEN_URI"
    clickActionData={{ uri: GRAPHS_DEEP_LINK }}
    accessibilityLabel={label}
    style={{ ...ROOT_STYLE, ...style, backgroundColor: colors.surface }}
  >
    {children}
  </FlexWidget>
);

Root.propTypes = {
  children: PropTypes.node,
  colors: PropTypes.object.isRequired,
  label: PropTypes.string.isRequired,
  style: PropTypes.object,
};

// A short message centred in a box of its own: the whole widget, or one half.
// `retry` makes the box the refresh button: a widget with no rates to show is
// where fetching again by hand is wanted most.
const MessageBox = ({ colors, text, style, retry }) => (
  <FlexWidget style={style} {...(retry ? { clickAction: REFRESH_RATES_ACTION } : null)}>
    <TextWidget
      text={text}
      maxLines={3}
      truncate="END"
      style={{ ...MESSAGE_TEXT, color: colors.mutedText }}
    />
  </FlexWidget>
);

MessageBox.propTypes = {
  colors: PropTypes.object.isRequired,
  retry: PropTypes.bool,
  style: PropTypes.object.isRequired,
  text: PropTypes.string.isRequired,
};

const Message = ({ colors, label, text, retry }) => (
  <Root colors={colors} label={label}>
    <MessageBox colors={colors} text={text} style={CENTERED_STYLE} retry={retry} />
  </Root>
);

Message.propTypes = {
  colors: PropTypes.object.isRequired,
  label: PropTypes.string.isRequired,
  retry: PropTypes.bool,
  text: PropTypes.string.isRequired,
};

/**
 * What one rate shows, worked out once per draw: its figures, or else a
 * message (the prompt to set a chart up, or the pair and why it could not be
 * loaded, with a refresh to tap), and what a screen reader says for it.
 *
 * @param {Object} model
 * @returns {{figures?: Object, message?: string, retry?: boolean, label: string}}
 */
const viewOf = (model) => {
  const { language } = model;
  if (model.status === 'empty') {
    const message = translate(language, 'widget_rate_empty');
    return { message, label: message };
  }
  const figures = model.status === 'ready' ? describeRate(model.chart, model.points, language) : null;
  const title = rateChartTitle(model.chart);
  if (figures) {
    const offline = model.stale ? `, ${translate(language, 'rate_offline')}` : '';
    return { figures, label: `${title}: ${figures.value}, ${figures.change}${offline}` };
  }
  const failed = translate(language, 'rate_load_failed');
  return {
    message: `${title}\n${model.refreshing ? '↻ …' : `${failed} ↻`}`,
    retry: true,
    label: `${title}: ${failed}`,
  };
};

/**
 * One rate in a box `width` × `height` dp: the pair and date, the rate, its
 * move and when it was fetched, padded, and under them, when there is room,
 * the line, running to the box's edges and its bottom. The one-rate widget is
 * one such box; the two-rate widget two, side by side.
 *
 * @param {Object} model - A 'ready' model
 * @param {Object} figures - Its figures (viewOf)
 * @param {Object} colors
 * @param {Object} box
 * @param {number} box.width
 * @param {number} box.height
 * @param {number} box.padLeft - Text padding on the left (and right: padRight)
 * @param {number} box.padRight
 * @param {number} box.radiusLeft - The widget's corner under the box, if any
 * @param {number} box.radiusRight
 * @param {Object} [box.style] - Extra layout for the box (a margin)
 * @param {string} [key]
 * @returns {JSX.Element}
 */
const ratePanel = (model, figures, colors, box, key) => {
  const { language } = model;
  const mutedText = { ...SMALL_TEXT, color: colors.mutedText };
  const sparkHeight = box.height - PADDING - HEADER_HEIGHT - SPACING.xs;
  const sparkline = sparkHeight - LINE_BOTTOM_INSET >= MIN_SPARKLINE_HEIGHT && box.width > 0
    ? buildSparklineSvg(
      model.points.map((point) => point.rate * model.chart.amount),
      box.width,
      sparkHeight,
      colors.primary,
      { bottomInset: LINE_BOTTOM_INSET, radiusLeft: box.radiusLeft, radiusRight: box.radiusRight },
    )
    : null;
  // Without a line under them the rows are padded at the bottom too.
  const textStyle = {
    width: 'match_parent',
    flexDirection: 'column',
    paddingTop: PADDING,
    paddingLeft: box.padLeft,
    paddingRight: box.padRight,
    paddingBottom: sparkline ? SPACING.xs : PADDING,
  };
  // Short: the time today, the date before that. The rate's own date sits on
  // the title row; this says how fresh the copy on screen is.
  // Tapping it fetches fresh rates; "…" while that runs.
  const fetched = model.refreshing
    ? '↻ …'
    : model.checkedAt ? `↻ ${formatCheckedAt(model.checkedAt, language)}` : null;

  // Each row pins a short text right of one that gives way: the date beside
  // the title, the fetch time beside the rate (the row with room to spare),
  // the offline marker beside the move. A narrow widget truncates the title or
  // the move, never what says how old the figures are.
  return (
    <FlexWidget key={key} style={{ ...PANEL_STYLE, ...box.style, width: box.width }}>
      <FlexWidget style={textStyle}>
        <FlexWidget style={ROW_STYLE}>
          <FlexWidget style={ROW_GROW_STYLE}>
            <TextWidget text={figures.title} maxLines={1} truncate="END" style={mutedText} />
          </FlexWidget>
          <TextWidget text={figures.date} maxLines={1} style={{ ...mutedText, ...ROW_END_STYLE }} />
        </FlexWidget>
        <FlexWidget style={ROW_STYLE}>
          <FlexWidget style={ROW_GROW_STYLE}>
            <TextWidget
              text={figures.value}
              maxLines={1}
              truncate="END"
              style={{ ...VALUE_TEXT, color: colors.text }}
            />
          </FlexWidget>
          {fetched && (
            <FlexWidget
              clickAction={REFRESH_RATES_ACTION}
              accessibilityLabel={translate(language, 'widget_refresh')}
              style={REFRESH_TAP_STYLE}
            >
              <TextWidget text={fetched} maxLines={1} style={mutedText} />
            </FlexWidget>
          )}
        </FlexWidget>
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
      </FlexWidget>
      {sparkline && <SvgWidget svg={sparkline} style={{ width: box.width, height: sparkHeight }} />}
    </FlexWidget>
  );
};

/**
 * @param {Object} props
 * @param {{status: 'ready'|'error'|'empty', chart?: Object, points?: Array, stale?: boolean,
 *   checkedAt?: number, refreshing?: boolean, language: string}} props.model
 * @param {'light'|'dark'} props.theme
 * @param {number} props.width - Widget width in dp
 * @param {number} props.height - Widget height in dp
 */
export function ExchangeRateWidget({ model, theme, width, height }) {
  const colors = (theme === 'dark' ? darkTheme : lightTheme).colors;
  const view = viewOf(model);
  if (!view.figures) {
    return <Message colors={colors} label={view.label} text={view.message} retry={view.retry} />;
  }
  return (
    <Root colors={colors} label={view.label} style={BLEED_ROOT_STYLE}>
      {ratePanel(model, view.figures, colors, {
        width,
        height,
        padLeft: PADDING,
        padRight: PADDING,
        radiusLeft: CORNER_RADIUS,
        radiusRight: CORNER_RADIUS,
      })}
    </Root>
  );
}

const MODEL_SHAPE = PropTypes.shape({
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
  checkedAt: PropTypes.number,
  refreshing: PropTypes.bool,
  language: PropTypes.string,
});

ExchangeRateWidget.propTypes = {
  height: PropTypes.number.isRequired,
  model: MODEL_SHAPE.isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  width: PropTypes.number.isRequired,
};


/**
 * Two rates side by side, for a row of the home screen the one-rate widget
 * would leave half empty: five cells wide is too much for one rate and splits
 * unevenly into two widgets. One card, each half laid out like the one-rate
 * widget at half the width, its line running to the card's outer edge and
 * bottom, with a small gap between the halves.
 *
 * @param {Object} props
 * @param {Array<Object>} props.models - Two models, as the one-rate widget takes
 * @param {'light'|'dark'} props.theme
 * @param {number} props.width - Widget width in dp
 * @param {number} props.height - Widget height in dp
 */
export function ExchangeRatePairWidget({ models, theme, width, height }) {
  const colors = (theme === 'dark' ? darkTheme : lightTheme).colors;
  // Nothing set up at all: one prompt across the whole widget, not two.
  if (models.every((model) => model.status === 'empty')) {
    const text = translate(models[0].language, 'widget_rate_empty');
    return <Message colors={colors} label={text} text={text} />;
  }

  const views = models.map(viewOf);
  const halfWidth = (width - PAIR_GAP) / 2;
  const half = (model, view, side) => {
    const first = side === 'first';
    const padLeft = first ? PADDING : PAIR_INNER_PADDING;
    const padRight = first ? PAIR_INNER_PADDING : PADDING;
    const gap = first ? null : { marginLeft: PAIR_GAP };
    if (!view.figures) {
      return (
        <MessageBox
          key={side}
          colors={colors}
          text={view.message}
          retry={view.retry}
          style={{ ...HALF_MESSAGE_STYLE, ...gap, width: halfWidth, paddingLeft: padLeft, paddingRight: padRight }}
        />
      );
    }
    return ratePanel(model, view.figures, colors, {
      width: halfWidth,
      height,
      padLeft,
      padRight,
      radiusLeft: first ? CORNER_RADIUS : 0,
      radiusRight: first ? 0 : CORNER_RADIUS,
      style: gap,
    }, side);
  };

  return (
    <Root colors={colors} label={views.map((view) => view.label).join('; ')} style={PAIR_ROOT_STYLE}>
      {half(models[0], views[0], 'first')}
      {half(models[1], views[1], 'second')}
    </Root>
  );
}

ExchangeRatePairWidget.propTypes = {
  height: PropTypes.number.isRequired,
  models: PropTypes.arrayOf(MODEL_SHAPE.isRequired).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  width: PropTypes.number.isRequired,
};
