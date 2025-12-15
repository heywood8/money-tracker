export default `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_operations\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`type\` text NOT NULL,
	\`amount\` text NOT NULL,
	\`account_id\` text NOT NULL,
	\`category_id\` text,
	\`to_account_id\` text,
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
INSERT INTO \`__new_operations\`("type", "amount", "account_id", "category_id", "to_account_id", "date", "created_at", "description", "exchange_rate", "destination_amount", "source_currency", "destination_currency") SELECT "type", "amount", "account_id", "category_id", "to_account_id", "date", "created_at", "description", "exchange_rate", "destination_amount", "source_currency", "destination_currency" FROM \`operations\` ORDER BY "created_at" ASC;--> statement-breakpoint
DROP TABLE \`operations\`;--> statement-breakpoint
ALTER TABLE \`__new_operations\` RENAME TO \`operations\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX \`idx_operations_date\` ON \`operations\` (\`date\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_account\` ON \`operations\` (\`account_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_category\` ON \`operations\` (\`category_id\`);--> statement-breakpoint
CREATE INDEX \`idx_operations_type\` ON \`operations\` (\`type\`);`;
