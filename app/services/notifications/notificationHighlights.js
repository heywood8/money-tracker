/**
 * Locating the parsed parts of a notification inside its own text.
 *
 * The notification feed shows the raw message the listener captured. For the
 * ones Penny understands, the interesting question a reader has is *why* — which
 * words made it a 3,900 AMD purchase at GURMAN. This module answers that by
 * finding, in the original text, the spans the descriptor was built from, so the
 * card can tint them in place.
 *
 * It works by locating values rather than by asking the parser where it looked.
 * Each built-in parser finds its fields differently (Ameria classifies pipe
 * segments, Tinkoff cuts at a balance keyword) and none of them tracks offsets;
 * threading positions through all of them would be a lot of machinery for a
 * display concern. Searching for the value that came out is parser-agnostic, so
 * a new bank parser gets highlighting for free.
 *
 * Locating is done by *meaning*, not by string equality, wherever the two can
 * differ:
 *   - "3,900.00" and "3900.00" are the same amount, so candidate numbers are
 *     normalized before they are compared. That is also what keeps the balance
 *     line from being highlighted: it normalizes to a different number.
 *   - "28.06.2026" and "2026-06-28" are the same date, so candidates are parsed
 *     before they are compared.
 *   - "₽" and "RUB" are the same currency.
 *
 * A field that cannot be found is simply not highlighted — this is decoration,
 * and it must never be able to break the card that carries it.
 */

import {
  AMOUNT_VALUE_PATTERN,
  CURRENCY_VALUE_PATTERN,
  DATE_VALUE_PATTERN,
  TIME_VALUE_PATTERN,
  currencyCodeFromToken,
  normalizeAmountString,
  normalizeNotificationText,
  normalizeTimeValue,
  parseDateValue,
} from './valueFormat';
import { findTemplateByKind } from './customTemplates';

/** Fields worth pointing at, in the order ties are resolved. */
export const HIGHLIGHT_FIELDS = ['kind', 'amount', 'currency', 'merchant', 'card', 'date', 'time'];

// Built from the shared sources so the highlighter's idea of "a number" is
// exactly the engine's — otherwise it would point at spans the parser never read.
const AMOUNT_SCAN = new RegExp(AMOUNT_VALUE_PATTERN, 'g');
const CURRENCY_SCAN = new RegExp(CURRENCY_VALUE_PATTERN, 'g');
const DATE_SCAN = new RegExp(DATE_VALUE_PATTERN, 'g');
const TIME_SCAN = new RegExp(TIME_VALUE_PATTERN, 'g');

/**
 * Fold the spelling differences that stop a kind keyword from being found
 * literally: Tinkoff's kinds are stored uppercased with `ё` folded to `е`, but
 * the notification says "Платёж".
 * @param {string} value
 * @returns {string}
 */
const foldKind = (value) => String(value || '').toLowerCase().replace(/ё/g, 'е');

/**
 * Every match of a scanning regex, as ranges.
 * @param {string} text
 * @param {RegExp} regex - must carry the `g` flag
 * @returns {Array<{ start: number, end: number, value: string }>}
 */
const scan = (text, regex) => {
  const out = [];
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    out.push({ start: match.index, end: match.index + match[0].length, value: match[0] });
    if (regex.lastIndex === match.index) regex.lastIndex += 1;
    match = regex.exec(text);
  }
  return out;
};

/**
 * Find a literal substring, preferring an exact-case hit over a loose one.
 * @param {string} text
 * @param {string} needle
 * @returns {{ start: number, end: number }|null}
 */
const findLiteral = (text, needle) => {
  const value = String(needle || '');
  if (!value) return null;
  let index = text.indexOf(value);
  if (index === -1) index = text.toLowerCase().indexOf(value.toLowerCase());
  if (index === -1) return null;
  return { start: index, end: index + value.length };
};

/**
 * Find the kind keyword ("PURCHASE", "Платёж") that classified the notification.
 *
 * A descriptor from a user template carries the *template's name* as its kind,
 * which is not text that appears in the message — its trigger words are. So a
 * template's descriptor highlights the triggers instead, which is the same
 * thing: the words that made this template claim the notification.
 *
 * @param {string} text
 * @param {Object} descriptor
 * @returns {Array<{ start: number, end: number }>}
 */
const findKindRanges = (text, descriptor) => {
  const template = descriptor.templateId
    ? findTemplateByKind(descriptor.kind, descriptor.packageName)
    : null;
  const needles = template
    ? (template.triggers || [])
    : [descriptor.kind];

  const folded = foldKind(text);
  const ranges = [];
  needles.forEach((needle) => {
    const key = foldKind(needle);
    if (!key) return;
    const index = folded.indexOf(key);
    if (index !== -1) ranges.push({ start: index, end: index + key.length });
  });
  return ranges;
};

/**
 * Locate every parsed field within one string.
 *
 * @param {string} text - already whitespace-normalized
 * @param {Object} descriptor - a parsed notification descriptor
 * @param {Set<string>} claimed - fields already located in another string
 * @returns {Array<{ start: number, end: number, field: string }>}
 */
