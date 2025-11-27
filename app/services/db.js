import * as SQLite from 'expo-sqlite';

const DB_NAME = 'penny.db';
const DB_VERSION = 7;

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
 * Migrate from V4 to V5 - Add is_shadow field to categories for shadow categories
 */
const migrateToV5 = async (db) => {
  try {
    console.log('Starting migration to V5: Add is_shadow field to categories...');

    // Step 1: Check if is_shadow column already exists
    const tableInfo = await db.getAllAsync('PRAGMA table_info(categories)');
    const hasIsShadowColumn = tableInfo.some(col => col.name === 'is_shadow');

    if (!hasIsShadowColumn) {
      console.log('Adding is_shadow column...');
      // Add is_shadow column to categories table (defaults to 0/false)
      await db.execAsync(`
        ALTER TABLE categories ADD COLUMN is_shadow INTEGER DEFAULT 0;
      `);

      // Create index on is_shadow for efficient filtering
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_categories_is_shadow ON categories(is_shadow);
      `);
      console.log('is_shadow column added successfully');
    } else {
      console.log('is_shadow column already exists');
    }

    // Step 2: Check if shadow categories exist (do this regardless of column existence)
    const shadowCategories = await db.getAllAsync(
      'SELECT id FROM categories WHERE id IN (?, ?)',
      ['shadow-adjustment-expense', 'shadow-adjustment-income']
    );

    if (shadowCategories.length < 2) {
      console.log('Adding missing shadow categories...');
      const now = new Date().toISOString();

      const hasShadowExpense = shadowCategories.some(cat => cat.id === 'shadow-adjustment-expense');
      const hasShadowIncome = shadowCategories.some(cat => cat.id === 'shadow-adjustment-income');

      // Add shadow adjustment expense category if missing
      if (!hasShadowExpense) {
        await db.runAsync(
          'INSERT OR IGNORE INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            'shadow-adjustment-expense',
            'Balance Adjustment (Expense)',
            'entry',
            'expense',
            null,
            'cash-minus',
            null,
            1,
            now,
            now,
          ]
        );
        console.log('Shadow expense category added');
      }

      // Add shadow adjustment income category if missing
      if (!hasShadowIncome) {
        await db.runAsync(
          'INSERT OR IGNORE INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            'shadow-adjustment-income',
            'Balance Adjustment (Income)',
            'entry',
            'income',
            null,
            'cash-plus',
            null,
            1,
            now,
            now,
          ]
        );
        console.log('Shadow income category added');
      }

      console.log('Shadow categories added successfully');
    } else {
      console.log('Shadow categories already exist');
    }

    console.log('Migration to V5 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V5:', error);
    throw error;
  }
};

/**
 * Migrate from V5 to V6 - Ensure shadow categories exist
 */
const migrateToV6 = async (db) => {
  try {
    console.log('Starting migration to V6: Ensure shadow categories exist...');

    // Check if shadow categories exist
    const shadowCategories = await db.getAllAsync(
      'SELECT id FROM categories WHERE id IN (?, ?)',
      ['shadow-adjustment-expense', 'shadow-adjustment-income']
    );

    if (shadowCategories.length < 2) {
      console.log('Adding missing shadow categories...');
      const now = new Date().toISOString();

      const hasShadowExpense = shadowCategories.some(cat => cat.id === 'shadow-adjustment-expense');
      const hasShadowIncome = shadowCategories.some(cat => cat.id === 'shadow-adjustment-income');

      // Add shadow adjustment expense category if missing
      if (!hasShadowExpense) {
        await db.runAsync(
          'INSERT OR IGNORE INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            'shadow-adjustment-expense',
            'Balance Adjustment (Expense)',
            'entry',
            'expense',
            null,
            'cash-minus',
            null,
            1,
            now,
            now,
          ]
        );
        console.log('Shadow expense category added');
      }

      // Add shadow adjustment income category if missing
      if (!hasShadowIncome) {
        await db.runAsync(
          'INSERT OR IGNORE INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            'shadow-adjustment-income',
            'Balance Adjustment (Income)',
            'entry',
            'income',
            null,
            'cash-plus',
            null,
            1,
            now,
            now,
          ]
        );
        console.log('Shadow income category added');
      }

      console.log('Shadow categories added successfully');
    } else {
      console.log('Shadow categories already exist');
    }

    console.log('Migration to V6 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V6:', error);
    throw error;
  }
};

/**
 * Migrate from V6 to V7 - Add multi-currency transfer support
 */
const migrateToV7 = async (db) => {
  try {
    console.log('Starting migration to V7: Add multi-currency transfer support...');

    // Check if columns already exist
    const tableInfo = await db.getAllAsync('PRAGMA table_info(operations)');
    const hasExchangeRate = tableInfo.some(col => col.name === 'exchange_rate');
    const hasDestinationAmount = tableInfo.some(col => col.name === 'destination_amount');
    const hasSourceCurrency = tableInfo.some(col => col.name === 'source_currency');
    const hasDestinationCurrency = tableInfo.some(col => col.name === 'destination_currency');

    if (hasExchangeRate && hasDestinationAmount && hasSourceCurrency && hasDestinationCurrency) {
      console.log('Multi-currency columns already exist, skipping migration...');
      return;
    }

    // Add new columns for multi-currency transfers
    if (!hasExchangeRate) {
      console.log('Adding exchange_rate column...');
      await db.execAsync(`
        ALTER TABLE operations ADD COLUMN exchange_rate TEXT;
      `);
    }

    if (!hasDestinationAmount) {
      console.log('Adding destination_amount column...');
      await db.execAsync(`
        ALTER TABLE operations ADD COLUMN destination_amount TEXT;
      `);
    }

    if (!hasSourceCurrency) {
      console.log('Adding source_currency column...');
      await db.execAsync(`
        ALTER TABLE operations ADD COLUMN source_currency TEXT;
      `);
    }

    if (!hasDestinationCurrency) {
      console.log('Adding destination_currency column...');
      await db.execAsync(`
        ALTER TABLE operations ADD COLUMN destination_currency TEXT;
      `);
    }

    console.log('Migration to V7 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V7:', error);
    throw error;
  }
};

/**
 * Migrate from V3 to V4 - Add order field to accounts
 */
const migrateToV4 = async (db) => {
  try {
    console.log('Starting migration to V4: Add order field to accounts...');

    // Check if order column already exists
    const tableInfo = await db.getAllAsync('PRAGMA table_info(accounts)');
    const hasOrderColumn = tableInfo.some(col => col.name === 'display_order');

    if (hasOrderColumn) {
      console.log('Order column already exists, skipping migration...');
      return;
    }

    // Add order column to accounts table
    await db.execAsync(`
      ALTER TABLE accounts ADD COLUMN display_order INTEGER;
    `);

    // Set initial order based on created_at (oldest first)
    const accounts = await db.getAllAsync(
      'SELECT id FROM accounts ORDER BY created_at ASC'
    );

    for (let i = 0; i < accounts.length; i++) {
      await db.runAsync(
        'UPDATE accounts SET display_order = ? WHERE id = ?',
        [i, accounts[i].id]
      );
    }

    // Create index on display_order for efficient sorting
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_accounts_order ON accounts(display_order);
    `);

    console.log('Migration to V4 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V4:', error);
    throw error;
  }
};

