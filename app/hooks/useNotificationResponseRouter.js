import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { appEvents, EVENTS } from '../services/eventEmitter';
import {
  dismissNotificationById,
  isAcknowledgeResponse,
  isAddedOperationsResponse,
  isPendingOperationsResponse,
  isRejectPendingResponse,
  isSelectPendingResponse,
  responseNotificationId,
} from '../services/notifications/localNotifications';
import { handleRejectPendingResponse } from '../services/notifications/rejectPendingAction';

/**
 * Routes a tapped "transactions to review" notification to the quick-add surface
 * on the operations page, where the queued suggestions are stacked as binding
 * cards over the form — reviewing them is an operations task, not a settings one.
 *
 * The sibling "operations added" notification routes to the same page but not to
 * the deck: those operations are already booked, so the user wants to see them in
 * the list, not a review surface.
 *
 * The alert's two buttons are handled here too: "Select" is the same deep link
 * as a tap on the body (plus the dismissal Android does not do for a button),
 * while "Reject" navigates nowhere — it drops the queued item where it stands.
 *
 * Handles both cases:
 *   - Warm: the app is already running when the notification is tapped
 *     (addNotificationResponseReceivedListener).
 *   - Cold: the app was launched by the tap (getLastNotificationResponseAsync).
 *
 * On a match it emits OPEN_PENDING_OPERATIONS, which SimpleTabs (switch to the
 * Operations tab) and OperationsScreen (close search, scroll the deck into view,
 * refresh the queue) listen for. All tab screens are pre-mounted, so both
 * listeners are already subscribed by the time the async cold-start lookup
 * resolves — and Operations is the default tab anyway, so a missed cold-start
 * emit still lands the user on the right screen.
 *
 * Mount this once, near the app root.
 */
export default function useNotificationResponseRouter() {
  useEffect(() => {
    let active = true;

    // `fromColdStart` marks the response expo-notifications replays on launch.
    // It is how a press that opened the app arrives — but it is also handed back
    // on a later launch from the home screen, so a press that never opens the
    // app (Reject) is *always* a replay here and must not be acted on twice.
    const route = (response, fromColdStart = false) => {
      // "Acknowledged" is checked first and navigates nowhere: it means "seen,
      // dismiss it", so treating it as a tap would yank the user into the app.
      // Clearing it here covers the running app; acknowledgeTask covers the rest.
      if (isAcknowledgeResponse(response)) {
        dismissNotificationById(responseNotificationId(response));
        return;
      }
      // "Reject" likewise answers the alert instead of navigating: the item is
      // dropped from the review queue where it stands. Handled here for the
      // running app; the headless task covers the rest — which is also why a
      // cold-start replay is dropped rather than re-run. The press was already
      // performed, the queued row is long gone, and re-running it would clear
      // whatever review alert is in the tray *now*, about another transaction.
      if (isRejectPendingResponse(response)) {
        if (!fromColdStart) handleRejectPendingResponse(response).catch(() => {});
        return;
      }
      if (isPendingOperationsResponse(response)) {
        // The "Select" button lands in the same place as a tap on the body, but
        // Android's auto-cancel only covers the tap — so clear the alert here or
        // it outlives the review it asked for.
        if (isSelectPendingResponse(response)) {
          dismissNotificationById(responseNotificationId(response));
        }
        appEvents.emit(EVENTS.OPEN_PENDING_OPERATIONS);
      } else if (isAddedOperationsResponse(response)) {
        appEvents.emit(EVENTS.OPEN_ADDED_OPERATIONS);
      }
    };

    // Cold start: the notification that launched the app, if any.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) route(response, true);
      })
      .catch(() => {});

    // Warm: taps received while the app is running.
    const subscription = Notifications.addNotificationResponseReceivedListener(route);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
