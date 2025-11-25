/**
 * SQLite backup and restore service (Native platforms: iOS/Android)
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { queryAll, executeQuery, executeTransaction } from './db';

const BACKUP_VERSION = 1;

/**
 * Create a backup of the entire database
 * @returns {Promise<Object>} Backup data object
 */
export const createBackup = async () => {
  try {
    console.log('Creating database backup...');

    // Fetch all data from all tables
    const [accounts, categories, operations, appMetadata] = await Promise.all([
      queryAll('SELECT * FROM accounts ORDER BY created_at ASC'),
      queryAll('SELECT * FROM categories ORDER BY created_at ASC'),
      queryAll('SELECT * FROM operations ORDER BY created_at ASC'),
      queryAll('SELECT * FROM app_metadata'),
    ]);

    // Create backup object
    const backup = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      platform: 'native',
      data: {
        accounts: accounts || [],
        categories: categories || [],
        operations: operations || [],
        app_metadata: appMetadata || [],
      },
    };

    console.log('Backup created successfully:', {
      accounts: backup.data.accounts.length,
      categories: backup.data.categories.length,
      operations: backup.data.operations.length,
    });

    return backup;
  } catch (error) {
    console.error('Failed to create backup:', error);
    throw error;
  }
};

/**
 * Export backup to a JSON file
 * @returns {Promise<void>}
 */
export const exportBackup = async () => {
  try {
    const backup = await createBackup();

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `money_tracker_backup_${timestamp}.json`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    // Write backup to file
    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

    console.log('Backup file created:', fileUri);

    // Share the file
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Database Backup',
        UTI: 'public.json',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }

    return filename;
  } catch (error) {
    console.error('Failed to export backup:', error);
    throw error;
  }
};

/**
 * Validate backup data structure
 * @param {Object} backup - Backup object to validate
 * @returns {boolean} True if valid, throws error if invalid
 */
const validateBackup = (backup) => {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup format: not an object');
  }

  if (!backup.version) {
    throw new Error('Invalid backup format: missing version');
  }

  if (backup.version > BACKUP_VERSION) {
    throw new Error(
      `Backup version ${backup.version} is not supported by this app version (max: ${BACKUP_VERSION})`
    );
  }

  if (!backup.data || typeof backup.data !== 'object') {
    throw new Error('Invalid backup format: missing or invalid data');
  }

  // Check required tables
  const requiredTables = ['accounts', 'categories', 'operations'];
  for (const table of requiredTables) {
    if (!Array.isArray(backup.data[table])) {
      throw new Error(`Invalid backup format: missing or invalid ${table} data`);
    }
  }

  return true;
};

/**
 * Restore database from backup data
 * @param {Object} backup - Backup object
 * @returns {Promise<void>}
 */
export const restoreBackup = async (backup) => {
  try {
    console.log('Restoring database from backup...');

    // Validate backup
    validateBackup(backup);

    await executeTransaction(async (db) => {
      // Clear existing data (in reverse order due to foreign keys)
      await db.runAsync('DELETE FROM operations');
      await db.runAsync('DELETE FROM categories');
      await db.runAsync('DELETE FROM accounts');
      await db.runAsync('DELETE FROM app_metadata WHERE key != ?', ['db_version']);

      console.log('Existing data cleared');

      // Restore accounts
      for (const account of backup.data.accounts) {
        await db.runAsync(
          'INSERT INTO accounts (id, name, balance, currency, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            account.id,
            account.name,
            account.balance || '0',
            account.currency || 'USD',
            account.display_order ?? null,
            account.created_at,
            account.updated_at,
          ]
        );
      }
      console.log(`Restored ${backup.data.accounts.length} accounts`);

      // Restore categories
      for (const category of backup.data.categories) {
        await db.runAsync(
          'INSERT INTO categories (id, name, type, category_type, parent_id, icon, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            category.id,
            category.name,
            category.type || 'folder',
            category.category_type || 'expense',
            category.parent_id || null,
            category.icon || null,
            category.color || null,
            category.created_at,
            category.updated_at,
          ]
        );
      }
      console.log(`Restored ${backup.data.categories.length} categories`);

      // Restore operations
      for (const operation of backup.data.operations) {
        await db.runAsync(
          'INSERT INTO operations (id, type, amount, account_id, category_id, to_account_id, date, created_at, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            operation.id,
            operation.type,
            operation.amount,
            operation.account_id,
            operation.category_id || null,
            operation.to_account_id || null,
            operation.date,
            operation.created_at,
            operation.description || null,
          ]
        );
      }
      console.log(`Restored ${backup.data.operations.length} operations`);

      // Restore app metadata (except db_version)
      if (backup.data.app_metadata) {
        for (const meta of backup.data.app_metadata) {
          if (meta.key !== 'db_version') {
            await db.runAsync(
              'INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
              [meta.key, meta.value, meta.updated_at]
            );
          }
        }
        console.log(`Restored ${backup.data.app_metadata.length} metadata entries`);
      }
    });

    console.log('Database restored successfully');
  } catch (error) {
    console.error('Failed to restore backup:', error);
    throw error;
  }
};

/**
 * Import backup from a JSON file
 * @returns {Promise<void>}
 */
export const importBackup = async () => {
  try {
    // Pick a document
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      throw new Error('Import cancelled');
    }

    const fileUri = result.assets[0].uri;
    console.log('Reading backup file:', fileUri);

    // Read file contents
    const fileContent = await FileSystem.readAsStringAsync(fileUri);

    // Parse JSON
    let backup;
    try {
      backup = JSON.parse(fileContent);
    } catch (error) {
      throw new Error('Invalid backup file: not valid JSON');
    }

    // Restore from backup
    await restoreBackup(backup);

    return backup;
  } catch (error) {
    console.error('Failed to import backup:', error);
    throw error;
  }
};

/**
 * Get backup info from a backup object
 * @param {Object} backup - Backup object
 * @returns {Object} Backup information
 */
export const getBackupInfo = (backup) => {
  try {
    validateBackup(backup);

    return {
      version: backup.version,
      timestamp: backup.timestamp,
      platform: backup.platform || 'unknown',
      accountsCount: backup.data.accounts?.length || 0,
      categoriesCount: backup.data.categories?.length || 0,
      operationsCount: backup.data.operations?.length || 0,
    };
  } catch (error) {
    return null;
  }
};
