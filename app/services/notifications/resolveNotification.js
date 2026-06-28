/**
 * Resolver: maps a parsed bank-notification descriptor onto an account and a
 * category, using the card-mask binding and learned merchant rules.
 *
 * Resolution is intentionally conservative for the account: a card mask is the
 * only strong signal, with a single-currency-account heuristic as a fallback.
 * The category comes purely from learned merchant rules.
 */

import * as AccountsDB from '../AccountsDB';
import * as NotificationRulesDB from '../NotificationRulesDB';

/**
 * Resolve the account for a descriptor.
 *
 * 1. Exact card-mask binding wins.
 * 2. Otherwise, if exactly one non-hidden account matches the notification's
 *    currency, use it (a safe single-account fallback).
 * 3. Otherwise null — the user must choose.
 *
 * @param {Object} descriptor - parsed notification (needs cardMask, currency)
 * @returns {Promise<Object|null>} the account row, or null
 */
export const resolveAccount = async (descriptor) => {
  if (!descriptor) return null;

  if (descriptor.cardMask) {
    const account = await AccountsDB.getAccountByCardMask(descriptor.cardMask);
    if (account) return account;
  }

  if (descriptor.currency) {
    const all = await AccountsDB.getAllAccounts();
    const matches = (all || []).filter(
      (a) => a.currency === descriptor.currency && !a.hidden,
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
};

/**
 * Resolve just the account id for a descriptor.
 * @param {Object} descriptor
 * @returns {Promise<number|null>}
 */
export const resolveAccountId = async (descriptor) => {
  const account = await resolveAccount(descriptor);
  return account ? account.id : null;
};

/**
 * Resolve the category id for a descriptor via learned merchant rules.
 * @param {Object} descriptor - parsed notification (needs merchant, packageName)
 * @returns {Promise<string|null>}
 */
export const resolveCategoryId = async (descriptor) => {
  if (!descriptor || !descriptor.merchant) return null;
  return NotificationRulesDB.getCategoryForMerchant(
    descriptor.merchant,
    descriptor.packageName,
  );
};

/**
 * Resolve both account and category for a descriptor.
 *
 * `fullyMatched` additionally requires the resolved account's currency to equal
 * the notification's currency. A foreign-currency purchase on a bound card
 * resolves the account but is NOT auto-created — booking the amount in the
 * account's currency would be wrong — so it falls through to the review queue.
 *
 * @param {Object} descriptor
 * @returns {Promise<{ accountId: number|null, accountCurrency: string|null,
 *   categoryId: string|null, matchedAccount: boolean, matchedCategory: boolean,
 *   currencyMatch: boolean, fullyMatched: boolean }>}
 */
export const resolveNotification = async (descriptor) => {
  const [account, categoryId] = await Promise.all([
    resolveAccount(descriptor),
    resolveCategoryId(descriptor),
  ]);
  const accountId = account ? account.id : null;
  const accountCurrency = account ? account.currency : null;
  const matchedAccount = accountId != null;
  const matchedCategory = categoryId != null;
  const currencyMatch =
    matchedAccount && (!descriptor?.currency || accountCurrency === descriptor.currency);
  return {
    accountId,
    accountCurrency,
    categoryId,
    matchedAccount,
    matchedCategory,
    currencyMatch,
    fullyMatched: matchedAccount && matchedCategory && currencyMatch,
  };
};

export default resolveNotification;
