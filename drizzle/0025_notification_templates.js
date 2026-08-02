/**
 * Migration 0025: Add the notification_templates table
 *
 * User-defined parse templates for banking apps Penny ships no parser for. The
 * user marks the fields in one captured notification and the marks are stored
 * here as context anchors (`fields` / `triggers` JSON) rather than offsets. See
 * app/db/schema.js and app/services/notifications/templateEngine.js.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with `no such table`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`notification_templates\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`package_name\` text,
	\`type\` text NOT NULL,
	\`enabled\` integer DEFAULT 1 NOT NULL,
	\`priority\` integer DEFAULT 0 NOT NULL,
	\`category_id\` text,
	\`currency\` text,
	\`date_order\` text,
	\`fields\` text NOT NULL,
	\`triggers\` text,
	\`sample_title\` text,
	\`sample_text\` text,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_notification_templates_package\` ON \`notification_templates\` (\`package_name\`)`;

export default sql;
