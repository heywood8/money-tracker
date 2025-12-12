import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from '../db/schema';
import { setDatabaseInstances } from '../db/client';

const DB_NAME = 'penny.db';

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
      console.log('Opening database:', DB_NAME);
      // Use sync API for migrations (UUID migration needs sync methods)
      dbInstance = SQLite.openDatabaseSync(DB_NAME);
      console.log('Database opened successfully, instance:', !!dbInstance);

      if (!dbInstance) {
        throw new Error('Database instance is null after opening');
      }

      drizzleInstance = drizzle(dbInstance, { schema });
      console.log('Drizzle instance created');

      // Set instances for db/client.js to use in migrations
      setDatabaseInstances(dbInstance, drizzleInstance);

      await initializeDatabase(dbInstance);
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to open database:', error);
      console.error('Error details:', error.message, error.stack);
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
 * Uses Drizzle migrations for all schema management
 */
const initializeDatabase = async (rawDb) => {
  try {
    console.log('Initializing database...');

    // Import and run migrations (includes UUID migration if needed)
    let initializeDatabase;
    try {
      // eslint-disable-next-line global-require
      ({ initializeDatabase } = require('../db/migrate'));
    } catch (requireErr) {
      if (requireErr && /Cannot find module/.test(requireErr.message)) {
        console.warn('Drizzle migrate module not available in this environment; skipping migrations.');
        return;
      }
      throw requireErr;
    }

    if (typeof initializeDatabase === 'function') {
      await initializeDatabase();
      console.log('Database initialization completed');
    } else {
      console.warn('initializeDatabase function not available');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

// Database tables are now managed by Drizzle migrations in drizzle/ folder

/**
 * Execute a query with parameters (legacy compatibility)
 * @param {string} sqlStr
 * @param {Array} params
 * @returns {Promise<any>}
 */
export const executeQuery = async (sqlStr, params = []) => {
  const { raw } = await getDatabase();
  try {
    return raw.runSync(sqlStr, params);
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
    return raw.getAllSync(sqlStr, params) || [];
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
    return raw.getFirstSync(sqlStr, params);
  } catch (error) {
    console.error('Query failed:', error);
    throw error;
  }
};

/**
 * Execute multiple statements in a transaction (legacy compatibility)
 * @param {Function} callback - Function that receives the db instance
 * @returns {Promise<any>}
 */
export const executeTransaction = async (callback) => {
  const { raw } = await getDatabase();
  try {
    let result;
    raw.withTransactionSync(() => {
      result = callback(raw);
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
    console.log('Closing database connection...');
    try {
      dbInstance.closeSync();
      console.log('Database connection closed successfully');
    } catch (error) {
      console.error('Error closing database:', error);
      // Continue anyway to reset the instances
    }
    dbInstance = null;
    drizzleInstance = null;
    initPromise = null;
  }
};

/**
 * Drop all tables (for testing/development only)
 */
export const dropAllTables = async () => {
  const { raw } = await getDatabase();

  if (!raw) {
    throw new Error('Database instance is null');
  }

  raw.execSync(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS budgets;
    DROP TABLE IF EXISTS operations;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS app_metadata;
    PRAGMA foreign_keys = ON;
  `);

  // Close the database connection properly
  raw.closeSync();

  // Reset both instance and initialization promise
  dbInstance = null;
  drizzleInstance = null;
  initPromise = null;
};
