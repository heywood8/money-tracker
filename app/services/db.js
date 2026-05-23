import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import * as schema from '../db/schema';
import migrations from '../../drizzle/migrations';
import { normalizeSearchText } from './searchNormalize';

const DB_NAME = 'penny.db';

let dbInstance = null;
let drizzleInstance = null;
let initPromise = null;
let searchNormAvailable = false;

export const isSearchNormAvailable = () => searchNormAvailable;

/**
 * Get or create the database instance
 * @returns {Promise<Object>} Object with both raw and drizzle instances
 */
export const getDatabase = async () => {
  if (dbInstance && drizzleInstance) {
    return { raw: dbInstance, drizzle: drizzleInstance };
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    await initPromise;
    return { raw: dbInstance, drizzle: drizzleInstance };
  }

  // Start initialization
  initPromise = (async () => {
    try {
      console.log('Opening database:', DB_NAME);
      dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
      console.log('Database opened successfully, instance:', !!dbInstance);

      if (!dbInstance) {
        throw new Error('Database instance is null after opening');
      }

      // Register search-normalization function — SQLite's built-in LOWER() is ASCII-only,
      // so Cyrillic case-folding (and Russian ё/е equivalence) has to be done in JS. The
      // callback delegates to normalizeSearchText() which is the same normalizer applied
      // to the query on the JS side, so SQL-side and in-memory results stay consistent.
      // expo-sqlite 16.x uses createCustomFunctionAsync(name, callback, options).
      try {
        if (typeof dbInstance.createCustomFunctionAsync === 'function') {
          await dbInstance.createCustomFunctionAsync('SEARCH_NORM', normalizeSearchText, { deterministic: true });
          searchNormAvailable = true;
        } else if (typeof dbInstance.createFunctionAsync === 'function') {
          await dbInstance.createFunctionAsync('SEARCH_NORM', normalizeSearchText, { deterministic: true });
          searchNormAvailable = true;
        } else {
          console.warn('SEARCH_NORM: no custom function API found, Cyrillic/yo search will use LOWER()');
        }
      } catch (fnError) {
        console.warn('SEARCH_NORM registration failed, Cyrillic/yo search will use LOWER():', fnError.message);
      }

      drizzleInstance = drizzle(dbInstance, { schema });
      console.log('Drizzle instance created');

      await initializeDatabase(dbInstance, drizzleInstance);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to open database:', error);
      console.error('Error details:', error.message, error.stack);
      dbInstance = null;
      drizzleInstance = null;
      initPromise = null;
      searchNormAvailable = false;
      throw error;
    }
  })();

  await initPromise;
  initPromise = null;
  return { raw: dbInstance, drizzle: drizzleInstance };
};

/**
 * Get the Drizzle instance
 * @returns {Promise<drizzle>}
 */
export const getDrizzle = async () => {
  const { drizzle: db } = await getDatabase();
  return db;
};

/**
 * Check if database is in a corrupted migration state
 */
const isDatabaseCorrupted = async (rawDb) => {
  try {
    // Check if accounts table exists
    const accountsTable = await rawDb.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'",
    );

    if (accountsTable.length === 0) {
      return false; // No accounts table, fresh database
    }

    // Check the actual schema of accounts table
    const accountsSchema = await rawDb.getAllAsync('PRAGMA table_info(accounts)');
    const idColumn = accountsSchema.find(col => col.name === 'id');

    if (!idColumn) {
      console.warn('Accounts table exists but has no id column - corrupted');
      return true;
    }

    // Check if we have the right schema (integer id with autoincrement)
    // If id is 'text' type, we're in the old schema and migration failed
    if (idColumn.type.toLowerCase() === 'text') {
      console.warn('Accounts table has text id - migration 0002 was not applied');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking database corruption:', error);
    return false;
  }
};

/**
 * Initialize database with Drizzle migrations
 */
