/**
 * Migration 0005: Add planned_operations table
 *
 * Creates a table for storing planned/template operations that can be
 * quickly converted to real operations with one tap.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`planned_operations\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`type\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`account_id\` integer NOT NULL,
	\`category_id\` text,
	\`to_account_id\` integer,
	\`description\` text,
	\`is_recurring\` integer NOT NULL DEFAULT 1,
	\`last_executed_month\` text,
	\`display_order\` integer,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_planned_ops_account\` ON \`planned_operations\` (\`account_id\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_planned_ops_type\` ON \`planned_operations\` (\`type\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_planned_ops_recurring\` ON \`planned_operations\` (\`is_recurring\`)`;

export default sql;
