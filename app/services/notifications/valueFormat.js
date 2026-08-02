/**
 * Value normalization shared by every notification parser.
 *
 * The Ameriabank and Tinkoff parsers each grew their own copy of the amount and
 * date helpers, and user-defined parse templates (see `templateEngine.js`) need
 * exactly the same behaviour. A template built by marking "1 000,50" in a
 * notification must produce the same decimal string the built-in parsers would,
 * or the same charge would book differently depending on which parser handled
 * it — so the logic lives here once and every parser imports it.
 *
 * Everything in this module is pure and string-in/string-out: amounts never
 * become floats (they feed the decimal currency layer directly) and dates are
 * validated against a real calendar rather than trusted.
 */

/**
 * Whitespace variants a notification can carry that are *not* U+0020: no-break
 * space, narrow/thin no-break space, figure space, word joiner, BOM. Banks use
 * them freely as thousands separators ("1 000 ₽").
 *
 * Every entry is a single code unit, so replacing them with a plain space is a
 * 1:1 substitution — character offsets into the text are preserved. The template
 * editor depends on that: it marks fields by offset into the normalized text.
 */
const EXOTIC_SPACES = /[\u00A0\u202F\u2009\u2007\u2060\uFEFF]/g;

/**
 * Normalize a notification string for parsing/marking: exotic spaces become
 * plain spaces, everything else is left untouched (including newlines and the
 * string's length).
 *
 * @param {*} value
 * @returns {string} the normalized string, or '' for a non-string
 */
export const normalizeNotificationText = (value) =>
  (typeof value === 'string' ? value.replace(EXOTIC_SPACES, ' ') : '');

/**
 * Regex *sources* for the value shapes every parser has to recognize.
 *
 * They live here, next to the functions that interpret what they match, so the
 * template engine and the feed's highlighter cannot drift apart on what counts
 * as a number: the highlighter finds a span by scanning for these and comparing
 * the normalized result, and if its idea of a number were looser or tighter than
 * the engine's it would point at the wrong words.
 *
 * Note the amount class allows a plain space but not `\s`: spaces are thousands
 * grouping ("1 000"), while a newline or tab is a field boundary. With `\s` an
 * amount at the end of a line could swallow the number at the start of the next
 * one — the balance line, typically — and normalize to a nonsense value.
 */
export const AMOUNT_VALUE_PATTERN = String.raw`\d[\d .,']*\d|\d`;

/**
 * A currency: a 3-letter ISO code, a colloquial rouble abbreviation, or a
 * symbol. The symbol class excludes the punctuation that tends to be glued to a
 * currency ("1 000 ₽, счет RUB") so a marked or scanned token is the symbol
 * alone rather than the symbol plus its separator.
 */
export const CURRENCY_VALUE_PATTERN = String.raw`[A-Za-z]{3}|руб\.|руб|р\.|[^\s\dA-Za-z.,;:|()]{1,2}`;

/** A numeric date in any part order: 28.06.2026, 2026-06-28, 6/28/26. */
export const DATE_VALUE_PATTERN = String.raw`\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}`;

/** A clock time. */
export const TIME_VALUE_PATTERN = String.raw`\d{1,2}:\d{2}`;

/**
 * Normalize a localized amount string to a plain decimal string.
 *
 * Handles both grouping conventions without corrupting either:
 * - "1,234.56" (comma thousands, dot decimal) -> "1234.56"
 * - "1.234,56" (dot thousands, comma decimal) -> "1234.56"
 * - "12,50"    (comma decimal)                -> "12.50"
 * - "1 000,50" (space thousands)              -> "1000.50"
 *
 * When both separators are present, the one that appears last is the decimal
 * separator and the other is grouping. When only one separator is present it is
 * treated as a decimal point only if it is not a 3-digit group (so "1,234" and
 * "1.234" are read as thousands, while "12,50" is read as a decimal). The result
 * is a string so it feeds straight into the decimal currency layer without ever
 * becoming a lossy float.
 *
 * @param {string} raw - e.g. "3,900.00"
 * @returns {string|null} e.g. "3900.00", or null when no digits are present
 */
export const normalizeAmountString = (raw) => {
  if (!raw) return null;
  // Strip everything that is not a digit or a separator — this also removes the
  // spaces used as thousands grouping and any currency symbol glued to the value.
  let s = String(raw).replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // Comma is the decimal separator: drop dot grouping, comma -> dot.
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Dot is the decimal separator: drop comma grouping.
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      s = s.replace(',', '.'); // single comma, not a 3-digit group -> decimal
    } else {
      s = s.replace(/,/g, ''); // grouping
    }
  } else if (lastDot !== -1) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = s.replace(/\./g, ''); // multiple dots -> grouping
    }
    // single dot -> keep as the decimal point
  }

  return s;
};

