/**
 * User-defined parse templates — the matching engine.
 *
 * The built-in parsers in `bankParsers/` are hand-written for one bank each.
 * This module is what lets a user teach Penny a *new* bank (or any app that
 * posts money notifications) without a code change: they mark, in one captured
 * notification, which part is the amount, which is the payee, and so on, and the
 * marks become a template that recognizes every future notification of that
 * shape.
 *
 * ## Why anchors and not offsets
 *
 * The naive encoding of "the amount is here" is a character range. It is also
 * useless: the very next notification has a different number of digits and every
 * offset after the amount has shifted. So a marked span is stored as the literal
 * text *around* it — a `before` and `after` anchor — plus what shape the value
 * itself has. "Платеж на ⟨1 000⟩ ₽" becomes "after the words 'Платеж на', take a
 * number, and expect ' ₽' behind it".
 *
 * Anchors are templated rather than literal: every run of digits inside one
 * becomes `\d+`. Without that, marking the payee in
 * "PURCHASE | 3,900.00 AMD | 4083***7027, | GURMAN" would bake that exact card
 * number into the anchor and the template would match nothing else.
 *
 * ## Why the anchors are grown, not guessed
 *
 * `deriveFieldRule` does not pick an anchor length. It starts with no anchor at
 * all, compiles the rule, runs it against the sample, and grows the anchor one
 * token at a time until the rule extracts *exactly* the span the user marked.
 * The result is the shortest anchor that is unambiguous on the sample — long
 * enough to be correct, short enough to survive the parts of the message that
 * vary. A rule that cannot be disambiguated within the token budget falls back
 * to remembering which occurrence was marked.
 *
 * This is also why the editor can highlight what a template *actually* extracts
 * rather than what the user tapped: the highlight is `extractField`'s output, so
 * a template that would grab the balance line instead of the charge shows that
 * before it is ever saved.
 *
 * Everything here is pure — no DB, no I/O — so the whole matching surface is
 * unit-testable and can run inside a synchronous render (the notification feed
 * parses every card as it draws it).
 */

import {
  AMOUNT_VALUE_PATTERN,
  CURRENCY_VALUE_PATTERN,
  DATE_VALUE_PATTERN,
  TIME_VALUE_PATTERN,
  currencyCodeFromToken,
  isBookableAmount,
  normalizeAmountString,
  normalizeNotificationText,
  normalizeTimeValue,
  parseDateValue,
} from './valueFormat';

/** The fields a template can extract. `amount` is the only mandatory one. */
export const TEMPLATE_FIELDS = ['amount', 'currency', 'merchant', 'card', 'date', 'time'];

/** Which part of the notification a field is marked in. */
export const FIELD_SOURCES = ['title', 'text'];

/** Operation types a custom template may produce (see the module notes in
 * `customTemplates.js` for why transfers stay built-in-only). */
export const TEMPLATE_TYPES = ['expense', 'income'];

/**
 * How many whitespace-separated tokens an anchor may grow to on each side.
 * Four is well past what any real notification needs to be unambiguous (two is
 * typical), and it bounds the derivation search at 5x5 compile-and-test rounds.
 */
export const MAX_ANCHOR_TOKENS = 4;

/**
 * Longest notification we will run a template against. Real notifications are a
 * line or two; anything this long is a digest/summary that no per-transaction
 * template should be matching, and the cap keeps a pathological anchor from
 * scanning a huge string on every feed render.
 */
const MAX_TEXT_LENGTH = 4000;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turn a literal chunk of notification text into a regex source that tolerates
 * the ways that chunk legitimately varies between notifications:
 *   - a run of digits becomes `\d+` (card numbers, amounts, dates inside anchors)
 *   - a run of whitespace becomes `\s+` (single vs double space, newline vs space)
 *   - everything else is matched literally
 *
 * @param {string} value
 * @returns {string} regex source (never anchored)
 */
export const templatePattern = (value) => {
  const text = String(value || '');
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\d/.test(ch)) {
      while (i < text.length && /\d/.test(text[i])) i += 1;
      out += '\\d+';
    } else if (/\s/.test(ch)) {
      while (i < text.length && /\s/.test(text[i])) i += 1;
      out += '\\s+';
    } else {
      out += escapeRegex(ch);
      i += 1;
    }
  }
  return out;
};

// A payee/merchant runs to the end of its field. A pipe is a delimiter in every
// pipe-formatted notification we've seen, and a newline always ends a field.
const MERCHANT_PATTERN_BOUNDED = String.raw`[^\n|]+?`;
const MERCHANT_PATTERN_OPEN = String.raw`[^\n|]+`;

