/**
 * Thin wrapper around expo-notifications for Penny's local (non-push) alerts.
 *
 * Only local, immediately-presented notifications are used — no push tokens and
 * no FCM setup. Two alerts are posted, both from the background task:
 *
 * - **transactions to review** — new items landed in the review queue; tapping
 *   deep-links to the quick-add surface on the operations page, where the queue
 *   is stacked as binding cards over the form (see useNotificationResponseRouter).
 *   It carries two buttons — "Select" (the same deep link, spelled out) and,
 *   when the alert is about a single transaction, "Reject", which drops that
 *   transaction from the queue without opening the app.
 * - **operations added** — the run booked fully-matched operations on its own.
 *   Without it the silent auto-create path is invisible until the user next opens
 *   the app; tapping lands on the operations list where the new rows are.
 *
 * They are separate notifications (distinct identifiers) because they ask for
 * different things: one is a task, the other is a receipt.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** Android channel the pending-operations alert is posted on. */
export const BANK_ALERTS_CHANNEL_ID = 'bank-operations';

/**
 * Data key + value used to route a tapped notification to the review surface.
 * The value keeps its original 'notificationProcessing' wording so an alert
 * posted by an older build (still sitting in the tray across an update) keeps
 * routing after the destination moved to the operations page.
 */
export const NOTIFICATION_ROUTE_KEY = 'route';
export const ROUTE_PENDING_OPERATIONS = 'notificationProcessing';

/**
 * Route value for the "operations added" alert. Distinct from the review route:
 * there is nothing to resolve, so the tap opens the operations list rather than
 * the suggestion deck.
 */
export const ROUTE_ADDED_OPERATIONS = 'addedOperations';

/**
 * Categories (action-button sets) attached to the "transactions to review" alert,
 * and the ids of their actions.
 *
 * The alert asks a question — what is this transaction? — so its buttons are the
 * two answers a user can give without reading the whole queue: "Select" opens the
 * review surface (the same place a tap on the body lands, spelled out as a
 * button), and "Reject" drops the transaction without opening the app at all.
 *
 * Rejecting is offered only for an alert about a *single* transaction, which is
 * why there are two categories: a button that silently discards several
 * transactions at once — some of which the collapsed row does not even name — is
 * not a choice anyone can make from the shade. A multi-transaction alert
 * therefore gets the select-only set, and rejecting stays a per-card action in
 * the review surface.
 *
 * "Reject" declares `opensAppToForeground: false` (Android broadcasts the press
 * and the handlers act on it headless, as with the receipt's "Acknowledged"),
 * while "Select" opens the app precisely because picking a category is what it
 * is for.
 */
export const PENDING_ALERT_CATEGORY_ID = 'bank-operations-review';
export const PENDING_ALERT_SELECT_ONLY_CATEGORY_ID = 'bank-operations-review-select';
export const REJECT_PENDING_ACTION_ID = 'reject-pending';
export const SELECT_PENDING_ACTION_ID = 'select-pending';

/**
 * Data key carrying the ids of the pending rows an alert is about, so the
 * "Reject" handler knows what to drop. Only populated for the single-transaction
 * alert (see the categories above).
 */
export const PENDING_IDS_KEY = 'pendingIds';

/**
 * Category (action-button set) attached to the "operations added" receipt, and
 * the id of its single action.
 *
 * The receipt is a statement, not a task, so its one useful reply is "seen" —
 * the messenger "mark as read" gesture. The action declares
 * `opensAppToForeground: false`, so pressing it never launches the app: Android
 * broadcasts the response, and the handlers below clear the notification.
 * Pressing an action button does **not** dismiss the notification by itself
 * (Android's auto-cancel only covers a tap on the body), so the dismissal is
 * ours to do — see acknowledgeTask.js for the app-not-running path.
 */
export const ADDED_ALERT_CATEGORY_ID = 'bank-operations-added';
export const ACKNOWLEDGE_ACTION_ID = 'acknowledge';

// A fixed identifier so a fresh alert replaces the previous one instead of
// stacking a new row every background run.
const PENDING_ALERT_IDENTIFIER = 'penny-pending-operations';

