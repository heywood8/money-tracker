/**
 * Database Reset Utility
 *
 * This utility can be called to reset the database and reinitialize it.
 * Useful for development and fixing database migration issues.
 */

import { dropAllTables, getDatabase, closeDatabase } from '../services/db';
import { appEvents, EVENTS } from '../services/eventEmitter';

/**
 * Reset the database completely
 * This will drop all tables and reinitialize from scratch
 *
 * @returns {Promise<void>}
 */
export const resetDatabase = async () => {
  try {
    console.log('Starting database reset...');

    // Close existing database connection first to ensure clean state
    await closeDatabase();
    console.log('Existing database connection closed');

    // Drop all tables
    await dropAllTables();
    console.log('All tables dropped');

    // Reinitialize database (this will create all tables fresh)
    await getDatabase();
    console.log('Database reinitialized');

    // Emit event to notify all contexts of the reset
    // Note: Do NOT emit RELOAD_ALL here - contexts clear their state on DATABASE_RESET
    // and will reload naturally when the user completes language selection (isFirstLaunch -> false)
    // Emitting RELOAD_ALL prematurely would initialize categories in English before the user picks a language
    appEvents.emit(EVENTS.DATABASE_RESET);

    console.log('Database reset complete');
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
};

/**
 * Check if budgets table exists
 * Useful for diagnosing migration issues
 *
 * @returns {Promise<boolean>}
 */
export const checkBudgetsTableExists = async () => {
  try {
    const { raw } = await getDatabase();
    const result = await raw.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'",
    );
    return result !== null;
  } catch (error) {
    console.error('Failed to check budgets table:', error);
    return false;
  }
};

/**
 * Get current database version
 *
 * @returns {Promise<number>}
 */
export const getDatabaseVersion = async () => {
  try {
    const { raw } = await getDatabase();
    const result = await raw.getFirstAsync(
      'SELECT value FROM app_metadata WHERE key = ?',
      ['db_version'],
    );
    return result ? parseInt(result.value) : 0;
  } catch (error) {
    console.error('Failed to get database version:', error);
    return 0;
  }
};

export default {
  resetDatabase,
  checkBudgetsTableExists,
  getDatabaseVersion,
};
