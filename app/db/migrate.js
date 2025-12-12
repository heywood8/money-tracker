import { needsUuidMigration, migrateUuidToInteger } from '../services/uuidToIntegerMigration';

// Import the SQL migration directly (can't use Drizzle's file-based migrations in React Native)
import initialMigrationSQL from './migrations/0000_initial';

/**
 * Initialize database with migrations
 *
 * Migration flow:
 * 1. Check if UUID to integer migration is needed (old text-based IDs)
 * 2. If needed, run custom UUID migration (creates tables with integer IDs)
 * 3. Run SQL migration directly (idempotent - uses CREATE TABLE IF NOT EXISTS)
 *
 * This approach works for:
 * - Fresh installs: SQL creates tables
 * - UUID migrations: Custom migration creates tables, SQL sees they exist
 * - Normal updates: Add new migration SQL files
 *
 * Note: We can't use Drizzle's migrate() in React Native because it requires
 * filesystem access to read migration files, which isn't available after bundling.
 */
export const initializeDatabase = async () => {
  try {
    console.log('Initializing database...');

    // Import db getter functions (lazy import to avoid circular dependency)
    const { getRawDb } = await import('./client');

    // Get actual database instance
    const rawDb = getRawDb();

    // Enable foreign keys and WAL mode
    rawDb.execSync('PRAGMA foreign_keys = ON');
    rawDb.execSync('PRAGMA journal_mode = WAL');

    // Step 1: Check if UUID to integer migration is needed
    const needsUuidMig = await needsUuidMigration();
    if (needsUuidMig) {
      console.log('UUID database detected - migrating to integer IDs...');
      await migrateUuidToInteger();
      console.log('✅ UUID to integer migration completed');
    }

    // Step 2: Run SQL migration directly (idempotent - safe after UUID migration or on fresh install)
    console.log('Running database schema migration...');
    rawDb.execSync(initialMigrationSQL);
    console.log('✅ Database schema migration completed');

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};
