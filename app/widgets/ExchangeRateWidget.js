'use no memo';
// ↑ The widget tree is built by calling these functions directly, outside
// React's renderer, so they must stay plain functions: no hooks, and no React
// Compiler memoisation wrapping them should it ever be switched on.

import React from 'react';
import PropTypes from 'prop-types';
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { lightTheme, darkTheme } from '../contexts/ThemeColorsContext';
import { getCurrencySymbol } from '../services/currency';
import {
  RANGE_LABEL_KEYS,
  RATE_RANGES,
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
import { GRAPHS_DEEP_LINK, RATE_WINDOW_ACTION, REFRESH_RATES_ACTION } from './widgetConstants';

/**
 * The exchange-rate home-screen widget: one pair's current rate, its move over
 * the window shown ("‹ Month ›", its arrows switching it) and, when the widget
 * is tall enough, the line behind it.
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

// The window, "‹ Month ›": the label at a fixed width, so the arrows stay put
// as it changes, and each arrow a tap area of its own.
const WINDOW_ARROW_WIDTH = 18;
const WINDOW_LABEL_WIDTH = 44;
const WINDOW_STYLE = { flexDirection: 'row', alignItems: 'center' };
const WINDOW_ARROW_STYLE = { width: WINDOW_ARROW_WIDTH, alignItems: 'center' };
const WINDOW_ARROW_TEXT = { fontSize: FONT_SIZE.lg, fontWeight: 'bold' };
const WINDOW_LABEL_TEXT = {
  ...SMALL_TEXT,
  width: WINDOW_LABEL_WIDTH,
  textAlign: 'center',
  adjustsFontSizeToFit: true,
};
// What the arrows add to the height of the move's row, which carries them in
// the one-rate widget.
const WINDOW_ROW_EXTRA = SPACING.sm;
// The room the move keeps beside the window on the one-rate widget. Narrower
// than that and the window is the label alone, a tap stepping it round.
const MIN_MOVE_WIDTH = 100;
// Under a message (a window that would not load), the window stays to step back.
const MESSAGE_FILL_STYLE = { flex: 1, width: 'match_parent', justifyContent: 'center' };
const WINDOW_FOOTER_STYLE = { width: 'match_parent', flexDirection: 'row', justifyContent: 'center' };
const MESSAGE_TEXT = { fontSize: FONT_SIZE.md };
const VALUE_TEXT = { fontSize: VALUE_FONT_SIZE, fontWeight: 'bold' };

// The two-rate widget: one card holding two halves, each rate centred in its
// own half, and between them, once for both, the date and "↻ 14:05". A
// hairline parts the two lines below; the text above shares the card unparted.
const DIVIDER_WIDTH = 1;
// The middle column: the window level with the pairs' names, the date with the
// rates, "↻ 14:05" with their moves. Each half keeps half of MIDDLE_WIDTH clear
// on both sides, so its text is centred over its own line and never runs under
// the date or the fetch time. The window is wider, but sits beside the names,
// the halves' shortest text, so the moves (their longest) keep the room.
const MIDDLE_WIDTH = 64;
const WINDOW_WIDTH = WINDOW_ARROW_WIDTH * 2 + WINDOW_LABEL_WIDTH;
// The names keep clear of the window's overhang past MIDDLE_WIDTH, on both
// sides so they stay centred.
const TITLE_INSET_STYLE = {
  paddingLeft: (WINDOW_WIDTH - MIDDLE_WIDTH) / 2,
  paddingRight: (WINDOW_WIDTH - MIDDLE_WIDTH) / 2,
};
// What a half's text keeps before its outer padding gives way, the text
// shifting off-centre a little rather than the rate being cut: about "₽81.55"
// at the value's size, or "▼ -2.74 (-3.25%)" at the move's.
const MIN_HALF_TEXT_WIDTH = 100;
const PAIR_STACK_STYLE = { width: 'match_parent', height: 'match_parent' };
const PAIR_ROW_STYLE = { width: 'match_parent', height: 'match_parent', flexDirection: 'row' };
const PAIR_PANEL_STYLE = { justifyContent: 'space-between' };
const DIVIDER_STYLE = {
  width: DIVIDER_WIDTH,
  height: 'match_parent',
  flexDirection: 'column',
  justifyContent: 'flex-end',
};
const MIDDLE_ROW_STYLE = { width: 'match_parent', flexDirection: 'row', justifyContent: 'center' };
// Raised by what the arrows add to a line, so the window's label sits level
// with the names beside it.
const MIDDLE_STYLE = {
  width: WINDOW_WIDTH,
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: PADDING - SPACING.xs,
};
// Pushed down to the moves' line, and padded below for a thumb.
const MIDDLE_TAP_STYLE = {
  width: MIDDLE_WIDTH,
  alignItems: 'center',
  paddingTop: SPACING.sm,
  paddingBottom: SPACING.xs,
};
const CENTERED_TEXT = { width: 'match_parent', textAlign: 'center' };
// Shrunk rather than cut where a language's word is wider than the column.
const MIDDLE_TEXT = { width: MIDDLE_WIDTH, textAlign: 'center', adjustsFontSizeToFit: true };
const HALF_MESSAGE_STYLE = { ...PANEL_STYLE, justifyContent: 'center', alignItems: 'center' };

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
const MessageBox = ({ colors, text, style, retry, textAlign }) => (
  <FlexWidget style={style} {...(retry ? { clickAction: REFRESH_RATES_ACTION } : null)}>
    <TextWidget
      text={text}
      maxLines={3}
      truncate="END"
      style={{ ...MESSAGE_TEXT, color: colors.mutedText, ...(textAlign ? { textAlign } : null) }}
    />
  </FlexWidget>
);

MessageBox.propTypes = {
  colors: PropTypes.object.isRequired,
  retry: PropTypes.bool,
  style: PropTypes.object.isRequired,
  text: PropTypes.string.isRequired,
  textAlign: PropTypes.oneOf(['center']),
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

// The line's height in a box `height` dp tall: what the text leaves.
const sparkHeightOf = (height, extra = 0) => height - PADDING - HEADER_HEIGHT - extra - SPACING.xs;
const hasRoomForLine = (sparkHeight) => sparkHeight - LINE_BOTTOM_INSET >= MIN_SPARKLINE_HEIGHT;

// Short: the time today, the date before that. The rate's own date sits beside
// it; this says how fresh the copy on screen is. Tapping it fetches fresh
// rates; "…" while that runs.
const fetchedText = (refreshing, checkedAt, language) => (refreshing
  ? '↻ …'
  : checkedAt ? `↻ ${formatCheckedAt(checkedAt, language)}` : null);

/**
 * The window a widget shows and the arrows switching it: "‹ Month ›". An arrow
 * at the end of the ranges is drawn faint; its tap is a no-op rather than a
 * fall-through to the Graphs tab. `compact`, for a widget too narrow for both
 * arrows: "Month ›", one tap area stepping on and round from the longest.
 *
 * @param {string} range - One of RATE_RANGES
 * @param {string} language
 * @param {Object} colors
 * @param {Object} [options]
 * @param {boolean} [options.compact]
 * @returns {JSX.Element}
 */
const windowSelector = (range, language, colors, { compact = false } = {}) => {
  const index = RATE_RANGES.indexOf(range);
  const label = (
    <TextWidget
      text={translate(language, RANGE_LABEL_KEYS[range] ?? RANGE_LABEL_KEYS.month)}
      maxLines={1}
      truncate="END"
      style={{ ...WINDOW_LABEL_TEXT, color: colors.mutedText }}
    />
  );
  if (compact) {
    return (
      <FlexWidget
        clickAction={RATE_WINDOW_ACTION}
        clickActionData={{ step: 1, wrap: true }}
        accessibilityLabel={translate(language, 'widget_window_next')}
        style={WINDOW_STYLE}
      >
        {label}
        <FlexWidget style={WINDOW_ARROW_STYLE}>
          <TextWidget text="›" style={{ ...WINDOW_ARROW_TEXT, color: colors.primary }} />
        </FlexWidget>
      </FlexWidget>
    );
  }
  const arrow = (glyph, step, enabled, labelKey) => (
    <FlexWidget
      clickAction={RATE_WINDOW_ACTION}
      clickActionData={{ step }}
      accessibilityLabel={translate(language, labelKey)}
      style={WINDOW_ARROW_STYLE}
    >
      <TextWidget text={glyph} style={{ ...WINDOW_ARROW_TEXT, color: enabled ? colors.primary : colors.border }} />
    </FlexWidget>
  );
  return (
    <FlexWidget style={WINDOW_STYLE}>
      {arrow('‹', -1, index > 0, 'widget_window_shorter')}
      {label}
      {arrow('›', 1, index < RATE_RANGES.length - 1, 'widget_window_longer')}
    </FlexWidget>
  );
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
 * @param {Object} [box.style] - Extra layout for the box
 * @param {boolean} [box.centered] - The two-rate widget's half: the pair, the
 *   rate and its move centred, and no date, fetch time, offline marker or
 *   window (the middle column shows them once for both)
 * @param {string} [key]
 * @returns {JSX.Element}
 */
const ratePanel = (model, figures, colors, box, key) => {
  const { language } = model;
  const mutedText = { ...SMALL_TEXT, color: colors.mutedText };
  const sparkHeight = sparkHeightOf(box.height, box.centered ? 0 : WINDOW_ROW_EXTRA);
  const sparkline = hasRoomForLine(sparkHeight) && box.width > 0
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
  const fetched = box.centered ? null : fetchedText(model.refreshing, model.checkedAt, language);

  const changeText = { ...SMALL_TEXT, color: rateChangeColor(figures.delta, colors) };
  const rows = box.centered ? (
    <FlexWidget style={textStyle}>
      <TextWidget
        text={figures.title}
        maxLines={1}
        truncate="END"
        style={{ ...mutedText, ...CENTERED_TEXT, ...TITLE_INSET_STYLE }}
      />
      <TextWidget
        text={figures.value}
        maxLines={1}
        truncate="END"
        style={{ ...VALUE_TEXT, ...CENTERED_TEXT, color: colors.text }}
      />
      <TextWidget
        text={`${figures.arrow} ${figures.change}`}
        maxLines={1}
        truncate="END"
        style={{ ...changeText, ...CENTERED_TEXT }}
      />
    </FlexWidget>
  ) : (
    // Each row pins a short text right of one that gives way: the date (or,
    // read from the cache after a failed fetch, "offline") beside the title, the fetch time beside the rate (the
    // row with room to spare), the window beside the move it is the move over.
    // A narrow widget truncates the title or the move, never what says how old
    // the figures are or over what.
    <FlexWidget style={textStyle}>
      <FlexWidget style={ROW_STYLE}>
        <FlexWidget style={ROW_GROW_STYLE}>
          <TextWidget text={figures.title} maxLines={1} truncate="END" style={mutedText} />
        </FlexWidget>
        <TextWidget
          text={model.stale ? translate(language, 'rate_offline') : figures.date}
          maxLines={1}
          style={{ ...mutedText, ...ROW_END_STYLE }}
        />
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
          <TextWidget text={`${figures.arrow} ${figures.change}`} maxLines={1} truncate="END" style={changeText} />
        </FlexWidget>
        {windowSelector(model.chart.range, language, colors, {
          compact: box.width - box.padLeft - box.padRight < MIN_MOVE_WIDTH + WINDOW_WIDTH,
        })}
      </FlexWidget>
    </FlexWidget>
  );

  return (
    <FlexWidget key={key} style={{ ...PANEL_STYLE, ...box.style, width: box.width }}>
      {rows}
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
  if (!view.figures && model.chart) {
    // The window may be what would not load: it stays, to step back from.
    return (
      <Root colors={colors} label={view.label}>
        <MessageBox colors={colors} text={view.message} retry={view.retry} style={MESSAGE_FILL_STYLE} />
        <FlexWidget style={WINDOW_FOOTER_STYLE}>
          {windowSelector(model.chart.range, model.language, colors, { compact: width - PADDING * 2 < WINDOW_WIDTH })}
        </FlexWidget>
      </Root>
    );
  }
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
    range: PropTypes.string,
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
 * unevenly into two widgets. One card: each half holds a rate centred over its
 * line, the lines running to the card's outer edges and bottom and up to a
 * hairline between them, and the date and fetch time sit once in the middle.
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

  const { language } = models[0];
  const views = models.map(viewOf);
  const halfWidth = (width - DIVIDER_WIDTH) / 2;
  // The inner side always clears the middle column; the outer side matches it
  // (the text centred over its line) while the half is wide enough.
  const innerPad = MIDDLE_WIDTH / 2;
  const outerPad = Math.min(innerPad, Math.max(PADDING, halfWidth - innerPad - MIN_HALF_TEXT_WIDTH));
  const half = (model, view, side) => {
    const first = side === 'first';
    if (!view.figures) {
      return (
        <MessageBox
          key={side}
          colors={colors}
          text={view.message}
          retry={view.retry}
          textAlign="center"
          style={{
            ...HALF_MESSAGE_STYLE,
            width: halfWidth,
            paddingLeft: first ? outerPad : innerPad,
            paddingRight: first ? innerPad : outerPad,
          }}
        />
      );
    }
    return ratePanel(model, view.figures, colors, {
      width: halfWidth,
      height,
      padLeft: first ? outerPad : innerPad,
      padRight: first ? innerPad : outerPad,
      // Rounded only at the card's own corner; square where it meets the line.
      radiusLeft: first ? CORNER_RADIUS : 0,
      radiusRight: first ? 0 : CORNER_RADIUS,
      centered: true,
      style: PAIR_PANEL_STYLE,
    }, side);
  };

  // What the middle says for both: the window both halves are drawn over, the
  // older of the two rates' dates and fetch times, so neither half looks
  // fresher than it is, and in the date's place "offline" if either was read
  // from the cache after a failed fetch.
  // A fetch time only when every rate shown has one: one unknown is no basis
  // for calling both fresh.
  const shown = models.filter((model, i) => views[i].figures);
  const lastDate = (model) => model.points[model.points.length - 1].date;
  const oldest = shown.reduce((found, model) => (!found || lastDate(model) < lastDate(found) ? model : found), null);
  const checkedAts = shown.map((model) => model.checkedAt);
  const fetched = fetchedText(
    shown.some((model) => model.refreshing),
    checkedAts.length > 0 && checkedAts.every(Boolean) ? Math.min(...checkedAts) : null,
    language,
  );
  // The window stays when neither half loaded: it may be what would not load.
  const window = models.find((model) => model.chart)?.chart.range;
  const mutedText = { ...SMALL_TEXT, color: colors.mutedText };
  const sparkHeight = sparkHeightOf(height);

  return (
    <Root colors={colors} label={views.map((view) => view.label).join('; ')} style={BLEED_ROOT_STYLE}>
      <OverlapWidget style={PAIR_STACK_STYLE}>
        <FlexWidget style={PAIR_ROW_STYLE}>
          {half(models[0], views[0], 'first')}
          <FlexWidget style={DIVIDER_STYLE}>
            {shown.length === models.length && hasRoomForLine(sparkHeight) && (
              <FlexWidget style={{ width: DIVIDER_WIDTH, height: sparkHeight, backgroundColor: colors.border }} />
            )}
          </FlexWidget>
          {half(models[1], views[1], 'second')}
        </FlexWidget>
        {window && (
          <FlexWidget style={MIDDLE_ROW_STYLE}>
            <FlexWidget style={MIDDLE_STYLE}>
              {windowSelector(window, language, colors)}
              {oldest && (
                <TextWidget
                  text={shown.some((model) => model.stale)
                    ? translate(language, 'rate_offline')
                    : views[models.indexOf(oldest)].figures.date}
                  maxLines={1}
                  truncate="END"
                  style={{ ...mutedText, ...MIDDLE_TEXT }}
                />
              )}
              {fetched && (
                <FlexWidget
                  clickAction={REFRESH_RATES_ACTION}
                  accessibilityLabel={translate(language, 'widget_refresh')}
                  style={MIDDLE_TAP_STYLE}
                >
                  <TextWidget
                    text={fetched}
                    maxLines={1}
                    truncate="END"
                    style={{ ...mutedText, ...MIDDLE_TEXT }}
                  />
                </FlexWidget>
              )}
            </FlexWidget>
          </FlexWidget>
        )}
      </OverlapWidget>
    </Root>
  );
}

ExchangeRatePairWidget.propTypes = {
  height: PropTypes.number.isRequired,
  models: PropTypes.arrayOf(MODEL_SHAPE.isRequired).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  width: PropTypes.number.isRequired,
};
