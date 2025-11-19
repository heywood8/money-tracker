import * as SQLite from 'expo-sqlite';

const DB_NAME = 'money_tracker.db';
const DB_VERSION = 2;

let dbInstance = null;

/**
 * Get or create the database instance
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export const getDatabase = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
    await initializeDatabase(dbInstance);
    return dbInstance;
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
};

/**
 * Migrate database from one version to another
 */
const migrateDatabase = async (db, fromVersion, toVersion) => {
  console.log(`Migrating database from version ${fromVersion} to ${toVersion}`);

  try {
    if (fromVersion < 2) {
      // Migration from v1 to v2: Add category_type column and update type constraint
      console.log('Migrating to v2: Adding category_type column and updating type constraint');

      // SQLite doesn't support ALTER TABLE to modify CHECK constraints
      // We need to recreate the table with the new schema

      await db.execAsync(`
        PRAGMA foreign_keys = OFF;

        BEGIN TRANSACTION;

        -- Create new categories table with updated schema
        CREATE TABLE categories_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('folder', 'subfolder', 'entry', 'expense', 'income')),
          category_type TEXT CHECK(category_type IN ('expense', 'income')),
          parent_id TEXT,
          icon TEXT,
          color TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
        );

        -- Copy existing data
        INSERT INTO categories_new (id, name, type, category_type, parent_id, icon, color, created_at, updated_at)
        SELECT id, name, type, NULL, parent_id, icon, color, created_at, updated_at
        FROM categories;

        -- Drop old table
        DROP TABLE categories;

        -- Rename new table
        ALTER TABLE categories_new RENAME TO categories;

        -- Recreate indexes
        CREATE INDEX idx_categories_parent ON categories(parent_id);
        CREATE INDEX idx_categories_type ON categories(type);

        COMMIT;

        PRAGMA foreign_keys = ON;
      `);

      console.log('Migration to v2 completed successfully');
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

/**
 * Initialize database schema
 */
const initializeDatabase = async (db) => {
  try {
    // Create tables in order (no foreign key dependencies first)
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      -- Accounts table
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        balance TEXT NOT NULL DEFAULT '0',
        currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('folder', 'subfolder', 'entry', 'expense', 'income')),
        category_type TEXT CHECK(category_type IN ('expense', 'income')),
        parent_id TEXT,
        icon TEXT,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      -- Operations table
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'transfer')),
        amount TEXT NOT NULL,
        account_id TEXT NOT NULL,
        category_id TEXT,
        to_account_id TEXT,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        description TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      -- App metadata table
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(date DESC);
      CREATE INDEX IF NOT EXISTS idx_operations_account ON operations(account_id);
      CREATE INDEX IF NOT EXISTS idx_operations_category ON operations(category_id);
      CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
    `);

    // Check and set database version
    const versionResult = await db.getFirstAsync(
      'SELECT value FROM app_metadata WHERE key = ?',
      ['db_version']
    );

    const currentVersion = versionResult ? parseInt(versionResult.value, 10) : 0;

    if (currentVersion === 0) {
      // New database, set version
      await db.runAsync(
        'INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['db_version', DB_VERSION.toString(), new Date().toISOString()]
      );
    } else if (currentVersion < DB_VERSION) {
      // Migration needed
      await migrateDatabase(db, currentVersion, DB_VERSION);

      // Update version
      await db.runAsync(
        'UPDATE app_metadata SET value = ?, updated_at = ? WHERE key = ?',
        [DB_VERSION.toString(), new Date().toISOString(), 'db_version']
      );
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

/**
 * Execute a query with parameters
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const executeQuery = async (sql, params = []) => {
  const db = await getDatabase();
  try {
    return await db.runAsync(sql, params);
  } catch (error) {
    console.error('Query execution failed:', error);
    throw error;
  }
};

/**
 * Execute a SELECT query and return all results
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array>}
 */
export const queryAll = async (sql, params = []) => {
  const db = await getDatabase();
  try {
    return await db.getAllAsync(sql, params);
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

/**
 * Execute a SELECT query and return first result
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const queryFirst = async (sql, params = []) => {
  const db = await getDatabase();
  try {
    return await db.getFirstAsync(sql, params);
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

/**
 * Execute multiple statements in a transaction
 * @param {Function} callback - Async function that receives the db instance
 * @returns {Promise<any>}
 */
export const executeTransaction = async (callback) => {
  const db = await getDatabase();
  try {
    let result;
    await db.withTransactionAsync(async () => {
      result = await callback(db);
    });
    return result;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
};

/**
 * Close the database connection
 */
export const closeDatabase = async () => {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
};

/**
 * Drop all tables (for testing/development only)
 */
export const dropAllTables = async () => {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS operations;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS app_metadata;
    PRAGMA foreign_keys = ON;
  `);
  dbInstance = null;
};
