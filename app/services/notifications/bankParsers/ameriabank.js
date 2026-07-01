/**
 * Bank notification parser for the Ameriabank app (`com.banqr.ameriabank`).
 *
 * Ameria posts each card event as a single pipe-delimited "ARCA transaction"
 * line. Five kinds are recognized today:
 *
 *   PURCHASE                | 3,900.00 AMD  | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD
 *   E-POS PURCHASE          | 129.99 EUR    | 4083***7027, | Nike ES, ES         | 29.06.2026 15:14 | BALANCE: 27,608.20 AMD
 *   C2C                     | 19,200.00 AMD | 4083***7027, | TO: N. DORVANYAN | AMERIABANK API GATE, AM | 28.06.2026 16:23 | BALANCE: 106,819.97 AMD
 *   PRE-PURCHASE COMPLETION | 2,800.00 AMD  | 4083***7027, | YANDEX.GO, AM | 30.06.2026 13:51 | BALANCE: 19,095.20 AMD
 *   DEBIT ACCOUNT           | 7,500.00 AMD  | 4083***7027, | AMERIABANK API GATE, AM | 01.07.2026 12:02 | BALANCE: 104,320.20 AMD
 *   ATM CASH                | 200,000.00 AMD| 4083***7027, | ATM 401 REPUBLIC 67/1, AM | 01.07.2026 09:13 | BALANCE: 111,820.20 AMD
 *
 * DEBIT ACCOUNT is a direct debit routed through the bank's API gateway (its
 * merchant segment is the generic "AMERIABANK API GATE"). Like C2C, that generic
 * counterparty covers many unrelated debits, so its category can never be inferred
 * or learned — it is always reviewed manually (see KINDS_REQUIRING_CATEGORY).
 *
 * ATM CASH is a cash withdrawal: money leaves the card account and becomes
 * physical cash. It is therefore a *transfer* (type 'transfer', see TRANSFER_KINDS)
 * from the card account to a "cash" account rather than an expense. It has no
 * category; instead it needs a target (cash) account, which the user binds the
 * first time one is reviewed and which is remembered for future withdrawals.
 *
 * PRE-PURCHASE (the initial authorization hold) is intentionally ignored —
 * PRE-PURCHASE COMPLETION is the actual settled charge, so recording both
 * would create duplicate entries for the same transaction.
 *
 * Note the E-POS PURCHASE example: the transaction is charged in EUR while the
 * card account is in AMD. The parser reports the transaction currency as-is
 * (EUR); converting to the account currency is the ingestion layer's job.
 *
 * The `parse` function is *pure* (no side effects) so it can be exhaustively
 * unit-tested and reused regardless of how notifications are ingested (polling,
 * native events, manual paste).
 *
 * Design notes:
 * - Parsing is pattern-based, not strictly positional. Each pipe segment is
 *   classified by what it looks like (amount+currency, card mask, merchant,
 *   date/time, balance) so a reordered or slightly different layout still
 *   parses. The balance segment is deliberately ignored.
 * - Unrecognized text returns `null` so callers can cheaply skip the flood of
 *   non-transaction notifications the listener also sees.
 *
 * This module is registered against its source-app package in
 * `bankParsers/index.js`. Other banks get their own parser module with their own
 * patterns; nothing here is shared by assumption.
 */

/** Android package name(s) this parser handles. */
export const PACKAGE_NAMES = ['com.banqr.ameriabank'];

/**
 * Maps a notification "kind" keyword to an operation type. Extend this table to
 * support more notification kinds (e.g. REFUND -> income) without touching the
 * parsing logic below.
 *
 * C2C is a client-to-client transfer (money sent to another person). It is an
 * expense like a purchase, but unlike a merchant purchase its category cannot be
 * inferred — see KINDS_REQUIRING_CATEGORY below.
 */
const KIND_TO_TYPE = {
  PURCHASE: 'expense',
  // Card-not-present / online point-of-sale purchase (e.g. a webshop). Behaves
  // exactly like an in-store PURCHASE: a merchant expense whose category can be
  // inferred from learned rules. Often charged in a foreign currency.
  'E-POS PURCHASE': 'expense',
  C2C: 'expense',
  // Settlement of a prior PRE-PURCHASE authorization hold. The final charged
  // amount may differ from the hold (e.g. a taxi fare calculated after the ride).
  // PRE-PURCHASE itself is intentionally omitted to avoid duplicate entries.
  'PRE-PURCHASE COMPLETION': 'expense',
  // Direct debit routed through the bank's API gateway. An expense whose
  // counterparty ("AMERIABANK API GATE") is generic across many unrelated
  // debits, so — like C2C — its category cannot be inferred or learned. See
  // KINDS_REQUIRING_CATEGORY below.
  'DEBIT ACCOUNT': 'expense',
  // Cash withdrawal at an ATM. The money doesn't leave the user's net worth —
  // it moves from the card account into physical cash — so it is modelled as a
  // transfer, not an expense. Its destination is a "cash" account the user binds
  // once (see TRANSFER_KINDS).
  'ATM CASH': 'transfer',
};