const locateIn = (text, descriptor, claimed) => {
  if (!text) return [];
  const found = [];
  const add = (field, range) => {
    if (!range || claimed.has(field)) return;
    if (range.end <= range.start) return;
    claimed.add(field);
    found.push({ ...range, field });
  };

  // A template can have several trigger words, and all of them are what made it
  // claim the notification — so they are all highlighted, but the field is
  // claimed once, so a later string doesn't hunt for them again.
  const kindRanges = findKindRanges(text, descriptor);
  if (kindRanges.length > 0 && !claimed.has('kind')) {
    claimed.add('kind');
    kindRanges.forEach((range) => found.push({ ...range, field: 'kind' }));
  }

  // Amount: compare normalized values, so "3,900.00" is found for "3900.00" and
  // the balance line (a different number) never is.
  let amountRange = null;
  if (descriptor.amount) {
    amountRange = scan(text, AMOUNT_SCAN)
      .find((candidate) => normalizeAmountString(candidate.value) === descriptor.amount) || null;
    add('amount', amountRange);
  }

  // Currency: the occurrence nearest after the amount, since a notification that
  // also prints a balance prints its currency twice.
  if (descriptor.currency) {
    const after = amountRange ? amountRange.end : 0;
    const candidates = scan(text, CURRENCY_SCAN)
      .filter((candidate) => currencyCodeFromToken(candidate.value) === descriptor.currency);
    add('currency', candidates.find((c) => c.start >= after) || candidates[0] || null);
  }

  if (descriptor.merchant) add('merchant', findLiteral(text, descriptor.merchant));
  if (descriptor.cardMask) add('card', findLiteral(text, descriptor.cardMask));

  if (descriptor.date) {
    const match = scan(text, DATE_SCAN).find((candidate) => {
      const parsed = parseDateValue(candidate.value);
      return parsed && parsed.date === descriptor.date;
    });
    add('date', match || null);
  }

  if (descriptor.time) {
    const match = scan(text, TIME_SCAN)
      .find((candidate) => normalizeTimeValue(candidate.value) === descriptor.time);
    add('time', match || null);
  }

  return found;
};

/**
 * Drop overlapping ranges and sort what's left.
 *
 * Overlaps are real: a currency symbol glued to an amount, a merchant string
 * that happens to contain the card number. The earlier-claimed field wins, which
 * follows HIGHLIGHT_FIELDS order via the order `locateIn` adds them in.
 *
 * @param {Array<{ start: number, end: number, field: string }>} ranges
 * @returns {Array<{ start: number, end: number, field: string }>}
 */
const resolveOverlaps = (ranges) => {
  const kept = [];
  ranges.forEach((range) => {
    const clashes = kept.some((other) => range.start < other.end && other.start < range.end);
    if (!clashes) kept.push(range);
  });
  return kept.sort((a, b) => a.start - b.start);
};

/**
 * The spans of a notification that produced its parsed descriptor.
 *
 * @param {{ title?: string, text?: string }} notification
 * @param {Object|null} descriptor - from parseBankNotification
 * @returns {{ title: Array, text: Array }} ranges per source string, each
 *   `{ start, end, field }`, non-overlapping and in document order
 */
export const notificationHighlights = (notification, descriptor) => {
  const empty = { title: [], text: [] };
  if (!notification || !descriptor) return empty;
  const title = normalizeNotificationText(notification.title);
  const text = normalizeNotificationText(notification.text);

  // The body is searched first so a field present in both (a merchant repeated
  // in the title, say) is pointed at where the parser would have read it.
  const claimed = new Set();
  const textRanges = resolveOverlaps(locateIn(text, descriptor, claimed));
  const titleRanges = resolveOverlaps(locateIn(title, descriptor, claimed));
  return { title: titleRanges, text: textRanges };
};

/**
 * Cut a string into consecutive segments, flagging which are highlighted.
 *
 * Returned as segments rather than as ranges so the renderer stays trivial: map
 * to nested <Text> elements and inline flow does the rest — no measuring, and
 * line wrapping is unaffected.
 *
 * @param {string} text - the ORIGINAL string (offsets are 1:1 with the
 *   normalized one, so slicing it here is safe)
 * @param {Array<{ start: number, end: number, field: string }>} ranges
 * @returns {Array<{ text: string, field: string|null }>}
 */
export const segmentHighlights = (text, ranges) => {
  const source = typeof text === 'string' ? text : '';
  if (!source) return [];
  const list = Array.isArray(ranges) ? ranges : [];
  if (list.length === 0) return [{ text: source, field: null }];

  const segments = [];
  let cursor = 0;
  list.forEach((range) => {
    const start = Math.max(cursor, Math.min(range.start, source.length));
    const end = Math.max(start, Math.min(range.end, source.length));
    if (start > cursor) segments.push({ text: source.slice(cursor, start), field: null });
    if (end > start) segments.push({ text: source.slice(start, end), field: range.field });
    cursor = Math.max(cursor, end);
  });
  if (cursor < source.length) segments.push({ text: source.slice(cursor), field: null });
  return segments;
};
