/**
 * Names the home-screen widgets share with the rest of the app, kept apart from
 * the widget components so navigation and settings can read them without
 * loading the widget library.
 */

// The widget's name in app.config.js (react-native-android-widget plugin). The
// launcher passes it back with every update, so it must never change: a renamed
// widget is a new widget, and every placed copy of the old one goes blank.
export const EXCHANGE_RATE_WIDGET = 'ExchangeRate';

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