const initializeDatabase = async (rawDb, db) => {
  try {
    console.log('Running Drizzle migrations...');
    console.log('Available migrations:', migrations.journal.entries.map(e => e.tag).join(', '));

    // Check existing tables
    const existingTables = await rawDb.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" ORDER BY name',
    );
    console.log('Existing tables:', (existingTables || []).map(t => t.name).join(', '));

    // Check for corrupted migration state
    const isCorrupted = await isDatabaseCorrupted(rawDb);
    if (isCorrupted) {
      console.warn('Database is in a corrupted state - attempting recovery...');
      console.warn('This will reset all data. To avoid this, please use Settings > Reset Database before updating the app.');

      // Drop all tables and start fresh
      await rawDb.runAsync('PRAGMA foreign_keys = OFF');
      const tables = await rawDb.getAllAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      );
      for (const table of tables) {
        await rawDb.runAsync(`DROP TABLE IF EXISTS "${table.name}"`);
      }
      await rawDb.runAsync('PRAGMA foreign_keys = ON');
      console.log('All tables dropped for recovery');
    }

    // Check current migration state before running
    const drizzleMigrations = await rawDb.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" AND name="__drizzle_migrations"',
    );

    if (drizzleMigrations && drizzleMigrations.length > 0) {
      const appliedMigrations = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC');
      const hashList = (appliedMigrations || []).map(m => m.hash || 'null').join(', ');
      console.log('Previously applied migrations:', hashList || 'none');
    } else {
      console.log('No migrations table found - database will be migrated from scratch');
    }

    // Get migrations before applying
    const migrationsBefore = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC').catch(() => []);
    const appliedHashesBefore = new Set((migrationsBefore || []).map(m => m.hash));

    // Pre-migration: log exact column list of operations table so we can see
    // what state it is in before migrations run.
    const opsColumnsPreMigration = await rawDb.getAllAsync('PRAGMA table_info(operations)').catch(() => []);
    if (opsColumnsPreMigration && opsColumnsPreMigration.length > 0) {
      console.log('[DB] operations table columns before migrations:', opsColumnsPreMigration.map(c => `${c.cid}:${c.name}(${c.type})`).join(', '));
    } else {
      console.log('[DB] operations table does not exist yet (fresh database)');
    }

    // PRE-MIGRATION DEFENSIVE CHECK: ensure original_balance column exists BEFORE
    // running migrations. If migration 0006 was recorded in __drizzle_migrations but
    // its ALTER TABLE was rolled back (Drizzle/Expo SQLite bug), the column will be
    // absent. Migration 0007 does `INSERT INTO __new_operations SELECT * FROM operations`
    // which fails when the column counts mismatch (old=13, new=14) — causing migrate()
    // to throw BEFORE the post-migration fallback below can run. Adding the column here
    // breaks that infinite failure loop.
    if (opsColumnsPreMigration && opsColumnsPreMigration.length > 0) {
      const hasOriginalBalancePre = opsColumnsPreMigration.some(col => col.name === 'original_balance');
      if (!hasOriginalBalancePre) {
        console.warn('[DB] PRE-MIGRATION: original_balance column missing from operations table — adding it now so migration 0007 SELECT * column count matches');
        try {
          await rawDb.runAsync('ALTER TABLE `operations` ADD COLUMN `original_balance` text');
          console.log('[DB] PRE-MIGRATION: original_balance column added successfully');
        } catch (preAddErr) {
          console.error('[DB] PRE-MIGRATION: failed to add original_balance column:', preAddErr.message);
        }
      } else {
        console.log('[DB] PRE-MIGRATION: original_balance column already present — no action needed');
      }
    }

    // Pre-migration guard for migration 0007 (CHECK constraint on operations.type).
    // If invalid types exist we warn and exclude 0007 from this run so the app can
    // still start. The migration stays pending and will be retried on the next
    // launch after the user has fixed or removed the offending rows.
    let migrationsConfig = migrations;
    const opsSchema = await rawDb.getFirstAsync(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='operations'",
    ).catch(() => null);
    const m0007Tag = '0007_add_enum_check_constraints';
    // Look specifically for the type-column CHECK so a future CHECK on a different
    // column (e.g. CHECK (amount >= 0)) cannot mask whether 0007 has run.
    const m0007AlreadyApplied =
      !!opsSchema?.sql && /CHECK\s*\(\s*[`"]?type[`"]?\s+IN\s*\(/i.test(opsSchema.sql);
    if (opsSchema && !m0007AlreadyApplied) {
      const invalidOp = await rawDb.getFirstAsync(
        "SELECT id, type FROM operations WHERE type NOT IN ('expense', 'income', 'transfer') LIMIT 1",
      ).catch(() => null);
      if (invalidOp) {
        console.warn(
          `[DB] Skipping migration 0007: operation id=${invalidOp.id} has invalid type "${invalidOp.type}". ` +
          'All operation types must be expense, income, or transfer. ' +
          'Fix the invalid operations and restart the app to apply this migration.',
        );
        const { m0007: _skip, ...migsWithout0007 } = migrations.migrations;
        migrationsConfig = {
          ...migrations,
          journal: {
            ...migrations.journal,
            entries: migrations.journal.entries.filter(e => e.tag !== m0007Tag),
          },
          migrations: migsWithout0007,
        };
      }
    }

    // Run Drizzle migrations
    console.log('[DB] calling migrate() with', migrationsConfig.journal.entries.length, 'journal entries:', migrationsConfig.journal.entries.map(e => e.tag).join(', '));
    try {
      await migrate(db, migrationsConfig);
      console.log('[DB] migrate() completed without throwing');
    } catch (migrateErr) {
      console.error('[DB] migrate() threw an error:', migrateErr.message);
      console.error('[DB] migrate() error cause:', migrateErr.cause?.message ?? '(no cause)');
      throw migrateErr;
    }

    // Post-migration verification: log the final column list and confirm
    // original_balance is present. Acts as a last-resort fallback in case
    // both the pre-migration guard and migrate() somehow left it absent.
    const opsColumnsPostMigration = await rawDb.getAllAsync('PRAGMA table_info(operations)').catch(() => []);
    if (opsColumnsPostMigration && opsColumnsPostMigration.length > 0) {
      console.log('[DB] operations table columns after migrations:', opsColumnsPostMigration.map(c => `${c.cid}:${c.name}(${c.type})`).join(', '));
    }
    const hasOriginalBalance = (opsColumnsPostMigration || []).some(col => col.name === 'original_balance');
    if (!hasOriginalBalance) {
      console.warn('[DB] POST-MIGRATION: original_balance column still missing — adding it as last-resort fallback');
      try {
        await rawDb.runAsync('ALTER TABLE `operations` ADD COLUMN `original_balance` text');
        console.log('[DB] POST-MIGRATION: original_balance column added via fallback');
      } catch (postAddErr) {
        console.error('[DB] POST-MIGRATION: failed to add original_balance column:', postAddErr.message);
      }
    } else {
      console.log('[DB] POST-MIGRATION: original_balance column confirmed present');
    }

    // Defensive: ensure planned_operations table exists after migrations.
    // The beta Drizzle migrator can silently fail to apply a migration (transaction
    // rolls back, hash not recorded), so we create the table directly as a fallback.
    const plannedOpsTable = await rawDb.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='planned_operations'",
    ) || [];
    if (plannedOpsTable.length === 0) {
      console.warn('planned_operations table missing after migrations — creating it directly');
      await rawDb.runAsync(
        `CREATE TABLE IF NOT EXISTS \`planned_operations\` (
          \`id\` text PRIMARY KEY NOT NULL,
          \`name\` text NOT NULL,
          \`type\` text NOT NULL,
          \`amount\` text NOT NULL,
          \`account_id\` integer NOT NULL,
          \`category_id\` text,
          \`to_account_id\` integer,
          \`description\` text,
          \`is_recurring\` integer NOT NULL DEFAULT 1,
          \`last_executed_month\` text,
          \`display_order\` integer,
          \`created_at\` text NOT NULL,
          \`updated_at\` text NOT NULL,
          FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
          FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
          FOREIGN KEY (\`to_account_id\`) REFERENCES \`accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade
        )`,
      );
      await rawDb.runAsync(
        'CREATE INDEX IF NOT EXISTS `idx_planned_ops_account` ON `planned_operations` (`account_id`)',
      );
      await rawDb.runAsync(
        'CREATE INDEX IF NOT EXISTS `idx_planned_ops_type` ON `planned_operations` (`type`)',
      );
      await rawDb.runAsync(
        'CREATE INDEX IF NOT EXISTS `idx_planned_ops_recurring` ON `planned_operations` (`is_recurring`)',
      );
      console.log('planned_operations table created via fallback');
    }

    // Enable foreign keys and WAL mode after migrations
    await rawDb.runAsync('PRAGMA foreign_keys = ON');
    await rawDb.runAsync('PRAGMA journal_mode = WAL');

    // Log which migrations were applied
    const finalMigrations = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC');
    const finalHashList = (finalMigrations || []).map(m => m.hash || 'null').join(', ');
    console.log('Migrations after running migrate:', finalHashList || 'none');
    console.log(`Total migrations applied: ${(finalMigrations || []).length}/${migrations.journal.entries.length}`);

    // Run post-migration handlers for newly applied migrations
    if (migrations.postMigrationHandlers) {
      const appliedHashesAfter = new Set((finalMigrations || []).map(m => m.hash));
      
      for (const [key, handler] of Object.entries(migrations.postMigrationHandlers)) {
        // Find the migration hash for this key (e.g., m0003 -> hash)
        const migrationEntry = migrations.journal.entries.find(e => e.tag.includes(key.replace('m', '')));
        
        if (migrationEntry && appliedHashesAfter.has(migrationEntry.hash) && !appliedHashesBefore.has(migrationEntry.hash)) {
          console.log(`Running post-migration handler for ${key}...`);
          try {
            await handler(rawDb);
          } catch (handlerError) {
            console.error(`Post-migration handler ${key} failed:`, handlerError);
            // Don't throw - allow app to continue
          }
        }
      }
    }

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);    console.error('Error details:', {
      message: error.message,
      cause: error.cause,
      stack: error.stack,
    });
    
    // Log current database state for debugging
    try {
      const tables = await rawDb.getAllAsync('SELECT name FROM sqlite_master WHERE type="table"');
      console.error('Current tables in database:', tables.map(t => t.name).join(', '));
      
      const migrationsCheck = await rawDb.getAllAsync('SELECT * FROM __drizzle_migrations').catch(() => []);
      console.error('Current migration records:', migrationsCheck.length);
    } catch (debugError) {
      console.error('Could not retrieve debug info:', debugError.message);
    }
    throw error;
  }
};

