/**
 * Migration 0023: Per-operation exclusion from the graphs
 *
 * Adds operations.exclude_from_charts — when set to 1, the operation is left out
 * of every analytic surface (expense/income donut, the 12-month spending trend,
 * the category drill-down list, the summary totals and the burndown forecast)
 * while its money still moves: account balances, balance history and the
 * operations list are untouched.
 *
 * Distinct from exclude_from_avg (migration 0013), which only keeps an operation
 * out of the daily average / forecast and deliberately leaves it in the charts.
 *
 * Nullable; existing rows default to 0, which means "shown" (current behaviour).
 * Unlike exclude_from_avg this one is settable for balance adjustments too —
 * those live in shadow categories and have no editable form, so the operations
 * list's long-press menu is their entry point.
 */

const sql = `ALTER TABLE \`operations\` ADD COLUMN \`exclude_from_charts\` integer DEFAULT 0;`;

export default sql;
