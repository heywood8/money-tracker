/**
 * Background bank-notification checker.
 *
 * Registers a periodic background task (Android WorkManager, via
 * expo-background-task) that runs the bank-notification ingestion pipeline while
 * the app is backgrounded or closed, and reports what it did:
 *
 * - new transactions left in the review queue → the "transactions to review"
 *   alert, deep-linking into the review surface;
 * - fully-matched transactions the run booked on its own → the "operations added"
 *   alert, so the silent auto-create path is no longer invisible until the user
 *   next opens the app. Skipped when the app is on screen at reporting time: the
 *   create was not silent then, and the receipt would only repeat the row
 *   RELOAD_ALL has already put in front of the user.
 *
 * Both are posted only from here (the foreground pipeline runs while the user is
 * already looking at the app, where RELOAD_ALL refreshes the lists instead) — but
 * a run that *started* backgrounded can still *finish* under an open app, which
 * is what the on-screen check above is about (see appForeground.js).
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
  presentAddedOperationsAlert,
  presentPendingOperationsAlert,
} from './localNotifications';
import { getAddedAlertCopy, getPendingAlertCopy } from './notificationStrings';
import { collectPendingAlertDetails } from './pendingAlertItems';
import { collectAddedAlertDetails } from './addedAlertItems';
import { isAppInForeground } from './appForeground';

/** Task identifier, also used as the WorkManager unique work name. */
export const BACKGROUND_BANK_TASK = 'penny-background-bank-notifications';

// Requested cadence in minutes, so a purchase is picked up within a minute of
// the bank posting its notification rather than up to a quarter of an hour later.
//
// This value is honoured fairly literally on Android 8+: expo-background-task
// does not use WorkManager's periodic work there (whose 15-minute floor would
// clamp it) but chains a one-shot request with `setInitialDelay(interval)`,
// re-enqueueing after each run. Doze and the OS's battery heuristics still delay
// wakeups on an idle device, and each run needs network (the worker is enqueued
// with a CONNECTED constraint), so the cadence is a ceiling, not a guarantee.
//
// The cost is real — a minutely wakeup for a run that is usually a no-op — which
// is why it stays behind the background-alerts opt-in. Pushing each notification
// into a headless run from the native listener, instead of this pull-based poll,
// would be both cheaper and faster; it is the natural next step.
//
// WorkManager persists the registration across app termination and reboots.
const MINIMUM_INTERVAL_MINUTES = 1;

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
 * Ingests any newly-captured bank notifications and reports the outcome, as long
 * as the OS notification permission is granted:
 *
 * - `notifiedAdded` — this run auto-created operations *and* the app was not on
 *   screen, so the "operations added" receipt was posted describing what was
 *   booked and where it landed. False for a booking made under an open app,
 *   which the user watches land in the list instead.
 * - `notified` — this run queued new items for review, so the pending alert was
 *   posted/refreshed with the current queue size plus what each item still needs.
 *
 * A single run can do both (some notifications book, others need input); the two
 * alerts carry separate identifiers and neither replaces the other.
 *
 * @returns {Promise<{ created: number, pending: number, skipped: number,
 *   notified: boolean, notifiedAdded: boolean }>}
 */
export const runBackgroundBankCheck = async () => {
  const idle = { created: 0, pending: 0, skipped: 0, notified: false, notifiedAdded: false };

  // Respect both gates: the feature must be on and background alerts opted into.
  if (!(await isBankNotificationsEnabled())) return idle;
  if (!(await isBackgroundAlertsEnabled())) return idle;

  // Overlapping callers are handed the same summary, so this wakeup may be
  // reporting work another caller performed and is also reporting. Reporting it
  // is still right — the performer is often an app-open ingestion that posts
  // nothing at all — but each alert has to be idempotent about what it puts in
  // the tray, or one booking lands there twice. See presentAddedOperationsAlert
  // (keyed on the operations) and the review alert's fixed identifier.
  const summary = await processBankNotifications();

  // The receipt exists because an auto-create is otherwise invisible until the
  // app is next opened — which is not true when the app is open by the time the
  // run reports: the booking emitted RELOAD_ALL into a live app, so the operation
  // is already in its lists. Read *here*, after the run, rather than before it:
  // a wakeup that starts backgrounded and finishes under an app the user has
  // since opened is the case worth suppressing, and only the state at reporting
  // time can see it (see appForeground.js).
  const reportAdded = summary.created > 0 && !isAppInForeground();

  // Nothing to say: nothing worth reporting was booked and nothing new needs
  // review. Skip the permission check too — it is only needed to post.
  if (!reportAdded && summary.pending <= 0) {
    return { ...summary, notified: false, notifiedAdded: false };
  }
  if (!(await areNotificationsGranted())) {
    return { ...summary, notified: false, notifiedAdded: false };
  }

  let notifiedAdded = false;
  // Tell the user about operations booked without asking. Describes what was
  // booked (amount, payee, account, category / cash account); an empty list
  // degrades to the plain count-only copy.
  if (reportAdded) {
    const addedDetails = await collectAddedAlertDetails(summary.createdItems);
    const addedCopy = await getAddedAlertCopy(summary.created, addedDetails);
    // Key the receipt on the operations it describes, so a second wakeup handed
    // this same run's summary lands on the notification already in the tray
    // instead of stacking an identical copy beside it.
    await presentAddedOperationsAlert(
      addedCopy,
      (summary.createdItems || []).map((item) => item.operationId),
    );
    notifiedAdded = true;
  }

  // Only nudge about review when this run added something new to it — already-
  // pending items the user hasn't gotten to yet must not re-notify every wakeup.
  if (summary.pending > 0) {
    const totalPending = await getPendingCount();
    // Describe what this run actually queued (amount, payee, resolved account /
    // category, and the field still missing) so the alert is actionable at a
    // glance; an empty list degrades to the plain count-only copy.
    const details = await collectPendingAlertDetails(summary.pending);
    const copy = await getPendingAlertCopy(totalPending, details);
    await presentPendingOperationsAlert(copy);
    return { ...summary, notified: true, notifiedAdded };
  }

  return { ...summary, notified: false, notifiedAdded };
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
 *
 * An existing registration is left alone *unless* it was made with a different
 * cadence: the OS persists the registration (and the interval it carries) across
 * restarts and app updates, so a build that changes `MINIMUM_INTERVAL_MINUTES`
 * would otherwise ship the new cadence to fresh installs only, leaving every
 * existing user on the old one forever. The interval last registered with is
 * therefore recorded, and a mismatch re-registers.
 *
 * @returns {Promise<boolean>} whether the task is registered afterwards
 */
export const registerBackgroundBankTaskAsync = async () => {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return false;
    }
    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_BANK_TASK);
    const registeredInterval = await PreferencesDB.getNumberPreference(
      PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_TASK_INTERVAL,
      null,
    );
    if (alreadyRegistered && registeredInterval === MINIMUM_INTERVAL_MINUTES) {
      return true;
    }
    // Registering over a live registration does not update its options, so an
    // interval change has to tear the old one down first.
    if (alreadyRegistered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_BANK_TASK);
    }
    await BackgroundTask.registerTaskAsync(BACKGROUND_BANK_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
    await PreferencesDB.setPreference(
      PreferencesDB.PREF_KEYS.BANK_NOTIFICATIONS_TASK_INTERVAL,
      String(MINIMUM_INTERVAL_MINUTES),
    );
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
