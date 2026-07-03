/**
 * Background "transactions to review" checker.
 *
 * Registers a periodic background task (Android WorkManager, via
 * expo-background-task) that runs the bank-notification ingestion pipeline while
 * the app is backgrounded or closed. When the run leaves new transactions in the
 * review queue, it posts a local notification; tapping it deep-links into the
 * notification-processing screen.
 *
 * The task definition must be registered at module load — before the OS spins up
 * the headless JS context — so this module is imported from the app entry point
 * (index.js). Registration with the OS scheduler is opt-in and mirrors the two
 * stored preferences (bank processing on + background alerts on).
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as PreferencesDB from '../PreferencesDB';
import { getPendingCount } from '../PendingNotificationsDB';
import { isBankNotificationsEnabled, processBankNotifications } from './processBankNotifications';
import {
  areNotificationsGranted,
  presentPendingOperationsAlert,
} from './localNotifications';
import { getPendingAlertCopy } from './notificationStrings';

/** Task identifier, also used as the WorkManager unique work name. */
export const BACKGROUND_BANK_TASK = 'penny-background-bank-notifications';

// Requested cadence in minutes. The OS treats this as a floor and batches
// wakeups for battery; 15 is the platform minimum. WorkManager persists the
// registration across app termination and reboots.
const MINIMUM_INTERVAL_MINUTES = 15;

/**
 * Whether background alerts are enabled (default off). This is the second gate
 * on top of the bank-processing feature flag.
 * @returns {Promise<boolean>}
 */
export const isBackgroundAlertsEnabled = async () => {
  const value = await PreferencesDB.getPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_BACKGROUND_ALERTS,
    '0',
  );
  return value === '1' || value === 'true';
};

/**
 * Enable/disable background alerts.
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export const setBackgroundAlertsEnabled = async (enabled) => {
  await PreferencesDB.setPreference(
    PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_BACKGROUND_ALERTS,
    enabled ? '1' : '0',
  );
};

/**
 * The work performed on each background wakeup (exported for direct testing).
 *
 * Ingests any newly-captured bank notifications, and — when this run queued new
 * items for review and the OS notification permission is granted — posts/refreshes
 * the pending-operations alert with the current review-queue size.
 *
 * @returns {Promise<{ created: number, pending: number, skipped: number, notified: boolean }>}
 */
export const runBackgroundBankCheck = async () => {
  const idle = { created: 0, pending: 0, skipped: 0, notified: false };

  // Respect both gates: the feature must be on and background alerts opted into.
  if (!(await isBankNotificationsEnabled())) return idle;
  if (!(await isBackgroundAlertsEnabled())) return idle;

  const summary = await processBankNotifications();

  // Only nudge when this run added something new to review — already-pending
  // items the user hasn't gotten to yet must not re-notify on every wakeup.
  if (summary.pending > 0 && (await areNotificationsGranted())) {
    const totalPending = await getPendingCount();
    const copy = await getPendingAlertCopy(totalPending);
    await presentPendingOperationsAlert(copy);
    return { ...summary, notified: true };
  }

  return { ...summary, notified: false };
};

// Define the task at module load so the OS can invoke it headless. The executor
// returns a BackgroundTaskResult; a thrown error is reported as Failed so the
// scheduler can back off rather than treating the run as successful.
TaskManager.defineTask(BACKGROUND_BANK_TASK, async () => {
  try {
    await runBackgroundBankCheck();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[backgroundBankTask] run failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Register the periodic task with the OS scheduler (idempotent). No-op when the
 * platform reports background execution as restricted.
 * @returns {Promise<boolean>} whether the task is registered afterwards
 */
export const registerBackgroundBankTaskAsync = async () => {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return false;
    }
    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_BANK_TASK);
    if (!alreadyRegistered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_BANK_TASK, {
        minimumInterval: MINIMUM_INTERVAL_MINUTES,
      });
    }
    return true;
  } catch (error) {
    console.warn('[backgroundBankTask] register failed:', error);
    return false;
  }
};

/**
 * Remove the periodic task from the OS scheduler (idempotent).
 * @returns {Promise<void>}
 */
export const unregisterBackgroundBankTaskAsync = async () => {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_BANK_TASK);
    if (registered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_BANK_TASK);
    }
  } catch (error) {
    console.warn('[backgroundBankTask] unregister failed:', error);
  }
};

/**
 * Reconcile the OS registration with the stored preferences. Registers when both
 * bank processing and background alerts are on; unregisters otherwise. Called at
 * app start and whenever either preference changes.
 * @returns {Promise<boolean>} whether the task is registered afterwards
 */
export const syncBackgroundBankTaskRegistrationAsync = async () => {
  const shouldRun =
    (await isBankNotificationsEnabled()) && (await isBackgroundAlertsEnabled());
  if (shouldRun) {
    return registerBackgroundBankTaskAsync();
  }
  await unregisterBackgroundBankTaskAsync();
  return false;
};