const KNOWN_KINDS = Object.keys(KIND_TO_TYPE);

/**
 * Kinds that move money between the user's own accounts (operation type
 * 'transfer') rather than in or out of them. A transfer needs a *target* account
 * instead of a category: an ATM withdrawal goes from the card account to a cash
 * account. The target is bound on first review and reused thereafter.
 */
const TRANSFER_KINDS = new Set(['ATM CASH']);

/**
 * Whether a notification kind maps to a transfer between the user's own accounts.
 * @param {string} kind
 * @returns {boolean}
 */
export const kindIsTransfer = (kind) =>
  TRANSFER_KINDS.has(String(kind || '').toUpperCase());

/**
 * Kinds whose category must always be chosen by the user instead of being
 * inferred from learned merchant rules. A client-to-client transfer goes to the
 * same counterparty (a friend) for many different reasons, so any single learned
 * category would be wrong as often as right. A DEBIT ACCOUNT is a direct debit
 * whose merchant is the generic "AMERIABANK API GATE" gateway, which likewise
 * spans many unrelated debits. These always land in the review queue with the
 * category left blank, and no merchant rule is ever learned for them.
 */
const KINDS_REQUIRING_CATEGORY = new Set(['C2C', 'DEBIT ACCOUNT']);

/**
 * Whether a notification kind must always have its category chosen manually.
 * @param {string} kind
 * @returns {boolean}
 */
export const kindRequiresCategory = (kind) =>
  KINDS_REQUIRING_CATEGORY.has(String(kind || '').toUpperCase());

// "TO: N. DORVANYAN" — a leading recipient label on C2C transfer segments. The
// descriptive part (the recipient) is what we keep as the merchant.
const RECIPIENT_LABEL_RE = /^(?:TO|FROM)\s*:\s*/i;

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
 * Handles both grouping conventions without corrupting either:
 * - "1,234.56" (comma thousands, dot decimal) -> "1234.56"
 * - "1.234,56" (dot thousands, comma decimal) -> "1234.56"
 * - "12,50" (comma decimal)                   -> "12.50"
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
const normalizeAmount = (raw) => {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,]/g, '');
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
 * Convert "DD.MM.YYYY" to an ISO "YYYY-MM-DD" date string.
 *
 * Validates against a real calendar via a UTC round-trip, so impossible dates
 * like "31.02.2026" are rejected (returns null) rather than producing
 * "2026-02-31".
 *
 * @param {string} day
 * @param {string} month
 * @param {string} year
 * @returns {string|null} ISO date, or null if the date is not a real calendar date
 */
const toIsoDate = (day, month, year) => {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
};

/**
 * Parse an Ameriabank notification into a normalized transaction descriptor.
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
 *   requiresCategory: boolean,// true when the category must be chosen manually (C2C, DEBIT ACCOUNT)
 *   isTransfer: boolean,      // true when the kind moves money between own accounts (ATM CASH)
 *   packageName: string|null, // source app, passed through for rule scoping
 *   raw: string,              // the original text, kept for auditing/debugging
 * }}
 */
export const parse = (notification) => {
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

  // 4. Date / time — pull from whichever segment carries a *valid* date. Keep
  //    scanning if a segment's date is impossible (e.g. 31.02.2026) so a valid
  //    date elsewhere is still found.
  let date = null;
  let time = null;
  for (const segment of segments) {
    const match = segment.match(DATE_TIME_RE);
    if (match) {
      const iso = toIsoDate(match[1], match[2], match[3]);
      if (iso) {
        date = iso;
        time = match[4] || null;
        break;
      }
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
    // Strip a "TO:"/"FROM:" recipient label so a C2C transfer descriptor keeps
    // just the counterparty's name as its merchant/description.
    candidate = candidate.replace(RECIPIENT_LABEL_RE, '').trim();
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
    // C2C transfers and DEBIT ACCOUNT debits must always be reviewed so the user
    // picks the category (their counterparty is too generic to learn a rule from).
    requiresCategory: kindRequiresCategory(kind),
    // ATM CASH is a transfer between the user's own accounts (card -> cash), so it
    // needs a target account rather than a category.
    isTransfer: kindIsTransfer(kind),
    packageName: notification.packageName || null,
    raw: text,
  };
};

export default {
  packageNames: PACKAGE_NAMES,
  parse,
  kindRequiresCategory,
  kindIsTransfer,
};
