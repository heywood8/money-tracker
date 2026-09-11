/**
 * Migration 0030: Index operations.to_account_id, and (account_id, date)
 *
 * `operations` was indexed on date, account_id, category_id and type, but never
 * on to_account_id — the other half of every transfer. Every query that asks
 * "did this account take part" is written as
 * `account_id = ? OR to_account_id = ?`, and SQLite's OR optimization can only
 * use an index when *each* disjunct has one. With to_account_id unindexed the
 * planner fell back to a full table scan for all of them:
 * getOperationsByAccount, getTransferTotals (run once per transfer line per plan
 * inside the budget status loop), getAccountDayDeltas, the account-delete
 * safety count in AccountsDB, and getTopTransferTargetAccounts, which groups by
 * to_account_id.
 *
 * The composite (account_id, date) index serves the same queries' second half:
 * the per-account lookups all order or window by date, so the account-only
 * index left a sort (or a scan of every row of a busy account) on the table.
 *
 * Both are plain CREATE INDEX IF NOT EXISTS statements: no data is touched, no
 * column is added, and re-running is a no-op.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and never gain the indexes.
 */

const sql = `CREATE INDEX IF NOT EXISTS \`idx_operations_to_account\` ON \`operations\` (\`to_account_id\`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_operations_account_date\` ON \`operations\` (\`account_id\`,\`date\`)`;

export default sql;
