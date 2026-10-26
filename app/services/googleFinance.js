import { RateSourceError } from './frankfurter';

/**
 * Live currency quotes as Google shows them (Google Finance, data from
 * Morningstar): the price people quote each other when they swap currency
 * person to person, which is why the app's "now" reads it rather than a
 * central bank's fixing, published once a day and not at weekends.
 *
 * There is no public API. This is the request Google Finance's own page makes
 * to refresh a quote, so it can change without notice: every caller treats a
 * failure as "no market quote" and falls back to the central banks
 * (frankfurter.js), which stay the source of every rate's history.
 */

export const GOOGLE_FINANCE_RPC = 'https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute';
// The page's own quote lookup.
const QUOTE_RPC = 'xh8wxf';

// Where a quote's fields sit in the answer: [.., 5: [price, ...], .., 21: 'RUB-AMD'].
const PRICE = 5;
const PAIR = 21;

/**
 * The form body asking for several pairs at once.
 *
 * @param {Array<[string, string]>} pairs - [from, to] currency codes
 * @returns {string}
 */
export const buildQuoteRequestBody = (pairs) => {
  const args = JSON.stringify([pairs.map(([from, to]) => [null, null, [from, to]]), 1]);
  return `f.req=${encodeURIComponent(JSON.stringify([[[QUOTE_RPC, args, null, 'generic']]]))}`;
};

/**
 * The quotes in an answer, keyed "FROM-TO". A pair Google does not quote, or
 * an answer of another shape, is simply absent.
 *
 * @param {string} text - The response body: `)]}'` and a JSON array
 * @returns {Map<string, number>}
 */
export const parseQuoteResponse = (text) => {
  const quotes = new Map();
  try {
    const body = String(text).slice(String(text).indexOf('\n') + 1);
    const envelope = JSON.parse(body.trim()).find((entry) => (
      Array.isArray(entry) && entry[0] === 'wrb.fr' && entry[1] === QUOTE_RPC
    ));
    if (!envelope || typeof envelope[2] !== 'string') return quotes;
    const rows = JSON.parse(envelope[2])?.[0];
    if (!Array.isArray(rows)) return quotes;
    rows.forEach((row) => {
      const quote = Array.isArray(row) ? row[0] : null;
      const pair = Array.isArray(quote) ? quote[PAIR] : null;
      const price = Array.isArray(quote?.[PRICE]) ? quote[PRICE][0] : null;
      if (typeof pair === 'string' && /^[A-Z]{3}-[A-Z]{3}$/.test(pair)
        && typeof price === 'number' && Number.isFinite(price) && price > 0) {
        quotes.set(pair, price);
      }
    });
  } catch {
    // Not the answer expected: no quotes, the caller falls back.
  }
  return quotes;
};

/**
 * Fetch live quotes for several pairs in one request.
 *
 * @param {Array<[string, string]>} pairs - [from, to] currency codes
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=8000]
 * @returns {Promise<Map<string, number>>} "FROM-TO" -> one `from` in `to`
 * @throws {RateSourceError} 'network' when no answer came
 */
export const fetchGoogleQuotes = async (pairs, { timeoutMs = 8000 } = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${GOOGLE_FINANCE_RPC}?rpcids=${QUOTE_RPC}&hl=en`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: buildQuoteRequestBody(pairs),
      signal: controller.signal,
    });
  } catch (error) {
    throw new RateSourceError('network', error?.message || 'Network request failed');
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) throw new RateSourceError('network', `Google Finance responded ${response.status}`);
  return parseQuoteResponse(await response.text());
};
