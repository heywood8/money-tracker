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

/**
 * Point categories at the icon the picker offers under the name the icon set
 * actually has.
 *
 * The picker offered "motorcycle", which is not a MaterialCommunityIcons glyph
 * ("motorbike" is), so every category saved with it rendered the missing-glyph
 * box in the picker, the category grid and every operation row. The picker now
 * offers "motorbike"; this moves categories saved with the old name.
 *
 * Idempotent: a second run finds nothing to rename. One-shot: once its flag is
 * set it never runs again, so a later icon rename needs a handler of its own.
 * Backups restored afterwards are mapped by resolveCategoryIcon
 * (app/utils/categoryUtils.js) on insert instead.
 *
 * @param {Object} db - expo-sqlite database
 * @returns {Promise<void>}
 */
export const renameMotorcycleIcon = async (db) => {
  try {
    await db.runAsync("UPDATE categories SET icon = 'motorbike' WHERE icon = 'motorcycle'");
    await db.runAsync(
      "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES ('post_migration_renameMotorcycleIcon_completed', 'true', ?)",
      [new Date().toISOString()],
    );
  } catch (error) {
    // Not fatal: the flag stays unset and the repair is retried on next launch.
    console.error('Failed to rename the motorcycle category icon:', error);
  }
};

/**
 * Clear every stored coordinate, the attach-location preference and the
 * heatmap's map tiles.
 *
 * The app used to attach the device location to operations (and to queued bank
 * notifications) for an operations heatmap and nearby label suggestions. Both
 * features are gone, so nothing reads these values any more and nothing in the
 * app can show or delete them. They are cleared rather than left behind: a
 * location history the user can neither see nor remove should not linger on the
 * device or reach new backups. The columns stay (dropping them would undo
 * migrations 0009 and 0017, whose markers are those very columns), always NULL
 * from here on.
 *
 * Backups written before the repair keep their coordinates (the restore drops
 * them), and SQLite frees the old values' pages without overwriting them; both
 * age out rather than being rewritten at startup.
 *
 * The tiles (OpenStreetMap squares around wherever the user spent money) sat in
 * the cache directory with nothing left to prune them. Removing them is best
 * effort: the OS may clear a cache directory anyway, so a failure does not hold
 * the repair back.
 *
 * Idempotent: a second run finds nothing to clear.
 *
 * @param {Object} db - expo-sqlite database
 * @returns {Promise<void>}
 */
export const clearStoredLocations = async (db) => {
  try {
    await db.runAsync(
      'UPDATE operations SET latitude = NULL, longitude = NULL WHERE latitude IS NOT NULL OR longitude IS NOT NULL',
    );
    await db.runAsync(
      'UPDATE pending_notifications SET latitude = NULL, longitude = NULL WHERE latitude IS NOT NULL OR longitude IS NOT NULL',
    );
    await db.runAsync("DELETE FROM app_metadata WHERE key = 'attach_location'");
    try {
      // Required on demand so expo-file-system stays out of normal startup.
      const FileSystem = require('expo-file-system/legacy');
      await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}map-tiles/`, { idempotent: true });
    } catch (error) {
      console.warn('Failed to delete the map tile cache:', error?.message);
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES ('post_migration_clearStoredLocations_completed', 'true', ?)",
      [new Date().toISOString()],
    );
  } catch (error) {
    // Not fatal: the flag stays unset and the repair is retried on next launch.
    console.error('Failed to clear stored locations:', error);
  }
};
