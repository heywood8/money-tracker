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
 */

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
