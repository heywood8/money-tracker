/**
 * Ingestion pipeline: read recent bank notifications, parse them, resolve
 * account/category, and either create an operation (when fully matched) or
 * enqueue the item for review.
 *
 * Processing model (per the feature design): auto-create when both the card and
 * merchant resolve; otherwise queue. Already-processed notifications are skipped
 * using a rolling set of signatures persisted in preferences, because the native
 * listener exposes a pull-only rolling window with no per-item "seen" state.
 */

import { getRecentNotifications } from '../NotificationAccess';
import * as PreferencesDB from '../PreferencesDB';
import * as OperationsDB from '../OperationsDB';
import * as AccountsDB from '../AccountsDB';
import * as Currency from '../currency';
import * as NotificationRulesDB from '../NotificationRulesDB';
import * as PendingNotificationsDB from '../PendingNotificationsDB';
import { serializeLabels } from '../../utils/labelUtils';
import { appEvents, EVENTS } from '../eventEmitter';
import { parseBankNotification, kindRequiresCategory } from './parseBankNotification';
import { resolveNotification } from './resolveNotification';

// Cap on remembered signatures. The native side only ever keeps a handful of
// notifications, so this is comfortably large while bounding storage.
const MAX_SIGNATURES = 100;

/**
 * Stable, compact signature for a raw notification so re-processing the same
 * one is a no-op. Combines post time with a hash of the text.
 * @param {{ postTime?: number, text?: string }} notification
 * @returns {string}
 */
