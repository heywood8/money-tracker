/**
 * Names the home-screen widgets share with the rest of the app, kept apart from
 * the widget components so navigation and settings can read them without
 * loading the widget library.
 */

// The widget's name in app.config.js (react-native-android-widget plugin). The
// launcher passes it back with every update, so it must never change: a renamed
// widget is a new widget, and every placed copy of the old one goes blank.
export const EXCHANGE_RATE_WIDGET = 'ExchangeRate';
// The two-rate widget, under the same rule.
export const EXCHANGE_RATE_PAIR_WIDGET = 'ExchangeRatePair';
// Every widget that draws exchange rates, for the code that serves them all.
export const EXCHANGE_RATE_WIDGETS = [EXCHANGE_RATE_WIDGET, EXCHANGE_RATE_PAIR_WIDGET];
// The month-end balance forecast for the accounts the user picked, under the
// same rule.
export const BALANCE_FORECAST_WIDGET = 'BalanceForecast';
// The forecast widget's table columns, in the order they are drawn: the
// balance now, the daily spending rate behind the forecast, the forecast. The
// user picks which of them a widget shows; these keys are what its store keeps.
export const FORECAST_COLUMNS = ['balance', 'daily', 'forecast'];

/**
 * The forecast columns to draw, in table order: the known ones among
 * `columns`, or every column when that leaves none (a table of names alone
 * says nothing). The one reading of a widget's saved columns, for the store,
 * the setup screen and the layout alike.
 *
 * @param {*} columns
 * @returns {string[]}
 */
export const normalizeColumns = (columns) => {
  const picked = Array.isArray(columns) ? FORECAST_COLUMNS.filter((column) => columns.includes(column)) : [];
  return picked.length ? picked : [...FORECAST_COLUMNS];
};

// The click action of the "↻ 14:05" on a widget: fetch fresh rates now. Unlike
// a tap anywhere else, it reaches the task handler (WIDGET_CLICK).
export const REFRESH_RATES_ACTION = 'REFRESH_RATES';

// Where a tap on the widget goes: the Graphs tab, where the full chart is.
// The scheme is app.config.js's `scheme`.
export const GRAPHS_DEEP_LINK = 'com.heywood8.monkeep://graphs';

/**
 * Whether a URL the app was opened with is the widget's deep link. Matched by
 * prefix so a query string or trailing slash still lands.
 *
 * @param {*} url
 * @returns {boolean}
 */
export const isGraphsDeepLink = (url) => typeof url === 'string' && url.startsWith(GRAPHS_DEEP_LINK);
