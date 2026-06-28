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
import * as NotificationRulesDB from '../NotificationRulesDB';
import * as PendingNotificationsDB from '../PendingNotificationsDB';
import { serializeLabels } from '../../utils/labelUtils';
import { appEvents, EVENTS } from '../eventEmitter';
import { parseBankNotification } from './parseBankNotification';
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
 * Process all currently-available bank notifications once.
 *
 * Safe to call repeatedly (e.g. on app foreground): already-seen notifications
 * are skipped. Does nothing when the feature is disabled.
 *
 * @returns {Promise<{ created: number, pending: number, skipped: number }>}
 */
export const processBankNotifications = async () => {
  const summary = { created: 0, pending: 0, skipped: 0 };

  if (!(await isBankNotificationsEnabled())) {
    return summary;
  }

  const notifications = await getRecentNotifications();
  if (!notifications || notifications.length === 0) {
    return summary;
  }

  const seen = new Set(await loadSignatures());
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

    try {
      const resolution = await resolveNotification(descriptor);

      if (resolution.fullyMatched) {
        await OperationsDB.createOperation({
          type: descriptor.type,
          amount: descriptor.amount,
          accountId: resolution.accountId,
          categoryId: resolution.categoryId,
          date: descriptor.date,
          description: descriptor.merchant
            ? serializeLabels([descriptor.merchant])
            : null,
        });
        summary.created += 1;
      } else {
        await PendingNotificationsDB.addPendingNotification({
          ...descriptor,
          accountId: resolution.accountId,
          categoryId: resolution.categoryId,
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

  if (summary.created > 0) {
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

  const operation = await OperationsDB.createOperation({
    type: pending.type,
    amount: pending.amount,
    accountId,
    categoryId: categoryId || null,
    date: pending.date,
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
  if (choices.learnMerchant !== false && pending.merchant && categoryId) {
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
