import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from '../db/schema';

const DB_NAME = 'penny.db';
const DB_VERSION = 8;

let dbInstance = null;
let drizzleInstance = null;
let initPromise = null;

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
      dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
      drizzleInstance = drizzle(dbInstance, { schema });
      await initializeDatabase(dbInstance, drizzleInstance);
    } catch (error) {
      console.error('Failed to open database:', error);
      dbInstance = null;
      drizzleInstance = null;
      initPromise = null;
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
 * Initialize database schema
 */
const initializeDatabase = async (rawDb, db) => {
  try {
    // Enable foreign keys and WAL mode
    await rawDb.execAsync('PRAGMA foreign_keys = ON');
    await rawDb.execAsync('PRAGMA journal_mode = WAL');

    // Check if app_metadata table exists
    const tableCheck = await rawDb.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_metadata'"
    );

    if (!tableCheck) {
      // Fresh database - create all tables
      console.log('Initializing fresh database...');
      await createTables(rawDb);

      // Set initial version
      await rawDb.runAsync(
        'INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['db_version', DB_VERSION.toString(), new Date().toISOString()]
      );

      console.log(`Database created successfully (v${DB_VERSION})`);
    } else {
      // Existing database - check version and run migrations if needed
      const versionResult = await rawDb.getFirstAsync(
        'SELECT value FROM app_metadata WHERE key = ?',
        ['db_version']
      );

      const currentVersion = versionResult ? parseInt(versionResult.value) : 0;

      if (currentVersion < DB_VERSION) {
        console.log(`Database upgrade needed: v${currentVersion} → v${DB_VERSION}`);
        // Migrations would go here if needed in the future

        // Update version
        await rawDb.runAsync(
          'UPDATE app_metadata SET value = ?, updated_at = ? WHERE key = ?',
          [DB_VERSION.toString(), new Date().toISOString(), 'db_version']
        );

        console.log('Database upgraded successfully');
      }
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

/**
 * Create all database tables
 */
const createTables = async (rawDb) => {
  await rawDb.execAsync(`
    -- App metadata table
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Accounts table
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance TEXT NOT NULL DEFAULT '0',
      currency TEXT NOT NULL DEFAULT 'USD',
      display_order INTEGER,
      hidden INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('folder', 'entry')),
      category_type TEXT NOT NULL CHECK(category_type IN ('expense', 'income')),
      parent_id TEXT,
      icon TEXT,
      color TEXT,
      is_shadow INTEGER DEFAULT 0,
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
      exchange_rate TEXT,
      destination_amount TEXT,
      source_currency TEXT,
      destination_currency TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- Budgets table
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly', 'yearly')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_recurring INTEGER DEFAULT 1,
      rollover_enabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(date DESC);
    CREATE INDEX IF NOT EXISTS idx_operations_account ON operations(account_id);
    CREATE INDEX IF NOT EXISTS idx_operations_category ON operations(category_id);
    CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
    CREATE INDEX IF NOT EXISTS idx_categories_category_type ON categories(category_type);
    CREATE INDEX IF NOT EXISTS idx_categories_is_shadow ON categories(is_shadow);
    CREATE INDEX IF NOT EXISTS idx_accounts_order ON accounts(display_order);
    CREATE INDEX IF NOT EXISTS idx_accounts_hidden ON accounts(hidden);
    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_type);
    CREATE INDEX IF NOT EXISTS idx_budgets_dates ON budgets(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_currency ON budgets(currency);
    CREATE INDEX IF NOT EXISTS idx_budgets_recurring ON budgets(is_recurring);
  `);
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
    console.error('Query execution failed:', error);
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

/**
 * Execute multiple statements in a transaction (legacy compatibility)
 * @param {Function} callback - Async function that receives the db instance
 * @returns {Promise<any>}
 */
export const executeTransaction = async (callback) => {
  const { raw } = await getDatabase();
  try {
    let result;
    await raw.withTransactionAsync(async () => {
      result = await callback(raw);
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
    drizzleInstance = null;
  }
};

/**
 * Drop all tables (for testing/development only)
 */
export const dropAllTables = async () => {
  const { raw } = await getDatabase();
  await raw.execAsync(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS budgets;
    DROP TABLE IF EXISTS operations;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS app_metadata;
    PRAGMA foreign_keys = ON;
  `);

  // Close the database connection properly
  await raw.closeAsync();

  // Reset both instance and initialization promise
  dbInstance = null;
  drizzleInstance = null;
  initPromise = null;
};
