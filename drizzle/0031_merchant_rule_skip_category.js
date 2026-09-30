/**
 * Migration 0031: "don't bind to a category" flag on merchant rules
 *
 * Adds notification_merchant_rules.skip_category. Set when the user ticks "Don't
 * bind to category" while reviewing a merchant's notification: from then on the
 * merchant never learns (or auto-applies) a category, so every one of its
 * notifications waits in the review queue for a category picked by hand. The
 * name binding on the same row is unaffected.
 *
 * Existing rows default to 0 (category learning on), which is what every rule
 * did before this column existed.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and never gain the column.
 */

const sql = `ALTER TABLE \`notification_merchant_rules\` ADD COLUMN \`skip_category\` integer DEFAULT 0;`;

export default sql;
