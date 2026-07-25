/**
 * Migration 0020: Executable templates on budget plan lines (Budgets v3 phase 3)
 *
 * Absorbs the standalone `planned_operations` model (A) into `budget_plan_lines`
 * (B/C), killing the last double entry: expected income vs income templates, and
 * recurring expense templates vs allocations.
 *
 * Schema changes to `budget_plan_lines` (all plain ADD COLUMNs — nullable, so no
 * table recreate is needed):
 *   - `kind` (TEXT, nullable): 'income' | 'expense' | 'transfer'. NULL on legacy
 *     rows, where the effective kind is inferred from the target
 *     (`to_account_id` set → transfer, otherwise expense) — see
 *     BudgetPlansDB.mapLineFields.
 *   - `account_id` (INTEGER, nullable, FK → accounts ON DELETE SET NULL): the
 *     account an execution would touch, matching `operations.account_id`
 *     semantics (source for expense/transfer, destination for income). A line
 *     WITH it is an executable template; a line without it stays a pure analytic
 *     target.
 *   - `last_executed_month` (TEXT, nullable): YYYY-MM of the last execution,
 *     exactly like `planned_operations.last_executed_month`.
 *
 * Data migration (see `postMigration` below → BudgetPlansDB.migratePlannedOperationsToLines):
 *   - every `planned_operations` row becomes a line — recurring ones become
 *     recurring (global) lines, one-time ones become one-off lines on the
 *     current month's plan (created if missing);
 *   - every plan's `expected_income` becomes a one-off income line, so income is
 *     declared once, in the same list as everything else.
 * Neither `planned_operations` nor `budget_plans.expected_income` is dropped
 * (append-only) — they simply stop being the source of truth. The migration is
 * idempotent, gated by an `app_metadata` completion flag, and the SAME bridge is
 * reused by BackupRestore.js when restoring an older backup.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such column: kind`.
 */

const sql = `ALTER TABLE \`budget_plan_lines\` ADD COLUMN \`kind\` text;--> statement-breakpoint
ALTER TABLE \`budget_plan_lines\` ADD COLUMN \`account_id\` integer REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE \`budget_plan_lines\` ADD COLUMN \`last_executed_month\` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_budget_plan_lines_kind\` ON \`budget_plan_lines\` (\`kind\`)`;

/**
 * Post-migration: bridge `planned_operations` and every plan's stored
 * `expected_income` into plan lines. Delegates to BudgetPlansDB so
 * BackupRestore.js can reuse the exact same idempotent logic when restoring an
 * older backup (see BudgetPlansDB.migratePlannedOperationsToLines).
 * @param {Object} db - Raw SQLite database instance
 */
const postMigration = async (db) => {
  console.log('Running post-migration: bridging planned operations into plan lines...');
  try {
    // Dynamic import for the same reason migration 0019 does it: BudgetPlansDB
    // pulls in the currency/CategoriesDB/OperationsDB module graph, which is
    // unnecessary weight for every other migration's cold start.
    const { migratePlannedOperationsToLines } = await import('../app/services/BudgetPlansDB');
    const result = await migratePlannedOperationsToLines(db);
    console.log(
      `Post-migration: ${result.migratedTemplates} planned operation(s) and `
      + `${result.migratedIncome} expected-income figure(s) bridged into plan lines (skipped: ${result.skipped})`,
    );
  } catch (error) {
    console.error('Failed to bridge planned operations into plan lines:', error);
    // Don't throw — allow app to continue. Retried on next launch (same
    // completion-flag pattern as migrations 0003 / 0019).
  }
};

export default sql;
export { postMigration };
