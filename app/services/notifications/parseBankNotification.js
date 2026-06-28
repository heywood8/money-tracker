/**
 * Bank notification parser.
 *
 * Banking apps post transaction notifications as a single pipe-delimited line,
 * e.g. the Ameria "ARCA transaction" notification:
 *
 *   title: АРКА транзакции
 *   text:  PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD
 *
 * This module turns that raw text into a structured, normalized object that the
 * rest of the app can map onto an operation. It is a *pure* function with no
 * side effects so it can be exhaustively unit-tested and reused regardless of
 * how notifications are ingested (polling, native events, manual paste).
 *
 * Design notes:
 * - Parsing is pattern-based, not strictly positional. Each pipe segment is
 *   classified by what it looks like (amount+currency, card mask, merchant,
 *   date/time, balance) so a reordered or slightly different layout still
 *   parses. The balance segment is deliberately ignored.
 * - Unrecognized text returns `null` so callers can cheaply skip the flood of
 *   non-transaction notifications the listener also sees.
 */

/**
 * Maps a notification "kind" keyword to an operation type. Extend this table to
 * support more notification kinds (e.g. REFUND -> income) without touching the
 * parsing logic below.
 */
const KIND_TO_TYPE = {
  PURCHASE: 'expense',
};

const KNOWN_KINDS = Object.keys(KIND_TO_TYPE);

// "3,900.00 AMD" — amount with optional thousands separators followed by a
// 3-letter currency code, anchored so "BALANCE: 133,719.97 AMD" never matches.
const AMOUNT_CURRENCY_RE = /^([\d.,]+)\s+([A-Z]{3})$/;

// "4083***7027" — a masked card number (4 digits, asterisks, 4 digits).
const CARD_MASK_RE = /\d{2,6}\*{2,}\d{2,6}/;

// "28.06.2026 10:15" — DD.MM.YYYY with an optional HH:MM time.
const DATE_TIME_RE = /\b(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?\b/;

// A trailing ", AM" style ISO-3166 alpha-2 country code on the merchant segment.
const TRAILING_COUNTRY_RE = /,\s*([A-Z]{2})\s*$/;

/**
 * Normalize a localized amount string to a plain decimal string.
 *
 * Handles the common "1,234.56" grouping (comma thousands, dot decimal). The
 * result is a string so it can be fed straight into the decimal-based currency
 * layer without ever becoming a lossy float.
 *
 * @param {string} raw - e.g. "3,900.00"
 * @returns {string|null} e.g. "3900.00", or null when no digits are present
 */
const normalizeAmount = (raw) => {
  if (!raw) return null;
  // Strip everything except digits, dots and commas, then drop comma group
  // separators. (This bank uses "." as the decimal separator.)
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/,/g, '');
  if (!/\d/.test(cleaned)) return null;
  return cleaned;
};

/**
 * Convert "DD.MM.YYYY" to an ISO "YYYY-MM-DD" date string.
 *
 * @param {string} day
 * @param {string} month
 * @param {string} year
 * @returns {string|null} ISO date, or null if the components are out of range
 */
const toIsoDate = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${month}-${day}`;
};

/**
 * Parse a captured bank notification into a normalized transaction descriptor.
 *
 * @param {{ title?: string, text?: string, packageName?: string, postTime?: number }} notification
 * @returns {null | {
 *   kind: string,             // e.g. 'PURCHASE'
 *   type: 'expense'|'income', // operation type the kind maps to
 *   amount: string,           // normalized decimal string, e.g. '3900.00'
 *   currency: string,         // ISO code, e.g. 'AMD'
 *   cardMask: string|null,    // e.g. '4083***7027'
 *   merchant: string|null,    // e.g. 'NAREK MEHRABYAN'
 *   country: string|null,     // ISO alpha-2, e.g. 'AM'
 *   date: string|null,        // 'YYYY-MM-DD'
 *   time: string|null,        // 'HH:MM'
 *   packageName: string|null, // source app, passed through for rule scoping
 *   raw: string,              // the original text, kept for auditing/debugging
 * }}
 */
export const parseBankNotification = (notification) => {
  if (!notification || typeof notification.text !== 'string') return null;

  const text = notification.text.trim();
  if (!text) return null;

  const segments = text
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  // 1. Kind — must be present for us to recognize this as a transaction.
  const kindSegment = segments.find((segment) =>
    KNOWN_KINDS.includes(segment.toUpperCase()),
  );
  if (!kindSegment) return null;
  const kind = kindSegment.toUpperCase();
  const type = KIND_TO_TYPE[kind];

  // 2. Amount + currency — required; without it there's nothing to record.
  let amount = null;
  let currency = null;
  for (const segment of segments) {
    const match = segment.match(AMOUNT_CURRENCY_RE);
    if (match) {
      amount = normalizeAmount(match[1]);
      currency = match[2];
      break;
    }
  }
  if (!amount || !currency) return null;

  // 3. Card mask — optional but the key to account binding.
  const cardSegment = segments.find((segment) => CARD_MASK_RE.test(segment));
  const cardMask = cardSegment
    ? (cardSegment.match(CARD_MASK_RE) || [null])[0]
    : null;

  // 4. Date / time — pull from whichever segment carries it.
  let date = null;
  let time = null;
  for (const segment of segments) {
    const match = segment.match(DATE_TIME_RE);
    if (match) {
      date = toIsoDate(match[1], match[2], match[3]);
      time = match[4] || null;
      break;
    }
  }

  // 5. Merchant + country — the descriptive segment that is none of the above.
  //    It carries letters, isn't the kind, balance, card, amount or date.
  let merchant = null;
  let country = null;
  for (const segment of segments) {
    if (segment === kindSegment || segment === cardSegment) continue;
    if (/^BALANCE\b/i.test(segment)) continue;
    if (AMOUNT_CURRENCY_RE.test(segment)) continue;
    if (DATE_TIME_RE.test(segment)) continue;
    if (!/[A-Za-zÀ-ɏЀ-ӿ]/.test(segment)) continue;

    let candidate = segment;
    const countryMatch = candidate.match(TRAILING_COUNTRY_RE);
    if (countryMatch) {
      country = countryMatch[1];
      candidate = candidate.replace(TRAILING_COUNTRY_RE, '').trim();
    }
    candidate = candidate.replace(/,\s*$/, '').trim();
    if (candidate) {
      merchant = candidate;
      break;
    }
  }

  return {
    kind,
    type,
    amount,
    currency,
    cardMask,
    merchant,
    country,
    date,
    time,
    packageName: notification.packageName || null,
    raw: text,
  };
};

export default parseBankNotification;
