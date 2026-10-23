/**
 * The app's one exchange-rate source: the Frankfurter v2 API
 * (https://frankfurter.dev), a free, keyless, open-source feed of daily
 * mid-market rates blended from central banks (or, for a pair with a currency
 * in HOME_PROVIDERS, read from that currency's own central bank).
 *
 * Both the live conversion rate (currency.fetchLiveExchangeRate) and the rate
 * history charts (ExchangeRateHistory) read it, so a figure a transfer was
 * converted at and the chart drawn beside it come from the same data.
 *
 * Every rate is quoted per row as `{ date, base, quote, rate }`: one unit of
 * `base` buys `rate` units of `quote`. Rates are rounded to about five
 * significant digits *in the direction requested*, so a weak base against a
 * strong quote (AMD → USD, 0.00277) keeps only three — callers that care ask in
 * the other direction and invert.
 */

export const FRANKFURTER_API = 'https://api.frankfurter.dev/v2';

/**
 * Currencies whose blended rate trails the market, and the central bank whose
 * own rates are read instead for any pair with one of them.
 *
 * The blend is a median over every bank that quotes a currency. For most
 * currencies that is a dozen banks quoting it on the day, and it lands within
 * a few tenths of a percent of the market. Not for the rouble: since 2022 few
 * banks quote it directly, the rest derive it from their own currency a day or
 * more late, and when it moves the blend lags by a day. In October 2026 that put
 * RUB → AMD 1.1% under the market, against 0.2% for the two home banks. The dram
 * is thinly quoted too, and the Central Bank of Armenia's figure is the average
 * the Armenian market actually traded at.
 *
 * A bank is added here for a measured gap, not on principle: some home banks
 * publish a policy fix rather than the market (China's CFETS sits 0.9% off), and
 * for most currencies the blend is already the closer figure.
 */
export const HOME_PROVIDERS = {
  AMD: 'CBA', // Central Bank of Armenia
  RUB: 'CBR', // Bank of Russia
};

/**
 * The `providers` filter for a pair: the home banks of either currency, joined
 * in a fixed order, or '' when neither has one and the blend is used. With both
 * banks the API averages them; with one it reads that bank's own cross rate.
 *
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export const pairProviders = (from, to) => [
  ...new Set([HOME_PROVIDERS[from], HOME_PROVIDERS[to]].filter(Boolean)),
].sort().join(',');

/**
 * Build a /v2/rates URL. Empty parameters are left out rather than sent blank.
 *
 * @param {Object} params - base, quotes, from, to, group, providers
 * @returns {string}
 */
export const buildRatesUrl = (params = {}) => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${FRANKFURTER_API}/rates${query ? `?${query}` : ''}`;
};

/**
 * Error thrown by fetchRates. `code` says which way it went wrong:
 * 'network' (no answer, timeout, 5xx), 'unsupported' (the API refused the
 * currency, 4xx) or 'invalid' (an answer that is not a list of rates).
 */
export class RateSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RateSourceError';
    this.code = code;
  }
}

/**
 * Keep the rows that are usable rates: a positive, finite number with a date
 * and both currency codes.
 *
 * @param {*} data - The parsed response body
 * @returns {Array<{date: string, base: string, quote: string, rate: number}>}
 */
export const parseRateRows = (data) => {
  if (!Array.isArray(data)) return [];
  return data.filter((row) => (
    row
    && typeof row.date === 'string'
    && typeof row.base === 'string'
    && typeof row.quote === 'string'
    && typeof row.rate === 'number'
    && Number.isFinite(row.rate)
    && row.rate > 0
  ));
};

/**
 * Fetch /v2/rates with a timeout.
 *
 * @param {Object} params - Query parameters (base, quotes, from, to, group, providers)
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=10000]
 * @returns {Promise<Array<{date: string, base: string, quote: string, rate: number}>>}
 * @throws {RateSourceError}
 */
export const fetchRates = async (params, { timeoutMs = 10000 } = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(buildRatesUrl(params), { signal: controller.signal });
  } catch (error) {
    throw new RateSourceError('network', error?.message || 'Network request failed');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // 400/404/422 are the API saying no to the request itself (an unknown
    // currency, a malformed date) — retrying will not change its mind.
    const code = response.status >= 400 && response.status < 500 ? 'unsupported' : 'network';
    throw new RateSourceError(code, `Frankfurter responded ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new RateSourceError('invalid', 'Frankfurter returned malformed JSON');
  }
  if (!Array.isArray(data)) {
    throw new RateSourceError('invalid', 'Frankfurter returned no rate list');
  }
  return parseRateRows(data);
};
