/**
 * The app's one exchange-rate source: the Frankfurter v2 API
 * (https://frankfurter.dev), a free, keyless, open-source feed of daily
 * mid-market rates blended from central banks.
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
 * Build a /v2/rates URL. Empty parameters are left out rather than sent blank.
 *
 * @param {Object} params - base, quotes, from, to, group
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
 * @param {Object} params - Query parameters (base, quotes, from, to, group)
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
