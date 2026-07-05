/**
 * Migration 0013: Per-operation exclusion from the spending average / burndown forecast
 *
 * Adds operations.exclude_from_avg — when set to 1, the operation is left out of
 * the daily spending average and burndown forecast (getTotalExpenses), while
 * still counting as a normal expense everywhere else (account balances, pie
 * charts, category totals). Nullable; existing rows default to 0, which means
 * "counted" (current behaviour). Lets a user keep a one-off large purchase from
 * skewing the forecast.
 */

const sql = `ALTER TABLE \`operations\` ADD COLUMN \`exclude_from_avg\` integer DEFAULT 0;`;

export default sql;
