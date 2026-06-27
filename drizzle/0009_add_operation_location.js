/**
 * Migration 0009: Add latitude/longitude columns to operations table
 *
 * Optionally attaches the device's geolocation (decimal degrees, stored as text
 * to stay uniform with the rest of the schema's "numbers as strings" convention)
 * to an operation at save time. Both columns are nullable — they are only
 * populated when the user opts in to attaching location. A composite index over
 * (latitude, longitude) powers the bounding-box prefilter used to recall the
 * labels a user has historically applied near a given place.
 *
 * SQLite requires one ADD COLUMN per statement, so the two columns are added in
 * separate statements (split on Drizzle's statement-breakpoint marker).
 */

const sql = `ALTER TABLE \`operations\` ADD COLUMN \`latitude\` text;--> statement-breakpoint
ALTER TABLE \`operations\` ADD COLUMN \`longitude\` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS \`idx_operations_location\` ON \`operations\` (\`latitude\`,\`longitude\`);`;

export default sql;
