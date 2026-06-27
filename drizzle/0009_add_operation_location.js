/**
 * Migration 0009: Add latitude/longitude columns to operations table
 *
 * Optionally attaches the device's geolocation (decimal degrees, stored as text
 * to stay uniform with the rest of the schema's "numbers as strings" convention)
 * to an operation at save time. Both columns are nullable — they are only
 * populated when the user opts in to attaching location.
 *
 * No index is created: the proximity-recall query (getLabelsNearLocation) ranges
 * on CAST(latitude AS REAL), which a text index can't serve, so an index over the
 * text columns would only add per-insert write cost without accelerating the
 * query. The scan is bounded the same way getDistinctLabels' is.
 *
 * SQLite requires one ADD COLUMN per statement, so the two columns are added in
 * separate statements (split on Drizzle's statement-breakpoint marker).
 */

const sql = `ALTER TABLE \`operations\` ADD COLUMN \`latitude\` text;--> statement-breakpoint
ALTER TABLE \`operations\` ADD COLUMN \`longitude\` text;`;

export default sql;
