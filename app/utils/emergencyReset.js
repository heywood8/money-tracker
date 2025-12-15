/**
 * Emergency Database Reset Utility
 *
 * This provides a nuclear option to delete the database file directly
 * without trying to initialize or connect to it.
 * Use this when the normal reset fails.
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

const DB_NAME = 'penny.db';

/**
 * Forcefully delete the database file
 * This bypasses all migration and initialization logic
 *
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export const forceDeleteDatabase = async () => {
  try {
    console.log('Emergency database deletion initiated...');

    // Construct database file path
    const dbPath = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
    console.log('Database path:', dbPath);

    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (fileInfo.exists) {
      console.log('Database file found, deleting...');
      await FileSystem.deleteAsync(dbPath, { idempotent: true });
      console.log('Database file deleted successfully');
    } else {
      console.log('Database file does not exist');
    }

    // Also try to delete WAL and SHM files if they exist
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    try {
      await FileSystem.deleteAsync(walPath, { idempotent: true });
      console.log('WAL file deleted');
    } catch (e) {
      console.log('No WAL file to delete');
    }

    try {
      await FileSystem.deleteAsync(shmPath, { idempotent: true });
      console.log('SHM file deleted');
    } catch (e) {
      console.log('No SHM file to delete');
    }

    console.log('Emergency database deletion completed');
    return true;
  } catch (error) {
    console.error('Emergency database deletion failed:', error);
    return false;
  }
};

/**
 * Get database file info for debugging
 * @returns {Promise<object>}
 */
export const getDatabaseFileInfo = async () => {
  try {
    const dbPath = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
    const fileInfo = await FileSystem.getInfoAsync(dbPath);

    return {
      path: dbPath,
      exists: fileInfo.exists,
      size: fileInfo.size,
      modificationTime: fileInfo.modificationTime,
    };
  } catch (error) {
    console.error('Failed to get database file info:', error);
    return null;
  }
};

export default {
  forceDeleteDatabase,
  getDatabaseFileInfo,
};
