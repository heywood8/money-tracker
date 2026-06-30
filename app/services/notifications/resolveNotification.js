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
 * Derive the category id from an already-fetched merchant rule.
 *
 * Kinds flagged `requiresCategory` (client-to-client transfers) never resolve a
 * category automatically: the same counterparty maps to different categories
 * across transfers, so the user must always pick one in the review queue.
 *
 * @param {Object} descriptor
 * @param {Object|null} rule - merchant rule row, or null
 * @returns {string|null}
 */
const categoryFromRule = (descriptor, rule) => {
  if (!descriptor || descriptor.requiresCategory || !descriptor.merchant || !rule) return null;
  return rule.categoryId || null;
};

/**
 * Derive the user-chosen display label from an already-fetched merchant rule.
 *
 * Unlike the category, a label override applies to every kind (including C2C
 * transfers) — it is purely a display name for the counterparty/shop.
 *
 * @param {Object} descriptor
 * @param {Object|null} rule - merchant rule row, or null
 * @returns {string|null}
 */
const labelFromRule = (descriptor, rule) => {
  if (!descriptor || !descriptor.merchant || !rule || !rule.labelOverride) return null;
  return rule.labelOverride;
};

/**
 * Resolve the category id for a descriptor via learned merchant rules.
 *
 * @param {Object} descriptor - parsed notification (needs merchant, packageName)
 * @returns {Promise<string|null>}
 */
export const resolveCategoryId = async (descriptor) => {
  if (!descriptor || descriptor.requiresCategory || !descriptor.merchant) return null;
  const rule = await NotificationRulesDB.getMerchantRule(descriptor.merchant, descriptor.packageName);
  return categoryFromRule(descriptor, rule);
};

/**
 * Resolve the user-chosen display label for a descriptor's merchant, or null.
 *
 * @param {Object} descriptor - parsed notification (needs merchant, packageName)
 * @returns {Promise<string|null>}
 */
export const resolveLabelOverride = async (descriptor) => {
  if (!descriptor || !descriptor.merchant) return null;
  const rule = await NotificationRulesDB.getMerchantRule(descriptor.merchant, descriptor.packageName);
  return labelFromRule(descriptor, rule);
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
 *   accountRounding: number|null, categoryId: string|null, matchedAccount: boolean,
 *   matchedCategory: boolean, currencyMatch: boolean, fullyMatched: boolean }>}
 */
export const resolveNotification = async (descriptor) => {
  // Read the merchant rule once and derive both category and label from it,
  // rather than issuing a separate lookup per field.
  const [account, rule] = await Promise.all([
    resolveAccount(descriptor),
    descriptor && descriptor.merchant
      ? NotificationRulesDB.getMerchantRule(descriptor.merchant, descriptor.packageName)
      : Promise.resolve(null),
  ]);
  const categoryId = categoryFromRule(descriptor, rule);
  const labelOverride = labelFromRule(descriptor, rule);
  const accountId = account ? account.id : null;
  const accountCurrency = account ? account.currency : null;
  // Rounding step for auto-created operations (null/0 = no rounding).
  const accountRounding = account ? account.autoTxnRounding : null;
  const matchedAccount = accountId != null;
  const matchedCategory = categoryId != null;
  const currencyMatch =
    matchedAccount && (!descriptor?.currency || accountCurrency === descriptor.currency);
  return {
    accountId,
    accountCurrency,
    accountRounding,
    categoryId,
    labelOverride,
    matchedAccount,
    matchedCategory,
    currencyMatch,
    fullyMatched: matchedAccount && matchedCategory && currencyMatch,
  };
};

export default resolveNotification;
