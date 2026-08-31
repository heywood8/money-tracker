import uuid from 'react-native-uuid';
import { executeQuery, queryAll } from './db';

/**
 * Rejection log for bank notifications the user declined in the review queue.
 *
 * Dismissing a queued item only removes its `pending_notifications` row, which is
 * all the *queue* needs — but the ingestion pipeline re-reads the same bank
 * notification whenever its processed signature no longer matches (the signature
 * is keyed on the notification's post time, which changes when the bank re-posts
 * or updates it, and the remembered signature window is a bounded rolling list).
 * With no memory of the rejection, that pass re-queues the transaction the user
 * had explicitly rejected — or, for a trusted source with resolvable bindings,
 * silently books it. This module is that memory.
 *
 * A dismissal is stored as a fingerprint of the transaction the notification
 * described, not of its delivery, so the same charge read again matches whatever
 * its post time.
 *
 * The cost, stated plainly: two genuinely distinct charges the bank announced in
 * byte-identical words share one fingerprint, so a repeat within the retention
 * window is dropped rather than queued. Nothing in such a pair distinguishes
 * them — that is what byte-identical means — so no fingerprint could separate
 * them either. In practice both built-in parsers read a running balance (and
 * Ameriabank a clock time) out of the text, which differs between two charges;
 * the exposure is a terser source, mainly a user-defined template. The way back
 * is Re-add operation in the recent-notifications feed, which clears the
 * rejection deliberately.
 *
 * That cost is why a rejection expires, and deliberately soon (MAX_AGE_DAYS). It
 * only has to outlive the two rolling windows that can re-present a notification
 * — the native listener's 50 entries and the pipeline's 100 remembered
 * signatures, both of which turn over in days on an active device. A rejection
 * that outlived them would start suppressing charges nobody would call a repeat:
 * the same subscription billed a month later reads exactly the same and is a
 * transaction the user does want queued.
 */

/**
 * How long a rejection is enforced. Comfortably longer than any plausible
 * re-post or window rollover, comfortably shorter than a monthly billing cycle.
 */
const MAX_AGE_DAYS = 14;

const normalizePart = (value) => {
  if (value === null || value === undefined) return '';
  // Collapse whitespace as well as casing: the bank's own text is the strongest
  // part of the fingerprint, and it should not be split by incidental spacing.
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
};

/**
 * Stable identity for the transaction a notification describes, shared by the
 * parsed descriptor and the pending row it was stored as (the row is written by
 * spreading the descriptor, so both carry the same fields).
 *
 * Built from the parsed fields plus `raw`, the notification's own text — which is
 * what makes it stable. The date the pipeline books an item with is deliberately
 * NOT part of it: for a notification that carries no date of its own that date is
 * derived from the post time, and the post time changing is precisely why a
 * notification gets read a second time. A fingerprint keyed on it would miss the
 * re-post it exists to catch (a re-post either side of UTC midnight most of all).
 * The bank's text already carries whatever date and time the bank sent.
 *
 * @param {{ packageName?: string|null, kind?: string|null, type?: string|null,
 *   amount?: string|null, currency?: string|null, cardMask?: string|null,
 *   merchant?: string|null, raw?: string|null }} item
 * @returns {string}
 */
export const notificationFingerprint = (item) => [
  normalizePart(item?.packageName),
  normalizePart(item?.kind),
  normalizePart(item?.type),
  normalizePart(item?.amount),
  normalizePart(item?.currency),
  normalizePart(item?.cardMask),
  normalizePart(item?.merchant),
  normalizePart(item?.raw),
].join('|');

/** ISO timestamp before which a rejection is no longer enforced. */
const expiryCutoff = () => new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

/**
 * Remove rejections past their expiry. Housekeeping run on write so the log stays
 * bounded without a separate maintenance pass — the reads below apply the same
 * cutoff themselves, so an expired row is never enforced even if it lingers
 * (a user who stops dismissing stops pruning).
 * @returns {Promise<void>}
 */
const pruneExpired = async () => {
  await executeQuery('DELETE FROM dismissed_notifications WHERE dismissed_at < ?', [expiryCutoff()]);
};

/**
 * Record that the user rejected the transaction this item describes, so
 * ingestion never queues or books it again.
 *
 * Idempotent: re-dismissing the same transaction refreshes the existing row
 * rather than failing on the fingerprint's unique index.
 *
 * @param {Object} item - a pending row or parsed descriptor (see
 *   notificationFingerprint for the fields read)
 * @returns {Promise<string|null>} the stored fingerprint, or null on failure
 */
export const rememberDismissedNotification = async (item) => {
  if (!item) return null;
  const fingerprint = notificationFingerprint(item);
  try {
    const now = new Date().toISOString();
    await executeQuery(
      `INSERT INTO dismissed_notifications
        (id, fingerprint, package_name, kind, type, amount, currency, card_mask, merchant, date, time, raw, dismissed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(fingerprint) DO UPDATE SET
         date = excluded.date, time = excluded.time, dismissed_at = excluded.dismissed_at`,
      [
        uuid.v4(), fingerprint, item.packageName || null, item.kind || null,
        item.type || null, item.amount || null, item.currency || null,
        item.cardMask || null, item.merchant || null, item.date || null,
        item.time || null, item.raw || null, now,
      ],
    );
    // Housekeeping only — a failed prune must not turn a recorded rejection into
    // a reported failure.
    await pruneExpired().catch(() => {});
    return fingerprint;
  } catch (error) {
    console.error('Failed to record dismissed notification:', error);
    return null;
  }
};

/**
 * Every unexpired rejection's fingerprint, as a Set — one read per ingestion pass
 * rather than a query per notification.
 * @returns {Promise<Set<string>>}
 */
export const loadDismissedFingerprints = async () => {
  try {
    const rows = await queryAll(
      'SELECT fingerprint FROM dismissed_notifications WHERE dismissed_at >= ?',
      [expiryCutoff()],
    );
    return new Set((rows || []).map((row) => row.fingerprint));
  } catch (error) {
    // Never let a lookup failure block ingestion — an unremembered rejection is
    // recoverable (dismiss it again); a swallowed notification is not.
    console.warn('[DismissedNotificationsDB] Failed to load dismissals:', error);
    return new Set();
  }
};

/**
 * Forget a rejection, so the transaction can be ingested again. Used by the
 * explicit "re-add operation" path, where the user is asking for exactly the
 * notification they once rejected.
 * @param {Object} item - a pending row or parsed descriptor
 * @returns {Promise<void>}
 */
export const forgetDismissedNotification = async (item) => {
  if (!item) return;
  try {
    await executeQuery(
      'DELETE FROM dismissed_notifications WHERE fingerprint = ?',
      [notificationFingerprint(item)],
    );
  } catch (error) {
    console.warn('[DismissedNotificationsDB] Failed to forget dismissal:', error);
  }
};
