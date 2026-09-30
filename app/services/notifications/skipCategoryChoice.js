/**
 * The "don't bind to category" side of a review card's choice, shared by the two
 * review surfaces (the operations-page deck and Settings → Notification
 * processing) so they seed and follow the merchant's flag the same way.
 *
 * A card's choice carries two fields for it:
 *   - `skipCategoryBinding` — the checkbox: save this merchant as "don't bind".
 *   - `skipCategoryLocked`  — the merchant is already flagged, so the box is
 *     ticked and cannot be unticked from the card (only Settings → Bindings).
 */

import { getMerchantRule } from '../NotificationRulesDB';

/**
 * Read the merchant rule behind each queued item, one lookup per distinct
 * (merchant, source app) pair: a queue holding many notifications from a few
 * shops is the normal case, and every save or dismiss re-reads it.
 *
 * @param {Array<Object>} items - queued items (need merchant, packageName)
 * @returns {Promise<Array<Object|null|undefined>>} aligned with `items`: the rule,
 *   null when there is none (or no merchant to look up), or undefined when the
 *   lookup failed — the caller then keeps the card as it stands.
 */
export const readMerchantRules = (items) => {
  const lookups = new Map();
  return Promise.all(items.map((item) => {
    if (!item.merchant) return Promise.resolve(null);
    const key = `${item.merchant}\u0000${item.packageName ?? ''}`;
    if (!lookups.has(key)) {
      lookups.set(
        key,
        getMerchantRule(item.merchant, item.packageName)
          .then((rule) => rule || null)
          .catch(() => undefined),
      );
    }
    return lookups.get(key);
  }));
};

/**
 * The flag fields of a new card's choice. A flagged merchant's card opens ticked
 * and locked, with no category: one the queue pre-filled came from a binding the
 * user has since dropped.
 *
 * @param {boolean} locked - whether the merchant is flagged
 * @returns {Object} fields to spread over the new choice
 */
export const seedSkipCategory = (locked) => (locked
  ? { skipCategoryBinding: true, skipCategoryLocked: true, categoryId: null }
  : { skipCategoryBinding: false, skipCategoryLocked: false });

/**
 * Follow the merchant's flag when it changes under an open card: a sibling saved
 * with "don't bind" locks (and ticks) it, and lifting the flag in Settings frees
 * (and clears) it. Locking also drops the category the queue pre-filled, which
 * came from the binding just removed; a category the user picked stays.
 *
 * @param {Object} choice - the card's current choice
 * @param {Object} item - the queued item (its categoryId is the pre-fill)
 * @param {boolean} locked - whether the merchant is flagged now
 * @returns {Object} the same choice when nothing changed, else an updated copy
 */
export const followSkipCategory = (choice, item, locked) => {
  if (!!choice.skipCategoryLocked === locked) return choice;
  const next = { ...choice, skipCategoryLocked: locked, skipCategoryBinding: locked };
  if (locked && choice.categoryId != null && choice.categoryId === item.categoryId) {
    next.categoryId = null;
  }
  return next;
};
