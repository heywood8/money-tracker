import { useCallback, useEffect, useRef } from 'react';
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
import useOnForeground from './useOnForeground';

/**
 * One key per press, so a response already routed can be told from a new one.
 * Our alerts reuse a fixed identifier, so the post date is what separates two
 * presses on re-posted alerts.
 *
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {string}
 */
export const responseKey = (response) => [
  response?.actionIdentifier || 'tap',
  response?.notification?.request?.identifier || '',
  response?.notification?.date || '',
].join('|');

/**
 * The key a deep link is remembered under — a tap on the review alert's body or
 * its "Select" button, or a tap on the receipt — and null for anything else: the
 * answered buttons are never replayed by design, and an unrelated response is
 * never routed.
 */
const deepLinkKey = (response) => {
  if (isAcknowledgeResponse(response) || isRejectPendingResponse(response)) return null;
  if (!isPendingOperationsResponse(response) && !isAddedOperationsResponse(response)) return null;
  return responseKey(response);
};

/**
 * Forget the response once it has been acted on, so neither a later launch nor
 * the next foreground re-check replays it.
 */
const clearLastResponse = () => {
  try {
    Notifications.clearLastNotificationResponse();
  } catch (error) {
    // The key set still keeps this process from routing the press twice; a
    // later launch may replay it, which is worth knowing about.
    console.warn('[useNotificationResponseRouter] Failed to clear the last notification response:', error);
  }
};

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
 * Three paths deliver a response:
 *   - Warm: the app is already running when the notification is tapped
 *     (addNotificationResponseReceivedListener).
 *   - Cold: the app was launched by the tap (getLastNotificationResponseAsync).
 *   - Foreground re-check: the app was in the background and the press brought
 *     it forward. The listener is expected to fire for that too, but nothing
 *     guarantees it, so the last response is read again on every return to the
 *     foreground. Only deep links are re-run this way: "Reject" and
 *     "Acknowledged" were performed headless when the press happened, and
 *     performing them again would act on whatever alert is in the tray now.
 *
 * All three funnel through one gate that routes a deep link once per press —
 * the listener and the cold-start lookup can both hand over the press that
 * launched the app, and the re-check can hand over one the listener already
 * delivered — and a routed deep link is then cleared natively so a later launch
 * does not replay it either.
 *
 * `enabled` says whether the screens that act on the events are mounted.
 * AppInitializer renders nothing until the language preference and the database
 * are ready, so a cold-start response resolving before that has nobody to hear
 * it; responses that arrive while disabled are queued and delivered the moment
 * it flips. Mount this once, near the app root.
 *
 * @param {{ enabled?: boolean }} [options]
 */
export default function useNotificationResponseRouter({ enabled = true } = {}) {
  const enabledRef = useRef(enabled);
  // Responses that arrived before the screens acting on them were mounted.
  const queuedRef = useRef([]);
  // Keys (responseKey) of the deep links already routed.
  const handledRef = useRef(new Set());
  // Guards the async lookups from routing after unmount.
  const activeRef = useRef(true);

  // The one place a response is acted on; `route` below decides whether it
  // gets here. `fromColdStart` marks the response expo-notifications replays
  // on launch. It is how a press that opened the app arrives — but it is also
  // handed back on a later launch from the home screen, so a press that never
  // opens the app (Reject) is *always* a replay here and must not be acted on
  // twice.
  const deliver = useCallback((response, fromColdStart) => {
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
    } else {
      return;
    }
    handledRef.current.add(responseKey(response));
    clearLastResponse();
  }, []);

  // The gate every path goes through: a deep link already routed, or already
  // waiting for the screens to mount, is dropped; anything else is delivered
  // now or queued until `enabled`.
  const route = useCallback((response, fromColdStart = false) => {
    const key = deepLinkKey(response);
    if (key && (handledRef.current.has(key) || queuedRef.current.some((entry) => entry.key === key))) {
      return;
    }
    if (!enabledRef.current) {
      queuedRef.current.push({ key, response, fromColdStart });
      return;
    }
    deliver(response, fromColdStart);
  }, [deliver]);

  // Deliver whatever arrived while the listeners were still unmounted.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) return;
    const queued = queuedRef.current;
    queuedRef.current = [];
    queued.forEach(({ response, fromColdStart }) => deliver(response, fromColdStart));
  }, [enabled, deliver]);

  useEffect(() => {
    activeRef.current = true;

    // Cold start: the notification that launched the app, if any.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (activeRef.current && response) route(response, true);
      })
      .catch(() => {});

    // Warm: taps received while the app is running.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => route(response, false),
    );

    return () => {
      activeRef.current = false;
      subscription.remove();
    };
  }, [route]);

  // Foreground re-check: a press that brought a backgrounded app forward and
  // that the listener did not deliver. Deep links only — `route` drops the
  // ones already handled.
  useOnForeground(useCallback(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!activeRef.current || !response || !deepLinkKey(response)) return;
        route(response, false);
      })
      .catch(() => {});
  }, [route]));
}
