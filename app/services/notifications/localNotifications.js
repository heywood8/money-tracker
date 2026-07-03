/**
 * Thin wrapper around expo-notifications for Penny's local (non-push) alerts.
 *
 * Only local, immediately-presented notifications are used — no push tokens and
 * no FCM setup. The single alert this app posts tells the user that new bank
 * transactions have landed in the review queue; tapping it deep-links into the
 * notification-processing screen (see useNotificationResponseRouter).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** Android channel the pending-operations alert is posted on. */
export const BANK_ALERTS_CHANNEL_ID = 'bank-operations';

/** Data key + value used to route a tapped notification to the review screen. */
export const NOTIFICATION_ROUTE_KEY = 'route';
export const ROUTE_NOTIFICATION_PROCESSING = 'notificationProcessing';

// A fixed identifier so a fresh alert replaces the previous one instead of
// stacking a new row every background run.
const PENDING_ALERT_IDENTIFIER = 'penny-pending-operations';

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
 * Post (or refresh) the "transactions to review" alert. Uses a fixed identifier
 * so repeated calls update a single notification rather than stacking.
 *
 * @param {{ title: string, body: string, channelName?: string }} copy
 * @returns {Promise<void>}
 */
export const presentPendingOperationsAlert = async ({ title, body, channelName }) => {
  await ensureBankAlertsChannelAsync(channelName);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: PENDING_ALERT_IDENTIFIER,
      content: {
        title,
        body,
        data: { [NOTIFICATION_ROUTE_KEY]: ROUTE_NOTIFICATION_PROCESSING },
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
 * Whether a tapped-notification response is Penny's review-queue deep link.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isNotificationProcessingResponse = (response) => {
  const data = response?.notification?.request?.content?.data;
  return !!data && data[NOTIFICATION_ROUTE_KEY] === ROUTE_NOTIFICATION_PROCESSING;
};
