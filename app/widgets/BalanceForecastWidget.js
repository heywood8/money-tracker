'use no memo';
// ↑ The widget tree is built by calling these functions directly, outside
// React's renderer, so they must stay plain functions: no hooks, and no React
// Compiler memoisation wrapping them should it ever be switched on.

import React from 'react';
import PropTypes from 'prop-types';
import { FlexWidget, ListWidget, TextWidget } from 'react-native-android-widget';
import { lightTheme, darkTheme } from '../contexts/ThemeColorsContext';
import { formatMoney, getDecimalPlaces } from '../services/currency';
import { translate } from '../services/notifications/notificationStrings';
import { parseLocalDay } from '../utils/dateUtils';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '../styles/designTokens';
import { FORECAST_COLUMNS, GRAPHS_DEEP_LINK, normalizeColumns } from './widgetConstants';

/**
 * The balance-forecast home-screen widget: a table of the accounts the user
 * picked, one line each, with the columns they picked of the balance now, the
 * daily spending rate and what the account will hold on the month's last day at
 * that rate, the same forecast the balance chart on the Graphs tab draws.
 *
 * One line per account, so a widget two cells tall shows two accounts with
 * every column and no scrolling. The launcher draws the widget from the top at
 * the height it reports, which can be taller than the cell it shows, so the
 * table keeps to the top and the list ends on a whole line short of the
 * reported bottom. Accounts past what fits sit in a ListWidget the launcher
 * scrolls. Sizes follow the system font scale, the text being in sp.
 */

const PADDING = SPACING.md;
const HEADER_ROW_HEIGHT = 18;
const HEADER_GAP = SPACING.xs;
const ROW_HEIGHT = 24;
const COLUMN_GAP = SPACING.sm;
// What the account names keep when the figures need the room: the figures are
// shrunk to fit instead (adjustsFontSizeToFit) rather than the names vanishing.
const MIN_NAME_WIDTH = 56;
// How far the figures may shrink to make that room. Past it a column is
// dropped instead, the rate first and then the balance now, so a widget too
// narrow for every column it was given still prints legible figures and the
// forecast it exists for.
const MIN_FIGURE_SCALE = 0.75;
const DROP_ORDER = ['daily', 'balance'];
// The width of four cells, for a launcher that has not reported one yet.
const DEFAULT_WIDTH = 276;
const HEADER_FONT_SIZE = FONT_SIZE.sm;
const CELL_FONT_SIZE = FONT_SIZE.md;
const CORNER_RADIUS = BORDER_RADIUS.xl;
// What the app prints for an amount while balances are hidden in Settings.
const HIDDEN_AMOUNT = '••••';

const ROOT_STYLE = {
  height: 'match_parent',
  width: 'match_parent',
  flexDirection: 'column',
  borderRadius: CORNER_RADIUS,
  padding: PADDING,
};
const CENTERED_STYLE = { height: 'match_parent', width: 'match_parent', justifyContent: 'center' };
const LIST_STYLE = { width: 'match_parent' };
const TABLE_ROW_STYLE = { width: 'match_parent', flexDirection: 'row' };
const NAME_CELL_STYLE = { flex: 1 };
const FIGURE_CELL_STYLE = { marginLeft: COLUMN_GAP, textAlign: 'right', adjustsFontSizeToFit: true };
const MESSAGE_TEXT = { fontSize: FONT_SIZE.md };

// Rough advance widths of a character, in ems, for sizing the columns before
// Android lays them out: digits as Roboto draws them, the group separators
// toLocaleString puts in, and everything else (letters, currency signs) on the
// wide side so a column errs towards room to spare.
const charEms = (char) => {
  if (char >= '0' && char <= '9') return 0.57;
  // CJK, kana and Hangul draw a full em wide.
  if (char.charCodeAt(0) >= 0x2e80) return 1;
  if (char === ' ' || char === ' ') return 0.2;
  if (char === ' ' || char === ' ') return 0.28;
  if (char === ',' || char === '.' || char === '\'') return 0.27;
  if (char === '-' || char === '−') return 0.36;
  return 0.62;
};

/**
 * About how wide a text draws, in dp.
 *
 * @param {string} text
 * @param {number} fontSize
 * @param {boolean} [bold]
 * @returns {number}
 */
export const estimateTextWidth = (text, fontSize, bold = false) => (
  [...String(text)].reduce((sum, char) => sum + charEms(char), 0) * fontSize * (bold ? 1.06 : 1)
);

/**
 * "31 Oct" in the app's language.
 *
 * @param {string} day - YYYY-MM-DD
 * @param {string} language
 * @returns {string}
 */
export const formatMonthEnd = (day, language) => {
  try {
    return parseLocalDay(day).toLocaleDateString(language || undefined, { day: 'numeric', month: 'short' });
  } catch {
    return String(day);
  }
};

