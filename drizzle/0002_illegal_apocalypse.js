export default `PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Step 1: Create temporary mapping table for old UUID -> new integer ID
CREATE TABLE \`__account_id_mapping\` (
	\`old_id\` text PRIMARY KEY NOT NULL,
	\`new_id\` integer NOT NULL
);
--> statement-breakpoint

-- Step 2: Create new accounts table with integer autoincrement ID
CREATE TABLE \`__new_accounts\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`balance\` text DEFAULT '0' NOT NULL,
	\`currency\` text DEFAULT 'USD' NOT NULL,
	\`display_order\` integer,
	\`hidden\` integer DEFAULT 0,
	\`monthly_target\` text,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL
);
--> statement-breakpoint

-- Step 3: Copy accounts data (ID will be auto-generated) and populate mapping table
INSERT INTO \`__new_accounts\`("name", "balance", "currency", "display_order", "hidden", "monthly_target", "created_at", "updated_at")
SELECT "name", "balance", "currency", "display_order", "hidden", "monthly_target", "created_at", "updated_at"
FROM \`accounts\`
ORDER BY "created_at" ASC;
--> statement-breakpoint

-- Step 4: Populate the mapping table with old UUID -> new integer ID
INSERT INTO \`__account_id_mapping\`("old_id", "new_id")
SELECT a.id, n.id
FROM \`accounts\` a
JOIN \`__new_accounts\` n ON a.name = n.name AND a.created_at = n.created_at;
--> statement-breakpoint

-- Step 5: Create new operations table with integer account references
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
	FOREIGN KEY (\`account_id\`) REFERENCES \`__new_accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`__new_accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Step 6: Copy operations data with mapped integer account IDs
INSERT INTO \`__new_operations\`("type", "amount", "account_id", "category_id", "to_account_id", "date", "created_at", "description", "exchange_rate", "destination_amount", "source_currency", "destination_currency")
SELECT
	o.type,
	o.amount,
	m1.new_id,
	o.category_id,
	m2.new_id,
	o.date,
	o.created_at,
	o.description,
	o.exchange_rate,
	o.destination_amount,
	o.source_currency,
	o.destination_currency
FROM \`operations\` o
JOIN \`__account_id_mapping\` m1 ON o.account_id = m1.old_id
LEFT JOIN \`__account_id_mapping\` m2 ON o.to_account_id = m2.old_id
ORDER BY o.created_at ASC;
--> statement-breakpoint

-- Step 7: Drop old tables
DROP TABLE \`operations\`;--> statement-breakpoint
DROP TABLE \`accounts\`;--> statement-breakpoint
DROP TABLE \`__account_id_mapping\`;--> statement-breakpoint

-- Step 8: Rename new tables to original names
ALTER TABLE \`__new_accounts\` RENAME TO \`accounts\`;--> statement-breakpoint
ALTER TABLE \`__new_operations\` RENAME TO \`operations\`;--> statement-breakpoint

PRAGMA foreign_keys=ON;--> statement-breakpoint

-- Step 9: Recreate indexes
CREATE INDEX \`idx_accounts_order\` ON \`accounts\` (\`display_order\`);--> statement-breakpoint
CREATE INDEX \`idx_accounts_hidden\` ON \`accounts\` (\`hidden\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_date\` ON \`operations\` (\`date\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_account\` ON \`operations\` (\`account_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_category\` ON \`operations\` (\`category_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_type\` ON \`operations\` (\`type\`);`;