/**
 * Migrate from V2 to V3 - Allow 'entry' type categories
 */
const migrateToV3 = async (db) => {
  try {
    console.log('Starting migration to V3: Allow entry type categories...');

    // Create new categories table with updated schema
    await db.execAsync(`
      -- Create temporary table with updated schema
      CREATE TABLE categories_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('folder', 'entry')),
        category_type TEXT NOT NULL CHECK(category_type IN ('expense', 'income')),
        parent_id TEXT,
        icon TEXT,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES categories_new(id) ON DELETE CASCADE
      );
    `);

    // Get all existing categories
    const existingCategories = await db.getAllAsync('SELECT * FROM categories');

    // Determine which categories should be 'entry' (leaf categories without children)
    const categoryIdsWithChildren = new Set(
      existingCategories
        .filter(cat => cat.parent_id !== null)
        .map(cat => cat.parent_id)
    );

    // Copy data to new table, updating type for leaf categories
    for (const cat of existingCategories) {
      const isLeaf = !categoryIdsWithChildren.has(cat.id);
      const newType = isLeaf ? 'entry' : 'folder';

      await db.runAsync(
        `INSERT INTO categories_new (id, name, type, category_type, parent_id, icon, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          cat.name,
          newType,
          cat.category_type,
          cat.parent_id,
          cat.icon,
          cat.color,
          cat.created_at,
          cat.updated_at
        ]
      );
    }

    // Drop old table and rename new one
    await db.execAsync(`
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
      CREATE INDEX IF NOT EXISTS idx_categories_category_type ON categories(category_type);
    `);

    console.log('Migration to V3 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V3:', error);
    throw error;
  }
};

/**
 * Migrate from V1 to V2 - Refactor category structure
 */
const migrateToV2 = async (db) => {
  try {
    // Check if categories table exists and has the old structure
    const tableInfo = await db.getAllAsync('PRAGMA table_info(categories)');
    const hasCategoryTypeColumn = tableInfo.some(col => col.name === 'category_type');

    if (hasCategoryTypeColumn) {
      console.log('Migration already applied, skipping...');
      return;
    }

    console.log('Starting category structure migration...');

    // Get all existing categories
    const existingCategories = await db.getAllAsync('SELECT * FROM categories');

    if (existingCategories.length === 0) {
      console.log('No categories to migrate');
      return;
    }

    // Create new categories table with updated schema
    await db.execAsync(`
      -- Create temporary table with new schema
      CREATE TABLE categories_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('folder', 'entry')),
        category_type TEXT NOT NULL CHECK(category_type IN ('expense', 'income')),
        parent_id TEXT,
        icon TEXT,
        color TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES categories_new(id) ON DELETE CASCADE
      );
    `);

    // Build a map to determine category_type for each category
    const categoryTypeMap = new Map();

    // First pass: determine category_type from old type or ID/name
    for (const cat of existingCategories) {
      let categoryType = 'expense'; // default

      // If old type was 'expense' or 'income', use that as category_type
      if (cat.type === 'expense' || cat.type === 'income') {
        categoryType = cat.type;
      }
      // Check for root folders by ID or name
      else if (cat.id === 'expense-root' || cat.name === 'Expenses') {
        categoryType = 'expense';
      } else if (cat.id === 'income-root' || cat.name === 'Income') {
        categoryType = 'income';
      }
      // Check if ID starts with expense- or income-
      else if (cat.id && cat.id.startsWith('expense-')) {
        categoryType = 'expense';
      } else if (cat.id && cat.id.startsWith('income-')) {
        categoryType = 'income';
      }

      categoryTypeMap.set(cat.id, categoryType);
    }

    // Second pass: inherit category_type from parent if not determined
    for (const cat of existingCategories) {
      if (cat.parent_id && !categoryTypeMap.has(cat.id)) {
        const parent = existingCategories.find(c => c.id === cat.parent_id);
        if (parent && categoryTypeMap.has(parent.id)) {
          categoryTypeMap.set(cat.id, categoryTypeMap.get(parent.id));
        }
      }
    }

    // Third pass: insert into new table
    for (const cat of existingCategories) {
      const categoryType = categoryTypeMap.get(cat.id) || 'expense';

      await db.runAsync(
        `INSERT INTO categories_new (id, name, type, category_type, parent_id, icon, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          cat.name,
          'folder', // All items are now folders
          categoryType,
          cat.parent_id,
          cat.icon,
          cat.color,
          cat.created_at,
          cat.updated_at
        ]
      );
    }

    // Drop old table and rename new one
    await db.execAsync(`
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;

      -- Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
      CREATE INDEX IF NOT EXISTS idx_categories_category_type ON categories(category_type);
    `);

    console.log('Category structure migration completed successfully');
  } catch (error) {
    console.error('Failed to migrate categories:', error);
    throw error;
  }
};