/**
 * What one account's line prints in each column: the balance now, the daily
 * spending rate (as the change it makes to the balance, so with a minus) and
 * the forecast. With balances hidden in Settings every amount is masked. An
 * account whose spending could not be read has no rate or forecast, rather than
 * ones that pretend it spends nothing.
 *
 * @param {Object} row - { name, currency, balance, forecast, dailyAverage }
 * @param {Object} options
 * @param {string} options.language
 * @param {boolean} [options.hideBalances]
 * @returns {{name: string, balance: string, daily: string, forecast: string, negative: boolean}}
 */
export const describeForecastRow = (row, { language, hideBalances = false }) => {
  if (hideBalances) {
    return { name: row.name, balance: HIDDEN_AMOUNT, daily: HIDDEN_AMOUNT, forecast: HIDDEN_AMOUNT, negative: false };
  }
  const money = (amount) => formatMoney(amount, row.currency, { language });
  const known = Number.isFinite(row.forecast);
  return {
    name: row.name,
    balance: money(row.balance),
    daily: known ? money(-row.dailyAverage) : '—',
    forecast: known ? money(row.forecast) : '—',
    // Read off the figure as printed: a forecast of -0.3 in a whole-unit
    // currency prints "₽0", which is not a warning.
    negative: known && Number(row.forecast.toFixed(getDecimalPlaces(row.currency))) < 0,
  };
};

/**
 * Each column's header: short words over the figures, the forecast's being the
 * day it is for.
 *
 * @param {string[]} columns
 * @param {string} language
 * @param {string} monthEnd - YYYY-MM-DD
 * @returns {string[]}
 */
export const columnHeaders = (columns, language, monthEnd) => columns.map((column) => {
  if (column === 'balance') return translate(language, 'widget_forecast_col_now');
  if (column === 'daily') return translate(language, 'widget_forecast_col_daily');
  return formatMonthEnd(monthEnd, language);
});

// Each column as wide as its widest text, the header included.
const naturalWidths = (columns, headers, views, fontScale) => columns.map((column, i) => Math.ceil(fontScale * Math.max(
  estimateTextWidth(headers[i], HEADER_FONT_SIZE),
  ...views.map((view) => estimateTextWidth(view[column], CELL_FONT_SIZE, column === 'forecast')),
)));

const sum = (values) => values.reduce((total, value) => total + value, 0);
const figureRoom = (columns, available) => available - MIN_NAME_WIDTH - COLUMN_GAP * columns.length;

/**
 * How wide each figure column is drawn, in dp: as wide as its widest text (the
 * header included), so the columns line up row under row. When they would not
 * leave the names `MIN_NAME_WIDTH`, they are narrowed in proportion, never past
 * `MIN_FIGURE_SCALE`, and the figures shrink to fit them.
 *
 * @param {string[]} columns
 * @param {string[]} headers - One per column
 * @param {Array<Object>} views - describeForecastRow's, one per account
 * @param {number} available - The table's width, in dp
 * @param {number} [fontScale=1] - The system font scale
 * @returns {number[]}
 */
export const columnWidths = (columns, headers, views, available, fontScale = 1) => {
  const natural = naturalWidths(columns, headers, views, fontScale);
  const room = figureRoom(columns, available);
  const total = sum(natural);
  if (total <= room) return natural;
  const scale = Math.max(MIN_FIGURE_SCALE, Math.max(0, room) / total);
  return natural.map((width) => Math.floor(width * scale));
};

/**
 * The table a widget draws: the columns it was given, less those it has no
 * room for (dropped in `DROP_ORDER` until the rest fit at `MIN_FIGURE_SCALE`,
 * the forecast always kept), with their headers and widths.
 *
 * @param {*} columns - The widget's columns
 * @param {Array<Object>} views - describeForecastRow's, one per account
 * @param {Object} where
 * @param {string} where.language
 * @param {string} where.monthEnd - YYYY-MM-DD
 * @param {number} where.available - The table's width, in dp
 * @param {number} [where.fontScale=1]
 * @returns {{columns: string[], headers: string[], widths: number[]}}
 */
export const layoutTable = (columns, views, { language, monthEnd, available, fontScale = 1 }) => {
  let shown = normalizeColumns(columns);
  const tooWide = (candidate) => (
    sum(naturalWidths(candidate, columnHeaders(candidate, language, monthEnd), views, fontScale)) * MIN_FIGURE_SCALE
      > figureRoom(candidate, available)
  );
  while (shown.length > 1 && tooWide(shown)) {
    const dropped = DROP_ORDER.find((column) => shown.includes(column));
    if (!dropped) break;
    shown = shown.filter((column) => column !== dropped);
  }
  const headers = columnHeaders(shown, language, monthEnd);
  return { columns: shown, headers, widths: columnWidths(shown, headers, views, available, fontScale) };
};

// A figure in its column: right-aligned, and shrunk rather than cut short when
// the column is narrower than it. A fixed box on both sides is what Android's
// autosizing needs to work from.
const cell = (key, text, width, height, style) => (
  <TextWidget
    key={key}
    text={text}
    maxLines={1}
    style={{ ...style, ...FIGURE_CELL_STYLE, width, height }}
  />
);

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

