import * as FileSystem from 'expo-file-system/legacy';
import { fetchRates, RateSourceError } from './frankfurter';
import { fetchLiveExchangeRate } from './currency';

/**
 * Exchange-rate history for the rate charts on the Graphs tab.
 *
 * The source publishes one rate per day (central banks fix once a day), so
 * every range is a daily series; the shortest one, a day, is today against the
 * previous fixing. That is the granularity the charts are for: whether a rate
 * has moved noticeably, not the tick-by-tick noise of a trading screen.
 *
 * History is kept on disk and only ever topped up. A past day's rate never
 * changes, so once a pair has been drawn, opening it again asks the network for
 * the days since the last visit — usually one or two rows — and a chart opened
 * offline draws what was saved, marked stale, instead of an error.
 */

// The ranges a chart offers, shortest first: the order of its chip row.
export const RATE_RANGES = ['day', 'week', 'month', 'year', 'all'];
export const DEFAULT_RATE_RANGE = 'month';

// Translation key per range. Literal so the i18n scan sees every one.
export const RANGE_LABEL_KEYS = {
  day: 'rate_range_day',
  week: 'rate_range_week',
  month: 'rate_range_month',
  year: 'rate_range_year',
  all: 'rate_range_all',
};

// How many units of the source currency a chart prices. A weak currency against
// a strong one reads better per 10, 100 or 1000 (100 AMD = 22.59 RUB rather
// than 1 AMD = 0.2259 RUB) — the same nominal central banks quote such pairs in.
export const RATE_AMOUNTS = [1, 10, 100, 1000];

// Where "all time" starts. The API's oldest data; a pair simply starts later.
const EARLIEST_DATE = '1948-01-01';

// How long a saved series counts as current before its newest days are asked
// for again. Today's row can still move while providers publish through the
// day, and the top-up is a row or two, so an hour costs next to nothing.
export const HISTORY_REFRESH_MS = 60 * 60 * 1000;
// A first year-long download is ~20 KB; give a slow connection room for it.
const HISTORY_TIMEOUT_MS = 15000;

// Bumped when the saved shape changes; a file of another version is ignored.
const CACHE_VERSION = 1;
export const RATE_CACHE_DIR = `${FileSystem.cacheDirectory}exchange-rates/`;

const CURRENCY_CODE = /^[A-Z]{3}$/;

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * A local calendar date as the API writes it.
 *
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export const toIsoDate = (date) => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

// The calendar day before a YYYY-MM-DD date.
const dayBefore = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return toIsoDate(new Date(year, month - 1, day - 1));
};

// Step a date back by whole months, holding the day where the target month
// has it: a month before 31 March is 28/29 February, not 3 March.
const monthsBefore = (date, months) => {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
};

/**
 * First date a range draws from.
 *
 * The day range reaches back a week rather than one day: the source has no
 * row on a day no provider published, so "the previous fixing" can be several
 * days back across a holiday. Only its last two rows are kept.
 *
 * @param {string} range - One of RATE_RANGES
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
export const rangeStart = (range, now = new Date()) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
  case 'day':
  case 'week':
    return toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7));
  case 'month':
    return toIsoDate(monthsBefore(today, 1));
  case 'year':
    return toIsoDate(monthsBefore(today, 12));
  default:
    return EARLIEST_DATE;
  }
};

/**
 * Which way round to ask the source for a pair the first time it is drawn.
 *
 * The source rounds each rate to about five significant digits in the
 * direction asked for, so a rate below 1 loses digits: AMD → USD comes back as
 * 0.00277 and KRW → USD as 0.00075, which would draw a staircase. Asked the
 * other way round (361.00, 1324.48) and inverted, the line is smooth.
 *
 * The magnitude comes from the live rate table every conversion already reads
 * (cached for an hour, one request for all currencies), falling back to the
 * bundled offline table; a pair neither knows is asked as written. Once a pair
 * has history saved, the direction it was saved in is kept (see
 * fetchRateHistory), so a later answer from a different table never splits one
 * pair's history across two directions.
 *
 * @param {string} from
 * @param {string} to
 * @returns {Promise<{base: string, quote: string}>}
 */
export const resolveRequestDirection = async (from, to) => {
  let approx = NaN;
  try {
    const { rate } = await fetchLiveExchangeRate(from, to);
    approx = Number(rate);
  } catch {
    approx = NaN;
  }
  const invert = Number.isFinite(approx) && approx > 0 && approx < 1;
  return invert ? { base: to, quote: from } : { base: from, quote: to };
};

