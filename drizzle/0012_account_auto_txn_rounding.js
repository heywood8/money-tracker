/**
 * Migration 0012: Per-account automatic-transaction rounding
 *
 * Adds accounts.auto_txn_rounding — the rounding step (10, 100, or 1000) applied
 * to the amount of operations created automatically from bank notifications. When
 * set, an auto-created amount is rounded to the nearest multiple of the step with
 * ties rounded up (e.g. with step 100, 1216 → 1200 and 150 → 200). Nullable;
 * existing rows default to NULL, which means no rounding (current behaviour).
 */

const sql = `ALTER TABLE \`accounts\` ADD COLUMN \`auto_txn_rounding\` integer;`;

export default sql;
