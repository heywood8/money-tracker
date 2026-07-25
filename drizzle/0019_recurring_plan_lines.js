/**
 * Migration 0019: Recurring budget plan lines (Budgets v3 phase 2)
 *
 * Consolidates the old per-category `budgets` table (C) into `budget_plan_lines`
 * (B) as RECURRING lines, eliminating the duplicate "cap vs allocation" model.
 *
 * Schema changes to `budget_plan_lines`:
 *   - `plan_id` becomes NULLable (was NOT NULL). SQLite has no
 *     `ALTER COLUMN DROP NOT NULL`, so this is a recreate-table migration
 *     (create __new_budget_plan_lines → copy → drop old → rename), following the
 *     same pattern as migration 0002.
 *   - `is_recurring` (INTEGER NOT NULL DEFAULT 0): 0 = one-time (tied to a single
 *     month via `plan_id`), 1 = recurring (global template, `plan_id` NULL,
 *     applies to every month).
 *   - `currency` (TEXT, nullable): only set for recurring lines, which have no
 *     plan to inherit a currency from.
 *
 * Data migration: existing `budgets` (v1) rows are converted into recurring
 * `budget_plan_lines` by the post-migration handler below (see `postMigration`).
 * Weekly/yearly budgets are converted to an equivalent monthly amount:
 *   - weekly → amount × (365 / 12 / 7) ≈ ×4.345 (computed as ×365÷84 for exact
 *     decimal math, see BudgetPlansDB.convertBudgetAmountToMonthly)
 *   - yearly → amount ÷ 12
 * The `budgets` table itself is NOT dropped (append-only) — it is just no longer
 * the source of truth once migrated (its rows now exist twice: as the legacy v1
 * row, and as a derived recurring plan line). The migration is idempotent, gated
 * by an `app_metadata` completion flag, and the SAME bridge function is reused by
 * BackupRestore.js when restoring an older backup that still only has `budgets`.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such column: is_recurring`.
 */

const sql = `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_budget_plan_lines\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`plan_id\` text,
	\`label\` text,
	\`amount\` text NOT NULL,
	\`comment\` text,
	\`category_id\` text,
	\`to_account_id\` integer,
	\`sort_order\` integer DEFAULT 0 NOT NULL,
	\`is_recurring\` integer DEFAULT 0 NOT NULL,
	\`currency\` text,
	\`created_at\` text NOT NULL,
	\`updated_at\` text NOT NULL,
	FOREIGN KEY (\`plan_id\`) REFERENCES \`budget_plans\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO \`__new_budget_plan_lines\` (\`id\`, \`plan_id\`, \`label\`, \`amount\`, \`comment\`, \`category_id\`, \`to_account_id\`, \`sort_order\`, \`is_recurring\`, \`currency\`, \`created_at\`, \`updated_at\`)
SELECT \`id\`, \`plan_id\`, \`label\`, \`amount\`, \`comment\`, \`category_id\`, \`to_account_id\`, \`sort_order\`, 0, NULL, \`created_at\`, \`updated_at\` FROM \`budget_plan_lines\`;--> statement-breakpoint
DROP TABLE \`budget_plan_lines\`;--> statement-breakpoint
ALTER TABLE \`__new_budget_plan_lines\` RENAME TO \`budget_plan_lines\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_lines_plan\` ON \`budget_plan_lines\` (\`plan_id\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_lines_recurring\` ON \`budget_plan_lines\` (\`is_recurring\`)`;

/**
 * Post-migration: bridge legacy per-category `budgets` (v1) rows into recurring
 * `budget_plan_lines`. Delegates to BudgetPlansDB so BackupRestore.js can reuse the
 * exact same idempotent logic when restoring an older backup (see
 * BudgetPlansDB.migrateLegacyBudgetsToRecurringLines / BackupRestore.js).
 * @param {Object} db - Raw SQLite database instance
 */
const postMigration = async (db) => {
  console.log('Running post-migration: bridging legacy budgets into recurring plan lines...');
  try {
    // Dynamic import: BudgetPlansDB pulls in the currency/CategoriesDB/OperationsDB
    // module graph, which is unnecessary weight for every other migration's cold
    // start — only pay for it when this specific migration actually runs.
    const { migrateLegacyBudgetsToRecurringLines } = await import('../app/services/BudgetPlansDB');
    const result = await migrateLegacyBudgetsToRecurringLines(db);
    console.log(`Post-migration: ${result.migrated} legacy budget(s) bridged into recurring plan lines (skipped: ${result.skipped})`);
  } catch (error) {
    console.error('Failed to bridge legacy budgets into recurring plan lines:', error);
    // Don't throw — allow app to continue. Retried on next launch (same
    // completion-flag pattern as migration 0003's postMigration).
  }
};

export default sql;
export { postMigration };
