/**
 * Thin wrapper around expo-notifications for Penny's local (non-push) alerts.
 *
 * Only local, immediately-presented notifications are used — no push tokens and
 * no FCM setup. Two alerts are posted, both from the background task:
 *
 * - **transactions to review** — new items landed in the review queue; tapping
 *   deep-links to the quick-add surface on the operations page, where the queue
 *   is stacked as binding cards over the form (see useNotificationResponseRouter).
 * - **operations added** — the run booked fully-matched operations on its own.
 *   Without it the silent auto-create path is invisible until the user next opens
 *   the app; tapping lands on the operations list where the new rows are.
 *
 * They are separate notifications (distinct identifiers) because they ask for
 * different things: one is a task, the other is a receipt.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** Android channel the pending-operations alert is posted on. */
export const BANK_ALERTS_CHANNEL_ID = 'bank-operations';

/**
 * Data key + value used to route a tapped notification to the review surface.
 * The value keeps its original 'notificationProcessing' wording so an alert
 * posted by an older build (still sitting in the tray across an update) keeps
 * routing after the destination moved to the operations page.
 */
export const NOTIFICATION_ROUTE_KEY = 'route';
export const ROUTE_PENDING_OPERATIONS = 'notificationProcessing';

/**
 * Route value for the "operations added" alert. Distinct from the review route:
 * there is nothing to resolve, so the tap opens the operations list rather than
 * the suggestion deck.
 */
export const ROUTE_ADDED_OPERATIONS = 'addedOperations';

// A fixed identifier so a fresh alert replaces the previous one instead of
// stacking a new row every background run.
const PENDING_ALERT_IDENTIFIER = 'penny-pending-operations';

// The auto-added receipt does NOT replace in place: each run's receipt describes
// different operations, so reusing one identifier would let a later booking
// silently erase an unread notice of an earlier one — the exact thing this alert
// exists to prevent. A per-post identifier stacks them instead (Android groups
// them under the channel once there are several), and the prefix keeps them
// recognizable as ours.
const ADDED_ALERT_PREFIX = 'penny-added-operations';

// Foreground presentation: show the alert as a banner + in the tray even while
// the app is open, but stay quiet (no sound/badge) — it is a low-urgency nudge.
// Set once at module load so it is in effect for both foreground and headless
// (background task) presentations.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Create (or update the name of) the Android notification channel. No-op on
 * platforms without channels. Safe to call repeatedly.
 *
 * @param {string} [name] - localized channel name shown in system settings
 * @returns {Promise<void>}
 */
export const ensureBankAlertsChannelAsync = async (name) => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(BANK_ALERTS_CHANNEL_ID, {
      name: name || 'Bank operations',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (error) {
    // Non-fatal: the notification can still post to the default channel.
  }
};

/**
 * Whether the OS notification permission is currently granted.
 * @returns {Promise<boolean>}
 */
export const areNotificationsGranted = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    return false;
  }
};

/**
 * Ensure the OS notification permission, prompting the user if it has not been
 * decided yet. Resolves to whether permission is granted afterwards.
 * @returns {Promise<boolean>}
 */
export const requestNotificationsPermission = async () => {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch (error) {
    return false;
  }
};

/**
 * Post one of the bank alerts. Reusing an identifier updates that notification
 * in place instead of stacking a second row; see each caller for which it wants.
 *
 * The body may be multi-line (one line per transaction): expo-notifications wraps
 * the Android notification in a BigTextStyle, so the collapsed row shows the first
 * line and expanding the shade reveals the rest.
 *
 * @param {string} identifier - notification id
 * @param {string} route - deep-link route value carried in the payload
 * @param {{ title: string, body: string, channelName?: string }} copy
 * @returns {Promise<void>}
 */
const presentBankAlert = async (identifier, route, { title, body, channelName }) => {
  await ensureBankAlertsChannelAsync(channelName);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        data: { [NOTIFICATION_ROUTE_KEY]: route },
      },
      // `null` presents the notification immediately, but assigns it to the
      // Android channel above (channelId is read from the content on 8.0+).
      trigger: Platform.OS === 'android'
        ? { channelId: BANK_ALERTS_CHANNEL_ID }
        : null,
    });
  } catch (error) {
    // Non-fatal: a failed alert must never crash the background task.
  }
};

/**
 * Post (or refresh) the "transactions to review" alert.
 *
 * @param {{ title: string, body: string, channelName?: string }} copy
 * @returns {Promise<void>}
 */
export const presentPendingOperationsAlert = async (copy) =>
  presentBankAlert(PENDING_ALERT_IDENTIFIER, ROUTE_PENDING_OPERATIONS, copy);

/**
 * Post the "operations added" alert — the receipt for operations a background run
 * booked on its own, which would otherwise happen invisibly. Each call posts its
 * own notification (see ADDED_ALERT_PREFIX) rather than replacing the last.
 *
 * @param {{ title: string, body: string, channelName?: string }} copy
 * @returns {Promise<void>}
 */
export const presentAddedOperationsAlert = async (copy) =>
  presentBankAlert(`${ADDED_ALERT_PREFIX}-${Date.now()}`, ROUTE_ADDED_OPERATIONS, copy);

/**
 * Dismiss the "transactions to review" alert from the tray.
 *
 * Used when the review queue empties — every queued item resolved, dismissed, or
 * pruned as a duplicate of an operation the user already recorded — so the shade
 * no longer nags about transactions that are no longer waiting. Best-effort: a
 * failed dismissal is non-fatal (the alert is low-urgency and self-replaces on
 * the next background run).
 *
 * @returns {Promise<void>}
 */
export const dismissPendingOperationsAlert = async () => {
  try {
    await Notifications.dismissNotificationAsync(PENDING_ALERT_IDENTIFIER);
  } catch (error) {
    // Non-fatal — the alert is a low-urgency nudge and will refresh on its own.
  }
};

/**
 * The route a tapped notification carries, or null when it is not one of ours.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {string|null}
 */
const routeOf = (response) => {
  const data = response?.notification?.request?.content?.data;
  return data ? data[NOTIFICATION_ROUTE_KEY] || null : null;
};

/**
 * Whether a tapped-notification response is Penny's review-queue deep link.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isPendingOperationsResponse = (response) =>
  routeOf(response) === ROUTE_PENDING_OPERATIONS;

/**
 * Whether a tapped-notification response is the auto-added receipt's deep link.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isAddedOperationsResponse = (response) =>
  routeOf(response) === ROUTE_ADDED_OPERATIONS;