// "AAA_BBB" (codes sorted) -> saved entry, once read from disk this session
const entries = new Map();
// "AAA_BBB" -> tail of the work queued on that pair (see runExclusive)
const pairQueues = new Map();

/**
 * Forget the in-memory copies (tests; the files on disk are left alone).
 */
export const clearRateHistoryCache = () => {
  entries.clear();
  pairQueues.clear();
};

const emptyEntry = () => ({ v: CACHE_VERSION, base: null, quote: null, daily: null, monthly: null });

const isRowList = (rows) => Array.isArray(rows) && rows.every((row) => (
  Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'number' && row[1] > 0
));

const isSeries = (series) => (
  series && typeof series.checkedAt === 'number' && isRowList(series.rows)
);

/**
 * A saved entry, or an empty one when the file is missing, unreadable or of
 * another version — it is a cache, so the worst case is downloading again.
 *
 * @param {*} raw - Parsed file contents
 * @returns {{v: number, base: string|null, quote: string|null, daily: Object|null, monthly: Object|null}}
 */
export const parseCacheEntry = (raw) => {
  if (
    !raw
    || raw.v !== CACHE_VERSION
    || !CURRENCY_CODE.test(raw.base ?? '')
    || !CURRENCY_CODE.test(raw.quote ?? '')
  ) {
    return emptyEntry();
  }
  return {
    v: CACHE_VERSION,
    base: raw.base,
    quote: raw.quote,
    daily: isSeries(raw.daily) && typeof raw.daily.from === 'string' ? raw.daily : null,
    monthly: isSeries(raw.monthly) ? raw.monthly : null,
  };
};

const cachePath = (pairKey) => `${RATE_CACHE_DIR}${pairKey}.json`;

const readEntry = async (pairKey) => {
  if (entries.has(pairKey)) return entries.get(pairKey);
  let entry = emptyEntry();
  try {
    const path = cachePath(pairKey);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) entry = parseCacheEntry(JSON.parse(await FileSystem.readAsStringAsync(path)));
  } catch {
    entry = emptyEntry();
  }
  entries.set(pairKey, entry);
  return entry;
};

