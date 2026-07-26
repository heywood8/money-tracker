/**
 * Migration 0021: Let a plan line track SEVERAL categories
 *
 * Until now a `budget_plan_lines` row tracked exactly one target: one expense
 * category or one destination account. A category target already rolled up its
 * descendants (see BudgetsDB.calculateSpendingForBudget), so "budget a parent
 * category" worked — but "budget Groceries + Cafes without their siblings" did
 * not, and the roll-up could not be turned off.
 *
 * Two changes:
 *
 * 1. `budget_plan_line_categories` — a junction table, the source of truth for
 *    which categories a line tracks. `line_id` cascades (dropping a line drops
 *    its links); `category_id` cascades too, so deleting a category just shrinks
 *    the set instead of nulling the whole line. A line left with NO categories
 *    and no transfer target is "broken", exactly as before.
 *
 *    `budget_plan_lines.category_id` is KEPT and still written, holding the
 *    line's primary (first) category. It stays for older backups, the CSV
 *    export shape, and the ON DELETE SET NULL "broken" semantics — but readers
 *    take the junction as authoritative (see BudgetPlansDB.mapLineFields), so
 *    the two cannot drift into disagreement when the primary category is the one
 *    that gets deleted.
 *
 * 2. `budget_plan_lines.include_children` — 1 (the default, and what every
 *    pre-0021 line did implicitly) rolls descendant categories into the line's
 *    actual; 0 counts only the categories explicitly linked. This is what makes
 *    "just this parent, not its children" expressible.
 *
 * The backfill copies every existing non-null `category_id` into the junction,
 * so a migrated line tracks exactly what it tracked before. `INSERT OR IGNORE`
 * keeps it idempotent if the migration is retried after a partial apply.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such table: budget_plan_line_categories`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`budget_plan_line_categories\` (
	\`line_id\` text NOT NULL,
	\`category_id\` text NOT NULL,
	PRIMARY KEY (\`line_id\`, \`category_id\`),
	FOREIGN KEY (\`line_id\`) REFERENCES \`budget_plan_lines\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_line_categories_category\` ON \`budget_plan_line_categories\` (\`category_id\`);--> statement-breakpoint
ALTER TABLE \`budget_plan_lines\` ADD COLUMN \`include_children\` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO \`budget_plan_line_categories\` (\`line_id\`, \`category_id\`)
SELECT \`id\`, \`category_id\` FROM \`budget_plan_lines\` WHERE \`category_id\` IS NOT NULL`;

export default sql;
