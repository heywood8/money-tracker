/**
 * Migration 0027: Add pending_notifications.force_added
 *
 * A queued review item is normally pruned when an operation matching it already
 * exists (the user recorded the charge by hand before the push arrived). That
 * reconciliation also swallowed items the user explicitly re-added from the
 * recent-notifications feed ("Re-add operation"), which deliberately bypasses the
 * duplicate check: the item was queued, the UI reported "Added to review queue",
 * and the very next reconcile pass deleted it again — so the queue stayed empty
 * with no way to recover the notification.
 *
 * `force_added` marks such a row so reconciliation leaves it alone. Nullable with
 * default 0; existing rows read as 0, i.e. the current (reconcilable) behaviour.
 */

const sql = `ALTER TABLE \`pending_notifications\` ADD COLUMN \`force_added\` integer DEFAULT 0;`;

export default sql;