const writeEntry = async (pairKey, entry) => {
  try {
    await FileSystem.makeDirectoryAsync(RATE_CACHE_DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(cachePath(pairKey), JSON.stringify(entry));
  } catch {
    // The copy in memory still serves this session; the next save retries.
  }
};

// One pair's history is read, topped up and written back as a unit. Two ranges
// of the same pair loading at once (the card's default plus a tap on another
// chip) would otherwise both merge into the entry they read and the second
// write would drop the first one's rows.
const runExclusive = (pairKey, task) => {
  const previous = pairQueues.get(pairKey) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  pairQueues.set(pairKey, run.catch(() => {}));
  return run;
};

// Rows by date, newer answers replacing older ones, oldest first.
const mergeRows = (rows, fetched) => {
  const byDate = new Map(rows);
  fetched.forEach(([date, rate]) => byDate.set(date, rate));
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
};

const lastDate = (series, fallback) => (
  series.rows.length ? series.rows[series.rows.length - 1][0] : fallback
);

const isFresh = (series, force) => !force && Date.now() - series.checkedAt < HISTORY_REFRESH_MS;

const requestRows = (base, quote, params) => fetchRates(
  { base, quotes: quote, ...params },
  { timeoutMs: HISTORY_TIMEOUT_MS },
).then((rows) => rows
  .filter((row) => row.base === base && row.quote === quote)
  .map((row) => [row.date, row.rate]));

/**
 * Bring the daily series up to date for a window starting at `start`, asking
 * only for what is missing: the days before the saved span when the window
 * reaches further back, and the days since the newest saved one once that is
 * stale. Returns whether the entry changed.
 */
const topUpDaily = async (entry, start, yearStart, force) => {
  const { base, quote } = entry;
  const daily = entry.daily;
  let rows = daily ? daily.rows : [];
  let from = daily ? daily.from : start;
  let checkedAt = daily ? daily.checkedAt : 0;
  let changed = false;

  if (!daily) {
    rows = await requestRows(base, quote, { from: start });
    checkedAt = Date.now();
    changed = true;
  } else {
    if (daily.from > start) {
      // Only the older days: the saved span already covers the rest.
      rows = mergeRows(rows, await requestRows(base, quote, { from: start, to: dayBefore(daily.from) }));
      from = start;
      changed = true;
    }
    if (!isFresh(daily, force)) {
      // From the newest saved day, not the day after: that day may have been
      // saved before every provider had published it.
      rows = mergeRows(rows, await requestRows(base, quote, { from: lastDate(daily, daily.from) }));
      checkedAt = Date.now();
      changed = true;
    }
  }
  if (!changed) return false;

  // Daily rows are only ever drawn for the last year; older ones would grow
  // the file forever for nothing (the all-time range reads the monthly series).
  if (from < yearStart) {
    from = yearStart;
    rows = rows.filter(([date]) => date >= yearStart);
  }
  entry.daily = { from, checkedAt, rows };
  return true;
};

/**
 * Bring the monthly series (all-time range) up to date. Returns whether the
 * entry changed.
 */
const topUpMonthly = async (entry, force) => {
  const { base, quote } = entry;
  const monthly = entry.monthly;
  // A pair the source has no months for is checked as rarely as any other.
  if (monthly && isFresh(monthly, force)) return false;
  // From the newest saved month: its average is still moving until it ends.
  const from = monthly ? lastDate(monthly, EARLIEST_DATE) : EARLIEST_DATE;
  const rows = await requestRows(base, quote, { from, group: 'month' });
  entry.monthly = { checkedAt: Date.now(), rows: mergeRows(monthly ? monthly.rows : [], rows) };
  return true;
};

// The points a range draws, in the direction the chart reads.
const pointsFor = (entry, range, start, invert) => {
  const toPoint = ([date, rate]) => ({ date, rate: invert ? 1 / rate : rate });
  const daily = entry.daily ? entry.daily.rows : [];

  if (range === 'all') {
    const monthly = entry.monthly ? entry.monthly.rows.map(toPoint) : [];
    // A monthly series ends on this month's average, not on today's rate: end
    // the line on the newest daily row so it agrees with the card's headline.
    const latest = daily.length ? toPoint(daily[daily.length - 1]) : null;
    if (latest && (monthly.length === 0 || latest.date > monthly[monthly.length - 1].date)) {
      monthly.push(latest);
    }
    return monthly;
  }

  const points = daily.filter(([date]) => date >= start).map(toPoint);
  return range === 'day' ? points.slice(-2) : points;
};

/**
 * Daily rate history of one unit of `from` in `to`, oldest first.
 *
 * Served from the saved history, topped up from the network when it is older
 * than HISTORY_REFRESH_MS. When the network fails and something is saved, that
 * is returned with `stale: true`; only a pair with nothing saved throws.
 *
 * Both directions of a pair share one saved history (USD → RUB and RUB → USD
 * read the same file), kept in the direction it was first requested in.
 *
 * @param {string} from - Currency being priced (e.g. 'USD')
 * @param {string} to - Currency the price is in (e.g. 'RUB')
 * @param {string} range - One of RATE_RANGES
 * @param {Object} [options]
 * @param {Date} [options.now]
 * @param {boolean} [options.force] - Top up even if the saved copy is fresh
 * @returns {Promise<{points: Array<{date: string, rate: number}>, stale: boolean}>}
 * @throws {RateSourceError} code 'network' | 'unsupported' | 'invalid' | 'empty'
 */
export const fetchRateHistory = (from, to, range, { now = new Date(), force = false } = {}) => {
  if (!from || !to || from === to) {
    return Promise.reject(new RateSourceError('unsupported', 'A rate needs two different currencies'));
  }
  const pairKey = [from, to].sort().join('_');
  const start = rangeStart(range, now);
  const yearStart = rangeStart('year', now);

  return runExclusive(pairKey, async () => {
    const entry = await readEntry(pairKey);
    // Pinned only by saved rows: a pair whose first visit got nothing (offline,
    // say) asks again next time, when the live table may know it better.
    if (!entry.base || (!entry.daily && !entry.monthly)) {
      Object.assign(entry, await resolveRequestDirection(from, to));
    }
    const invert = entry.base !== from;

    // The all-time line also ends on the newest daily rate, so it tops up the
    // last week of the daily series alongside its own — independently, so one
    // answering is enough to draw something.
    const updates = range === 'all'
      ? [topUpDaily(entry, rangeStart('day', now), yearStart, force), topUpMonthly(entry, force)]
      : [topUpDaily(entry, start, yearStart, force)];
    const results = await Promise.allSettled(updates);
    const failed = results.find((result) => result.status === 'rejected');
    const changed = results.some((result) => result.status === 'fulfilled' && result.value);

    if (changed) await writeEntry(pairKey, entry);

    const points = pointsFor(entry, range, start, invert);
    if (points.length === 0) {
      throw failed ? failed.reason : new RateSourceError('empty', `No rates for ${from}/${to}`);
    }
    return { points, stale: failed !== undefined };
  });
};

/**
 * The figures a chart's header reads off its series, priced per `amount`
 * units: where it is now, where the range started, and how far it moved.
 *
 * @param {Array<{date: string, rate: number}>} points
 * @param {number} [amount=1]
 * @returns {{current: number, first: number, change: number, changePercent: number,
 *   min: number, max: number, date: string}|null}
 */
export const summarizeRateSeries = (points, amount = 1) => {
  if (!Array.isArray(points) || points.length === 0) return null;
  const values = points.map((point) => point.rate * amount);
  const first = values[0];
  const current = values[values.length - 1];
  const change = current - first;
  return {
    current,
    first,
    change,
    changePercent: first > 0 ? (change / first) * 100 : 0,
    min: Math.min(...values),
    max: Math.max(...values),
    date: points[points.length - 1].date,
  };
};

/**
 * Decimal places for a rate: four significant digits, never fewer than two
 * decimals and never more than eight. 81.55, 4.427, 0.2259, 0.01226, 1324.48.
 *
 * A rate is a ratio, not an amount of money, so the currency's own minor units
 * do not apply — RUB prints no kopecks as a balance, but a rate of 81 RUB says
 * far less than 81.55.
 *
 * @param {number} value
 * @returns {number}
 */
export const rateDecimals = (value) => {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs) || abs === 0) return 2;
  const integerDigits = Math.floor(Math.log10(abs)) + 1;
  return Math.min(8, Math.max(2, 4 - integerDigits));
};

