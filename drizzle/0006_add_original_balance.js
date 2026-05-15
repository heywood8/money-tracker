/**
 * Migration 0006: Add original_balance column to operations table
 *
 * Stores the account balance before the first balance adjustment on a given
 * day directly as a column, instead of encoding it in the description string.
 * This prevents data corruption when users edit the description field and
 * fixes handling of negative balances (the old regex only matched digits).
 */

const sql = `ALTER TABLE \`operations\` ADD COLUMN \`original_balance\` text;`;

export default sql;
