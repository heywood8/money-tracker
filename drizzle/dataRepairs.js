/**
 * One-off data repairs that are not schema changes.
 *
 * They run through the post-migration handler runner in app/services/db.js,
 * which calls each handler on every launch until it records its completion flag
 * (`post_migration_<key>_completed` in app_metadata). A repair is keyed to a
 * migration that every install already has, so the runner's "has the migration
 * applied" check always passes; the migration's own SQL is not touched.
 */

/**
 * Trim `operations.date` to its calendar day.
 *
 * Imports used to copy a file's timestamped dates verbatim, and a missing date
 * fell back to a full ISO timestamp (#773). A timestamped row falls out of every
 * string date compare — month totals, category donuts, budget actuals — and it
 * stalled the operations list's load-more for good. Writers now store the day
 * only (toOperationDate); this repairs rows written before that. Keeping the
 * first ten characters is what SQLite's own `date()` reads from the value, which
 * the queries hardened for #773 already use, so no row changes the day it counts
 * on in those.
 *
 * Idempotent: a second run finds nothing longer than ten characters.
 *
 * @param {Object} db - expo-sqlite database
 * @returns {Promise<void>}
 */
export const normalizeOperationDates = async (db) => {
  try {
    await db.runAsync(
      `UPDATE operations SET date = substr(date, 1, 10)
         WHERE length(date) > 10
           AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'`,
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES ('post_migration_normalizeOperationDates_completed', 'true', ?)",
      [new Date().toISOString()],
    );
  } catch (error) {
    // Not fatal: the flag stays unset and the repair is retried on next launch.
    console.error('Failed to normalize operation dates:', error);
  }
};