// The auto-added receipt does NOT replace in place: each run's receipt describes
// different operations, so reusing one identifier would let a later booking
// silently erase an unread notice of an earlier one — the exact thing this alert
// exists to prevent. A per-batch identifier stacks them instead (Android groups
// them under the channel once there are several), and the prefix keeps them
// recognizable as ours.
const ADDED_ALERT_PREFIX = 'penny-added-operations';

/**
 * Identifier for a receipt describing exactly these operations.
 *
 * Two runs that book *different* operations must not share an id, or the later
 * would erase the earlier, still-unread notice (see ADDED_ALERT_PREFIX). But two
 * reports of the *same* booking must share one: the ingestion pipeline coalesces
 * overlapping calls into a single run and hands every caller the same summary, so
 * two background wakeups landing together (Doze holds wakeups back and releases
 * several at once) both describe one booking — and minting a fresh id per post is
 * how a single purchase appeared in the shade twice. Keying the id on the
 * operations themselves collapses the repeat onto the row already posted.
 *
 * This is a guard against reporting one booking twice, not against *making* one
 * twice: two operations genuinely booked for the same purchase carry different
 * ids and rightly get their own receipts. Not double-booking is the ingestion
 * pipeline's job (see findExistingOperation).
 *
 * Falls back to a per-post id when no operation ids are known, which keeps the
 * never-erase-an-unread-receipt property for callers that cannot identify them.
 *
 * @param {Array<string|number>} [operationIds] - ids the receipt describes
 * @returns {string}
 */
const addedAlertIdentifier = (operationIds) => {
  const ids = (Array.isArray(operationIds) ? operationIds : [])
    .filter((id) => id != null)
    .map(String)
    .sort();
  if (ids.length === 0) return `${ADDED_ALERT_PREFIX}-${Date.now()}`;
  const key = ids.join(',');
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return `${ADDED_ALERT_PREFIX}-${hash >>> 0}`;
};

// Foreground presentation: show the alert as a banner + in the tray even while
// the app is open, but stay quiet (no sound/badge) — it is a low-urgency nudge.
// Set once at module load so it is in effect for both foreground and headless
// (background task) presentations.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Create (or update the name of) the Android notification channel. No-op on
 * platforms without channels. Safe to call repeatedly.
 *
 * @param {string} [name] - localized channel name shown in system settings
 * @returns {Promise<void>}
 */
