import { fetchGoogleQuotes } from './googleFinance';

/**
 * The market rate of a pair right now, as Google shows it (googleFinance.js),
 * for the figures that mean "now": a chart's latest point and headline, a
 * widget, the rate a transfer is suggested at. History stays with the central
 * banks (ExchangeRateHistory): Google's own daily series has weekend values
 * several percent off for thinly traded pairs (RUB → AMD read 4.04 on a
 * Saturday between weekdays of 4.35).
 *
 * The same thin pairs can quote such a value live, so a quote is only used
 * when it sits within MAX_MARKET_DEVIATION of a reference the caller trusts
 * (the latest central-bank figure). Otherwise, and whenever Google cannot be
 * reached, the caller keeps its own figure.
 */

// How long a quote is reused. Rates people swap at move by the hour, not the
// second, and a chart, a widget and a transfer opened together share one request.
export const MARKET_RATE_TTL_MS = 10 * 60 * 1000;
// How far a quote may sit from the caller's reference. Central-bank fixings of
// the app's pairs move about 1% a day at most; the bad weekend quotes are 5–8% off.
export const MAX_MARKET_DEVIATION = 0.03;
// After a failed request, how long lookups answer "no quote" at once instead
// of waiting on the network again.
const FAILURE_BACKOFF_MS = 60 * 1000;

// "FROM-TO" -> { rate, at }; rate null for a pair Google does not quote,
// remembered as long as a quote so the miss is not asked again on every lookup.
const quotes = new Map();
const pending = new Map(); // "FROM-TO" -> in-flight request
const failedAt = new Map(); // "FROM-TO" -> when its last request failed

/**
 * Forget every cached quote (tests, and nothing else needs it).
 */
export const clearMarketRateCache = () => {
  quotes.clear();
  pending.clear();
  failedAt.clear();
};

const pairKey = (from, to) => `${String(from).toUpperCase()}-${String(to).toUpperCase()}`;

/**
 * Whether a market rate is close enough to a trusted figure to be used.
 * Without a reference there is nothing to hold it against, so nothing passes.
 *
 * @param {number} rate
 * @param {number} reference
 * @returns {boolean}
 */
export const isNearReference = (rate, reference) => (
  reference > 0 && Math.abs(rate / reference - 1) <= MAX_MARKET_DEVIATION
);

const withinReference = (rate, reference) => reference === undefined || isNearReference(rate, reference);

const load = (key) => {
  if (pending.has(key)) return pending.get(key);
  const [from, to] = key.split('-');
  const request = fetchGoogleQuotes([[from, to]])
    .then((found) => {
      failedAt.delete(key);
      const quote = { rate: found.get(key) ?? null, at: Date.now() };
      quotes.set(key, quote);
      return quote;
    })
    .catch(() => {
      failedAt.set(key, Date.now());
      return null;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
};

/**
 * One unit of `from` in `to` at the market now, or null when there is no
 * quote to use: Google unreachable or not quoting the pair, or the quote too
 * far from `reference`.
 *
 * @param {string} from
 * @param {string} to
 * @param {Object} [options]
 * @param {number} [options.reference] - A trusted figure the quote must sit near;
 *   left out, the caller checks the quote itself (isNearReference)
 * @param {boolean} [options.force] - Ask again even if the cached quote is fresh
 * @returns {Promise<{rate: number, at: number}|null>} `at`: when it was fetched (ms)
 */
export const fetchMarketRate = async (from, to, { reference, force = false } = {}) => {
  if (!from || !to || from === to) return null;
  const key = pairKey(from, to);
  const cached = quotes.get(key);
  let quote = !force && cached && Date.now() - cached.at < MARKET_RATE_TTL_MS ? cached : null;
  if (!quote) {
    if (!force && Date.now() - (failedAt.get(key) ?? -Infinity) < FAILURE_BACKOFF_MS) return null;
    quote = await load(key);
  }
  return quote && quote.rate !== null && withinReference(quote.rate, reference) ? { ...quote } : null;
};

/**
 * The quote already fetched for a pair, however old, without the network:
 * for a redraw that must not wait (a widget showing "↻ …").
 *
 * @param {string} from
 * @param {string} to
 * @param {Object} [options]
 * @param {number} [options.reference]
 * @returns {{rate: number, at: number}|null}
 */
export const peekMarketRate = (from, to, { reference } = {}) => {
  const quote = quotes.get(pairKey(from, to));
  return quote && quote.rate !== null && withinReference(quote.rate, reference) ? { ...quote } : null;
};
