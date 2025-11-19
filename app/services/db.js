import * as SQLite from 'expo-sqlite';

const DB_NAME = 'money_tracker.db';
const DB_VERSION = 1;

let dbInstance = null;
let initPromise = null;

/**
 * Get or create the database instance
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export const getDatabase = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    await initPromise;
    return dbInstance;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
      await initializeDatabase(dbInstance);
    } catch (error) {
      console.error('Failed to open database:', error);
      dbInstance = null;
      initPromise = null;
      throw error;
    }
  })();

  await initPromise;
  initPromise = null;
  return dbInstance;
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
        type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'folder')),
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

    if (!versionResult) {
      await db.runAsync(
        'INSERT OR IGNORE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['db_version', DB_VERSION.toString(), new Date().toISOString()]
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
