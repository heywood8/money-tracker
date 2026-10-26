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
import { GRAPHS_DEEP_LINK } from './widgetConstants';

/**
 * The balance-forecast home-screen widget: for each account the user picked,
 * what it will hold on the month's last day if it keeps spending at its rate
 * of the last 30 days, the same forecast the balance chart on the Graphs tab
 * draws, with the balance now and that daily rate under it.
 *
 * The accounts sit in a ListWidget, which the launcher scrolls: a widget two
 * cells tall has room for two or three, and the user may pick more.
 */

const PADDING = SPACING.md;
// What the title row above the list takes, so the list gets the rest.
const HEADER_HEIGHT = 20;
// A row is two lines of text and its padding. The library requires every list
// item to fit in the list, so the list is never made shorter than one.
const MIN_LIST_HEIGHT = 48;
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
const HEADER_STYLE = { width: 'match_parent', height: HEADER_HEIGHT };
const LIST_STYLE = { width: 'match_parent' };
const ITEM_STYLE = {
  width: 'match_parent',
  flexDirection: 'column',
  paddingTop: SPACING.xs,
  paddingBottom: SPACING.xs,
};
// The name gives way, the forecast beside it never does.
const ROW_STYLE = { width: 'match_parent', flexDirection: 'row', alignItems: 'center' };
const ROW_GROW_STYLE = { flex: 1 };
const ROW_END_STYLE = { marginLeft: SPACING.sm };
const SMALL_TEXT = { fontSize: FONT_SIZE.sm };
const NAME_TEXT = { fontSize: FONT_SIZE.md };
const FORECAST_TEXT = { fontSize: FONT_SIZE.base, fontWeight: 'bold' };
const MESSAGE_TEXT = { fontSize: FONT_SIZE.md };

const fill = (template, amount) => template.replace('{amount}', amount);

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
 * What one account's row prints: its name, the forecast and, under them, the
 * balance now and the daily rate behind the forecast. With balances hidden in
 * Settings the amounts are masked and the second line dropped, since it would
 * hold nothing but masks. An account whose spending could not be read has no
 * forecast, rather than one that pretends it spends nothing.
 *
 * @param {Object} row - { name, currency, balance, forecast, dailyAverage }
 * @param {Object} options
 * @param {string} options.language
 * @param {boolean} [options.hideBalances]
 * @returns {{name: string, forecast: string, detail: string|null, negative: boolean, label: string}}
 */
export const describeForecastRow = (row, { language, hideBalances = false }) => {
  const money = (amount) => formatMoney(amount, row.currency, { language });
  const known = Number.isFinite(row.forecast);
  if (hideBalances) {
    return { name: row.name, forecast: HIDDEN_AMOUNT, detail: null, negative: false, label: row.name };
  }
  const forecast = known ? money(row.forecast) : '—';
  const now = fill(translate(language, 'widget_forecast_now'), money(row.balance));
  const detail = known
    ? `${now} · ${fill(translate(language, 'widget_forecast_per_day'), money(-row.dailyAverage))}`
    : now;
  return {
    name: row.name,
    forecast,
    detail,
    // Read off the figure as printed: a forecast of -0.3 in a whole-unit
    // currency prints "₽0", which is not a warning.
    negative: known && Number(row.forecast.toFixed(getDecimalPlaces(row.currency))) < 0,
    label: `${row.name}: ${forecast}, ${detail}`,
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

// One account. A list item is drawn apart from the card around it, so it
// carries the card's tap of its own.
const forecastItem = (row, view, colors) => (
  <FlexWidget
    key={row.id}
    clickAction="OPEN_URI"
    clickActionData={{ uri: GRAPHS_DEEP_LINK }}
    accessibilityLabel={view.label}
    style={ITEM_STYLE}
  >
    <FlexWidget style={ROW_STYLE}>
      <FlexWidget style={ROW_GROW_STYLE}>
        <TextWidget text={view.name} maxLines={1} truncate="END" style={{ ...NAME_TEXT, color: colors.text }} />
      </FlexWidget>
      <TextWidget
        text={view.forecast}
        maxLines={1}
        style={{ ...FORECAST_TEXT, ...ROW_END_STYLE, color: view.negative ? colors.destructive : colors.text }}
      />
    </FlexWidget>
    {view.detail && (
      <TextWidget
        text={view.detail}
        maxLines={1}
        truncate="END"
        style={{ ...SMALL_TEXT, color: colors.mutedText }}
      />
    )}
  </FlexWidget>
);

/**
 * @param {Object} props
 * @param {{status: 'ready'|'error'|'empty', language: string, hideBalances?: boolean,
 *   monthEnd?: string, rows?: Array<Object>}} props.model
 * @param {'light'|'dark'} props.theme
 * @param {number} props.width - Widget width in dp
 * @param {number} props.height - Widget height in dp
 */
export function BalanceForecastWidget({ model, theme, height }) {
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

  const title = translate(language, 'widget_forecast_until').replace('{date}', formatMonthEnd(model.monthEnd, language));
  const listHeight = Math.max(MIN_LIST_HEIGHT, height - 2 * PADDING - HEADER_HEIGHT);
  return (
    <Root colors={colors} label={title}>
      <FlexWidget style={HEADER_STYLE}>
        <TextWidget text={title} maxLines={1} truncate="END" style={{ ...SMALL_TEXT, color: colors.mutedText }} />
      </FlexWidget>
      <ListWidget style={{ ...LIST_STYLE, height: listHeight }}>
        {model.rows.map((row) => forecastItem(row, describeForecastRow(row, model), colors))}
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
  width: PropTypes.number,
};
