import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { appEvents, EVENTS } from '../services/eventEmitter';
import {
  dismissNotificationById,
  isAcknowledgeResponse,
  isAddedOperationsResponse,
  isPendingOperationsResponse,
  responseNotificationId,
} from '../services/notifications/localNotifications';

/**
 * Routes a tapped "transactions to review" notification to the quick-add surface
 * on the operations page, where the queued suggestions are stacked as binding
 * cards over the form — reviewing them is an operations task, not a settings one.
 *
 * The sibling "operations added" notification routes to the same page but not to
 * the deck: those operations are already booked, so the user wants to see them in
 * the list, not a review surface.
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

    const route = (response) => {
      // "Acknowledged" is checked first and navigates nowhere: it means "seen,
      // dismiss it", so treating it as a tap would yank the user into the app.
      // Clearing it here covers the running app; acknowledgeTask covers the rest.
      if (isAcknowledgeResponse(response)) {
        dismissNotificationById(responseNotificationId(response));
        return;
      }
      if (isPendingOperationsResponse(response)) {
        appEvents.emit(EVENTS.OPEN_PENDING_OPERATIONS);
      } else if (isAddedOperationsResponse(response)) {
        appEvents.emit(EVENTS.OPEN_ADDED_OPERATIONS);
      }
    };

    // Cold start: the notification that launched the app, if any.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) route(response);
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
