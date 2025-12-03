import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { db, rawDb } from './client';

/**
 * Run Drizzle migrations
 * This function applies all pending migrations from the drizzle folder
 */
export const runMigrations = async () => {
  try {
    console.log('Running Drizzle migrations...');

    // Enable foreign keys
    rawDb.execSync('PRAGMA foreign_keys = ON');

    // Run migrations
    await migrate(db, { migrationsFolder: 'drizzle' });

    console.log('Drizzle migrations completed successfully');
  } catch (error) {
    console.error('Failed to run migrations:', error);
    throw error;
  }
};

/**
 * Check if database needs migration from old schema
 * @returns {Promise<boolean>}
 */
export const needsLegacyMigration = async () => {
  try {
    // Check if the old migration system was used
    const result = rawDb.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_metadata'"
    );

    if (!result) {
      // No app_metadata table means this is a fresh install
      return false;
    }

    // Check for drizzle migration tracking
    const drizzleCheck = rawDb.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
    );

    // If app_metadata exists but drizzle migrations don't, we need to migrate
    return !drizzleCheck;
  } catch (error) {
    console.error('Failed to check legacy migration status:', error);
    return false;
  }
};

/**
 * Initialize database with Drizzle migrations
 */
export const initializeDatabase = async () => {
  try {
    const needsLegacy = await needsLegacyMigration();

    if (needsLegacy) {
      console.log('Existing database detected - schema will be preserved');
      // The database already has the schema from the old system
      // We just need to mark it as migrated in Drizzle's tracking
      await markAsInitiallyMigrated();
    } else {
      // Fresh install or already using Drizzle - run migrations normally
      await runMigrations();
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

/**
 * Mark existing database as already migrated (for transition from old system)
 */
const markAsInitiallyMigrated = async () => {
  try {
    // Create the Drizzle migrations table if it doesn't exist
    rawDb.execSync(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER
      )
    `);

    console.log('Marked existing database as migrated');
  } catch (error) {
    console.error('Failed to mark database as migrated:', error);
    throw error;
  }
};