/**
 * Whether a normalized amount string is something we are willing to book.
 *
 * Rejects zero and anything that isn't a plain decimal. A zero amount is nearly
 * always a misparse (an anchor that captured the wrong digits) rather than a
 * real charge, and booking it would put a meaningless operation in the ledger.
 *
 * @param {string|null} amount - output of normalizeAmountString
 * @returns {boolean}
 */
export const isBookableAmount = (amount) => {
  if (!amount || !/^\d+(?:\.\d+)?$/.test(amount)) return false;
  return Number(amount) > 0;
};

/** Currency symbol / colloquial abbreviation -> ISO code. */
const SYMBOL_TO_CODE = {
  '₽': 'RUB',
  руб: 'RUB',
  'руб.': 'RUB',
  'р.': 'RUB',
  '֏': 'AMD',
  драм: 'AMD',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₾': 'GEL',
  '₸': 'KZT',
  '₴': 'UAH',
  '₹': 'INR',
  '₺': 'TRY',
};

/**
 * Resolve a currency token (symbol or ISO code) to an ISO code.
 *
 * @param {string} token - e.g. "₽", "руб.", "AMD"
 * @returns {string|null} ISO code, or null when the token isn't a currency
 */
export const currencyCodeFromToken = (token) => {
  if (!token) return null;
  const trimmed = String(token).trim();
  if (!trimmed) return null;
  if (SYMBOL_TO_CODE[trimmed]) return SYMBOL_TO_CODE[trimmed];
  const lower = trimmed.toLowerCase();
  if (SYMBOL_TO_CODE[lower]) return SYMBOL_TO_CODE[lower];
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
};

/**
 * Build an ISO "YYYY-MM-DD" date string from year/month/day numbers.
 *
 * Validates against a real calendar via a UTC round-trip, so impossible dates
 * like 31.02.2026 are rejected (returns null) rather than producing
 * "2026-02-31" — which the operations table would happily store and every date
 * filter would then mis-sort.
 *
 * @param {number|string} year
 * @param {number|string} month - 1-12
 * @param {number|string} day
 * @returns {string|null} ISO date, or null if it is not a real calendar date
 */
export const toIsoDate = (year, month, day) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** Accepted orders for a three-part numeric date. */
export const DATE_ORDERS = ['dmy', 'mdy', 'ymd'];

/**
 * Parse a marked date value ("28.06.2026", "2026-06-28", "6/28/26") into an ISO
 * date.
 *
 * The part order is resolved in this order:
 *   1. A 4-digit first part is always a year (YMD), whatever `order` says.
 *   2. A part greater than 12 can only be the day, so DMY vs MDY is settled by
 *      the data itself.
 *   3. Otherwise the caller's `order` decides (templates default to 'dmy', which
 *      is what both built-in bank parsers see).
 *
 * A 2-digit year is read as 20xx — bank notifications are never about the 1900s.
 *
 * @param {string} value - the marked date text
 * @param {string} [order] - 'dmy' | 'mdy' | 'ymd'
 * @returns {{ date: string, order: string }|null} the ISO date plus the order
 *   actually used, or null when the value isn't a usable date
 */
export const parseDateValue = (value, order = 'dmy') => {
  if (!value) return null;
  const parts = String(value).trim().split(/[.\-/\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  if (!parts.slice(0, 3).every((p) => /^\d{1,4}$/.test(p))) return null;

  const [a, b, c] = parts.slice(0, 3).map(Number);
  const expandYear = (y) => (y < 100 ? 2000 + y : y);

  // A 4-digit leading part is unambiguously a year.
  let resolved = parts[0].length === 4 ? 'ymd' : order;
  // A day-sized part settles DMY vs MDY regardless of the configured order.
  if (resolved !== 'ymd') {
    if (a > 12 && b <= 12) resolved = 'dmy';
    else if (b > 12 && a <= 12) resolved = 'mdy';
  }

  const candidates = {
    dmy: [expandYear(c), b, a],
    mdy: [expandYear(c), a, b],
    ymd: [expandYear(a), b, c],
  };
  const [y, m, d] = candidates[DATE_ORDERS.includes(resolved) ? resolved : 'dmy'];
  const iso = toIsoDate(y, m, d);
  return iso ? { date: iso, order: resolved } : null;
};

/**
 * Normalize a marked time value ("9:05", "21:5") to "HH:MM", or null.
 * @param {string} value
 * @returns {string|null}
 */
export const normalizeTimeValue = (value) => {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};
