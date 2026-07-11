/**
 * Card-mask helpers for bank-notification → account matching.
 *
 * A bank only ever reveals a card's last four digits; everything else in a mask
 * (the BIN prefix, and the bullet / asterisk / space decoration around the
 * digits) is cosmetic and varies by source. The T-Bank parser emits "*5285",
 * another notification format might carry "•• 5285", and a user typing the mask
 * into the account editor uses the full "4083***5285". Matching on the raw
 * literal makes those miss each other, so a card's identity is defined here by
 * its trailing four digits alone.
 *
 * An account can be bound to several cards, so its masks are stored as a single
 * delimiter-joined string in `accounts.card_mask` (the same one-column-list
 * convention labelUtils uses for operation labels). `parseCardMasks` /
 * `serializeCardMasks` convert between that stored form and a plain array; a
 * legacy single mask parses as a one-element list, so old rows keep working.
 */

// Separates masks within the `accounts.card_mask` column. A card mask never
// contains a pipe, so it can never collide with a real value.
export const CARD_MASK_DELIMITER = '|';

/**
 * The last four digits of a card mask, or null when fewer than four digits are
 * present. Ignores every non-digit character (decoration) and any BIN prefix.
 *
 * @param {string|null|undefined} mask - e.g. "*5285", "•• 5285", "4083***5285"
 * @returns {string|null} e.g. "5285"
 */
export const cardMaskLast4 = (mask) => {
  if (mask == null) return null;
  const digits = String(mask).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

/**
 * Whether two card masks refer to the same physical card, i.e. share their last
 * four digits. Two masks that don't both yield a comparable last-4 never match.
 *
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {boolean}
 */
export const cardMasksMatch = (a, b) => {
  const la = cardMaskLast4(a);
  return la != null && la === cardMaskLast4(b);
};

/** Trim a single mask and strip any delimiter char so it can't split a list. */
const sanitizeMask = (raw) =>
  (raw == null ? '' : String(raw)).split(CARD_MASK_DELIMITER).join('').trim();

/**
 * Split the stored `accounts.card_mask` value into individual masks. A legacy
 * single mask (no delimiter) yields a one-element list; null/empty yields [].
 *
 * @param {string|null|undefined} stored
 * @returns {string[]}
 */
export const parseCardMasks = (stored) => {
  if (!stored) return [];
  return String(stored)
    .split(CARD_MASK_DELIMITER)
    .map((m) => m.trim())
    .filter(Boolean);
};

/**
 * Join a list of masks into the stored column form, dropping blanks and
 * de-duplicating by last-4 (a card only needs one entry regardless of the
 * format each notification decorated it with). Returns null for an empty result
 * so the column clears rather than storing an empty string.
 *
 * @param {Array<string|null|undefined>} masks
 * @returns {string|null}
 */
export const serializeCardMasks = (masks) => {
  if (!Array.isArray(masks)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of masks) {
    const mask = sanitizeMask(raw);
    if (!mask) continue;
    // Dedupe by last-4 when available; fall back to the literal so an odd,
    // digit-poor entry isn't silently swallowed.
    const key = cardMaskLast4(mask) || `lit:${mask}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mask);
  }
  return out.length ? out.join(CARD_MASK_DELIMITER) : null;
};