/**
 * Execute a query with parameters (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const executeQuery = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return await raw.runAsync(sqlStr, params);
  } catch (error) {
    console.error('Query execution failed:', error.message, error);
    throw error;
  }
};

/**
 * Execute a SELECT query and return all results (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<Array>}
 */
export const queryAll = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return await raw.getAllAsync(sqlStr, params) || [];
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

/**
 * Execute a SELECT query and return first result (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const queryFirst = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return await raw.getFirstAsync(sqlStr, params);
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

// Serializes executeTransaction calls so their async statements cannot interleave
// on the shared SQLite connection. withTransactionAsync is used (same connection,
// no new native open) to avoid the startup crash caused by withExclusiveTransactionAsync
// opening a second connection during initialization.
let _lastTransaction = Promise.resolve();

/**
 * Execute multiple statements in a transaction (legacy compatibility)
 * @param {Function} callback - Async function that receives the db instance
 * @returns {Promise<any>}
 *
 * JS-level serialization ensures only one executeTransaction callback runs at a
 * time, preventing async interleaving without the new-connection overhead of
 * withExclusiveTransactionAsync (which caused startup crashes on Android).
 */
export const executeTransaction = async (callback) => {
  const { raw } = await getDatabase();

  // _lastTransaction is always resolved (tail .catch keeps it that way), so
  // chaining with .then is safe and prevents concurrent callbacks from interleaving.
  const txPromise = _lastTransaction.then(async () => {
    let callbackResult;
    await raw.withTransactionAsync(async () => {
      callbackResult = await callback(raw);
    });
    return callbackResult;
  });

  // Swallow rejection so the next queued transaction always starts.
  _lastTransaction = txPromise.catch(() => {});
  return txPromise;
};

