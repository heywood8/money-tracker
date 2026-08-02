/**
 * Migration 0024: Let a plan line filter by the ACCOUNT the money left
 *
 * Until now a `budget_plan_lines` row could only say WHAT was bought (a set of
 * expense categories, migration 0021) or WHERE money was moved to (a transfer
 * target). It could not say WHERE THE MONEY CAME FROM: "cap the spending on my
 * corporate card", or "budget 40 000 of groceries, but only the ones paid from
 * the cash wallet", were both inexpressible.
 *
 * `budget_plan_line_accounts` is that filter — the set of SOURCE accounts whose
 * expenses count toward a line (`operations.account_id`). It is deliberately a
 * second, INDEPENDENT dimension rather than a third kind of target:
 *
 *   - categories only → every expense in those categories, any account (today's
 *     behaviour, unchanged for every existing line),
 *   - accounts only   → every expense from those accounts, any category,
 *   - both            → the INTERSECTION (logical AND): expenses that are in one
 *     of the categories AND paid from one of the accounts,
 *   - neither         → the line is "broken", exactly as an unlinked line is now.
 *
 * Both FKs cascade, mirroring budget_plan_line_categories: deleting the line
 * drops its links, and deleting an account merely SHRINKS the line's filter. An
 * account-only line whose last account is deleted therefore becomes broken — the
 * same state, and the same re-link prompt, a category-only line already reaches.
 *
 * `account_id` is `integer` to match `accounts.id` (integer autoincrement), like
 * `budget_plan_lines.account_id` and `to_account_id`.
 *
 * NOT to be confused with the two account columns already on the line:
 *   - `to_account_id` is a transfer TARGET (what the line tracks),
 *   - `account_id` is the EXECUTION account of an executable template (what an
 *     execution would touch).
 * This junction is neither — it narrows which operations count.
 *
 * No backfill: no line could carry this filter before, so every existing line
 * starts with an empty set, which means "any account" — its actual is unchanged.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such table: budget_plan_line_accounts`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`budget_plan_line_accounts\` (
	\`line_id\` text NOT NULL,
	\`account_id\` integer NOT NULL,
	PRIMARY KEY (\`line_id\`, \`account_id\`),
	FOREIGN KEY (\`line_id\`) REFERENCES \`budget_plan_lines\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_line_accounts_account\` ON \`budget_plan_line_accounts\` (\`account_id\`)`;

export default sql;
