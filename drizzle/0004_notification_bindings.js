/**
 * Migration 0004: Add notification bindings tables
 *
 * Creates:
 * - card_bindings: Maps masked card numbers to accounts
 * - merchant_bindings: Maps merchant names to categories
 *
 * Also updates operations table to ensure proper foreign key constraints
 */

const sql = `CREATE TABLE \`card_bindings\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`card_mask\` text NOT NULL,
	\`account_id\` integer NOT NULL,
	\`bank_name\` text,
	\`last_used\` text NOT NULL,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`card_bindings_card_mask_unique\` ON \`card_bindings\` (\`card_mask\`);--> statement-breakpoint
CREATE INDEX \`idx_card_bindings_card_mask\` ON \`card_bindings\` (\`card_mask\`);--> statement-breakpoint
CREATE INDEX \`idx_card_bindings_account\` ON \`card_bindings\` (\`account_id\`);--> statement-breakpoint
CREATE TABLE \`merchant_bindings\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`merchant_name\` text NOT NULL,
	\`category_id\` text NOT NULL,
	\`last_used\` text NOT NULL,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`merchant_bindings_merchant_name_unique\` ON \`merchant_bindings\` (\`merchant_name\`);--> statement-breakpoint
CREATE INDEX \`idx_merchant_bindings_merchant_name\` ON \`merchant_bindings\` (\`merchant_name\`);--> statement-breakpoint
CREATE INDEX \`idx_merchant_bindings_category\` ON \`merchant_bindings\` (\`category_id\`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_operations\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`type\` text NOT NULL,
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
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO \`__new_operations\`("id", "type", "amount", "account_id", "category_id", "to_account_id", "date", "created_at", "description", "exchange_rate", "destination_amount", "source_currency", "destination_currency") SELECT "id", "type", "amount", "account_id", "category_id", "to_account_id", "date", "created_at", "description", "exchange_rate", "destination_amount", "source_currency", "destination_currency" FROM \`operations\`;--> statement-breakpoint
DROP TABLE \`operations\`;--> statement-breakpoint
ALTER TABLE \`__new_operations\` RENAME TO \`operations\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX \`idx_operations_date\` ON \`operations\` (\`date\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_account\` ON \`operations\` (\`account_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_category\` ON \`operations\` (\`category_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_type\` ON \`operations\` (\`type\`)`;

export default sql;