// One account's line. A list item is drawn apart from the card around it, so
// it carries the card's tap of its own. With balances hidden a screen reader
// hears the name alone, not a run of bullets.
const forecastItem = (row, view, table, colors, hideBalances) => {
  const cellStyle = (column) => {
    if (column === 'forecast') {
      return { fontSize: CELL_FONT_SIZE, fontWeight: 'bold', color: view.negative ? colors.destructive : colors.text };
    }
    return { fontSize: CELL_FONT_SIZE, color: column === 'daily' ? colors.mutedText : colors.text };
  };
  const label = hideBalances
    ? view.name
    : [view.name, ...table.columns.map((column, i) => `${table.headers[i]} ${view[column]}`)].join(', ');
  return (
    <FlexWidget
      key={row.id}
      clickAction="OPEN_URI"
      clickActionData={{ uri: GRAPHS_DEEP_LINK }}
      accessibilityLabel={label}
      style={{ ...TABLE_ROW_STYLE, height: table.rowHeight }}
    >
      <FlexWidget style={NAME_CELL_STYLE}>
        <TextWidget
          text={view.name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: CELL_FONT_SIZE, height: table.rowHeight, color: colors.text }}
        />
      </FlexWidget>
      {table.columns.map((column, i) => cell(column, view[column], table.widths[i], table.rowHeight, cellStyle(column)))}
    </FlexWidget>
  );
};

/**
 * @param {Object} props
 * @param {{status: 'ready'|'error'|'empty', language: string, hideBalances?: boolean,
 *   monthEnd?: string, columns?: string[], rows?: Array<Object>}} props.model
 * @param {'light'|'dark'} props.theme
 * @param {number} props.width - Widget width in dp
 * @param {number} props.height - Widget height in dp, as the launcher reports it
 * @param {number} [props.fontScale=1] - The system font scale (widgetInfo.screenInfo)
 */
export function BalanceForecastWidget({ model, theme, width, height, fontScale }) {
  const colors = (theme === 'dark' ? darkTheme : lightTheme).colors;
  const { language } = model;

  if (model.status !== 'ready') {
    const text = translate(language, model.status === 'error' ? 'widget_forecast_load_failed' : 'widget_forecast_empty');
    return (
      <Root colors={colors} label={text}>
        <FlexWidget style={CENTERED_STYLE}>
          <TextWidget text={text} maxLines={3} truncate="END" style={{ ...MESSAGE_TEXT, color: colors.mutedText }} />
        </FlexWidget>
      </Root>
    );
  }

  // The text is in sp, so the lines it sits in grow with the font scale.
  const scale = fontScale > 0 ? fontScale : 1;
  const rowHeight = Math.ceil(ROW_HEIGHT * scale);
  const headerHeight = Math.ceil(HEADER_ROW_HEIGHT * scale);
  const views = model.rows.map((row) => describeForecastRow(row, model));
  const table = {
    ...layoutTable(model.columns, views, {
      language,
      monthEnd: model.monthEnd,
      available: (width > 0 ? width : DEFAULT_WIDTH) - 2 * PADDING,
      fontScale: scale,
    }),
    rowHeight,
  };
  const { columns, headers } = table;
  const headerStyle = { fontSize: HEADER_FONT_SIZE, color: colors.mutedText };
  // Whole lines down to the card's padding at the reported bottom, so no line
  // is left half in the band a launcher may clip; never fewer than one, which
  // the library requires of a list.
  const lines = Math.floor((height - 2 * PADDING - headerHeight - HEADER_GAP) / rowHeight);
  const listHeight = Math.max(1, lines) * rowHeight;
  const title = translate(language, 'widget_forecast_until').replace('{date}', formatMonthEnd(model.monthEnd, language));

  return (
    <Root colors={colors} label={title}>
      <FlexWidget style={{ ...TABLE_ROW_STYLE, height: headerHeight, marginBottom: HEADER_GAP }}>
        <FlexWidget style={NAME_CELL_STYLE} />
        {columns.map((column, i) => cell(column, headers[i], table.widths[i], headerHeight, headerStyle))}
      </FlexWidget>
      <ListWidget style={{ ...LIST_STYLE, height: listHeight }}>
        {model.rows.map((row, i) => forecastItem(row, views[i], table, colors, model.hideBalances))}
      </ListWidget>
    </Root>
  );
}

BalanceForecastWidget.propTypes = {
  height: PropTypes.number.isRequired,
  model: PropTypes.shape({
    status: PropTypes.oneOf(['ready', 'error', 'empty']).isRequired,
    language: PropTypes.string,
    hideBalances: PropTypes.bool,
    monthEnd: PropTypes.string,
    columns: PropTypes.arrayOf(PropTypes.oneOf(FORECAST_COLUMNS)),
    rows: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      currency: PropTypes.string,
      balance: PropTypes.number,
      forecast: PropTypes.number,
      dailyAverage: PropTypes.number,
    })),
  }).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  width: PropTypes.number.isRequired,
  fontScale: PropTypes.number,
};
