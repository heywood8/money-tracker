import { queryFirst } from './db';
import { setJsonPreference, PREF_KEYS } from './PreferencesDB';
import { appEvents, EVENTS } from './eventEmitter';
import { DEFAULT_RATE_RANGE, RATE_AMOUNTS, RATE_RANGES } from './ExchangeRateHistory';

/**
 * The exchange-rate charts the user has set up, as stored in preferences.
 *
 * A chart is `{ id, from, to, amount, range }`: the price of `amount` units of
 * `from` in `to` (100 AMD = 22.59 RUB), opening on `range`. "Direct or
 * reverse" is not a field of its own — reversing a chart swaps `from` and
 * `to`, so there is one way to say each thing.
 */

const CURRENCY_CODE = /^[A-Z]{3}$/;

export const createRateChartId = () => (
  `rate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
);

/**
 * A chart in its stored shape, or null when it cannot be drawn: missing or
 * malformed currencies, or the same currency on both sides. An unknown amount
 * or range falls back to the default rather than dropping the chart, so a
 * backup from a build that offered more options still restores every chart.
 *
 * @param {*} raw
 * @returns {{id: string, from: string, to: string, amount: number, range: string}|null}
 */
export const normalizeRateChart = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const from = typeof raw.from === 'string' ? raw.from.toUpperCase() : '';
  const to = typeof raw.to === 'string' ? raw.to.toUpperCase() : '';
  if (!CURRENCY_CODE.test(from) || !CURRENCY_CODE.test(to) || from === to) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createRateChartId(),
    from,
    to,
    amount: RATE_AMOUNTS.includes(raw.amount) ? raw.amount : 1,
    range: RATE_RANGES.includes(raw.range) ? raw.range : DEFAULT_RATE_RANGE,
  };
};

/**
 * The stored list, cleaned: invalid charts dropped, a duplicated id kept once
 * (the first, which is the one shown first).
 *
 * @param {*} raw
 * @returns {Array<Object>}
 */
export const normalizeRateCharts = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const charts = [];
  raw.forEach((item) => {
    const chart = normalizeRateChart(item);
    if (!chart || seen.has(chart.id)) return;
    seen.add(chart.id);
    charts.push(chart);
  });
  return charts;
};

/**
 * The same chart read the other way round: USD → RUB becomes RUB → USD. The
 * amount stays, so the user decides whether the reversed pair wants a larger
 * nominal.
 *
 * @param {Object} chart
 * @returns {Object}
 */
export const reverseRateChart = (chart) => ({ ...chart, from: chart.to, to: chart.from });

/**
 * How a chart is named everywhere it appears: "100 AMD → RUB".
 *
 * @param {{amount: number, from: string, to: string}} chart
 * @returns {string}
 */
export const rateChartTitle = ({ amount, from, to }) => `${amount} ${from} → ${to}`;

/**
 * The stored list.
 *
 * Reads the row itself rather than through getJsonPreference, whose error path
 * returns the default: an edit is written back as the whole list, so a failed
 * read that looked like "no charts" would let the next save wipe every chart
 * the user had. A read error is thrown instead; only an absent or unparseable
 * value reads as empty.
 *
 * @returns {Promise<Array<Object>>}
 * @throws when the database cannot be read
 */
export const loadRateCharts = async () => {
  const row = await queryFirst(
    'SELECT value FROM app_metadata WHERE key = ?',
    [PREF_KEYS.EXCHANGE_RATE_CHARTS],
  );
  if (!row || row.value == null) return [];
  try {
    return normalizeRateCharts(JSON.parse(row.value));
  } catch {
    return [];
  }
};

/**
 * Save the list and tell the Graphs tab.
 *
 * @param {Array<Object>} charts
 * @returns {Promise<Array<Object>>} The list as stored
 */
export const saveRateCharts = async (charts) => {
  const normalized = normalizeRateCharts(charts);
  await setJsonPreference(PREF_KEYS.EXCHANGE_RATE_CHARTS, normalized);
  appEvents.emit(EVENTS.EXCHANGE_RATE_CHARTS_CHANGED, normalized);
  return normalized;
};

/**
 * Add a chart, or replace the one with its id, in the list as it is stored
 * now — never in a copy a screen read earlier, which a restore or another
 * holder may have changed since.
 *
 * @param {Object} chart
 * @returns {Promise<Array<Object>>} The list as stored
 */
export const upsertRateChart = async (chart) => {
  const charts = await loadRateCharts();
  const index = charts.findIndex(({ id }) => id === chart.id);
  const next = index === -1
    ? [...charts, chart]
    : charts.map((existing, i) => (i === index ? chart : existing));
  return saveRateCharts(next);
};

/**
 * Remove the chart with `id` from the stored list.
 *
 * @param {string} id
 * @returns {Promise<Array<Object>>} The list as stored
 */
export const removeRateChart = async (id) => (
  saveRateCharts((await loadRateCharts()).filter((chart) => chart.id !== id))
);
