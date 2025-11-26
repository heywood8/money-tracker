/**
 * IndexedDB backup and restore service (Web platform)
 */
import { idb, getDatabase } from './db.web';

const BACKUP_VERSION = 1;

/**
 * Create a backup of the entire database
 * @returns {Promise<Object>} Backup data object
 */
export const createBackup = async () => {
  try {
    console.log('Creating database backup...');

    // Fetch all data from all object stores
    const [accounts, categories, operations, appMetadata] = await Promise.all([
      idb.getAll('accounts'),
      idb.getAll('categories'),
      idb.getAll('operations'),
      idb.getAll('app_metadata'),
    ]);

    // Create backup object
    const backup = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      platform: 'web',
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
 * @returns {Promise<string>} Filename
 */
export const exportBackup = async () => {
  try {
    const backup = await createBackup();

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `money_tracker_backup_${timestamp}.json`;

    // Create blob and download
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('Backup file downloaded:', filename);

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

    const db = await getDatabase();

    // Clear existing data (in reverse order due to relationships)
    await clearObjectStore(db, 'operations');
    await clearObjectStore(db, 'categories');
    await clearObjectStore(db, 'accounts');
    await clearAppMetadata(db);

    console.log('Existing data cleared');

    // Restore data
    await restoreObjectStore(db, 'accounts', backup.data.accounts);
    console.log(`Restored ${backup.data.accounts.length} accounts`);

    await restoreObjectStore(db, 'categories', backup.data.categories);
    console.log(`Restored ${backup.data.categories.length} categories`);

    await restoreObjectStore(db, 'operations', backup.data.operations);
    console.log(`Restored ${backup.data.operations.length} operations`);

    // Restore app metadata (except db_version)
    if (backup.data.app_metadata) {
      await restoreAppMetadata(db, backup.data.app_metadata);
      console.log(`Restored ${backup.data.app_metadata.length} metadata entries`);
    }

    // Post-restore upgrades: Ensure shadow categories exist
    console.log('Performing post-restore database upgrades...');
    await ensureShadowCategoriesExist(db);
    console.log('Post-restore upgrades completed');

    console.log('Database restored successfully');
  } catch (error) {
    console.error('Failed to restore backup:', error);
    throw error;
  }
};

/**
 * Clear an object store
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @returns {Promise<void>}
 */
const clearObjectStore = (db, storeName) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear app metadata except db_version
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
const clearAppMetadata = (db) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['app_metadata'], 'readwrite');
    const store = transaction.objectStore('app_metadata');

    // Get all keys
    const getAllRequest = store.getAllKeys();
    getAllRequest.onsuccess = () => {
      const keys = getAllRequest.result;

      // Delete all except db_version
      const deletePromises = keys
        .filter((key) => key !== 'db_version')
        .map(
          (key) =>
            new Promise((res, rej) => {
              const deleteRequest = store.delete(key);
              deleteRequest.onsuccess = () => res();
              deleteRequest.onerror = () => rej(deleteRequest.error);
            })
        );

      Promise.all(deletePromises).then(resolve).catch(reject);
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
};

/**
 * Restore data to an object store
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {Array} data
 * @returns {Promise<void>}
 */
const restoreObjectStore = (db, storeName, data) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    let completed = 0;
    const total = data.length;

    if (total === 0) {
      resolve();
      return;
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    // Add all items, ensuring proper field defaults for categories
    for (const item of data) {
      if (storeName === 'categories' && item.is_shadow === undefined) {
        // Add is_shadow field to categories from old backups
        store.put({ ...item, is_shadow: 0 });
      } else {
        store.put(item);
      }
    }
  });
};

/**
 * Restore app metadata
 * @param {IDBDatabase} db
 * @param {Array} metadata
 * @returns {Promise<void>}
 */
const restoreAppMetadata = (db, metadata) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['app_metadata'], 'readwrite');
    const store = transaction.objectStore('app_metadata');

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    // Add all items except db_version
    for (const item of metadata) {
      if (item.key !== 'db_version') {
        store.put(item);
      }
    }
  });
};

/**
 * Ensure shadow categories exist in the database
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
const ensureShadowCategoriesExist = (db) => {
  return new Promise(async (resolve, reject) => {
    try {
      const transaction = db.transaction(['categories'], 'readwrite');
      const store = transaction.objectStore('categories');

      // Get all categories
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => {
        const categories = getAllRequest.result;

        // Check if shadow categories exist
        const hasShadowExpense = categories.some(cat => cat.id === 'shadow-adjustment-expense');
        const hasShadowIncome = categories.some(cat => cat.id === 'shadow-adjustment-income');

        if (!hasShadowExpense || !hasShadowIncome) {
          console.log('Adding missing shadow categories...');
          const now = new Date().toISOString();

          // Add shadow adjustment expense category if missing
          if (!hasShadowExpense) {
            store.put({
              id: 'shadow-adjustment-expense',
              name: 'Balance Adjustment (Expense)',
              type: 'entry',
              category_type: 'expense',
              parent_id: null,
              icon: 'cash-minus',
              color: null,
              is_shadow: 1,
              created_at: now,
              updated_at: now,
            });
            console.log('Shadow expense category added');
          }

          // Add shadow adjustment income category if missing
          if (!hasShadowIncome) {
            store.put({
              id: 'shadow-adjustment-income',
              name: 'Balance Adjustment (Income)',
              type: 'entry',
              category_type: 'income',
              parent_id: null,
              icon: 'cash-plus',
              color: null,
              is_shadow: 1,
              created_at: now,
              updated_at: now,
            });
            console.log('Shadow income category added');
          }

          console.log('Shadow categories added successfully');
        } else {
          console.log('Shadow categories already exist in backup');
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Import backup from a JSON file
 * @returns {Promise<Object>} Backup object
 */
export const importBackup = async () => {
  return new Promise((resolve, reject) => {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';

    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        console.log('Reading backup file:', file.name);

        // Read file
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const content = event.target.result;

            // Parse JSON
            let backup;
            try {
              backup = JSON.parse(content);
            } catch (error) {
              reject(new Error('Invalid backup file: not valid JSON'));
              return;
            }

            // Restore from backup
            await restoreBackup(backup);

            resolve(backup);
          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      } catch (error) {
        reject(error);
      }
    };

    input.oncancel = () => {
      reject(new Error('Import cancelled'));
    };

    // Trigger file picker
    input.click();
  });
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
