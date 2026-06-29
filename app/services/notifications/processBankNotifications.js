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
import { serializeLabels, sanitizeLabel } from '../../utils/labelUtils';
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
      // Auto-create only for trusted sources; everything else is reviewed.
      // Kinds that require a manual category (C2C transfers) are never
      // auto-created — they always wait in the queue for the user's category.
      const autoCreate =
        resolution.fullyMatched &&
        !descriptor.requiresCategory &&
        isAllowedSource(descriptor.packageName, allowedPackages);

      if (autoCreate) {
        // A learned label override (e.g. "ECOSENSE BYUZAND" -> "Ecosense") wins
        // over the raw merchant for the operation's label.
        const label = resolution.labelOverride || descriptor.merchant;
        await OperationsDB.createOperation({
          type: descriptor.type,
          amount: descriptor.amount,
          accountId: resolution.accountId,
          categoryId: resolution.categoryId,
          date,
          description: label ? serializeLabels([label]) : null,
        });
        summary.created += 1;
      } else {
        await PendingNotificationsDB.addPendingNotification({
          ...descriptor,
          date,
          accountId: resolution.accountId,
          // Don't pre-fill a category whose currency we couldn't match — the
          // user should confirm the account first.
          categoryId: resolution.currencyMatch ? resolution.categoryId : null,
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

  // Resolve the operation's label. When the review UI supplies a `labelOverride`
  // (always a string from that flow) it is authoritative: its text is the label,
  // and a blank field means "no override — use the raw shop name". Programmatic
  // callers that omit the field fall back to any previously-learned override.
  const hasLabelChoice = typeof choices.labelOverride === 'string';
  const typedLabel = sanitizeLabel(choices.labelOverride); // '' when blank/absent
  const learnedLabel = pending.merchant
    ? (await NotificationRulesDB.getLabelForMerchant(pending.merchant, pending.packageName)) || ''
    : '';
  const chosenLabel = hasLabelChoice ? typedLabel : learnedLabel;
  const label = chosenLabel || pending.merchant;

  const operation = await OperationsDB.createOperation({
    type: pending.type,
    amount: pending.amount,
    accountId,
    categoryId: categoryId || null,
    // operations.date is NOT NULL — fall back to the row's creation date / today.
    date: pending.date || (pending.createdAt ? pending.createdAt.slice(0, 10) : todayIso()),
    description: label ? serializeLabels([label]) : null,
  });

  // Persist an override change only when the user actually changed it in the
  // review UI: a new/edited name is learned, a blanked field clears the override.
  // An unchanged value writes nothing — avoiding updated_at churn that would
  // reorder the rules list. A label is a display name, so — unlike the category —
  // it is learned for every kind, including C2C transfers.
  if (hasLabelChoice && pending.merchant && typedLabel !== learnedLabel) {
    try {
      await NotificationRulesDB.upsertMerchantLabel(
        pending.merchant,
        typedLabel,
        pending.packageName,
      );
    } catch (error) {
      console.error('[resolvePendingNotification] Failed to learn merchant label:', error);
    }
  }

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
