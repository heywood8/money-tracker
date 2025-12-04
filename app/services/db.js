import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from '../db/schema';

const DB_NAME = 'penny.db';
const DB_VERSION = 9;

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
 * Migrate to V5 - Add is_shadow field to categories
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
 * Migrate from V6 to V7 - Add budgets table and multi-currency transfer support
 */
const migrateToV7 = async (db) => {
  try {
    console.log('Starting migration to V7: Add budgets table...');

    // Create budgets table
    await db.execAsync(`
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

      -- Create indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_type);
      CREATE INDEX IF NOT EXISTS idx_budgets_dates ON budgets(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_budgets_currency ON budgets(currency);
      CREATE INDEX IF NOT EXISTS idx_budgets_recurring ON budgets(is_recurring);
    `);

    console.log('Starting migration to V7: Add multi-currency transfer support...');

    // Check if operations table exists first
    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='operations'"
    );

    if (tables.length === 0) {
      console.log('Operations table does not exist yet, skipping column additions...');
      console.log('Migration to V7 completed successfully');
      return;
    }

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
 * Migrate from V7 to V8 - Add hidden field to accounts
 */
const migrateToV8 = async (db) => {
  try {
    console.log('Starting migration to V8: Add hidden field to accounts...');

    // Check if hidden column already exists
    const tableInfo = await db.getAllAsync('PRAGMA table_info(accounts)');
    const hasHiddenColumn = tableInfo.some(col => col.name === 'hidden');

    if (hasHiddenColumn) {
      console.log('Hidden column already exists, skipping migration...');
      return;
    }

    // Add hidden column to accounts table (defaults to 0/false)
    await db.execAsync(`
      ALTER TABLE accounts ADD COLUMN hidden INTEGER DEFAULT 0;
    `);

    // Create index on hidden for efficient filtering
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_accounts_hidden ON accounts(hidden);
    `);

    console.log('Migration to V8 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V8:', error);
    throw error;
  }
};

/**
 * Migrate from V8 to V9 - Add exclude_from_forecast field to categories
 */
const migrateToV9 = async (db) => {
  try {
    console.log('Starting migration to V9: Add exclude_from_forecast field to categories...');

    // Check if exclude_from_forecast column already exists
    const tableInfo = await db.getAllAsync('PRAGMA table_info(categories)');
    const hasExcludeFromForecastColumn = tableInfo.some(col => col.name === 'exclude_from_forecast');

    if (hasExcludeFromForecastColumn) {
      console.log('exclude_from_forecast column already exists, skipping migration...');
      return;
    }

    // Add exclude_from_forecast column to categories table (defaults to 0/false)
    await db.execAsync(`
      ALTER TABLE categories ADD COLUMN exclude_from_forecast INTEGER DEFAULT 0;
    `);

    // Create index on exclude_from_forecast for efficient filtering
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_categories_exclude_from_forecast ON categories(exclude_from_forecast);
    `);

    console.log('Migration to V9 completed successfully');
  } catch (error) {
    console.error('Failed to migrate to V9:', error);
    throw error;
  }
};

/**
 * Initialize database schema
 */
const initializeDatabase = async (rawDb) => {
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

        // Run migrations
        if (currentVersion > 0 && currentVersion < 2) {
          console.log('Migrating database from version', currentVersion, 'to version 2...');
          await migrateToV2(rawDb);
        }
        if (currentVersion >= 2 && currentVersion < 3) {
          console.log('Migrating database from version', currentVersion, 'to version 3...');
          await migrateToV3(rawDb);
        }
        if (currentVersion >= 3 && currentVersion < 4) {
          console.log('Migrating database from version', currentVersion, 'to version 4...');
          await migrateToV4(rawDb);
        }
        if (currentVersion >= 4 && currentVersion < 5) {
          console.log('Migrating database from version', currentVersion, 'to version 5...');
          await migrateToV5(rawDb);
        }
        if (currentVersion >= 5 && currentVersion < 6) {
          console.log('Migrating database from version', currentVersion, 'to version 6...');
          await migrateToV6(rawDb);
        }
        if (currentVersion >= 6 && currentVersion < 7) {
          console.log('Migrating database from version', currentVersion, 'to version 7...');
          await migrateToV7(rawDb);
        }
        if (currentVersion >= 7 && currentVersion < 8) {
          console.log('Migrating database from version', currentVersion, 'to version 8...');
          await migrateToV8(rawDb);
        }
        if (currentVersion >= 8 && currentVersion < 9) {
          console.log('Migrating database from version', currentVersion, 'to version 9...');
          await migrateToV9(rawDb);
        }

        // Force-check for V7 columns (safety net for migration issues)
        console.log('Verifying V7 schema...');
        const tables = await rawDb.getAllAsync(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='operations'"
        );

        if (tables.length > 0) {
          const tableInfo = await rawDb.getAllAsync('PRAGMA table_info(operations)');
          const hasExchangeRate = tableInfo.some(col => col.name === 'exchange_rate');

          if (!hasExchangeRate) {
            console.log('V7 columns missing! Force-running V7 migration...');
            await migrateToV7(rawDb);
          }
        } else {
          console.log('Operations table does not exist yet, skipping V7 verification...');
        }

        // Force-check for V9 columns (safety net for migration issues)
        console.log('Verifying V9 schema...');
        const categoriesTables = await rawDb.getAllAsync(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='categories'"
        );

        if (categoriesTables.length > 0) {
          const categoriesTableInfo = await rawDb.getAllAsync('PRAGMA table_info(categories)');
          const hasExcludeFromForecast = categoriesTableInfo.some(col => col.name === 'exclude_from_forecast');

          if (!hasExcludeFromForecast) {
            console.log('V9 columns missing! Force-running V9 migration...');
            await migrateToV9(rawDb);
          }
        } else {
          console.log('Categories table does not exist yet, skipping V9 verification...');
        }

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
      exclude_from_forecast INTEGER DEFAULT 0,
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
    CREATE INDEX IF NOT EXISTS idx_categories_exclude_from_forecast ON categories(exclude_from_forecast);
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
    console.log('Closing database connection...');
    try {
      await dbInstance.closeAsync();
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
