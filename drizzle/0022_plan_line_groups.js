/**
 * Migration 0022: Group several budget lines under one envelope
 *
 * A `budget_plan_lines` row is one tracking target — a set of categories, or a
 * destination account. Several of them routinely belong to one real-world
 * envelope that spans category trees and transfer targets alike ("Car" = Fuel +
 * Parking + the monthly transfer into the repairs account), and until now there
 * was no way to say so: the screen showed six unrelated rows and no figure for
 * the thing the user actually budgets.
 *
 * `budget_plan_line_groups` is that envelope. Deliberately NOT a line: a group
 * has no tracking target of its own (its actual is the sum of its children's,
 * which are already computed) and no executable template, so folding it into
 * budget_plan_lines would have meant a row that fails almost every invariant
 * that table enforces.
 *
 * - `amount` is NULLABLE and that is the DEFAULT state: null means "the group's
 *   budget is the sum of its children", recomputed as lines are added, edited or
 *   removed. A non-null amount is an explicit override and REPLACES the
 *   children's sum in the month's allocated total (see
 *   BudgetPlansDB.calculatePlanStatus) — otherwise the override would be
 *   decorative, agreeing with the group's own progress bar while the totals
 *   under it kept counting something else.
 * - `currency` travels with an override amount for the same reason a recurring
 *   line carries one: a group is global (below), so there is no plan to inherit
 *   a currency from. Null alongside a null amount — a derived total is expressed
 *   in whatever currency the screen is being read in.
 *
 * GROUPS ARE GLOBAL, like recurring lines: they are not scoped to a month's plan
 * (there is no `plan_id`), so a group may hold recurring and one-off lines at the
 * same time, and it survives month navigation, copyPlan and a backup round trip
 * without its membership being rebuilt. A group renders in any month where at
 * least one of its children does.
 *
 * `budget_plan_lines.group_id` is ON DELETE SET NULL, not CASCADE: deleting a
 * group must ungroup its lines, never destroy the budgets inside it. (SQLite
 * allows a REFERENCES clause on ADD COLUMN only when the default is NULL, which
 * is exactly what this is.)
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such table: budget_plan_line_groups`.
 */

const sql = `CREATE TABLE IF NOT EXISTS \`budget_plan_line_groups\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`label\` text NOT NULL,
	\`amount\` text,
	\`currency\` text,
	\`sort_order\` integer DEFAULT 0 NOT NULL,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL
);--> statement-breakpoint
ALTER TABLE \`budget_plan_lines\` ADD COLUMN \`group_id\` text REFERENCES \`budget_plan_line_groups\`(\`id\`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_lines_group\` ON \`budget_plan_lines\` (\`group_id\`)`;

export default sql;