/**
 * The regex source matching a field's *value*.
 *
 * Amount, currency and time have fixed shapes. Card masks and dates are far too
 * varied across banks to pin down generically ("4083***7027", "•• 5678",
 * "28.06.2026", "2026-06-28"), so their pattern is derived from the shape of the
 * value the user actually marked — digits generalized, punctuation kept exact.
 *
 * @param {{ kind: string, value?: string }} rule
 * @param {boolean} bounded - whether a non-empty `after` anchor follows
 * @returns {string} regex source
 */
const valuePattern = (rule, bounded) => {
  switch (rule.kind) {
  case 'amount':
    return AMOUNT_VALUE_PATTERN;
  case 'currency':
    return CURRENCY_VALUE_PATTERN;
  case 'time':
    return TIME_VALUE_PATTERN;
  case 'merchant':
    return bounded ? MERCHANT_PATTERN_BOUNDED : MERCHANT_PATTERN_OPEN;
  case 'card':
  case 'date':
  default:
    // Shape of the marked sample: "4083***7027" -> \d+\*\*\*\d+.
    return templatePattern(rule.value || '') || String.raw`\S+`;
  }
};

/**
 * Compile a field rule into a regex.
 *
 * The anchors are groups rather than inline text so the caller can recover the
 * value's exact offsets (group 1's length is the prefix width). The trailing
 * anchor is a lookahead so it never consumes characters — two fields whose
 * anchors overlap can both match, and a global scan can't skip an occurrence.
 *
 * @param {Object} rule
 * @returns {RegExp|null} a global regex, or null when the rule is unusable
 */
export const compileFieldRule = (rule) => {
  if (!rule || !rule.kind) return null;
  const before = templatePattern(rule.before || '');
  const after = templatePattern(rule.after || '');
  const value = valuePattern(rule, after.length > 0);
  if (!value) return null;
  try {
    return new RegExp(`(${before})((?:${value}))${after ? `(?=${after})` : ''}`, 'g');
  } catch (error) {
    // A stored rule can only fail to compile if it was hand-edited or restored
    // from a corrupt backup; treat it as "matches nothing" rather than throwing
    // out of a render.
    return null;
  }
};

/**
 * Run a compiled rule over a string and return every value occurrence it finds.
 *
 * @param {string} text
 * @param {RegExp} regex - from compileFieldRule (must carry the `g` flag)
 * @returns {Array<{ start: number, end: number, value: string }>}
 */
const allMatches = (text, regex) => {
  const results = [];
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    const start = match.index + match[1].length;
    results.push({ start, end: start + match[2].length, value: match[2] });
    // A zero-width match would spin forever; step past it.
    if (regex.lastIndex === match.index) regex.lastIndex += 1;
    match = regex.exec(text);
  }
  return results;
};

/**
 * Extract one field from a notification.
 *
 * @param {{ title?: string, text?: string }} notification
 * @param {Object} rule - { source, kind, before, after, value, occurrence }
 * @returns {{ start: number, end: number, value: string }|null}
 */
export const extractField = (notification, rule) => {
  if (!notification || !rule) return null;
  const raw = rule.source === 'title' ? notification.title : notification.text;
  const text = normalizeNotificationText(raw);
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  const regex = compileFieldRule(rule);
  if (!regex) return null;
  const matches = allMatches(text, regex);
  if (matches.length === 0) return null;
  // `occurrence` is only ever non-zero when the anchors alone could not single
  // out the marked span (see deriveFieldRule). Clamp rather than fail: a shorter
  // notification with fewer occurrences should still yield its last one.
  const index = Math.min(rule.occurrence || 0, matches.length - 1);
  return matches[index];
};

// ── Span refinement ───────────────────────────────────────────────────────────

// Trim a merchant span down to its meaningful text: field delimiters and the
// punctuation that separates segments are never part of a payee's name.
const MERCHANT_TRIM = /^[\s|,;:.–—-]+|[\s|,;:–—-]+$/g;

const KIND_SPAN_PATTERNS = {
  amount: new RegExp(AMOUNT_VALUE_PATTERN),
  currency: new RegExp(CURRENCY_VALUE_PATTERN),
  time: new RegExp(TIME_VALUE_PATTERN),
  date: new RegExp(DATE_VALUE_PATTERN),
  card: /[\d*•·xX]{2,}(?:\s?[\d*•·xX]{2,})*/,
};

