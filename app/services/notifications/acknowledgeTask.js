/**
 * Background handler for the notification buttons that never open the app.
 *
 * expo-notifications registers a single task for notification responses, so this
 * is the headless entry point for all of them: the receipt's "Acknowledged" and
 * the review alert's "Reject" (see rejectPendingAction.js). Both declare
 * `opensAppToForeground: false`, which means the press must be handled *without*
 * the app: Android broadcasts the response and runs the task registered here,
 * spinning up a headless JS context when the app is backgrounded or killed.
 *
 * Pressing a notification action button also does not clear the notification —
 * Android's auto-cancel only covers a tap on the body — so the dismissal is the
 * app's job in either case.
 *
 * The foreground path is separate and lives in `useNotificationResponseRouter`
 * (a running app receives the same response through its listener). Both may fire
 * for a backgrounded-but-alive app; dismissing an already-dismissed notification
 * is a no-op, so the overlap is harmless.
 *
 * As with the ingestion task, the definition must run at module load — before
 * the OS starts the headless context — so this module is imported from index.js.
 */

import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import {
  ACKNOWLEDGE_ACTION_ID,
  dismissNotificationById,
  isAcknowledgeResponse,
  responseNotificationId,
} from './localNotifications';
import { handleRejectPendingResponse } from './rejectPendingAction';

/** Task identifier for the notification-response handler. */
export const ACKNOWLEDGE_TASK = 'penny-notification-acknowledge';

/**
 * Clear the notification whose "Acknowledged" button was pressed.
 *
 * The payload is either a NotificationResponse (a press) or a received-notification
 * payload; only the former carries `actionIdentifier`, and only our action id is
 * acted on — a plain tap routes through the app instead.
 *
 * @param {object|null} payload - TaskManager task data
 * @returns {Promise<boolean>} whether a notification was dismissed
 */
export const handleAcknowledgePayload = async (payload) => {
  if (!isAcknowledgeResponse(payload)) return false;
  const identifier = responseNotificationId(payload);
  if (!identifier) return false;
  await dismissNotificationById(identifier);
  return true;
};

// Defined at module load so the OS can invoke it headless. Errors are swallowed:
// a failed dismissal must not crash the task, and the user can still swipe the
// notification away.
TaskManager.defineTask(ACKNOWLEDGE_TASK, async ({ data, error }) => {
  if (error) return;
  try {
    // Each handler ignores a payload that is not its own action, so the order
    // between them carries no meaning — at most one of them acts.
    await handleAcknowledgePayload(data);
    await handleRejectPendingResponse(data);
  } catch (taskError) {
    console.warn('[acknowledgeTask] failed to handle response:', taskError);
  }
});

/**
 * Register the handler with expo-notifications (idempotent). Without this the
 * button silently does nothing while the app is not running.
 *
 * @returns {Promise<boolean>} whether registration succeeded
 */
export const registerAcknowledgeTaskAsync = async () => {
  try {
    await Notifications.registerTaskAsync(ACKNOWLEDGE_TASK);
    return true;
  } catch (error) {
    console.warn('[acknowledgeTask] register failed:', error);
    return false;
  }
};

export { ACKNOWLEDGE_ACTION_ID };
