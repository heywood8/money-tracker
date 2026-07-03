/**
 * Bank notification parser for the Tinkoff / T-Bank app
 * (`com.idamob.tinkoff.android`).
 *
 * Unlike Ameria's single pipe-delimited line, Tinkoff posts a short Russian
 * notification whose **title is the merchant** and whose **body** carries the
 * kind, amount and account currency, followed by a balance line:
 *
 *   title: МегаФон
 *   text:  Платеж на 1 000 ₽, счет RUB
 *          Баланс 39 000 ₽
 *
 * Field mapping for that example:
 *
 *   | Field           | Example        | Becomes                              |
 *   | --------------- | -------------- | ------------------------------------ |
 *   | kind            | `Платеж`       | operation `type: 'expense'`          |
 *   | amount          | `1 000`        | `amount: '1000'`                     |
 *   | account currency| `счет RUB`     | `currency: 'RUB'` (account matching) |
 *   | merchant        | `МегаФон`      | bound to a **category** (from title) |
 *   | balance         | `Баланс 39 000 ₽` | **ignored**                       |
 *
 * Design notes, and how this differs from the Ameria parser:
 *
 * - **Merchant is the notification title.** Tinkoff puts the counterparty
 *   ("МегаФон") in the title, not the body, so the parser reads it from
 *   `notification.title`.
 * - **No card mask.** This notification format carries no masked card number, so
 *   `cardMask` is null and account resolution falls back to the single
 *   currency-matching account (see resolveNotification). The account currency is
 *   therefore the key account signal, and it is taken from the explicit ISO code
 *   in the "счет RUB" segment — more reliable than mapping the ₽ symbol, and it
 *   names the very account the charge hit. It falls back to the amount's currency
 *   symbol when no "счет" segment is present.
 * - **The balance line is stripped before anything else** so its amount
 *   ("39 000 ₽") can never be mistaken for the transaction amount ("1 000 ₽").
 * - **Russian numerics.** Amounts group with spaces (regular / non-breaking /
 *   narrow / thin) and use a comma decimal separator ("1 000,50"), both handled
 *   by normalizeAmount below.
 * - **No date/time in the body.** The ingestion layer falls back to the
 *   notification's post time, so `date`/`time` are null.
 *
 * `parse` is pure (no side effects) so it can be exhaustively unit-tested and
 * reused regardless of how notifications are ingested.
 *
 * Registered against its source-app package in `bankParsers/index.js`.
 */

/** Android package name(s) this parser handles. */
export const PACKAGE_NAMES = ['com.idamob.tinkoff.android'];

/**
 * Maps a Tinkoff notification "kind" keyword (uppercased, `ё` folded to `е`) to
 * an operation type. Extend this table to support more kinds without touching
 * the parsing logic below.
 *
 * Only kinds that share the "<kind> [на] <amount> <cur>, счет <CUR>" body layout
 * are listed. Transfers ("Перевод") and cash withdrawals ("Снятие") are
 * intentionally omitted for now: their bodies name a counterparty/target account
 * differently and would need target-account binding, so — rather than guess —
 * an unrecognized kind returns null and the notification is skipped.
 */
const KIND_TO_TYPE = {
  ПОКУПКА: 'expense', // card purchase
  ПЛАТЕЖ: 'expense', // payment (folded from ПЛАТЁЖ too)
  ОПЛАТА: 'expense', // payment/bill
  СПИСАНИЕ: 'expense', // direct debit / write-off
  ПОПОЛНЕНИЕ: 'income', // top-up / deposit
  ВОЗВРАТ: 'income', // refund
};

/**
 * Tinkoff expense/income notifications never move money between the user's own
 * accounts (that would be a "Перевод"/"Снятие", which this parser does not yet
 * handle), so no kind is a transfer.
 * @returns {boolean}
 */
export const kindIsTransfer = () => false;

/**
 * No Tinkoff kind here forces a manual category: a purchase/payment carries a
 * real merchant (the title) whose category can be inferred and learned.
 * @returns {boolean}
 */
export const kindRequiresCategory = () => false;

// "1 000 ₽" / "10 $" / "1 000,50 RUB" — a number (space/comma/dot punctuation
// allowed inside it) followed by a currency symbol or 3-letter code. Anchored on
// a leading digit so the "RUB" in "счет RUB" (no number) never matches.
const AMOUNT_CURRENCY_RE =
  /(\d[\d\s.,]*?)\s*(₽|руб\.?|р\.|\$|€|[A-Za-z]{3})/u;

// "счет RUB" / "счёт RUB" — the explicit account currency ISO code.
const ACCOUNT_CURRENCY_RE = /сч[её]т\s+([A-Za-z]{3})\b/iu;

// A masked card number if the notification happens to include one, e.g. "*1234"
// or "•• 5678". Optional — this format usually omits it.
const CARD_MASK_RE = /[*•]{1,4}\s?(\d{4})\b/;

// Currency symbol → ISO code. Anything already a 3-letter code passes through.
const SYMBOL_TO_CODE = {
  '₽': 'RUB',
  руб: 'RUB',
  'руб.': 'RUB',
  'р.': 'RUB',
  $: 'USD',
  '€': 'EUR',
};

