import * as IntentLauncher from 'expo-intent-launcher';

/**
 * Android settings action that opens the system "Notification access" screen,
 * where the user can grant Penny permission to read notifications.
 */
export const NOTIFICATION_LISTENER_SETTINGS_ACTION =
  'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS';

/**
 * Opens the system "Notification access" settings screen so the user can grant
 * (or revoke) Penny's permission to read notifications in the background.
 *
 * This only navigates the user to the system screen — it does not read, store,
 * or process any notifications.
 *
 * @returns {Promise<void>}
 */
export const openNotificationAccessSettings = async () => {
  await IntentLauncher.startActivityAsync(NOTIFICATION_LISTENER_SETTINGS_ACTION);
};