export const notificationSignature = (notification) => {
  const text = notification?.text || '';
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${notification?.postTime || 0}:${hash}`;
};

/**
 * Whether bank-notification processing is enabled (default off).
 * @returns {Promise<boolean>}
 */
export const isBankNotificationsEnabled = async () => {
  const value = await PreferencesDB.getPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ENABLED,
    '0',
  );
  return value === '1' || value === 'true';
};

/**
 * Enable/disable bank-notification processing.
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export const setBankNotificationsEnabled = async (enabled) => {
  await PreferencesDB.setPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_ENABLED,
    enabled ? '1' : '0',
  );
};

const loadSignatures = async () => {
  const sigs = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PROCESSED_SIGS,
    [],
  );
  return Array.isArray(sigs) ? sigs : [];
};

const saveSignatures = async (sigs) => {
  // Keep only the most recent MAX_SIGNATURES entries.
  const trimmed = sigs.slice(-MAX_SIGNATURES);
  await PreferencesDB.setJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PROCESSED_SIGS,
    trimmed,
  );
};

/**
 * ISO "YYYY-MM-DD" for an epoch-millis post time, or null if unusable.
 */
const isoDateFromPostTime = (postTime) => {
  if (!postTime) return null;
  const d = new Date(postTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

/** Today's ISO date — the last-resort fallback for a missing date. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Build the amount + multi-currency fields for booking a parsed notification
 * against an account whose currency may differ from the notification's.
 *
 * A bank notification can be charged in a currency other than the card's account
 * currency (e.g. a 129.99 EUR purchase on an AMD card). This mirrors how a
 * manually-entered foreign-currency operation is stored so the balance is hit in
 * the account currency while the original foreign value is preserved:
 *   amount              = value in the account currency (what hits the balance)
 *   destinationAmount   = original notification amount (foreign currency)
 *   exchangeRate        = account→foreign rate
 *   sourceCurrency      = foreign currency
 *   destinationCurrency = account currency
 *
 * The conversion uses the *current* exchange rate (live, with offline fallback),
 * the same source the operation form uses. When the currencies already match (or
 * either is unknown) the amount is booked as-is.
 *
 * @param {{ amount: string, currency: string }} item - parsed descriptor / pending row
 * @param {string|null|undefined} accountCurrency - currency of the booking account
 * @returns {Promise<Object|null>} operation field overrides, or null when a
 *   conversion is required but no exchange rate is available (caller must not
 *   book a wrong amount — leave it for manual review).
 */
export const buildOperationCurrencyFields = async (item, accountCurrency) => {
  if (!accountCurrency || !item.currency || item.currency === accountCurrency) {
    // Same currency (or unknown account): book as-is, but normalize to the
    // account currency's decimal places when known, matching the manual-entry
    // path (useOperationForm) so notification and hand-entered amounts agree.
    return {
      amount: accountCurrency
        ? Currency.formatAmount(item.amount, accountCurrency)
        : item.amount,
    };
  }

  // foreign → account rate (e.g. EUR→AMD), at the current rate.
  const { rate } = await Currency.fetchLiveExchangeRate(item.currency, accountCurrency);
  if (!rate) return null;

  const convertedAmount = Currency.convertAmount(item.amount, item.currency, accountCurrency, rate);
  if (!convertedAmount) return null;

  // Store the account→foreign rate, inverted with decimal precision.
  const exchangeRate = Currency.invertRate(rate);
  if (!exchangeRate) return null;

  return {
    amount: convertedAmount,                                              // account currency
    destinationAmount: Currency.formatAmount(item.amount, item.currency), // foreign currency
    exchangeRate,                                                         // account→foreign
    sourceCurrency: item.currency,                                        // foreign currency
    destinationCurrency: accountCurrency,                                 // account currency
  };
};

/**
 * Packages whose notifications are trusted to auto-create operations. A package
 * is added the first time the user resolves one of its notifications from the
 * review queue, so an unknown/forged source can never silently book money — it
 * can only ever produce a pending item the user must approve.
 * @returns {Promise<string[]>}
 */
export const getAllowedPackages = async () => {
  const list = await PreferencesDB.getJsonPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PACKAGES,
    [],
  );
  return Array.isArray(list) ? list : [];
};

/** Remember a package as a trusted auto-create source. */
export const learnSourcePackage = async (packageName) => {
  if (!packageName) return;
  const list = await getAllowedPackages();
  if (!list.includes(packageName)) {
    await PreferencesDB.setJsonPreference(
      PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_PACKAGES,
      [...list, packageName],
    );
  }
};

const isAllowedSource = (packageName, allowed) =>
  !!packageName && allowed.includes(packageName);

// Guards against overlapping runs (foreground listener + panel mount/refresh)
// double-creating operations: a second call awaits the first instead of racing.
let _inFlight = null;

/**
 * Process all currently-available bank notifications once.
 *
 * Safe to call repeatedly (e.g. on app foreground): already-seen notifications
 * are skipped, and overlapping invocations share a single run. Does nothing when
 * the feature is disabled.
 *
 * @returns {Promise<{ created: number, pending: number, skipped: number }>}
 */
export const processBankNotifications = async () => {
  if (_inFlight) return _inFlight;
  _inFlight = runProcess();
  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
};

const runProcess = async () => {
  const summary = { created: 0, pending: 0, skipped: 0 };

  if (!(await isBankNotificationsEnabled())) {
    return summary;
  }

  const notifications = await getRecentNotifications();
  if (!notifications || notifications.length === 0) {
    return summary;
  }

  const seen = new Set(await loadSignatures());
  const allowedPackages = await getAllowedPackages();
  const newlySeen = [];

  // Oldest first so operations are created in chronological order.
  const ordered = [...notifications].sort(
    (a, b) => (a.postTime || 0) - (b.postTime || 0),
  );

  for (const notification of ordered) {
    const signature = notificationSignature(notification);
    if (seen.has(signature)) {
      continue;
    }

    const descriptor = parseBankNotification(notification);
    if (!descriptor) {
      // Not a recognized transaction — mark seen so we don't re-parse it.
      seen.add(signature);
      newlySeen.push(signature);
      summary.skipped += 1;
      continue;
    }

    // operations.date is NOT NULL — always supply a valid date.
    const date = descriptor.date || isoDateFromPostTime(notification.postTime) || todayIso();

    try {
      const resolution = await resolveNotification(descriptor);

      // Everything an auto-create needs except the currency match. Computed first
      // so a queue-bound notification never pays for the exchange-rate fetch
      // below (whose result the pending branch would just discard and recompute
      // at resolve time). Auto-create only for trusted sources; kinds that
      // require a manual category (C2C transfers) always wait in the queue.
      const eligibleForAutoCreate =
        resolution.matchedAccount &&
        resolution.matchedCategory &&
        !descriptor.requiresCategory &&
        isAllowedSource(descriptor.packageName, allowedPackages);

      // When the account currency differs from the notification currency, convert
      // the amount at the current exchange rate (same principle as a manually
      // entered foreign-currency operation). A failed conversion (no rate) means
      // we must not book a wrong amount — leave it for manual review.
      let currencyFields = { amount: descriptor.amount };
      let currencyResolved = resolution.currencyMatch;
      if (eligibleForAutoCreate && !resolution.currencyMatch) {
        const built = await buildOperationCurrencyFields(descriptor, resolution.accountCurrency);
        if (built) {
          currencyFields = built;
          currencyResolved = true;
        }
      }

      const autoCreate = eligibleForAutoCreate && currencyResolved;

      if (autoCreate) {
        await OperationsDB.createOperation({
          type: descriptor.type,
          ...currencyFields,
          accountId: resolution.accountId,
          categoryId: resolution.categoryId,
          date,
          description: descriptor.merchant
            ? serializeLabels([descriptor.merchant])
            : null,
        });
        summary.created += 1;
      } else {
        await PendingNotificationsDB.addPendingNotification({
          ...descriptor,
          date,
          accountId: resolution.accountId,
          // Pre-fill the resolved category whenever we have an account to book
          // against; a currency mismatch is no longer a blocker since it is
          // resolved by conversion at save time.
          categoryId: resolution.matchedAccount ? resolution.categoryId : null,
        });
        summary.pending += 1;
      }

      seen.add(signature);
      newlySeen.push(signature);
    } catch (error) {
      // Leave the signature unrecorded so a transient failure is retried next run.
      console.error('[processBankNotifications] Failed to process notification:', error);
    }
  }

  if (newlySeen.length > 0) {
    await saveSignatures([...seen]);
  }

  // Refresh on any change so a pending badge updates too, not just on creates.
  if (summary.created > 0 || summary.pending > 0) {
    appEvents.emit(EVENTS.RELOAD_ALL);
  }

  return summary;
};

/**
 * Resolve a pending notification from the review queue: create the operation
 * with the user's chosen account/category, learn the bindings for next time,
 * then remove the pending row.
 *
 * @param {string} pendingId
 * @param {Object} choices - { accountId, categoryId, learnCardMask?, learnMerchant? }
 * @returns {Promise<Object|null>} the created operation, or null if not found
 */
export const resolvePendingNotification = async (pendingId, choices = {}) => {
  const pending = await PendingNotificationsDB.getPendingNotificationById(pendingId);
  if (!pending) return null;

  const accountId = choices.accountId ?? pending.accountId;
  const categoryId = choices.categoryId ?? pending.categoryId;

  if (accountId == null) {
    throw new Error('Cannot resolve pending notification without an account');
  }

  // Convert to the chosen account's currency at the current rate when they
  // differ (e.g. a EUR purchase booked against an AMD account). Unlike the
  // auto-create path (which silently re-queues when no rate is available), this
  // is a user-driven save with no further fallback — so a missing rate throws
  // rather than booking a wrong amount, surfacing the failure to the caller.
  let currencyFields = { amount: pending.amount };
  if (pending.currency) {
    const account = await AccountsDB.getAccountById(accountId);
    const accountCurrency = account ? account.currency : null;
    const built = await buildOperationCurrencyFields(pending, accountCurrency);
    if (built) {
      currencyFields = built;
    } else {
      throw new Error(
        `Cannot resolve pending notification ${pendingId}: no exchange rate for ${pending.currency}→${accountCurrency}`,
      );
    }
  }

  const operation = await OperationsDB.createOperation({
    type: pending.type,
    ...currencyFields,
    accountId,
    categoryId: categoryId || null,
    // operations.date is NOT NULL — fall back to the row's creation date / today.
    date: pending.date || (pending.createdAt ? pending.createdAt.slice(0, 10) : todayIso()),
    description: pending.merchant ? serializeLabels([pending.merchant]) : null,
  });

  // Learn the card -> account binding (default on when a card mask is present).
  if (choices.learnCardMask !== false && pending.cardMask && accountId != null) {
    try {
      await AccountsDB.setAccountCardMask(accountId, pending.cardMask);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn card mask:', error);
    }
  }

  // Learn the merchant -> category rule (default on when both are present).
  // Never learn a rule for kinds that must always be categorized manually
  // (C2C): a transfer to a friend has no stable category to remember.
  if (
    choices.learnMerchant !== false &&
    pending.merchant &&
    categoryId &&
    !kindRequiresCategory(pending.kind, pending.packageName)
  ) {
    try {
      await NotificationRulesDB.upsertMerchantRule(
        pending.merchant,
        categoryId,
        pending.packageName,
      );
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn merchant rule:', error);
    }
  }

  // Trust this source for auto-create going forward (default on).
  if (choices.learnSource !== false && pending.packageName) {
    try {
      await learnSourcePackage(pending.packageName);
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn source package:', error);
    }
  }

  await PendingNotificationsDB.deletePendingNotification(pendingId);
  appEvents.emit(EVENTS.RELOAD_ALL);
  return operation;
};

/**
 * Dismiss a pending notification without creating an operation.
 * @param {string} pendingId
 * @returns {Promise<void>}
 */
export const dismissPendingNotification = async (pendingId) => {
  await PendingNotificationsDB.deletePendingNotification(pendingId);
};

export default processBankNotifications;
