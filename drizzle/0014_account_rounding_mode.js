/**
 * Migration 0014: Per-account rounding direction for automatic transactions
 *
 * Adds accounts.auto_txn_rounding_mode — how the rounding step from migration
 * 0012 (auto_txn_rounding) is applied to an auto-created amount:
 *   'nearest' (default) — round to the nearest multiple, ties up (current behaviour)
 *   'up'                — always round up to the next multiple
 *   'down'              — always round down to the previous multiple
 * Nullable; existing rows default to NULL, which is treated as 'nearest'. Only
 * meaningful when auto_txn_rounding is set.
 */

const sql = `ALTER TABLE \`accounts\` ADD COLUMN \`auto_txn_rounding_mode\` text;`;

export default sql;
