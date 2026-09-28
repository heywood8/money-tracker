/**
 * Detail rows for the background "operations added" notification.
 *
 * The ingestion pipeline records only ids for each operation it auto-created
 * (`summary.createdItems`), because resolving names on the booking path would
 * cost a lookup per operation. This module does it once for the whole batch: it
 * loads accounts and categories a single time and turns the records into the
 * shape the copy layer (notificationStrings) renders.
 *
 * Everything here is best-effort: a failed read degrades to unnamed rows — or an
 * empty list, which the copy layer renders as its plain count-only text — rather
 * than losing the alert.
 *
 * The account's balance rides along so the receipt can say what is left, but only
 * while the user has not asked for balances to be hidden: a tray row is readable
 * from the lock screen, which is the last place a hidden figure should surface.
 * Withholding it here, rather than in the copy layer, means no later rendering
 * change can print a balance the setting was meant to keep out of sight.
 */

import { getAllAccounts } from '../AccountsDB';
import { getAllCategories } from '../CategoriesDB';
import { isHideBalancesEnabled } from '../PreferencesDB';

/** How many booked operations the alert body describes before "+N more". */
export const MAX_ADDED_ALERT_DETAILS = 3;

/**
 * Describe the operations a run just auto-created.
 *
 * @param {Array<Object>} items - `summary.createdItems` records
 * @param {number} [limit] - maximum number of described items
 * @returns {Promise<Array<{
 *   type: string, amount: string, currency: string, merchant: string|null,
 *   date: string|null, accountName: string|null, accountBalance: string|null,
 *   accountCurrency: string|null, categoryName: string|null,
 *   categoryNameKey: string|null, targetAccountName: string|null,
 * }>>} described items, or [] when nothing could be described. `accountBalance`
 *   is the account's current balance (after this run's bookings), null when
 *   balances are hidden or the account is unknown.
 */
export const collectAddedAlertDetails = async (items, limit = MAX_ADDED_ALERT_DETAILS) => {
  try {
    if (!Array.isArray(items) || items.length === 0) return [];
    const shown = items.slice(0, limit);

    // A transfer names its target account instead of a category, so categories
    // are only worth loading when a non-transfer is present.
    const needsCategories = shown.some((item) => item.type !== 'transfer');
    const [accounts, categories, hideBalances] = await Promise.all([
      getAllAccounts().catch(() => []),
      needsCategories ? getAllCategories().catch(() => []) : Promise.resolve([]),
      // A failed read counts as hidden (see isHideBalancesEnabled).
      isHideBalancesEnabled().catch(() => true),
    ]);

    const accountsById = new Map((accounts || []).map((a) => [a.id, a]));
    const categoriesById = new Map((categories || []).map((c) => [c.id, c]));

    return shown.map((item) => {
      const account = item.accountId != null ? accountsById.get(item.accountId) : null;
      const target = item.toAccountId != null ? accountsById.get(item.toAccountId) : null;
      const category = item.type !== 'transfer' && item.categoryId
        ? categoriesById.get(item.categoryId)
        : null;
      return {
        type: item.type,
        amount: item.amount,
        currency: item.currency,
        merchant: item.merchant || null,
        date: item.date || null,
        accountName: account ? account.name || null : null,
        accountBalance: account && !hideBalances && account.balance != null
          ? String(account.balance)
          : null,
        accountCurrency: account ? account.currency || null : null,
        categoryName: category ? category.name || null : null,
        // Built-in categories carry a translation key instead of a literal name.
        categoryNameKey: category ? category.nameKey || null : null,
        targetAccountName: target ? target.name || null : null,
      };
    });
  } catch (error) {
    // Never let detail-gathering break the alert — the count-only copy still works.
    console.warn('[addedAlertItems] Failed to collect alert details:', error);
    return [];
  }
};

export default collectAddedAlertDetails;
