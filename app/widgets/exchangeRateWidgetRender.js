import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { loadRateCharts } from '../services/ExchangeRateCharts';
import { fetchRateHistory } from '../services/ExchangeRateHistory';
import { resolveLanguage } from '../services/notifications/notificationStrings';
import { getWidgetChart, resolveWidgetChart } from './exchangeRateWidgetStore';
import { ExchangeRateWidget } from './ExchangeRateWidget';
import { EXCHANGE_RATE_WIDGET } from './widgetConstants';

const sameChart = (a, b) => (
  a.id === b.id && a.from === b.from && a.to === b.to && a.amount === b.amount && a.range === b.range
);

/**
 * Everything one widget needs to draw, read the way the Graphs tab reads it:
 * the configured chart, the saved rate history topped up from the network
 * when it is an hour old, and the app's language.
 *
 * Runs headless as often as in the app (the launcher asks for updates with the
 * app closed), so every read degrades instead of throwing: no charts reads as
 * "empty", no rates as "error" — a widget that fails to render keeps showing
 * whatever it last drew, which is worse than saying what is wrong.
 *
 * @param {number} widgetId
 * @param {Object} [options]
 * @param {boolean} [options.recheck=true] - Re-read the widget's chart after loading
 * @returns {Promise<{status: 'ready'|'error'|'empty', chart?: Object, points?: Array, stale?: boolean, language: string}>}
 */
export const loadExchangeRateWidgetModel = async (widgetId, { recheck = true } = {}) => {
  const [charts, stored, language] = await Promise.all([
    loadRateCharts().catch(() => []),
    getWidgetChart(widgetId).catch(() => null),
    resolveLanguage(),
  ]);
  const chart = resolveWidgetChart(charts, stored);
  if (!chart) return { status: 'empty', language };

  let model;
  try {
    const { points, stale } = await fetchRateHistory(chart.from, chart.to, chart.range);
    model = { status: 'ready', chart, points, stale, language };
  } catch {
    model = { status: 'error', chart, language };
  }

  // The pair can be picked while the rates load: on some launchers the first
  // update of a new widget runs alongside its configuration screen, and that
  // update started before a pair was saved. Whichever draw lands last wins,
  // so a stale one re-reads the choice and draws that instead.
  if (recheck) {
    const latest = resolveWidgetChart(charts, await getWidgetChart(widgetId).catch(() => null));
    if (latest && !sameChart(latest, chart)) {
      return loadExchangeRateWidgetModel(widgetId, { recheck: false });
    }
  }
  return model;
};

/**
 * The widget in both system themes; the launcher shows the one that matches.
 *
 * @param {{widgetId: number, width: number, height: number}} widgetInfo
 * @returns {Promise<{light: JSX.Element, dark: JSX.Element}>}
 */
export const renderExchangeRateWidget = async (widgetInfo) => {
  const model = await loadExchangeRateWidgetModel(widgetInfo.widgetId);
  const props = { model, width: widgetInfo.width, height: widgetInfo.height };
  return {
    light: <ExchangeRateWidget {...props} theme="light" />,
    dark: <ExchangeRateWidget {...props} theme="dark" />,
  };
};

/**
 * Redraw every exchange-rate widget on the home screen. Called by the app when
 * what they show may have changed (a chart edited, rates freshly loaded); the
 * launcher's own hourly update covers the rest. Never throws: a widget that
 * could not be redrawn now will be on the next update.
 *
 * @returns {Promise<void>}
 */
export const refreshExchangeRateWidgets = async () => {
  try {
    await requestWidgetUpdate({
      widgetName: EXCHANGE_RATE_WIDGET,
      renderWidget: renderExchangeRateWidget,
    });
  } catch (error) {
    console.warn('[widgets] Could not refresh exchange-rate widgets:', error?.message);
  }
};