export const ensureBankAlertsChannelAsync = async (name) => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(BANK_ALERTS_CHANNEL_ID, {
      name: name || 'Bank operations',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (error) {
    // Non-fatal: the notification can still post to the default channel.
  }
};

/**
 * Register (or relabel) the category carrying the receipt's "Acknowledged"
 * button. Safe to call repeatedly — re-setting an existing category overwrites
 * it, which is how the button follows a language change.
 *
 * Best-effort: if it fails the receipt still posts, just without the button.
 *
 * @param {string} [buttonTitle] - localized button label
 * @returns {Promise<void>}
 */
export const ensureAddedAlertCategoryAsync = async (buttonTitle) => {
  try {
    await Notifications.setNotificationCategoryAsync(ADDED_ALERT_CATEGORY_ID, [
      {
        identifier: ACKNOWLEDGE_ACTION_ID,
        buttonTitle: buttonTitle || 'Acknowledged',
        // Never launch the app: acknowledging is done with the notification, not
        // in the app. Android delivers the press as a broadcast instead.
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (error) {
    // Non-fatal — the receipt is still worth posting without its button.
  }
};

/**
 * Register (or relabel) the two categories carrying the review alert's buttons.
 * Safe to call repeatedly — re-setting an existing category overwrites it, which
 * is how the labels follow a language change.
 *
 * Best-effort: if it fails the alert still posts, just without its buttons.
 *
 * @param {{ rejectLabel?: string, selectLabel?: string }} [labels]
 * @returns {Promise<void>}
 */
export const ensurePendingAlertCategoriesAsync = async (labels = {}) => {
  const selectAction = {
    identifier: SELECT_PENDING_ACTION_ID,
    buttonTitle: labels.selectLabel || 'Select',
    // Picking an account/category is done in the app, so this one opens it.
    options: { opensAppToForeground: true },
  };
  const rejectAction = {
    identifier: REJECT_PENDING_ACTION_ID,
    buttonTitle: labels.rejectLabel || 'Reject',
    // Rejecting needs nothing from the app: Android broadcasts the press and the
    // response handlers drop the queued row headless.
    options: { opensAppToForeground: false },
  };
  try {
    await Promise.all([
      Notifications.setNotificationCategoryAsync(
        PENDING_ALERT_CATEGORY_ID,
        [rejectAction, selectAction],
      ),
      Notifications.setNotificationCategoryAsync(
        PENDING_ALERT_SELECT_ONLY_CATEGORY_ID,
        [selectAction],
      ),
    ]);
  } catch (error) {
    // Non-fatal — the alert is still worth posting without its buttons.
  }
};

/**
 * Remove a notification from the tray by id. Best-effort.
 * @param {string} identifier
 * @returns {Promise<void>}
 */
export const dismissNotificationById = async (identifier) => {
  if (!identifier) return;
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch (error) {
    // Non-fatal — the user can still swipe the notification away.
  }
};

/**
 * Whether the OS notification permission is currently granted.
 * @returns {Promise<boolean>}
 */
export const areNotificationsGranted = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    return false;
  }
};

/**
 * Ensure the OS notification permission, prompting the user if it has not been
 * decided yet. Resolves to whether permission is granted afterwards.
 * @returns {Promise<boolean>}
 */
export const requestNotificationsPermission = async () => {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch (error) {
    return false;
  }
};

/**
 * Post one of the bank alerts. Reusing an identifier updates that notification
 * in place instead of stacking a second row; see each caller for which it wants.
 *
 * The body may be multi-line (one line per transaction): expo-notifications wraps
 * the Android notification in a BigTextStyle, so the collapsed row shows the first
 * line and expanding the shade reveals the rest.
 *
 * @param {string} identifier - notification id
 * @param {string} route - deep-link route value carried in the payload
 * @param {{ title: string, body: string, channelName?: string }} copy
 * @param {string} [categoryIdentifier] - action-button set to attach
 * @param {object} [extraData] - additional payload merged into `data`
 * @returns {Promise<void>}
 */
const presentBankAlert = async (
  identifier,
  route,
  { title, body, channelName },
  categoryIdentifier,
  extraData,
) => {
  await ensureBankAlertsChannelAsync(channelName);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        data: { [NOTIFICATION_ROUTE_KEY]: route, ...extraData },
        ...(categoryIdentifier ? { categoryIdentifier } : null),
      },
      // `null` presents the notification immediately, but assigns it to the
      // Android channel above (channelId is read from the content on 8.0+).
      trigger: Platform.OS === 'android'
        ? { channelId: BANK_ALERTS_CHANNEL_ID }
        : null,
    });
  } catch (error) {
    // Non-fatal: a failed alert must never crash the background task.
  }
};

/**
 * Post (or refresh) the "transactions to review" alert.
 *
 * Carries the "Select" button always and "Reject" only when `pendingIds` names
 * exactly one queued row — the alert then describes that one transaction, so
 * rejecting it is a decision the shade actually shows the user enough to make.
 * Anything else (several ids, or none because the caller could not identify
 * them) gets the select-only button set; see the category docs above.
 *
 * @param {{ title: string, body: string, channelName?: string,
 *   rejectLabel?: string, selectLabel?: string }} copy
 * @param {Array<string>} [pendingIds] - queued rows this alert is about
 * @returns {Promise<void>}
 */
export const presentPendingOperationsAlert = async (copy, pendingIds) => {
  const ids = (Array.isArray(pendingIds) ? pendingIds : [])
    .filter((id) => id != null)
    .map(String);
  const rejectable = ids.length === 1;
  await ensurePendingAlertCategoriesAsync(copy);
  return presentBankAlert(
    PENDING_ALERT_IDENTIFIER,
    ROUTE_PENDING_OPERATIONS,
    copy,
    rejectable ? PENDING_ALERT_CATEGORY_ID : PENDING_ALERT_SELECT_ONLY_CATEGORY_ID,
    rejectable ? { [PENDING_IDS_KEY]: ids } : null,
  );
};

