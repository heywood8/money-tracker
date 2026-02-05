/**
 * Migration 0004: Remove exclude_from_forecast column and index from categories
 *
 * SQLite doesn't support DROP COLUMN directly in older versions,
 * so we recreate the table without the column.
 */

const sql = `DROP INDEX IF EXISTS \`idx_categories_exclude_from_forecast\`;--> statement-breakpoint
CREATE TABLE \`categories_new\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`type\` text NOT NULL,
	\`category_type\` text NOT NULL,
	\`parent_id\` text,
	\`icon\` text,
	\`color\` text,
	\`is_shadow\` integer DEFAULT 0,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`parent_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO \`categories_new\` SELECT \`id\`, \`name\`, \`type\`, \`category_type\`, \`parent_id\`, \`icon\`, \`color\`, \`is_shadow\`, \`created_at\`, \`updated_at\` FROM \`categories\`;--> statement-breakpoint
DROP TABLE \`categories\`;--> statement-breakpoint
ALTER TABLE \`categories_new\` RENAME TO \`categories\`;--> statement-breakpoint
CREATE INDEX \`idx_categories_parent\` ON \`categories\` (\`parent_id\`);--> statement-breakpoint
CREATE INDEX \`idx_categories_type\` ON \`categories\` (\`type\`);--> statement-breakpoint
CREATE INDEX \`idx_categories_category_type\` ON \`categories\` (\`category_type\`);--> statement-breakpoint
CREATE INDEX \`idx_categories_is_shadow\` ON \`categories\` (\`is_shadow\`)`;

export default sql;
