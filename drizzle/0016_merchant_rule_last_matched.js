/**
 * Migration 0016: last-matched timestamp for merchant rules
 *
 * Adds notification_merchant_rules.last_matched_at — the ISO timestamp of the
 * most recent notification this rule actually resolved/booked (auto-created or
 * approved from the review queue). Distinct from updated_at, which only changes
 * when the rule itself is edited. The bindings-management UI sorts by
 * COALESCE(last_matched_at, updated_at) DESC so a merchant just seen again floats
 * to the top of its list even though its category/label were unchanged.
 *
 * Nullable; existing rows default to NULL (never matched yet) and fall back to
 * updated_at for ordering until their first post-migration match.
 */

const sql = `ALTER TABLE \`notification_merchant_rules\` ADD COLUMN \`last_matched_at\` text;`;

export default sql;
