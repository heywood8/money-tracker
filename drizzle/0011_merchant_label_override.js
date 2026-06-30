/**
 * Migration 0011: Per-merchant label override
 *
 * Adds notification_merchant_rules.label_override — an optional user-chosen
 * display name for a merchant parsed from a bank notification (e.g.
 * "ECOSENSE BYUZAND" -> "Ecosense"). When set, operations created from future
 * notifications for that merchant use the override as their label instead of
 * the raw shop name. Nullable; existing rows default to NULL (no override).
 */

const sql = `ALTER TABLE \`notification_merchant_rules\` ADD COLUMN \`label_override\` text;`;

export default sql;
