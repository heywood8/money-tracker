/**
 * Handler for the review alert's "Reject" button.
 *
 * The button answers the alert's question with "this one isn't worth recording",
 * so it does exactly what the review card's Dismiss does — drops the queued row
 * and remembers the rejection by content, so the next ingestion pass does not
 * re-queue the same transaction (see dismissPendingNotification).
 *
 * It declares `opensAppToForeground: false`, so the press must be handled without
 * the app: Android broadcasts the response, and the same handler serves both
 * paths — `useNotificationResponseRouter` when the app is running, the headless
 * notification-response task (acknowledgeTask.js) when it is not. Both may fire
 * for a backgrounded-but-alive app; the second run finds the row already gone and
 * does nothing, so the overlap is harmless.
 *
 * Pressing an action button does not clear the notification the way a tap on the
 * body does, so the tray row is the handler's to deal with — leaving a
 * notification that names a transaction the user has just rejected is the one
 * outcome the button must not produce. It is refreshed rather than simply
 * dismissed when other transactions are still waiting: the background task only
 * re-notifies for *newly* queued rows, so a blanket dismissal would leave the
 * ones already in the queue with no reminder at all.
 */

import { getPendingCount } from '../PendingNotificationsDB';
import {
  dismissNotificationById,
  isRejectPendingResponse,
  presentPendingOperationsAlert,
  responseNotificationId,
  responsePendingIds,
} from './localNotifications';
import { collectPendingAlertDetails } from './pendingAlertItems';
import { getPendingAlertCopy, isSingleItemAlert } from './notificationStrings';
import { dismissPendingNotification } from './processBankNotifications';

/**
 * Rewrite the alert for what is left in the queue after a rejection, or clear it
 * when nothing is left.
 *
 * The alert carries a fixed identifier, so re-posting replaces the row in place
 * rather than stacking beside it. Best-effort throughout: the worst outcome of a
 * failure here is a stale tray row, which the next background run replaces.
 *
 * @param {string|null} identifier - the tray id of the alert that was pressed
 * @returns {Promise<void>}
 */
const refreshOrClearAlert = async (identifier) => {
  let remaining = 0;
  try {
    remaining = await getPendingCount();
  } catch (error) {
    // Unknown queue size: clearing is the safer guess, since the row that is
    // there names a transaction the user has just answered.
  }

  if (remaining <= 0) {
    await dismissNotificationById(identifier);
    return;
  }

  try {
    const details = await collectPendingAlertDetails(remaining);
    const copy = await getPendingAlertCopy(remaining, details);
    await presentPendingOperationsAlert(
      copy,
      isSingleItemAlert(remaining, details) ? [details[0].id] : [],
    );
  } catch (error) {
    console.warn('[rejectPendingAction] Failed to refresh the review alert:', error);
    await dismissNotificationById(identifier);
  }
};

/**
 * Drop the queued rows a "Reject" press was about, then bring the alert in line
 * with what is left.
 *
 * The payload is either a NotificationResponse (a press) or a received-notification
 * payload; only the former carries `actionIdentifier`, and only our action id is
 * acted on — a plain tap routes into the app instead.
 *
 * Each rejection is attempted independently: one failing row must not leave the
 * rest queued, and the alert is brought up to date either way (it describes a
 * decision the user has already made).
 *
 * @param {object|null} payload - a NotificationResponse or TaskManager task data
 * @returns {Promise<boolean>} whether the press was ours to handle
 */
export const handleRejectPendingResponse = async (payload) => {
  if (!isRejectPendingResponse(payload)) return false;

  const ids = responsePendingIds(payload);
  // Sequential rather than parallel: each rejection writes to the database, and
  // the list is one item long in practice (the button is only offered for a
  // single-transaction alert).
  for (const id of ids) {
    try {
      await dismissPendingNotification(id);
    } catch (error) {
      console.warn('[rejectPendingAction] Failed to reject pending item:', error);
    }
  }

  await refreshOrClearAlert(responseNotificationId(payload));
  return true;
};

export default handleRejectPendingResponse;
