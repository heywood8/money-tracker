import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { appEvents, EVENTS } from '../services/eventEmitter';
import { isNotificationProcessingResponse } from '../services/notifications/localNotifications';

/**
 * Routes a tapped "transactions to review" notification to the notification-
 * processing screen.
 *
 * Handles both cases:
 *   - Warm: the app is already running when the notification is tapped
 *     (addNotificationResponseReceivedListener).
 *   - Cold: the app was launched by the tap (getLastNotificationResponseAsync).
 *
 * On a match it emits OPEN_NOTIFICATION_PROCESSING, which SimpleTabs (switch to
 * the Settings tab) and SettingsScreen (open the review subpanel) listen for.
 * All tab screens are pre-mounted, so both listeners are already subscribed by
 * the time the async cold-start lookup resolves.
 *
 * Mount this once, near the app root.
 */
export default function useNotificationResponseRouter() {
  useEffect(() => {
    let active = true;

    const route = (response) => {
      if (isNotificationProcessingResponse(response)) {
        appEvents.emit(EVENTS.OPEN_NOTIFICATION_PROCESSING);
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