/**
 * Tighten a user-marked span to the part of it that is actually the value.
 *
 * The editor marks whole tokens, because tapping a chip is reliable where
 * dragging a text selection is not. That means a tap on "1 000,50," hands us the
 * trailing comma too, and a tap on "₽," hands us a symbol glued to punctuation.
 * Refining per kind makes the tap forgiving without making the stored rule
 * sloppy: what gets anchored is the value, not the user's aim.
 *
 * @param {string} text - normalized notification text
 * @param {{ start: number, end: number }} span
 * @param {string} kind
 * @returns {{ start: number, end: number, value: string }|null}
 */
export const refineSpan = (text, span, kind) => {
  if (!text || !span) return null;
  const start = Math.max(0, Math.min(span.start, text.length));
  const end = Math.max(start, Math.min(span.end, text.length));
  const slice = text.slice(start, end);
  if (!slice.trim()) return null;

  const pattern = KIND_SPAN_PATTERNS[kind];
  if (pattern) {
    const match = slice.match(pattern);
    if (!match) return null;
    const offset = start + match.index;
    return { start: offset, end: offset + match[0].length, value: match[0] };
  }

  // merchant / anything else: keep the whole span minus surrounding noise.
  const leading = slice.length - slice.replace(/^[\s|,;:.–—-]+/, '').length;
  const trimmed = slice.replace(MERCHANT_TRIM, '');
  if (!trimmed) return null;
  return { start: start + leading, end: start + leading + trimmed.length, value: trimmed };
};

// ── Tokenization ──────────────────────────────────────────────────────────────

/**
 * Split text into its whitespace-separated tokens, keeping each one's offsets.
 *
 * Used by both the derivation below (to grow anchors a token at a time) and the
 * editor (to render the notification as tappable chips), so the two always agree
 * on where a token starts and ends.
 *
 * @param {string} text
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
export const tokenize = (text) => {
  const tokens = [];
  const source = String(text || '');
  const regex = /\S+/g;
  let match = regex.exec(source);
  while (match) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    match = regex.exec(source);
  }
  return tokens;
};

// ── Rule derivation ───────────────────────────────────────────────────────────

/**
 * Candidate anchor sizes, cheapest first.
 *
 * Ordered by total tokens so the shortest sufficient anchor wins, and within a
 * total by a wider `before` — the label that precedes a value ("Платеж на",
 * "BALANCE:") identifies it far more reliably than whatever trails it.
 *
 * The no-anchor pair is deliberately tried *last* rather than first. On a sample
 * that happens to contain only one number, "no anchor at all" is technically the
 * minimal rule that reads it — and it is also the rule that will read the
 * account balance the day the bank adds one to the message. Ordering it last
 * means an anchored rule wins whenever one exists, and the bare rule survives
 * only for a value with genuinely nothing around it (a payee that is the entire
 * notification title, say).
 *
 * @returns {Array<[number, number]>} [beforeTokens, afterTokens] pairs
 */
const anchorCandidates = () => {
  const pairs = [];
  for (let total = 1; total <= MAX_ANCHOR_TOKENS * 2; total += 1) {
    for (let before = Math.min(total, MAX_ANCHOR_TOKENS); before >= 0; before -= 1) {
      const after = total - before;
      if (after >= 0 && after <= MAX_ANCHOR_TOKENS) pairs.push([before, after]);
    }
  }
  pairs.push([0, 0]);
  return pairs;
};

/**
 * Derive a storable field rule from a span the user marked in a sample.
 *
 * Grows the anchors until the compiled rule extracts exactly the marked span,
 * then stops — see the module header for why that beats a fixed anchor width.
 * When no anchor pair within the budget is unambiguous, the widest pair is kept
 * together with the index of the occurrence that was marked, so the rule still
 * resolves deterministically on the sample.
 *
 * @param {string} text - the normalized text the span refers to
 * @param {{ start: number, end: number }} span
 * @param {string} kind - one of TEMPLATE_FIELDS
 * @param {string} source - 'title' | 'text'
 * @returns {Object|null} the rule, or null when the span holds no usable value
 */