/**
 * Decimal places for a chart's y-axis: enough to tell four gridlines apart,
 * no more. A month of USD → RUB between 81 and 85 labels "82", "83"; the same
 * month as RUB → AMD between 4.21 and 4.43 needs "4.25", "4.30".
 *
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const axisDecimals = (min, max) => {
  const step = (max - min) / 4;
  if (!Number.isFinite(step) || step <= 0) return rateDecimals(max);
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(step))));
};

/**
 * Format a rate for display in the app's language.
 *
 * @param {number} value
 * @param {string} [language]
 * @param {number} [decimals] - Defaults to rateDecimals(value); pass the
 *   headline figure's when formatting a change next to it, so both line up.
 * @returns {string}
 */
export const formatRateValue = (value, language, decimals = rateDecimals(value)) => {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  try {
    return Number(fixed).toLocaleString(language || undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return fixed;
  }
};

/**
 * A move as "+1.55 (+1.94%)" — the change in the rate's own decimals, then in
 * percent. Shared by the Graphs card and the home-screen widget so the two say
 * it the same way.
 *
 * @param {number} change
 * @param {number} changePercent
 * @param {string} [language]
 * @param {number} decimals - The headline rate's decimals
 * @returns {string}
 */
export const formatRateChange = (change, changePercent, language, decimals) => {
  const signed = (value, text) => (value > 0 ? `+${text}` : text);
  return `${signed(change, formatRateValue(change, language, decimals))} `
    + `(${signed(changePercent, formatRateValue(changePercent, language, 2))}%)`;
};

// A YYYY-MM-DD date as a local Date, for the locale formatter.
const parseDate = (date) => {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(year, month - 1, day || 1);
};

// In the app's language, not the device's — the two are independent here.
const localeDate = (date, language, options) => {
  try {
    return parseDate(date).toLocaleDateString(language || undefined, options);
  } catch {
    return String(date);
  }
};

/**
 * "23 Oct 2026" in the app's language, or "Oct 2026" for a monthly average
 * (the all-time series, whose points stand for a whole month).
 *
 * @param {string} date - YYYY-MM-DD
 * @param {string} [language]
 * @param {boolean} [monthOnly]
 * @returns {string}
 */
export const formatRateDate = (date, language, monthOnly = false) => localeDate(
  date,
  language,
  monthOnly ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' },
);

/**
 * An x-axis label for a range: the day for the short ranges, the month for a
 * year, the year for all time.
 *
 * @param {string} date - YYYY-MM-DD
 * @param {string} range
 * @param {string} [language]
 * @returns {string}
 */
export const formatAxisDate = (date, range, language) => {
  if (range === 'all') return String(date).slice(0, 4);
  if (range === 'year') return localeDate(date, language, { month: 'short' });
  return localeDate(date, language, { day: 'numeric', month: 'short' });
};