/**
 * Initialize database schema
 */
const initializeDatabase = async (db) => {
  try {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      -- App metadata table (create first to track version)
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Check database version before creating other tables
    const versionResult = await db.getFirstAsync(
      'SELECT value FROM app_metadata WHERE key = ?',
      ['db_version']
    );

    const currentVersion = versionResult ? parseInt(versionResult.value) : 0;
    const isNewDatabase = currentVersion === 0;
    let didMigrate = false;

    // Run migrations BEFORE creating tables
    if (currentVersion > 0 && currentVersion < 2) {
      console.log('Migrating database from version', currentVersion, 'to version 2...');
      await migrateToV2(db);
      didMigrate = true;
    }
    if (currentVersion >= 2 && currentVersion < 3) {
      console.log('Migrating database from version', currentVersion, 'to version 3...');
      await migrateToV3(db);
      didMigrate = true;
    }
    if (currentVersion >= 3 && currentVersion < 4) {
      console.log('Migrating database from version', currentVersion, 'to version 4...');
      await migrateToV4(db);
      didMigrate = true;
    }
    if (currentVersion >= 4 && currentVersion < 5) {
      console.log('Migrating database from version', currentVersion, 'to version 5...');
      await migrateToV5(db);
      didMigrate = true;
    }
    if (currentVersion >= 5 && currentVersion < 6) {
      console.log('Migrating database from version', currentVersion, 'to version 6...');
      await migrateToV6(db);
      didMigrate = true;
    }
    if (currentVersion >= 6 && currentVersion < 7) {
      console.log('Migrating database from version', currentVersion, 'to version 7...');
      await migrateToV7(db);
      didMigrate = true;
    }

    // Now create or update tables
    await db.execAsync(`
      -- Accounts table
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        balance TEXT NOT NULL DEFAULT '0',
        currency TEXT NOT NULL DEFAULT 'USD',
        display_order INTEGER,
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
    `);

    // Update version
    if (!versionResult) {
      await db.runAsync(
        'INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['db_version', DB_VERSION.toString(), new Date().toISOString()]
      );
    } else if (currentVersion < DB_VERSION) {
      await db.runAsync(
        'UPDATE app_metadata SET value = ?, updated_at = ? WHERE key = ?',
        [DB_VERSION.toString(), new Date().toISOString(), 'db_version']
      );
    }

    // Log appropriate message based on what happened
    if (isNewDatabase) {
      console.log(`Database created successfully (v${DB_VERSION})`);
    } else if (didMigrate) {
      console.log(`Database migrated successfully (v${currentVersion} → v${DB_VERSION})`);
    }
    // No log for normal opens - database is ready silently
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

  // Close the database connection properly
  await db.closeAsync();

  // Reset both instance and initialization promise
  dbInstance = null;
  initPromise = null;
};