export const deriveFieldRule = (text, span, kind, source = 'text') => {
  const refined = refineSpan(text, span, kind);
  if (!refined) return null;

  const tokens = tokenize(text);
  const before = tokens.filter((tk) => tk.end <= refined.start);
  const after = tokens.filter((tk) => tk.start >= refined.end);

  const build = (beforeCount, afterCount) => {
    const anchorStart = beforeCount === 0
      ? refined.start
      : before[Math.max(0, before.length - beforeCount)].start;
    const anchorEnd = afterCount === 0
      ? refined.end
      : after[Math.min(after.length, afterCount) - 1].end;
    return {
      source,
      kind,
      before: text.slice(anchorStart, refined.start),
      after: text.slice(refined.end, anchorEnd),
      value: refined.value,
      occurrence: 0,
    };
  };

  let widest = null;
  for (const [b, a] of anchorCandidates()) {
    // Don't ask for more tokens than the sample has on that side.
    if (b > before.length || a > after.length) continue;
    const rule = build(b, a);
    widest = rule;
    const regex = compileFieldRule(rule);
    if (!regex) continue;
    const matches = allMatches(text, regex);
    const index = matches.findIndex((m) => m.start === refined.start && m.end === refined.end);
    if (index === 0) return rule;
    // Remember the occurrence in case nothing turns out to be unambiguous.
    if (index > 0) widest = { ...rule, occurrence: index };
  }
  return widest;
};

// ── Template matching ─────────────────────────────────────────────────────────

/**
 * Whether every trigger word a template requires is present in the notification.
 *
 * Triggers are what stop a template from claiming its app's *other* messages: a
 * template built from "Покупка на 500 ₽" requires the word "Покупка", so the
 * bank's "Ваш баланс" message falls through to nothing instead of being booked
 * as a 500₽ purchase. Matching is case-insensitive and whitespace-tolerant.
 *
 * @param {Object} template
 * @param {string} haystack - normalized title + text
 * @returns {boolean}
 */
