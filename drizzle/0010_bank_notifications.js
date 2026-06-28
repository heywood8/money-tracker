/**
 * Migration 0010: Bank notification processing support
 *
 * Adds the storage needed to turn incoming bank notifications into operations:
 *
 * 1. accounts.card_mask — the masked card number (e.g. "4083***7027") used to
 *    bind a notification to an account. Nullable.
 * 2. notification_merchant_rules — learned merchant -> category mappings, so a
 *    merchant the user has categorized once is auto-categorized next time.
 * 3. pending_notifications — parsed notifications that could not be fully matched
 *    (unknown card or merchant) and are waiting in the review queue.
 *
 * SQLite requires one ADD COLUMN per statement, and Drizzle's expo migrator
 * splits on the statement-breakpoint marker, so each statement is separated.
 */

const sql = `ALTER TABLE \`accounts\` ADD COLUMN \`card_mask\` text;--> statement-breakpoint
CREATE TABLE \`notification_merchant_rules\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`merchant\` text NOT NULL,
	\`package_name\` text,
	\`category_id\` text,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX \`idx_merchant_rules_merchant\` ON \`notification_merchant_rules\` (\`merchant\`);--> statement-breakpoint
CREATE TABLE \`pending_notifications\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`kind\` text NOT NULL,
	\`type\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`card_mask\` text,
	\`merchant\` text,
	\`country\` text,
	\`date\` text,
	\`time\` text,
	\`account_id\` integer,
	\`category_id\` text,
	\`package_name\` text,
	\`raw\` text,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX \`idx_pending_notifications_created\` ON \`pending_notifications\` (\`created_at\`);`;

export default sql;
