/**
 * Migration 0007: Add CHECK constraint to operations.type enum column
 *
 * Drizzle enums are not backed by SQLite CHECK constraints, so invalid values
 * from corrupted backups or manual edits can be inserted. This migration
 * recreates the operations table with an explicit CHECK constraint and silently
 * drops any rows whose type is not one of the three valid values.
 */

export default `PRAGMA foreign_keys=OFF;--> statement-breakpoint

CREATE TABLE \`__new_operations\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`type\` text NOT NULL CHECK (\`type\` IN ('expense', 'income', 'transfer')),
	\`amount\` text NOT NULL,
	\`account_id\` integer NOT NULL,
	\`category_id\` text,
	\`to_account_id\` integer,
	\`date\` text NOT NULL,
	\`created_at\` text NOT NULL,
	\`description\` text,
	\`exchange_rate\` text,
	\`destination_amount\` text,
	\`source_currency\` text,
	\`destination_currency\` text,
	\`original_balance\` text,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

INSERT INTO \`__new_operations\` SELECT * FROM \`operations\` WHERE \`type\` IN ('expense', 'income', 'transfer');--> statement-breakpoint

DROP TABLE \`operations\`;--> statement-breakpoint

ALTER TABLE \`__new_operations\` RENAME TO \`operations\`;--> statement-breakpoint

PRAGMA foreign_keys=ON;--> statement-breakpoint

CREATE INDEX \`idx_operations_date\` ON \`operations\` (\`date\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_account\` ON \`operations\` (\`account_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_category\` ON \`operations\` (\`category_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_type\` ON \`operations\` (\`type\`);`;
