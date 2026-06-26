import * as IntentLauncher from 'expo-intent-launcher';
import { NativeModules } from 'react-native';

/**
 * Android settings action that opens the system "Notification access" screen,
 * where the user can grant Penny permission to read notifications.
 */
export const NOTIFICATION_LISTENER_SETTINGS_ACTION =
  'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS';

const { PennyNotifications } = NativeModules;

/**
 * Opens the system "Notification access" settings screen so the user can grant
 * (or revoke) Penny's permission to read notifications in the background.
 *
 * @returns {Promise<void>}
 */
export const openNotificationAccessSettings = async () => {
  await IntentLauncher.startActivityAsync(NOTIFICATION_LISTENER_SETTINGS_ACTION);
};

/**
 * Whether the user has already granted Penny notification-access permission.
 *
 * Backed by the native PennyNotifications module. Resolves to `false` when the
 * module is unavailable (e.g. running on an unsupported build) or the lookup
 * fails, so callers can safely treat a `false` result as "not granted".
 *
 * @returns {Promise<boolean>}
 */
export const isNotificationAccessEnabled = async () => {
  if (!PennyNotifications?.isNotificationAccessEnabled) return false;
  try {
    return await PennyNotifications.isNotificationAccessEnabled();
  } catch (error) {
    return false;
  }
};

/**
 * The most recent notifications recorded by the listener service, newest first.
 *
 * Each entry is `{ title, text, packageName, postTime }`. Resolves to an empty
 * array when the module is unavailable or the read fails.
 *
 * @returns {Promise<Array<{ title: string, text: string, packageName: string, postTime: number }>>}
 */
export const getRecentNotifications = async () => {
  if (!PennyNotifications?.getRecentNotifications) return [];
  try {
    const items = await PennyNotifications.getRecentNotifications();
    return Array.isArray(items) ? items : [];
  } catch (error) {
    return [];
  }
};
