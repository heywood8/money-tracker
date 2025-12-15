import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import * as schema from '../db/schema';
import migrations from '../../drizzle/migrations';

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
      dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
      console.log('Database opened successfully, instance:', !!dbInstance);

      if (!dbInstance) {
        throw new Error('Database instance is null after opening');
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
 * Initialize database with Drizzle migrations
 */
const initializeDatabase = async (rawDb, db) => {
  try {
    // Enable foreign keys and WAL mode
    await rawDb.execAsync('PRAGMA foreign_keys = ON');
    await rawDb.execAsync('PRAGMA journal_mode = WAL');

    console.log('Running Drizzle migrations...');

    // Run Drizzle migrations
    await migrate(db, migrations);

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
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
    console.log('Closing database connection...');
    try {
      await dbInstance.closeAsync();
      console.log('Database closed successfully');
    } catch (error) {
      console.error('Error closing database:', error);
    } finally {
      dbInstance = null;
      drizzleInstance = null;
    }
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
