import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { loadRateCharts } from '../services/ExchangeRateCharts';
import { fetchRateSeries } from '../services/ExchangeRateHistory';
import { resolveLanguage } from '../services/notifications/notificationStrings';
import {
  getWidgetChart,
  getWidgetCharts,
  resolveWidgetChart,
  resolveWidgetCharts,
} from './exchangeRateWidgetStore';
import { ExchangeRatePairWidget, ExchangeRateWidget } from './ExchangeRateWidget';
import { EXCHANGE_RATE_PAIR_WIDGET, EXCHANGE_RATE_WIDGETS } from './widgetConstants';

const sameChart = (a, b) => (a === b) || (
  !!a && !!b
  && a.id === b.id && a.from === b.from && a.to === b.to && a.amount === b.amount && a.range === b.range
);

// One chart's model: its rates, or why there are none. `options` go to
// fetchRateSeries (force, cacheOnly); `refreshing` marks a redraw made while
// a tapped refresh runs, which shows "↻ …" however far the read got;
// `preferCache` reads what is saved and only goes to the network when nothing
// is (Android may have cleared the cache directory).
const loadRateModel = async (chart, language, { refreshing = false, preferCache = false, ...options } = {}) => {
  if (!chart) return { status: 'empty', language };
  const read = (readOptions) => fetchRateSeries(chart.from, chart.to, chart.range, readOptions);
  try {
    const { points, stale, checkedAt } = preferCache
      ? await read({ ...options, cacheOnly: true }).catch(() => read(options))
      : await read(options);
    return { status: 'ready', chart, points, stale, checkedAt, refreshing, language };
  } catch {
    return { status: 'error', chart, refreshing, language };
  }
};

/**
 * The models a widget draws, one per chart it shows. `readPicks` turns the
 * configured charts and the widget's id into the charts, in order.
 *
 * Runs headless as often as in the app (the launcher asks for updates with the
 * app closed), so every read degrades instead of throwing: no charts reads as
 * "empty", no rates as "error" — a widget that fails to render keeps showing
 * whatever it last drew, which is worse than saying what is wrong.
 *
 * The charts can be picked while the rates load: on some launchers the first
 * update of a new widget runs alongside its configuration screen, and that
 * update started before anything was saved. Whichever draw lands last wins,
 * so a stale one re-reads the choice once and draws that instead.
 */
const loadModels = async (widgetId, readPicks, { recheck = true, ...options }) => {
  const [charts, language] = await Promise.all([
    loadRateCharts().catch(() => []),
    resolveLanguage(),
  ]);
  const picked = await readPicks(charts, widgetId);
  const models = await Promise.all(picked.map((chart) => loadRateModel(chart, language, options)));
  if (recheck) {
    const latest = await readPicks(charts, widgetId);
    if (latest.some((chart, i) => !sameChart(chart, picked[i]))) {
      return loadModels(widgetId, readPicks, { ...options, recheck: false });
    }
  }
  return models;
};

const readOnePick = async (charts, widgetId) => [
  resolveWidgetChart(charts, await getWidgetChart(widgetId).catch(() => null)),
];

const readTwoPicks = async (charts, widgetId) => (
  resolveWidgetCharts(charts, await getWidgetCharts(widgetId).catch(() => []))
);

/**
 * Everything the one-rate widget needs to draw, read the way the Graphs tab
 * reads it: the configured chart, the saved rate history topped up from the
 * network when it is an hour old, and the app's language.
 *
 * @param {number} widgetId
 * @param {Object} [options]
 * @param {boolean} [options.recheck=true] - Re-read the widget's chart after loading
 * @param {boolean} [options.force] - Ask the network even if the saved rates are fresh
 * @param {boolean} [options.cacheOnly] - Only saved rates (see `refreshing`)
 * @param {boolean} [options.preferCache] - Saved rates, the network only when there are none
 * @param {boolean} [options.refreshing] - Mark the model as being refreshed
 * @returns {Promise<{status: 'ready'|'error'|'empty', chart?: Object, points?: Array, stale?: boolean,
 *   checkedAt?: number, refreshing?: boolean, language: string}>}
 */
export const loadExchangeRateWidgetModel = async (widgetId, options = {}) => (
  (await loadModels(widgetId, readOnePick, options))[0]
);

/**
 * The two models the two-rate widget draws, read like the one-rate widget's.
 *
 * @param {number} widgetId
 * @param {Object} [options] - As loadExchangeRateWidgetModel's
 * @returns {Promise<Array<Object>>} Two models
 */
export const loadExchangeRatePairModels = (widgetId, options = {}) => (
  loadModels(widgetId, readTwoPicks, options)
);

/**
 * A widget in both system themes; the launcher shows the one that matches.
 * Serves both exchange-rate widgets, told apart by `widgetName`.
 *
 * @param {{widgetName: string, widgetId: number, width: number, height: number}} widgetInfo
 * @param {Object} [options] - force, cacheOnly, refreshing (see loadExchangeRateWidgetModel)
 * @returns {Promise<{light: JSX.Element, dark: JSX.Element}>}
 */
export const renderExchangeRateWidget = async (widgetInfo, options = {}) => {
  const size = { width: widgetInfo.width, height: widgetInfo.height };
  if (widgetInfo.widgetName === EXCHANGE_RATE_PAIR_WIDGET) {
    const models = await loadExchangeRatePairModels(widgetInfo.widgetId, options);
    return {
      light: <ExchangeRatePairWidget models={models} {...size} theme="light" />,
      dark: <ExchangeRatePairWidget models={models} {...size} theme="dark" />,
    };
  }
  const model = await loadExchangeRateWidgetModel(widgetInfo.widgetId, options);
  return {
    light: <ExchangeRateWidget model={model} {...size} theme="light" />,
    dark: <ExchangeRateWidget model={model} {...size} theme="dark" />,
  };
};

/**
 * Redraw every exchange-rate widget on the home screen. Called by the app when
 * what they show may have changed (a chart edited, rates freshly loaded); the
 * launcher's own hourly update covers the rest. Never throws: a widget that
 * could not be redrawn now will be on the next update.
 *
 * @param {Object} [options] - Read options for every widget, as renderExchangeRateWidget's
 *   (`{ preferCache: true }` after a refresh has just saved fresh rates)
 * @returns {Promise<void>}
 */
export const refreshExchangeRateWidgets = async (options) => {
  const renderWidget = options
    ? (widgetInfo) => renderExchangeRateWidget(widgetInfo, options)
    : renderExchangeRateWidget;
  await Promise.all(EXCHANGE_RATE_WIDGETS.map(async (widgetName) => {
    try {
      await requestWidgetUpdate({ widgetName, renderWidget });
    } catch (error) {
      console.warn(`[widgets] Could not refresh ${widgetName} widgets:`, error?.message);
    }
  }));
};
