/**
 * Duplicate detection between bank notifications and already-recorded operations.
 *
 * A bank push often lands minutes after the user has already entered the same
 * purchase by hand. Without this, the pipeline would queue (or, for a trusted
 * source, auto-create) a second copy — leaving a "choose a category" card and a
 * tray alert for something already in the ledger. This module recognizes when an
 * operation matching a notification already exists so the notification can be
 * skipped at ingestion and any stale queued copy pruned.
 *
 * Matching is deliberately strict — same type, account, date, and amount — so a
 * genuinely new charge is never swallowed. A rare false positive (two identical
 * charges on the same account/day) is recoverable: the notification stays in the
 * recent feed and can be re-added by hand.
 */

import * as OperationsDB from '../OperationsDB';
import * as AccountsDB from '../AccountsDB';
import * as PendingNotificationsDB from '../PendingNotificationsDB';
import * as Currency from '../currency';

/**
 * The amounts an operation booked from this notification could carry, in the
 * account's currency: the raw charge, plus the value it would round to under the
 * account's automatic-transaction rounding (so a 1 683 charge on an account that
 * rounds to the nearest 100 also matches a hand-entered 1 700).
 *
 * @param {{ amount: string }} item
 * @param {{ autoTxnRounding?: number|null, autoTxnRoundingMode?: string|null, currency?: string|null }} [account]
 * @returns {string[]}
 */
const candidateAmounts = (item, account) => {
  const amounts = [item.amount];
  const rounding = account && account.autoTxnRounding;
  if (rounding) {
    amounts.push(
      Currency.roundToStep(item.amount, rounding, account.autoTxnRoundingMode, account.currency),
    );
  }
  return amounts;
};

/**
 * Whether an existing operation is the same transaction a notification describes.
 *
 * @param {Object} op - a mapped operation row
 * @param {{ type: string, amount: string, currency?: string|null, date?: string|null,
 *   accountId: string|number|null }} item - notification descriptor or pending row
 * @param {Object|null} [account] - the item's account (for currency + rounding)
 * @returns {boolean}
 */
export const operationMatchesNotification = (op, item, account) => {
  if (!op || !item) return false;
  if (op.type !== item.type) return false;
  if (op.accountId == null || item.accountId == null) return false;
  if (String(op.accountId) !== String(item.accountId)) return false;
  // A dateless notification can't be pinned to a specific day — never match it,
  // rather than risk pruning an unrelated operation.
  if (!item.date || op.date !== item.date) return false;

  const accountCurrency = account ? account.currency : null;
  const sameCurrency = !item.currency || !accountCurrency || item.currency === accountCurrency;

  if (sameCurrency) {
    // The booked amount is in the account currency; compare against the raw and
    // account-rounded candidates.
    return candidateAmounts(item, account).some(
      (amt) => Currency.compare(op.amount, amt) === 0,
    );
  }

  // A transfer books its `amount` in the source-account currency and never
  // preserves the notification's original charge (destination_amount is a second,
  // unrelated source→target conversion), so a cross-currency transfer can't be
  // compared reliably — don't risk a wrong match. The common same-currency
  // transfer is already handled by the branch above.
  if (op.type === 'transfer') return false;

  // Cross-currency expense/income: the operation preserves the original foreign
  // charge in destination_amount (unrounded), so compare that against the item.
  if (op.destinationAmount == null) return false;
  return Currency.compare(op.destinationAmount, item.amount) === 0;
};

/**
 * Find an operation the user has already recorded that matches a notification.
 *
 * `claimedOpIds`, when supplied, excludes operations already paired with an
 * earlier notification in the same batch, keeping matching 1:1: two genuinely
 * distinct same-day/same-amount charges pair with two distinct operations rather
 * than both being absorbed by the first one.
 *
 * @param {{ type: string, amount: string, currency?: string|null, date?: string|null,
 *   accountId: string|number|null }} item
 * @param {Object|null} [account] - the item's account; fetched by id when omitted
 * @param {Set<number|string>|null} [claimedOpIds] - operation ids already matched
 * @returns {Promise<Object|null>} the matching operation, or null
 */
export const findMatchingOperation = async (item, account, claimedOpIds = null) => {
  if (!item || item.accountId == null || !item.type || !item.date) return null;
  try {
    const resolvedAccount = account !== undefined
      ? account
      : await AccountsDB.getAccountById(item.accountId).catch(() => null);
    const query = OperationsDB.getOperationsByAccountTypeAndDate;
    if (typeof query !== 'function') return null;
    const candidates = await query(item.accountId, item.type, item.date);
    return (candidates || []).find(
      (op) => (!claimedOpIds || !claimedOpIds.has(op.id))
        && operationMatchesNotification(op, item, resolvedAccount),
    ) || null;
  } catch (error) {
    // Never let a duplicate-check failure block ingestion — treat it as "no match".
    console.warn('[duplicateOperations] Failed to find matching operation:', error);
    return null;
  }
};

/**
 * Remove queued review items the user has since recorded by hand.
 *
 * Runs on each pipeline pass and whenever a review surface reloads, so a card
 * for an already-entered operation disappears from the in-app deck and the
 * settings review queue alike. Best-effort: a read failure leaves the queue
 * untouched rather than throwing.
 *
 * @returns {Promise<number>} how many pending items were pruned
 */
export const reconcilePendingNotifications = async () => {
  let pruned = 0;
  try {
    const pending = await PendingNotificationsDB.getPendingNotifications();
    if (!pending || pending.length === 0) return 0;

    // Cache accounts by id so a batch of items on one account is fetched once.
    const accountCache = new Map();
    // Track operations already claimed by an earlier item so two queued
    // duplicates can't both be pruned against a single recorded operation.
    const claimedOpIds = new Set();
    for (const item of pending) {
      // An item the user explicitly re-added from the recent feed is never
      // pruned: that path bypasses duplicate detection on purpose (they may be
      // recording a second identical charge, or one whose amount happens to
      // collide with an unrelated operation after the account's rounding). Left
      // reconcilable, it would be deleted on the very next pass — the queue
      // reporting "added" and then showing nothing.
      if (item.forceAdded) continue;
      if (item.accountId == null || !item.date) continue;
      if (!accountCache.has(item.accountId)) {
        accountCache.set(
          item.accountId,
          await AccountsDB.getAccountById(item.accountId).catch(() => null),
        );
      }
      const account = accountCache.get(item.accountId);
      const match = await findMatchingOperation(item, account, claimedOpIds);
      if (match) {
        claimedOpIds.add(match.id);
        await PendingNotificationsDB.deletePendingNotification(item.id);
        pruned += 1;
      }
    }
  } catch (error) {
    console.warn('[duplicateOperations] Failed to reconcile pending notifications:', error);
  }
  return pruned;
};

export default reconcilePendingNotifications;
