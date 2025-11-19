/**
 * Web-specific database implementation using IndexedDB
 * This file is automatically used on web platform instead of db.js
 */

const DB_NAME = 'money_tracker';
const DB_VERSION = 3;

let dbInstance = null;

/**
 * Open IndexedDB database
 */
const openIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const transaction = event.target.transaction;

      // Create accounts store
      if (!db.objectStoreNames.contains('accounts')) {
        const accountsStore = db.createObjectStore('accounts', { keyPath: 'id' });
        accountsStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Create or upgrade categories store
      if (!db.objectStoreNames.contains('categories')) {
        const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
        categoriesStore.createIndex('parent_id', 'parent_id', { unique: false });
        categoriesStore.createIndex('type', 'type', { unique: false });
        categoriesStore.createIndex('category_type', 'category_type', { unique: false });
      } else {
        // V2 -> V3 migration: add category_type index if it doesn't exist
        const categoriesStore = transaction.objectStore('categories');
        if (!categoriesStore.indexNames.contains('category_type')) {
          categoriesStore.createIndex('category_type', 'category_type', { unique: false });
        }

        // Migrate existing data
        if (event.oldVersion < 3) {
          console.log('Migrating categories to V3 structure...');
          const getAllRequest = categoriesStore.getAll();
          getAllRequest.onsuccess = () => {
            const categories = getAllRequest.result;
            categories.forEach(cat => {
              // Add category_type if missing
              if (!cat.category_type) {
                let categoryType = cat.categoryType || 'expense';

                if (cat.type === 'expense' || cat.type === 'income') {
                  categoryType = cat.type;
                }

                if (cat.id === 'expense-root' || cat.name === 'Expenses') {
                  categoryType = 'expense';
                } else if (cat.id === 'income-root' || cat.name === 'Income') {
                  categoryType = 'income';
                } else if (cat.parent_id) {
                  const parent = categories.find(c => c.id === cat.parent_id);
                  if (parent) {
                    if (parent.type === 'expense' || parent.categoryType === 'expense' || parent.id === 'expense-root') {
                      categoryType = 'expense';
                    } else if (parent.type === 'income' || parent.categoryType === 'income' || parent.id === 'income-root') {
                      categoryType = 'income';
                    }
                  }
                }

                // Update the category
                categoriesStore.put({
                  ...cat,
                  type: 'folder',
                  category_type: categoryType
                });
              }
            });
          };
        }
      }

      // Create or upgrade operations store
      if (!db.objectStoreNames.contains('operations')) {
        const operationsStore = db.createObjectStore('operations', { keyPath: 'id' });
        operationsStore.createIndex('date', 'date', { unique: false });
        operationsStore.createIndex('account_id', 'account_id', { unique: false });
        operationsStore.createIndex('category_id', 'category_id', { unique: false });
        operationsStore.createIndex('type', 'type', { unique: false });
        operationsStore.createIndex('to_account_id', 'to_account_id', { unique: false });
      } else {
        // Store exists, check if we need to add the to_account_id index (v1 -> v2 migration)
        const operationsStore = transaction.objectStore('operations');
        if (!operationsStore.indexNames.contains('to_account_id')) {
          operationsStore.createIndex('to_account_id', 'to_account_id', { unique: false });
        }
      }

      // Create app_metadata store
      if (!db.objectStoreNames.contains('app_metadata')) {
        db.createObjectStore('app_metadata', { keyPath: 'key' });
      }
    };
  });
};

/**
 * Get or create the database instance
 */
export const getDatabase = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await openIndexedDB();
    console.log('IndexedDB initialized successfully');
    return dbInstance;
  } catch (error) {
    console.error('Failed to open IndexedDB:', error);
    throw error;
  }
};

/**
 * Execute a transaction helper
 */
const executeInTransaction = (storeName, mode, callback) => {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDatabase();
      const transaction = db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      callback(store, resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Execute a query (INSERT, UPDATE, DELETE)
 */
export const executeQuery = async (sql, params = []) => {
  // This is a compatibility layer - we'll handle specific operations in the DB modules
  console.warn('executeQuery called on web - this should use specific IndexedDB operations');
  return { changes: 0 };
};

/**
 * Query all records from a store
 */
export const queryAll = async (sql, params = []) => {
  // Parse SQL to determine store and operation
  const match = sql.match(/FROM (\w+)/i);
  if (!match) {
    throw new Error('Invalid SQL query for web');
  }

  const storeName = match[1];

  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDatabase();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result;

        // Apply ordering if specified in SQL
        if (sql.includes('ORDER BY created_at DESC')) {
          results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (sql.includes('ORDER BY date DESC')) {
          results.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        // Apply WHERE clause if params provided
        if (params.length > 0 && sql.includes('WHERE id = ?')) {
          results = results.filter(item => item.id === params[0]);
        }

        resolve(results);
      };

      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Query first record from a store
 */
export const queryFirst = async (sql, params = []) => {
  const results = await queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
};

/**
 * Execute transaction
 */
export const executeTransaction = async (callback) => {
  const db = await getDatabase();

  // Create a mock db object with the required methods
  const mockDb = {
    getFirstAsync: async (sql, params) => {
      return queryFirst(sql, params);
    },
    runAsync: async (sql, params) => {
      return executeQuery(sql, params);
    },
    getAllAsync: async (sql, params) => {
      return queryAll(sql, params);
    }
  };

  // Execute callback with mock db
  return await callback(mockDb);
};

/**
 * Close database
 */
export const closeDatabase = async () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};

/**
 * Drop all tables (for testing)
 */
export const dropAllTables = async () => {
  await closeDatabase();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// IndexedDB-specific helper functions for direct access
export const idb = {
  async put(storeName, data) {
    return executeInTransaction(storeName, 'readwrite', (store, resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get(storeName, id) {
    return new Promise(async (resolve, reject) => {
      const db = await getDatabase();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, id) {
    return executeInTransaction(storeName, 'readwrite', (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAll(storeName) {
    return new Promise(async (resolve, reject) => {
      const db = await getDatabase();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllByIndex(storeName, indexName, value) {
    return new Promise(async (resolve, reject) => {
      const db = await getDatabase();
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Execute multiple operations in a single atomic transaction
   * @param {string} storeName - The object store name
   * @param {Function} operations - Async function that receives the store
   * @returns {Promise<any>}
   */
  async transaction(storeName, operations) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await getDatabase();
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));

        // Execute operations with store access
        result = await operations(store);
      } catch (error) {
        reject(error);
      }
    });
  }
};
