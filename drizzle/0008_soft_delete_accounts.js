/**
 * Migration 0008: Add deleted_at column to accounts table (soft-delete)
 *
 * Instead of hard-deleting accounts (which CASCADE-deletes all balance history),
 * accounts are now soft-deleted by setting deleted_at to a timestamp.
 * Soft-deleted accounts are hidden from all normal queries but their balance
 * history and linked operations are preserved.
 */

const sql = `ALTER TABLE \`accounts\` ADD COLUMN \`deleted_at\` text;`;

export default sql;
