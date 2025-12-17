/**
 * Migration 0004: Add notification bindings tables
 *
 * Creates:
 * - card_bindings: Maps masked card numbers to accounts
 * - merchant_bindings: Maps merchant names to categories
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
CREATE INDEX \`idx_merchant_bindings_category\` ON \`merchant_bindings\` (\`category_id\`)`;

export default sql;