const triggersPresent = (template, haystack) => {
  const triggers = Array.isArray(template.triggers) ? template.triggers : [];
  if (triggers.length === 0) return true;
  const hay = haystack.toLowerCase().replace(/\s+/g, ' ');
  return triggers.every((trigger) => {
    const needle = String(trigger || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return needle.length === 0 || hay.includes(needle);
  });
};

/**
 * Whether a template is allowed to look at a notification at all.
 *
 * A template is bound to the app it was built from. A notification with no
 * package name is a manual paste / a test in the editor, and every template gets
 * a look at it — that is the only way to try a template against pasted text.
 *
 * @param {Object} template
 * @param {Object} notification
 * @returns {boolean}
 */
export const templateAppliesTo = (template, notification) => {
  if (!template || template.enabled === false) return false;
  if (!template.packageName) return true;
  if (!notification || !notification.packageName) return true;
  return template.packageName === notification.packageName;
};

/**
 * Run a template against a notification.
 *
 * Returns the same normalized descriptor shape the built-in bank parsers
 * produce, so everything downstream (resolution, booking, the review queue)
 * treats a user template exactly like a shipped parser. Returns null — rather
 * than a partial descriptor — whenever anything mandatory is missing, because a
 * half-parsed notification must never become a half-right operation.
 *
 * @param {Object} template - a stored template row
 * @param {{ title?: string, text?: string, packageName?: string, postTime?: number }} notification
 * @returns {Object|null} descriptor, or null when the template doesn't apply
 */
export const matchTemplate = (template, notification) => {
  if (!template || !notification) return null;
  if (!templateAppliesTo(template, notification)) return null;

  const title = normalizeNotificationText(notification.title);
  const text = normalizeNotificationText(notification.text);
  if (!title && !text) return null;
  if (title.length > MAX_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) return null;

  const normalized = { title, text };
  if (!triggersPresent(template, `${title}\n${text}`)) return null;

  const fields = template.fields || {};

  // 1. Amount — mandatory. A template that can't find its amount doesn't match.
  if (!fields.amount) return null;
  const amountMatch = extractField(normalized, fields.amount);
  if (!amountMatch) return null;
  const amount = normalizeAmountString(amountMatch.value);
  if (!isBookableAmount(amount)) return null;

  // 2. Currency — extracted when marked, otherwise the template's fixed choice.
  //    Falling back matters for apps that write only "1 000" with the currency
  //    implied by the account.
  let currency = null;
  if (fields.currency) {
    const currencyMatch = extractField(normalized, fields.currency);
    currency = currencyMatch ? currencyCodeFromToken(currencyMatch.value) : null;
  }
  if (!currency) currency = template.currency || null;
  if (!currency) return null;

  // 3. Payee, card, date and time are all optional — the pipeline already knows
  //    how to fill in a missing date (the notification's post time) and how to
  //    ask the user for an account when no card resolves one.
  const merchantMatch = fields.merchant ? extractField(normalized, fields.merchant) : null;
  const cardMatch = fields.card ? extractField(normalized, fields.card) : null;
  const dateMatch = fields.date ? extractField(normalized, fields.date) : null;
  const timeMatch = fields.time ? extractField(normalized, fields.time) : null;

  const parsedDate = dateMatch ? parseDateValue(dateMatch.value, template.dateOrder) : null;

  return {
    // The template's name doubles as the descriptor's `kind`: it is what the
    // review queue shows when a notification carries no payee, and what
    // kindRequiresCategory/kindIsTransfer look the template up by.
    kind: template.name,
    type: template.type === 'income' ? 'income' : 'expense',
    amount,
    currency,
    cardMask: cardMatch ? cardMatch.value.trim() : null,
    merchant: merchantMatch ? merchantMatch.value.trim() : null,
    country: null,
    date: parsedDate ? parsedDate.date : null,
    time: timeMatch ? normalizeTimeValue(timeMatch.value) : null,
    // A custom template never forces a manual category: it either carries a
    // default one, or the merchant rules learn it the first time through the
    // review queue.
    requiresCategory: false,
    isTransfer: false,
    // Surfaced to the resolver as the category to use when the merchant hasn't
    // taught one yet (a learned rule always wins — it is the more specific fact).
    defaultCategoryId: template.categoryId || null,
    templateId: template.id || null,
    packageName: notification.packageName || null,
    raw: text || title,
  };
};

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Check a draft template before it is saved.
 *
 * Split into `errors` (the template cannot work — saving is blocked) and
 * `warnings` (it works on the sample but is likely to misfire later). The editor
 * shows both; only errors disable the save button. The warnings are the ones
 * that matter in practice: an amount with no anchor on either side is exactly
 * the template that ends up booking the account balance instead of the charge.
 *
 * @param {Object} template - draft (name, type, fields, currency, triggers…)
 * @param {{ title?: string, text?: string }} sample - the notification it was built from
 * @returns {{ errors: string[], warnings: string[] }} i18n keys
 */
export const validateTemplate = (template, sample) => {
  const errors = [];
  const warnings = [];
  if (!template) return { errors: ['template_error_amount_required'], warnings };

  if (!String(template.name || '').trim()) errors.push('template_error_name_required');
  if (!TEMPLATE_TYPES.includes(template.type)) errors.push('template_error_type_required');

  const fields = template.fields || {};
  if (!fields.amount) {
    errors.push('template_error_amount_required');
  } else if (!fields.amount.before && !fields.amount.after) {
    // Nothing distinguishes this number from any other number in the message.
    warnings.push('template_warning_amount_unanchored');
  }

  if (!fields.currency && !template.currency) errors.push('template_error_currency_required');

  if (!fields.merchant) warnings.push('template_warning_no_merchant');
  if ((template.triggers || []).length === 0) warnings.push('template_warning_no_trigger');

  // The template has to work on the very notification it was built from; if it
  // doesn't, none of the other advice matters.
  if (sample && errors.length === 0) {
    const descriptor = matchTemplate({ ...template, enabled: true }, sample);
    if (!descriptor) errors.push('template_error_no_match');
  }

  return { errors, warnings };
};

/**
 * Preview what a template makes of a notification, for the editor.
 *
 * Returns the extracted ranges alongside the descriptor so the editor can
 * highlight what the *compiled rules* actually select rather than what the user
 * tapped — the two diverging is the single most useful thing to show someone
 * building a template.
 *
 * @param {Object} template - draft
 * @param {{ title?: string, text?: string }} sample
 * @returns {{ descriptor: Object|null, ranges: Object }} ranges keyed by field,
 *   each { source, start, end, value }
 */
export const previewTemplate = (template, sample) => {
  const ranges = {};
  if (!template || !sample) return { descriptor: null, ranges };
  const normalized = {
    title: normalizeNotificationText(sample.title),
    text: normalizeNotificationText(sample.text),
  };
  const fields = template.fields || {};
  TEMPLATE_FIELDS.forEach((field) => {
    const rule = fields[field];
    if (!rule) return;
    const match = extractField(normalized, rule);
    if (match) ranges[field] = { ...match, source: rule.source || 'text' };
  });
  return { descriptor: matchTemplate({ ...template, enabled: true }, sample), ranges };
};
