/**
 * Learned account bindings for card-less bank notifications.
 *
 * The card-mask binding (accounts.card_mask) resolves an account from the last
 * four digits a bank reveals — but some notifications carry no card number at
 * all. T-Bank's SBP ("Оплата через СБП … счет RUB") and account-level messages
 * name only the account *currency*, not a card. When more than one account
 * shares that currency, the currency-only fallback in resolveNotification can't
 * pick one, so the notification always lands in the review queue and the manual
 * choice is never remembered.
 *
 * This module adds a second, weaker binding keyed by (source app + currency):
 * once the user resolves a card-less notification to an account, future card-less
 * notifications from the same app in the same currency resolve to it. It is
 * intentionally applied ONLY when a descriptor has no card mask — a real card
 * notification for an unbound card must still reach the queue so its specific
 * card is learned, not be swallowed by this account-wide default.
 *
 * Storage mirrors the ATM-target and trusted-source patterns (a PreferencesDB
 * JSON value in app_metadata), so no schema change is needed and the bindings
 * survive alongside the other learned notification state.
 */

import * as PreferencesDB from '../PreferencesDB';
import * as AccountsDB from '../AccountsDB';

// Neither an Android package name (dots only) nor an ISO currency code contains
// a pipe, so it can never collide inside the composite map key.
const KEY_DELIMITER = '|';

/**
 * Build the composite binding key for a (package, currency) pair, or null when
 * either part is missing (nothing stable to bind on).
 * @param {string|null|undefined} packageName
 * @param {string|null|undefined} currency
 * @returns {string|null}
 */
export const bindingKey = (packageName, currency) => {
  if (!packageName || !currency) return null;
  return `${packageName}${KEY_DELIMITER}${String(currency).toUpperCase()}`;
};

/**
 * The full map of learned (package|currency) -> accountId bindings. Always an
 * object (empty when unset or malformed).
 * @returns {Promise<Object<string, number>>}
 */
export const getAccountBindings = async () => {
  const map = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ACCOUNT_BINDINGS,
    {},
  );
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
};

/**
 * Resolve the account bound to a card-less notification's (package, currency),
 * or null when none is bound (or the bound account was since deleted/hidden —
 * in which case resolution falls through to the currency heuristic / queue
 * rather than booking to a stale target).
 *
 * @param {string|null|undefined} packageName
 * @param {string|null|undefined} currency
 * @returns {Promise<Object|null>} the account row, or null
 */
export const resolveAccountBinding = async (packageName, currency) => {
  const key = bindingKey(packageName, currency);
  if (!key) return null;
  const map = await getAccountBindings();
  const id = map[key];
  if (id == null) return null;
  try {
    const account = await AccountsDB.getAccountById(id);
    if (!account || account.deletedAt || account.hidden) return null;
    return account;
  } catch (error) {
    return null;
  }
};

/**
 * Remember (source app + currency) -> account for future card-less notifications.
 * Overwrites any prior binding for the same pair (a pair maps to one account).
 *
 * @param {string} packageName
 * @param {string} currency
 * @param {number} accountId
 * @returns {Promise<void>}
 */
export const learnAccountBinding = async (packageName, currency, accountId) => {
  const key = bindingKey(packageName, currency);
  if (!key || accountId == null) return;
  const map = await getAccountBindings();
  if (map[key] === accountId) return; // already bound — avoid a redundant write
  await PreferencesDB.setJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ACCOUNT_BINDINGS,
    { ...map, [key]: accountId },
  );
};

/**
 * Forget the binding for a (package, currency) pair. Used by the bindings-
 * management UI; a no-op when nothing is bound for that pair.
 *
 * @param {string} packageName
 * @param {string} currency
 * @returns {Promise<void>}
 */
export const clearAccountBinding = async (packageName, currency) => {
  const key = bindingKey(packageName, currency);
  if (!key) return;
  const map = await getAccountBindings();
  if (!(key in map)) return;
  const next = { ...map };
  delete next[key];
  await PreferencesDB.setJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ACCOUNT_BINDINGS,
    next,
  );
};
