import * as FileSystem from 'expo-file-system/legacy';
import { normalizeRateChart } from '../services/ExchangeRateCharts';
import { RATE_RANGES } from '../services/ExchangeRateHistory';

/**
 * Which exchange-rate chart each home-screen widget shows.
 *
 * Kept in a file of its own rather than in app_metadata: widget ids belong to
 * this phone's launcher, and a backup restored on another phone would carry
 * ids that mean nothing there. The chart is stored whole, not just its id, so
 * a widget whose chart has since been deleted in Settings keeps showing the
 * pair it was set up with instead of jumping to another one.
 *
 * Shape: { [widgetId]: chart } for the one-rate widget and
 * { [widgetId]: [chart, chart] } for the two-rate one, a chart being
 * { id, from, to, amount, range }. Launcher ids are unique across widgets, so
 * both share the file.
 */

export const WIDGET_STORE_DIR = `${FileSystem.documentDirectory}widgets/`;
export const WIDGET_STORE_PATH = `${WIDGET_STORE_DIR}exchange-rate.json`;
// The window each widget was switched to with its arrows ({ [widgetId]: range }),
// apart from the charts: a widget with no entry shows its chart's own range.
export const WIDGET_WINDOWS_PATH = `${WIDGET_STORE_DIR}exchange-rate-windows.json`;

const readAll = async (path = WIDGET_STORE_PATH) => {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return {};
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Unreadable is as good as empty: every widget falls back to the first chart.
    return {};
  }
};

const writeAll = async (configs, path = WIDGET_STORE_PATH) => {
  await FileSystem.makeDirectoryAsync(WIDGET_STORE_DIR, { intermediates: true });
  await FileSystem.writeAsStringAsync(path, JSON.stringify(configs));
};

/**
 * The chart a widget was set up with, or null when it has none of its own.
 *
 * @param {number} widgetId
 * @returns {Promise<Object|null>}
 */
export const getWidgetChart = async (widgetId) => {
  const configs = await readAll();
  const saved = configs[String(widgetId)];
  return normalizeRateChart(Array.isArray(saved) ? saved[0] : saved) ?? null;
};

/**
 * The charts a two-rate widget was set up with, in its order; empty when it
 * has none of its own. A slot left empty is null.
 *
 * @param {number} widgetId
 * @returns {Promise<Array<Object|null>>}
 */
export const getWidgetCharts = async (widgetId) => {
  const configs = await readAll();
  const saved = configs[String(widgetId)];
  if (!Array.isArray(saved)) return saved ? [normalizeRateChart(saved) ?? null] : [];
  return saved.map((chart) => normalizeRateChart(chart) ?? null);
};

// The windows file is read and rewritten whole, by headless tasks that can run
// side by side (a double tap, two widgets tapped at once): one change at a
// time, so none is lost.
let windowsQueue = Promise.resolve();
const updateWindows = (change) => {
  const run = windowsQueue.then(async () => {
    const windows = await readAll(WIDGET_WINDOWS_PATH);
    const result = change(windows);
    if (result.changed) await writeAll(windows, WIDGET_WINDOWS_PATH);
    return result.value;
  });
  windowsQueue = run.catch(() => {});
  return run;
};

// A widget set up again shows the range of the chart just picked.
const clearWidgetWindow = (widgetId) => updateWindows((windows) => {
  if (!(String(widgetId) in windows)) return { changed: false };
  delete windows[String(widgetId)];
  return { changed: true };
});

/**
 * Bind a two-rate widget to its charts, in order.
 *
 * @param {number} widgetId
 * @param {Array<Object|null>} charts
 */
export const setWidgetCharts = async (widgetId, charts) => {
  const configs = await readAll();
  configs[String(widgetId)] = charts.map((chart) => normalizeRateChart(chart) ?? null);
  await writeAll(configs);
  await clearWidgetWindow(widgetId);
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
  await clearWidgetWindow(widgetId);
};

/**
 * The window a widget was switched to with its arrows, or null when it shows
 * its chart's own range.
 *
 * @param {number} widgetId
 * @returns {Promise<string|null>} One of RATE_RANGES
 */
export const getWidgetWindow = async (widgetId) => {
  const range = (await readAll(WIDGET_WINDOWS_PATH))[String(widgetId)];
  return RATE_RANGES.includes(range) ? range : null;
};

/**
 * Switch a widget to a window.
 *
 * @param {number} widgetId
 * @param {string} range - One of RATE_RANGES
 */
export const setWidgetWindow = async (widgetId, range) => {
  if (!RATE_RANGES.includes(range)) return;
  await updateWindows((windows) => {
    windows[String(widgetId)] = range;
    return { changed: true };
  });
};

/**
 * Move a widget's window `step` ranges along RATE_RANGES, read and saved in
 * one go so two taps in quick succession make two steps. Stops at the ends,
 * unless `wrap` carries it round to the other end.
 *
 * @param {number} widgetId
 * @param {string} fallback - The range shown while the widget has no window of its own
 * @param {number} step - -1 or 1
 * @param {Object} [options]
 * @param {boolean} [options.wrap] - Past the longest comes the shortest, and back
 * @returns {Promise<string|null>} The new window, or null when it did not move
 */
export const stepWidgetWindow = (widgetId, fallback, step, { wrap = false } = {}) => updateWindows((windows) => {
  const saved = windows[String(widgetId)];
  const index = Math.max(0, RATE_RANGES.indexOf(RATE_RANGES.includes(saved) ? saved : fallback));
  const target = index + Math.sign(step || 0);
  const next = wrap
    ? RATE_RANGES[(target + RATE_RANGES.length) % RATE_RANGES.length]
    : RATE_RANGES[Math.min(RATE_RANGES.length - 1, Math.max(0, target))];
  if (next === RATE_RANGES[index]) return { changed: false, value: null };
  windows[String(widgetId)] = next;
  return { changed: true, value: next };
});

/**
 * Drop a widget removed from the home screen: its charts and its window.
 *
 * @param {number} widgetId
 */
export const forgetWidget = async (widgetId) => {
  const configs = await readAll();
  if (String(widgetId) in configs) {
    delete configs[String(widgetId)];
    await writeAll(configs);
  }
  await clearWidgetWindow(widgetId);
};

/**
 * The charts a widget draws, all over one window: the one it was switched to,
 * else the first chart's own range. A widget shows one window, so both halves
 * of the two-rate widget follow it.
 *
 * @param {Array<Object|null>} charts
 * @param {string|null} window
 * @returns {Array<Object|null>}
 */
export const applyWidgetWindow = (charts, window) => {
  const range = RATE_RANGES.includes(window) ? window : charts.find(Boolean)?.range;
  return charts.map((chart) => (chart && range && chart.range !== range ? { ...chart, range } : chart));
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

/**
 * The charts a two-rate widget draws, slot by slot as resolveWidgetChart does
 * for one: what it was set up with (the live version), else the first two
 * configured charts. A slot with nothing to draw is null.
 *
 * @param {Array<Object>} charts - The configured charts
 * @param {Array<Object|null>} stored - The widget's own saved charts
 * @returns {[Object|null, Object|null]}
 */
export const resolveWidgetCharts = (charts, stored) => {
  if (stored.some(Boolean)) {
    return [0, 1].map((i) => (stored[i]
      ? charts.find((chart) => chart.id === stored[i].id) ?? stored[i]
      : null));
  }
  return [charts[0] ?? null, charts[1] ?? null];
};
