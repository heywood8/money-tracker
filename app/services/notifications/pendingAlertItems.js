/**
 * Detail rows for the background "transactions to review" alert.
 *
 * The alert used to say only how many transactions were waiting, which tells the
 * user nothing about whether it is worth opening the app right now. This module
 * collects, for the items a background run just queued, what the pipeline already
 * recognized (amount, payee, card, date, resolved account/category) and what is
 * still missing before the operation can be booked — the copy layer
 * (notificationStrings) turns these into localized lines.
 *
 * Everything here is best-effort: a failed read returns an empty list so the
 * alert falls back to its plain count-only copy rather than being skipped.
 */

import { getPendingNotifications } from '../PendingNotificationsDB';
import { getAllAccounts } from '../AccountsDB';
import { getAllCategories } from '../CategoriesDB';
import { kindRequiresCategory } from './parseBankNotification';
import { resolveAtmTargetAccount } from './processBankNotifications';

/** How many queued items the alert body describes before collapsing to "+N more". */
export const MAX_ALERT_DETAILS = 3;

/**
 * What the user still has to supply for a queued item, or null when everything
 * resolved and the item only awaits confirmation (an untrusted source).
 *
 * @param {Object} item - pending row
 * @param {boolean} hasAtmTarget - whether a cash account is bound for ATM transfers
 * @returns {'account'|'category'|'account_category'|'target'|'account_target'|null}
 */
const missingFor = (item, hasAtmTarget) => {
  const needsAccount = item.accountId == null;
  if (item.type === 'transfer') {
    // A transfer books card -> cash account; the target comes from the binding,
    // not from the row, so an unbound target is what the user must pick.
    if (needsAccount && !hasAtmTarget) return 'account_target';
    if (needsAccount) return 'account';
    if (!hasAtmTarget) return 'target';
    return null;
  }
  const needsCategory = item.categoryId == null;
  if (needsAccount && needsCategory) return 'account_category';
  if (needsAccount) return 'account';
  if (needsCategory) return 'category';
  return null;
};

/**
 * Describe the items a run has just queued for review.
 *
 * The queue is ordered oldest-first, so the `newCount` items a run added are its
 * tail; the first `limit` of those are described (oldest of the new batch first,
 * matching the order the review queue presents them in).
 *
 * @param {number} newCount - how many items this run queued (summary.pending)
 * @param {number} [limit] - maximum number of described items
 * @returns {Promise<Array<{
 *   id: string, type: string, amount: string, currency: string,
 *   merchant: string|null, cardMask: string|null, date: string|null,
 *   accountName: string|null, categoryName: string|null,
 *   categoryNameKey: string|null, missing: string|null,
 * }>>} described items, or [] when nothing could be read
 */
export const collectPendingAlertDetails = async (newCount, limit = MAX_ALERT_DETAILS) => {
  try {
    const queue = await getPendingNotifications();
    if (!queue || queue.length === 0) return [];

    // Fall back to the whole queue when the caller doesn't know how many are new.
    const fresh = newCount > 0 ? queue.slice(-newCount) : queue;
    const shown = fresh.slice(0, limit);
    if (shown.length === 0) return [];

    const needsAtmTarget = shown.some((item) => item.type === 'transfer');
    const [accounts, categories, atmTarget] = await Promise.all([
      getAllAccounts().catch(() => []),
      getAllCategories().catch(() => []),
      needsAtmTarget ? resolveAtmTargetAccount().catch(() => null) : Promise.resolve(null),
    ]);

    const accountsById = new Map((accounts || []).map((a) => [a.id, a]));
    const categoriesById = new Map((categories || []).map((c) => [c.id, c]));

    return shown.map((item) => {
      const account = item.accountId != null ? accountsById.get(item.accountId) : null;
      // A category is only worth showing for kinds that actually take one; a
      // transfer's "category" is the target account, handled via `missing`.
      const category = item.type !== 'transfer' && item.categoryId
        ? categoriesById.get(item.categoryId)
        : null;
      return {
        // Carried so the alert's "Reject" button knows which row to drop.
        id: item.id,
        type: item.type,
        amount: item.amount,
        currency: item.currency,
        merchant: item.merchant || null,
        cardMask: item.cardMask || null,
        date: item.date || null,
        accountName: account ? account.name : null,
        categoryName: category ? category.name || null : null,
        // Built-in categories carry a translation key instead of a literal name.
        categoryNameKey: category ? category.nameKey || null : null,
        missing: missingFor(item, !!atmTarget),
      };
    });
  } catch (error) {
    // Never let detail-gathering break the alert — the count-only copy still works.
    console.warn('[pendingAlertItems] Failed to collect alert details:', error);
    return [];
  }
};

export default collectPendingAlertDetails;