/**
 * Post the "operations added" alert — the receipt for operations a background run
 * booked on its own, which would otherwise happen invisibly. A receipt for a new
 * batch stacks rather than replacing the last (see ADDED_ALERT_PREFIX), while a
 * repeat report of the same batch lands on the notification already posted (see
 * addedAlertIdentifier). Carries the "Acknowledged" button that clears it without
 * opening the app.
 *
 * @param {{ title: string, body: string, channelName?: string, actionLabel?: string }} copy
 * @param {Array<string|number>} [operationIds] - the operations this receipt
 *   describes; supplying them makes a duplicate report collapse instead of
 *   posting a second identical row.
 * @returns {Promise<void>}
 */
export const presentAddedOperationsAlert = async (copy, operationIds) => {
  await ensureAddedAlertCategoryAsync(copy?.actionLabel);
  return presentBankAlert(
    addedAlertIdentifier(operationIds),
    ROUTE_ADDED_OPERATIONS,
    copy,
    ADDED_ALERT_CATEGORY_ID,
  );
};

/**
 * Dismiss the "transactions to review" alert from the tray.
 *
 * Used when the review queue empties — every queued item resolved, dismissed, or
 * pruned as a duplicate of an operation the user already recorded — so the shade
 * no longer nags about transactions that are no longer waiting. Best-effort: a
 * failed dismissal is non-fatal (the alert is low-urgency and self-replaces on
 * the next background run).
 *
 * @returns {Promise<void>}
 */
export const dismissPendingOperationsAlert = async () => {
  try {
    await Notifications.dismissNotificationAsync(PENDING_ALERT_IDENTIFIER);
  } catch (error) {
    // Non-fatal — the alert is a low-urgency nudge and will refresh on its own.
  }
};

/**
 * The route a tapped notification carries, or null when it is not one of ours.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {string|null}
 */
const routeOf = (response) => {
  const data = response?.notification?.request?.content?.data;
  return data ? data[NOTIFICATION_ROUTE_KEY] || null : null;
};

/**
 * Whether a tapped-notification response is Penny's review-queue deep link.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isPendingOperationsResponse = (response) =>
  routeOf(response) === ROUTE_PENDING_OPERATIONS;

/**
 * Whether a tapped-notification response is the auto-added receipt's deep link.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isAddedOperationsResponse = (response) =>
  routeOf(response) === ROUTE_ADDED_OPERATIONS;

/**
 * Whether a tapped-notification response is the "Acknowledged" button rather
 * than a tap on the notification itself. Checked before the route matchers: the
 * button means "I've seen it, go away", so it must never also navigate.
 *
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isAcknowledgeResponse = (response) =>
  response?.actionIdentifier === ACKNOWLEDGE_ACTION_ID;

/**
 * Whether a response is the review alert's "Reject" button. Checked before the
 * route matchers for the same reason "Acknowledged" is: the press means "drop
 * this one", so it must never also navigate.
 *
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isRejectPendingResponse = (response) =>
  response?.actionIdentifier === REJECT_PENDING_ACTION_ID;

/**
 * Whether a response is the review alert's "Select" button rather than a tap on
 * the notification body. Both go to the same place; they differ only in that
 * Android auto-cancels the notification for a body tap and not for a button.
 *
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {boolean}
 */
export const isSelectPendingResponse = (response) =>
  response?.actionIdentifier === SELECT_PENDING_ACTION_ID;

/**
 * The pending-queue row ids a response's notification is about, as strings.
 * Empty when the alert carried none (see presentPendingOperationsAlert).
 *
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {Array<string>}
 */
export const responsePendingIds = (response) => {
  const ids = response?.notification?.request?.content?.data?.[PENDING_IDS_KEY];
  if (!Array.isArray(ids)) return [];
  return ids.filter((id) => id != null).map(String);
};

/**
 * The tray id of the notification a response belongs to, or null.
 * @param {object|null} response - a Notifications.NotificationResponse
 * @returns {string|null}
 */
export const responseNotificationId = (response) =>
  response?.notification?.request?.identifier || null;
