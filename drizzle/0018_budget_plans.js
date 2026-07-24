/**
 * Migration 0018: Add budget_plans and budget_plan_lines tables
 *
 * Budgets v2 (envelope-style monthly income allocation). One plan per month with
 * an expected income, split into lines each linked to exactly one tracking target
 * (an expense category or a destination account). See app/db/schema.js.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with `no such table`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`budget_plans\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`month\` text NOT NULL,
	\`currency\` text NOT NULL,
	\`expected_income\` text NOT NULL DEFAULT '0',
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS \`idx_budget_plans_month\` ON \`budget_plans\` (\`month\`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS \`budget_plan_lines\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`plan_id\` text NOT NULL,
	\`label\` text,
	\`amount\` text NOT NULL,
	\`comment\` text,
	\`category_id\` text,
	\`to_account_id\` integer,
	\`sort_order\` integer NOT NULL DEFAULT 0,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`plan_id\`) REFERENCES \`budget_plans\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_lines_plan\` ON \`budget_plan_lines\` (\`plan_id\`)`;

export default sql;
