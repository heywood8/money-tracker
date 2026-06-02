/**
 * Migration 0007: Enforce operations.type enum via TRIGGER
 *
 * SQLite has no ALTER TABLE ADD CONSTRAINT, so adding a CHECK requires a full
 * table rebuild (CREATE new → INSERT SELECT → DROP old → RENAME). That approach
 * is fragile inside Drizzle's transaction wrapper because PRAGMA foreign_keys=OFF
 * is a no-op within a transaction (documented SQLite limitation).
 *
 * Instead we use BEFORE INSERT/UPDATE triggers — they provide identical enforcement
 * (reject invalid types at the DB level) without any destructive table operations.
 * Triggers work fine inside transactions and survive backup/restore cycles.
 */

export default `CREATE TRIGGER IF NOT EXISTS \`trg_operations_type_insert\`
BEFORE INSERT ON \`operations\`
BEGIN
  SELECT RAISE(ABORT, 'operations.type must be expense, income, or transfer')
  WHERE NEW.\`type\` NOT IN ('expense', 'income', 'transfer');
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS \`trg_operations_type_update\`
BEFORE UPDATE OF \`type\` ON \`operations\`
BEGIN
  SELECT RAISE(ABORT, 'operations.type must be expense, income, or transfer')
  WHERE NEW.\`type\` NOT IN ('expense', 'income', 'transfer');
END;`;
