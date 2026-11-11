/**
 * Migration 0032: secondary labels on merchant rules
 *
 * Adds notification_merchant_rules.secondary_labels. The rule's label_override is
 * the merchant's name, its primary label; these are the extra labels the user
 * attached to the same binding ("Ecosense" + "Groceries", "Narek" + "Rent").
 * Every operation booked from the merchant's notifications carries the name first
 * and these after it.
 *
 * Stored the way an operation's description stores its labels (serializeLabels in
 * app/utils/labelUtils.js: " | "-joined), so the column needs no parser of its
 * own. Existing rows read NULL, meaning no secondary labels, which is what every
 * rule had before this column existed.
 *
 * Append-only: never edit or revert an existing migration. This migration is also
 * registered in app/services/db.js (isSchemaComplete + detectAppliedMigrations),
 * otherwise existing installs would skip migrate() and never gain the column.
 */

const sql = `ALTER TABLE \`notification_merchant_rules\` ADD COLUMN \`secondary_labels\` text;`;

export default sql;
