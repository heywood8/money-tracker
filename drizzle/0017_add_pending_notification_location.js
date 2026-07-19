/**
 * Migration 0017: Add latitude/longitude columns to pending_notifications
 *
 * A bank notification that can't be auto-matched waits in the review queue as a
 * pending row. Its location is now captured when the notification is ingested
 * (near the shop) rather than when the user finally resolves it — otherwise a
 * notification reviewed later, e.g. after coming home, would be stamped with the
 * wrong (current) location. Both columns are nullable text, mirroring
 * operations.latitude/longitude (migration 0009): only populated when the
 * attach-location opt-in is on at ingestion time.
 *
 * SQLite requires one ADD COLUMN per statement, so the two columns are added in
 * separate statements (split on Drizzle's statement-breakpoint marker).
 */

const sql = `ALTER TABLE \`pending_notifications\` ADD COLUMN \`latitude\` text;--> statement-breakpoint
ALTER TABLE \`pending_notifications\` ADD COLUMN \`longitude\` text;`;

export default sql;