/**
 * Resolve a currency token (symbol or code) to an ISO code.
 * @param {string} token
 * @returns {string|null}
 */
const currencyCode = (token) => {
  if (!token) return null;
  const key = token.toLowerCase();
  if (SYMBOL_TO_CODE[token]) return SYMBOL_TO_CODE[token];
  if (SYMBOL_TO_CODE[key]) return SYMBOL_TO_CODE[key];
  if (/^[A-Za-z]{3}$/.test(token)) return token.toUpperCase();
  return null;
};

/**
 * Normalize a Russian-formatted amount string to a plain decimal string.
 *
 * Spaces (regular, non-breaking, narrow, thin) are always thousands grouping and
 * are stripped first. The remaining separators are then read with the same
 * dual-convention logic used elsewhere: when both a dot and a comma are present
 * the later one is the decimal separator; a lone comma that is not a 3-digit
 * group is a decimal separator ("12,50" → "12.50") while a 3-digit group is
 * treated as grouping ("1,234" → "1234").
 *
 * The result is a string so it feeds the decimal currency layer without ever
 * becoming a lossy float.
 *
 * @param {string} raw - e.g. "1 000,50"
 * @returns {string|null} e.g. "1000.50", or null when no digits are present
 */
const normalizeAmount = (raw) => {
  if (!raw) return null;
  // Strip all whitespace (incl. non-breaking / narrow / thin) — grouping only.
  let s = raw.replace(/[\s]/g, '');
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.'); // comma decimal, dot grouping
    } else {
      s = s.replace(/,/g, ''); // dot decimal, comma grouping
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
 * Parse a Tinkoff notification into a normalized transaction descriptor.
 *
 * @param {{ title?: string, text?: string, packageName?: string, postTime?: number }} notification
 * @returns {null | {
 *   kind: string,             // e.g. 'ПЛАТЕЖ'
 *   type: 'expense'|'income', // operation type the kind maps to
 *   amount: string,           // normalized decimal string, e.g. '1000'
 *   currency: string,         // ISO code, e.g. 'RUB' (from "счет RUB")
 *   cardMask: string|null,    // usually null for this format
 *   merchant: string|null,    // e.g. 'МегаФон' (from the title)
 *   country: string|null,     // always null (not present in this format)
 *   date: string|null,        // null — no date in the body; pipeline uses postTime
 *   time: string|null,        // null
 *   requiresCategory: boolean,// false
 *   isTransfer: boolean,      // false
 *   packageName: string|null, // source app, passed through for rule scoping
 *   raw: string,              // the original text, kept for auditing/debugging
 * }}
 */
export const parse = (notification) => {
  if (!notification || typeof notification.text !== 'string') return null;

  const text = notification.text.trim();
  if (!text) return null;

  // 1. Strip the balance line so its amount is never read as the transaction
  //    amount. Everything from the "Баланс" keyword onward is dropped.
  const balanceIdx = text.search(/Баланс/iu);
  const primary = (balanceIdx >= 0 ? text.slice(0, balanceIdx) : text).trim();
  if (!primary) return null;

  // 2. Kind — the first Cyrillic word that is a known kind. Must be present for
  //    us to recognize this as a transaction.
  const words = primary.match(/[А-Яа-яЁё]+/gu) || [];
  let kind = null;
  let type = null;
  for (const word of words) {
    const normalized = word.toUpperCase().replace(/Ё/g, 'Е');
    if (KIND_TO_TYPE[normalized]) {
      kind = normalized;
      type = KIND_TO_TYPE[normalized];
      break;
    }
  }
  if (!kind) return null;

  // 3. Amount + currency — required; without it there's nothing to record.
  const amountMatch = primary.match(AMOUNT_CURRENCY_RE);
  if (!amountMatch) return null;
  const amount = normalizeAmount(amountMatch[1]);
  if (!amount) return null;

  // 4. Currency — prefer the explicit account ISO code ("счет RUB"), since with
  //    no card mask the account is matched by currency; fall back to the amount's
  //    symbol/code.
  const accountCurrencyMatch = primary.match(ACCOUNT_CURRENCY_RE);
  const currency = accountCurrencyMatch
    ? accountCurrencyMatch[1].toUpperCase()
    : currencyCode(amountMatch[2]);
  if (!currency) return null;

  // 5. Card mask — optional; usually absent in this format.
  const cardSegment = primary.match(CARD_MASK_RE);
  const cardMask = cardSegment ? cardSegment[0].replace(/\s/g, '') : null;

  // 6. Merchant — the notification title (the counterparty). Bound to a category.
  const merchant =
    typeof notification.title === 'string' && notification.title.trim()
      ? notification.title.trim()
      : null;

  return {
    kind,
    type,
    amount,
    currency,
    cardMask,
    merchant,
    country: null,
    // No date/time in the Tinkoff body — the ingestion layer falls back to the
    // notification's post time.
    date: null,
    time: null,
    requiresCategory: false,
    isTransfer: false,
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
