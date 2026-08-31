/**
 * Migration 0029: Add the dismissed_notifications table
 *
 * Dismissing a queued review item only deleted its `pending_notifications` row,
 * so nothing remembered the rejection. The same bank notification is read again
 * on the next pass whenever its processed-signature no longer matches — the
 * signature is keyed on the notification's post time, which changes when the
 * bank re-posts or updates the notification, and the remembered window is a
 * bounded rolling list — and the pipeline happily re-queued (or, for a trusted
 * source, auto-created) the transaction the user had explicitly rejected.
 *
 * Each dismissal is now recorded as a content fingerprint of the transaction it
 * described (the parsed fields plus the bank's own text, never the post time),
 * which ingestion consults before booking or queueing anything. The remaining
 * columns are the fields that fingerprint is built from, kept readable rather
 * than opaque; rows expire on age (see DismissedNotificationsDB).
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with `no such table`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`dismissed_notifications\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`fingerprint\` text NOT NULL,
	\`package_name\` text,
	\`kind\` text,
	\`type\` text,
	\`amount\` text,
	\`currency\` text,
	\`card_mask\` text,
	\`merchant\` text,
	\`date\` text,
	\`time\` text,
	\`raw\` text,
	\`dismissed_at\` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_dismissed_notifications_fingerprint\` ON \`dismissed_notifications\` (\`fingerprint\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_dismissed_notifications_dismissed_at\` ON \`dismissed_notifications\` (\`dismissed_at\`)`;

export default sql;
