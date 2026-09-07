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
 * How long to wait before re-reading the native "last response" slot on a cold
 * start that found no deep link in it. Three tries over ~2s: the slot is filled
 * asynchronously and a launch press can land in it after the first read, while
 * a genuinely empty slot (the app opened from the launcher) is the common case
 * and must not keep polling.
 */
const COLD_START_RETRY_DELAYS = [250, 600, 1200];

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
 * What a response is, for the diagnostic trail: the action pressed, the route
 * it carries and the alert it belongs to. No notification text.
 */
const describe = (response) => ({
  action: response?.actionIdentifier || null,
  route: response?.notification?.request?.content?.data?.route || null,
  id: responseNotificationId(response),
});

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
    console.warn('[notif-route] Failed to clear the last notification response:', error);
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
 * Every step logs a `[notif-route]` line (no notification text) so the path a
 * press took — or did not take — can be read off the in-app log.
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

  // A response this router has finished with: remembered so nothing in this
  // process runs it twice, and — the part that matters across processes —
  // erased from the native "last response" slot.
  //
  // Only deep links used to be cleared, so an answered "Acknowledged" or
  // "Reject" sat in that slot indefinitely. The 2026-09-07 log has one from
  // 06:00:25 still coming back at 10:27:18, replayed at two cold starts in
  // between. That is not merely noisy: the slot is how a press that *launched*
  // the app is recovered, so a stale one standing in it answers the lookup a
  // real press should have answered — the app opens on its default tab and the
  // deep link is never delivered. Clearing every response the router is done
  // with keeps the slot meaning what it claims to.
  const settle = useCallback((response) => {
    handledRef.current.add(responseKey(response));
    // Compare before clearing. `clearLastNotificationResponse` empties the slot
    // whatever is in it, and between reading a response and finishing with it
    // the OS may have written a *newer* press there — the 2026-09-07 log timed
    // that gap at a single millisecond. Erasing that one would lose the very
    // deep link this router exists to deliver, so the slot is re-read and
    // cleared only while it still holds what was settled. A read that fails
    // still clears: a slot stuck on an answered press is the failure actually
    // observed, and it outlives everything until the next press lands.
    Notifications.getLastNotificationResponseAsync()
      .then((current) => {
        if (current && responseKey(current) !== responseKey(response)) {
          console.log('[notif-route] slot moved on, left alone', describe(current));
          return;
        }
        clearLastResponse();
      })
      .catch(() => clearLastResponse());
  }, []);

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
      console.log('[notif-route] acknowledged', { ...describe(response), fromColdStart });
      dismissNotificationById(responseNotificationId(response));
      settle(response);
      return;
    }
    // "Reject" likewise answers the alert instead of navigating: the item is
    // dropped from the review queue where it stands. Handled here for the
    // running app; the headless task covers the rest — which is also why a
    // cold-start replay is dropped rather than re-run. The press was already
    // performed, the queued row is long gone, and re-running it would clear
    // whatever review alert is in the tray *now*, about another transaction.
    if (isRejectPendingResponse(response)) {
      console.log('[notif-route] reject', { ...describe(response), fromColdStart });
      if (!fromColdStart) handleRejectPendingResponse(response).catch(() => {});
      settle(response);
      return;
    }
    let event = null;
    if (isPendingOperationsResponse(response)) {
      // The "Select" button lands in the same place as a tap on the body, but
      // Android's auto-cancel only covers the tap — so clear the alert here or
      // it outlives the review it asked for.
      if (isSelectPendingResponse(response)) {
        dismissNotificationById(responseNotificationId(response));
      }
      event = EVENTS.OPEN_PENDING_OPERATIONS;
    } else if (isAddedOperationsResponse(response)) {
      event = EVENTS.OPEN_ADDED_OPERATIONS;
    } else {
      // Settled like any other: left unkeyed and in the slot, it would be
      // re-read by every lookup below and sit there indefinitely — the same
      // stale-slot failure the clearing exists to prevent.
      console.log('[notif-route] ignored (no route)', describe(response));
      settle(response);
      return;
    }
    console.log('[notif-route] emit', { ...describe(response), event, fromColdStart });
    appEvents.emit(event);
    settle(response);
  }, [settle]);

  // The gate every path goes through: a deep link already routed, or already
  // waiting for the screens to mount, is dropped; anything else is delivered
  // now or queued until `enabled`.
  const route = useCallback((response, fromColdStart = false) => {
    // Deep links are keyed for the queue; every response, terminal ones
    // included, is checked against what this process has already acted on, so a
    // cold-start retry below cannot perform the same press twice.
    const seen = response ? responseKey(response) : null;
    if (seen && (handledRef.current.has(seen)
      || queuedRef.current.some((entry) => entry.key === seen))) {
      console.log('[notif-route] dropped (already routed)', describe(response));
      return;
    }
    if (!enabledRef.current) {
      console.log('[notif-route] queued until the screens mount', { ...describe(response), fromColdStart });
      queuedRef.current.push({ key: seen, response, fromColdStart });
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
    if (queued.length > 0) {
      console.log('[notif-route] screens mounted, delivering queued', { count: queued.length });
    }
    queued.forEach(({ response, fromColdStart }) => deliver(response, fromColdStart));
  }, [enabled, deliver]);

  useEffect(() => {
    activeRef.current = true;
    const timers = [];

    // Cold start: the notification that launched the app, if any.
    //
    // The slot is filled asynchronously, and the read can lose the race with
    // the press that filled it: on 2026-09-07 a foreground read returned a
    // four-hour-old response one millisecond before the listener delivered the
    // real one. On a cold start the listener is the other way this arrives and
    // it can miss its window entirely, so a lookup that comes back with no deep
    // link is retried a few times before the app gives up on the press. `route`
    // drops whatever the listener delivered in the meantime, so at most one of
    // the two wins.
    function scheduleRetry(attempt) {
      const delay = COLD_START_RETRY_DELAYS[attempt];
      if (delay == null || !activeRef.current) return;
      timers.push(setTimeout(() => lookup(attempt + 1), delay));
    }
    function lookup(attempt) {
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!activeRef.current) return;
          const deepLink = !!(response && deepLinkKey(response));
          console.log('[notif-route] cold-start lookup', response
            ? { ...describe(response), deepLink, attempt }
            : { found: false, attempt });
          // Only the first read can claim what it finds as the press that
          // launched the app. A later one is a re-read of a slot that may since
          // have taken a *warm* press, and calling that a launch replay would
          // skip the action it asks for ("Reject" is deliberately not re-run on
          // a replay) and then settle it out from under the listener that was
          // about to deliver it properly. Retries therefore carry deep links
          // only, which is all they were added for.
          if (response && (attempt === 0 || deepLink)) route(response, attempt === 0);
          if (deepLink) return;
          scheduleRetry(attempt);
        })
        .catch((error) => {
          console.warn('[notif-route] cold-start lookup failed:', error);
          // A transient read failure is precisely what the retries are for, so
          // one rejection must not end the chain.
          scheduleRetry(attempt);
        });
    }
    lookup(0);

    // Warm: taps received while the app is running.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[notif-route] listener', describe(response));
      route(response, false);
    });

    return () => {
      activeRef.current = false;
      subscription.remove();
      timers.forEach(clearTimeout);
    };
  }, [route]);

  // Foreground re-check: a press that brought a backgrounded app forward and
  // that the listener did not deliver. Deep links only — `route` drops the
  // ones already handled.
  useOnForeground(useCallback(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const deepLink = !!(response && deepLinkKey(response));
        console.log('[notif-route] foreground re-check', response ? { ...describe(response), deepLink } : { found: false });
        if (!activeRef.current || !deepLink) return;
        route(response, false);
      })
      .catch((error) => {
        console.warn('[notif-route] foreground re-check failed:', error);
      });
  }, [route]));
}
