/**
 * Migration 0026: Give a recurring budget line an EFFECTIVE MONTH RANGE
 *
 * A recurring line (`is_recurring = 1`, `plan_id` NULL — migration 0019) applies
 * to every calendar month there is, which also means editing one REWROTE HISTORY:
 * raising a 40 000 groceries budget to 50 000 in August retroactively claimed
 * that July, June and every month before them had been budgeted at 50 000 too,
 * and every past month's plan-vs-actual re-rendered against a target that did not
 * exist when it was spent.
 *
 * These two columns bound the months a recurring line speaks for:
 *
 *   - `effective_from` — first month (YYYY-MM) the line applies to; NULL means
 *     "since forever", which is what every pre-0026 recurring line has, so no
 *     existing budget changes shape on upgrade.
 *   - `effective_to`   — last month (YYYY-MM) it applies to, INCLUSIVE; NULL
 *     means open-ended (the normal state of a live budget).
 *
 * With them, editing a recurring line stops being an UPDATE and becomes a
 * VERSION SPLIT (BudgetPlansDB.updateLine): the old row is closed at the month
 * before the edit and a copy carrying the new values opens at the month the edit
 * was made in. Past months keep rendering the row that was true for them; the
 * current and future months read the new one. Deleting works the same way — a
 * line with months behind it is closed, not erased.
 *
 * Both columns are meaningless for a ONE-OFF line: `plan_id` already scopes it to
 * exactly one month. They stay NULL there.
 *
 * No backfill: NULL/NULL is precisely "applies to every month", the behaviour
 * every existing recurring line already had.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and crash with
 * `no such column: effective_from`.
 */

const sql = `ALTER TABLE \`budget_plan_lines\` ADD \`effective_from\` text;--> statement-breakpoint
ALTER TABLE \`budget_plan_lines\` ADD \`effective_to\` text`;

export default sql;