/**
 * Close the database connection
 */
export const closeDatabase = async () => {
  if (dbInstance) {
    console.log('Closing database connection...');
    try {
      await dbInstance.closeAsync();
      console.log('Database closed successfully');
    } catch (error) {
      console.error('Error closing database:', error);
    } finally {
      dbInstance = null;
      drizzleInstance = null;
      searchNormAvailable = false;
    }
  }
};

/**
 * Get the current database version based on applied migrations
 * @returns {Promise<string>} Database version (e.g., "2" for 2 migrations applied)
 */
export const getDatabaseVersion = async () => {
  try {
    const { raw } = await getDatabase();

    // Check if migrations table exists
    const tableExists = await raw.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" AND name="__drizzle_migrations"',
    );

    if (tableExists.length === 0) {
      return '0';
    }

    // Get all applied migrations
    const appliedMigrations = await raw.getAllAsync(
      'SELECT * FROM __drizzle_migrations ORDER BY created_at ASC',
    );

    // Return the count of applied migrations (this represents the version)
    return String(appliedMigrations.length);
  } catch (error) {
    console.error('Failed to get database version:', error);
    return '?';
  }
};

/**
 * Drop all tables in the database
 * WARNING: This will delete all data!
 */
export const dropAllTables = async () => {
  try {
    let raw;
    let openedNewConnection = false;

    // Try to get existing database connection, or open a new one
    try {
      if (dbInstance) {
        raw = dbInstance;
      } else {
        console.log('Opening database for table drop...');
        raw = await SQLite.openDatabaseAsync(DB_NAME);
        openedNewConnection = true;
      }
    } catch (openError) {
      console.error('Failed to open database for dropping tables:', openError);
      throw openError;
    }

    // Disable foreign keys temporarily
    await raw.runAsync('PRAGMA foreign_keys = OFF');

    // Get all table names
    const tables = await raw.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );

    console.log('Tables to drop:', tables.map(t => t.name).join(', '));

    // Drop each table (including migrations)
    for (const table of tables) {
      await raw.runAsync(`DROP TABLE IF EXISTS "${table.name}"`);
      console.log(`Dropped table: ${table.name}`);
    }

    // Re-enable foreign keys
    await raw.runAsync('PRAGMA foreign_keys = ON');

    console.log('All tables dropped successfully');

    // Close the database connection properly before resetting instances
    // This ensures the native connection is released
    try {
      await raw.closeAsync();
      console.log('Database connection closed after dropping tables');
    } catch (closeError) {
      console.error('Error closing database after dropping tables:', closeError);
    }

    // Reset the instances to null so it reinitializes on next getDatabase call
    dbInstance = null;
    drizzleInstance = null;
    initPromise = null;
  } catch (error) {
    console.error('Failed to drop tables:', error);
    throw error;
  }
};

/**
 * Reset database (for testing/debugging only)
 * WARNING: This will delete all data!
 */
export const resetDatabase = async () => {
  console.warn('Resetting database - all data will be lost!');

  // Close existing connection
  await closeDatabase();

  // Delete the database file
  const dbPath = `${SQLite.documentDirectory}SQLite/${DB_NAME}`;
  try {
    const FileSystem = require('expo-file-system/legacy');
    await FileSystem.deleteAsync(dbPath, { idempotent: true });
    console.log('Database file deleted');
  } catch (error) {
    console.error('Failed to delete database file:', error);
  }

  // Reopen and initialize
  return await getDatabase();
};
