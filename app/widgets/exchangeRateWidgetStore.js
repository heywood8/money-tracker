import * as FileSystem from 'expo-file-system/legacy';
import { normalizeRateChart } from '../services/ExchangeRateCharts';

/**
 * Which exchange-rate chart each home-screen widget shows.
 *
 * Kept in a file of its own rather than in app_metadata: widget ids belong to
 * this phone's launcher, and a backup restored on another phone would carry
 * ids that mean nothing there. The chart is stored whole, not just its id, so
 * a widget whose chart has since been deleted in Settings keeps showing the
 * pair it was set up with instead of jumping to another one.
 *
 * Shape: { [widgetId]: { id, from, to, amount, range } }
 */

export const WIDGET_STORE_DIR = `${FileSystem.documentDirectory}widgets/`;
export const WIDGET_STORE_PATH = `${WIDGET_STORE_DIR}exchange-rate.json`;

const readAll = async () => {
  try {
    const info = await FileSystem.getInfoAsync(WIDGET_STORE_PATH);
    if (!info.exists) return {};
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(WIDGET_STORE_PATH));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Unreadable is as good as empty: every widget falls back to the first chart.
    return {};
  }
};

const writeAll = async (configs) => {
  await FileSystem.makeDirectoryAsync(WIDGET_STORE_DIR, { intermediates: true });
  await FileSystem.writeAsStringAsync(WIDGET_STORE_PATH, JSON.stringify(configs));
};

/**
 * The chart a widget was set up with, or null when it has none of its own.
 *
 * @param {number} widgetId
 * @returns {Promise<Object|null>}
 */
export const getWidgetChart = async (widgetId) => {
  const configs = await readAll();
  return normalizeRateChart(configs[String(widgetId)]) ?? null;
};

/**
 * Bind a widget to a chart.
 *
 * @param {number} widgetId
 * @param {Object} chart
 */
export const setWidgetChart = async (widgetId, chart) => {
  const normalized = normalizeRateChart(chart);
  if (!normalized) return;
  const configs = await readAll();
  configs[String(widgetId)] = normalized;
  await writeAll(configs);
};

/**
 * Drop a widget removed from the home screen.
 *
 * @param {number} widgetId
 */
export const forgetWidget = async (widgetId) => {
  const configs = await readAll();
  if (!(String(widgetId) in configs)) return;
  delete configs[String(widgetId)];
  await writeAll(configs);
};

/**
 * The chart a widget draws: the live version of the chart it was set up with
 * (so an edit in Settings reaches it), else the copy it saved, else the first
 * configured chart. Null when there is nothing to draw.
 *
 * @param {Array<Object>} charts - The configured charts
 * @param {Object|null} stored - The widget's own saved chart
 * @returns {Object|null}
 */
export const resolveWidgetChart = (charts, stored) => {
  if (stored) {
    return charts.find((chart) => chart.id === stored.id) ?? stored;
  }
  return charts[0] ?? null;
};
