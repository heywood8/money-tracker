/**
 * UUID to Integer Migration Script
 *
 * Migrates existing databases from UUID-based IDs to auto-incrementing integer IDs
 * while preserving all data and foreign key relationships.
 *
 * Migration Process:
 * 1. Detect if migration is needed (text-based ID columns exist)
 * 2. Backup existing data to temporary tables
 * 3. Create new integer-based tables
 * 4. Migrate data with ID mapping
 * 5. Verify data integrity
 * 6. Cleanup backup tables
 */

import { rawDb } from '../db/client';
import { defaultCategoryIdMap } from '../defaults/defaultCategoryIdMap';

const MIGRATION_FLAG_KEY = 'uuid_to_integer_migration_complete';

/**
 * Check if UUID to integer migration is needed
 * @returns {Promise<boolean>}
 */
export const needsUuidMigration = async () => {
  try {
    // Check if migration flag exists
    const flagCheck = rawDb.getFirstSync(
      'SELECT value FROM app_metadata WHERE key = ?',
      [MIGRATION_FLAG_KEY]
    );

    if (flagCheck && flagCheck.value === 'true') {
      console.log('UUID migration already completed');
      return false;
    }

    // Check if accounts table exists with text ID
    const tableCheck = rawDb.getFirstSync(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'`
    );

    if (!tableCheck) {
      console.log('No existing database found - fresh install');
      return false;
    }

    // Check if ID column is text type (UUID-based)
    const isTextId = tableCheck.sql.includes('id" TEXT');

    if (isTextId) {
      console.log('UUID-based database detected - migration needed');
      return true;
    }

    console.log('Database already using integer IDs');
    return false;
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
};

/**
 * Perform UUID to integer migration
 * @returns {Promise<void>}
 */
export const migrateUuidToInteger = async () => {
  console.log('Starting UUID to Integer migration...');

  try {
    // Begin transaction
    rawDb.execSync('BEGIN TRANSACTION');

    // Step 1: Backup existing data
    console.log('Step 1: Backing up existing data...');
    await backupExistingTables();

    // Step 2: Drop old tables
    console.log('Step 2: Dropping old tables...');
    await dropOldTables();

    // Step 3: Create new integer-based tables
    console.log('Step 3: Creating new tables with integer IDs...');
    await createNewTables();

    // Step 4: Migrate accounts
    console.log('Step 4: Migrating accounts...');
    const accountIdMap = await migrateAccounts();

    // Step 5: Migrate categories
    console.log('Step 5: Migrating categories...');
    const categoryIdMap = await migrateCategories();

    // Step 6: Migrate operations
    console.log('Step 6: Migrating operations...');
    await migrateOperations(accountIdMap, categoryIdMap);

    // Step 7: Migrate budgets
    console.log('Step 7: Migrating budgets...');
    await migrateBudgets(categoryIdMap);

    // Step 8: Verify data integrity
    console.log('Step 8: Verifying data integrity...');
    await verifyDataIntegrity();

    // Step 9: Set user category sequence to start at 1000
    console.log('Step 9: Setting category auto-increment...');
    rawDb.execSync(
      `UPDATE sqlite_sequence SET seq = 1000 WHERE name = 'categories'`
    );

    // Step 10: Mark migration as complete
    console.log('Step 10: Marking migration complete...');
    rawDb.execSync(
      `INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)`,
      [MIGRATION_FLAG_KEY, 'true', new Date().toISOString()]
    );

    // Step 11: Drop backup tables
    console.log('Step 11: Cleaning up backup tables...');
    await dropBackupTables();

    // Commit transaction
    rawDb.execSync('COMMIT');

    console.log('✅ UUID to Integer migration completed successfully!');
  } catch (error) {
    // Rollback on error
    console.error('❌ Migration failed:', error);
    rawDb.execSync('ROLLBACK');

    console.log('Attempting to restore from backup...');
    try {
      await restoreFromBackup();
      console.log('✅ Restored from backup successfully');
    } catch (restoreError) {
      console.error('❌ Failed to restore from backup:', restoreError);
      throw new Error(
        'Migration failed and restore failed. Database may be in inconsistent state. ' +
          'Please restore from app backup or reinstall.'
      );
    }

    throw error;
  }
};

/**
 * Backup existing tables to _old suffix
 */
const backupExistingTables = async () => {
  const tables = ['accounts', 'categories', 'operations', 'budgets'];

  for (const table of tables) {
    rawDb.execSync(`DROP TABLE IF EXISTS ${table}_old`);
    rawDb.execSync(`CREATE TABLE ${table}_old AS SELECT * FROM ${table}`);

    const count = rawDb.getFirstSync(`SELECT COUNT(*) as count FROM ${table}_old`);
    console.log(`  Backed up ${count.count} records from ${table}`);
  }
};

/**
 * Drop old tables
 */
const dropOldTables = async () => {
  const tables = ['budgets', 'operations', 'categories', 'accounts'];

  for (const table of tables) {
    rawDb.execSync(`DROP TABLE IF EXISTS ${table}`);
  }
};

/**
 * Create new tables with integer IDs
 */
const createNewTables = async () => {
  // Enable foreign keys
  rawDb.execSync('PRAGMA foreign_keys = ON');

  // Create accounts table
  rawDb.execSync(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance TEXT NOT NULL DEFAULT '0',
      currency TEXT NOT NULL DEFAULT 'USD',
      display_order INTEGER,
      hidden INTEGER DEFAULT 0,
      monthly_target TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  rawDb.execSync('CREATE INDEX idx_accounts_order ON accounts(display_order)');
  rawDb.execSync('CREATE INDEX idx_accounts_hidden ON accounts(hidden)');

  // Create categories table
  rawDb.execSync(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('folder', 'entry')),
      category_type TEXT NOT NULL CHECK(category_type IN ('expense', 'income')),
      parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      icon TEXT,
      color TEXT,
      is_shadow INTEGER DEFAULT 0,
      exclude_from_forecast INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  rawDb.execSync('CREATE INDEX idx_categories_parent ON categories(parent_id)');
  rawDb.execSync('CREATE INDEX idx_categories_type ON categories(type)');
  rawDb.execSync('CREATE INDEX idx_categories_category_type ON categories(category_type)');
  rawDb.execSync('CREATE INDEX idx_categories_is_shadow ON categories(is_shadow)');
  rawDb.execSync('CREATE INDEX idx_categories_exclude_from_forecast ON categories(exclude_from_forecast)');

  // Create operations table
  rawDb.execSync(`
    CREATE TABLE operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'transfer')),
      amount TEXT NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      to_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      description TEXT,
      exchange_rate TEXT,
      destination_amount TEXT,
      source_currency TEXT,
      destination_currency TEXT
    )
  `);

  rawDb.execSync('CREATE INDEX idx_operations_date ON operations(date)');
  rawDb.execSync('CREATE INDEX idx_operations_account ON operations(account_id)');
  rawDb.execSync('CREATE INDEX idx_operations_category ON operations(category_id)');
  rawDb.execSync('CREATE INDEX idx_operations_type ON operations(type)');

  // Create budgets table
  rawDb.execSync(`
    CREATE TABLE budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly', 'yearly')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_recurring INTEGER DEFAULT 1,
      rollover_enabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  rawDb.execSync('CREATE INDEX idx_budgets_category ON budgets(category_id)');
  rawDb.execSync('CREATE INDEX idx_budgets_period ON budgets(period_type)');
  rawDb.execSync('CREATE INDEX idx_budgets_dates ON budgets(start_date, end_date)');
  rawDb.execSync('CREATE INDEX idx_budgets_currency ON budgets(currency)');
  rawDb.execSync('CREATE INDEX idx_budgets_recurring ON budgets(is_recurring)');
};

/**
 * Migrate accounts from old table to new table
 * @returns {Object} Map of old UUID to new integer ID
 */
const migrateAccounts = async () => {
  const oldAccounts = rawDb.getAllSync('SELECT * FROM accounts_old ORDER BY created_at');

  const idMap = {};
  let newId = 1;

  for (const account of oldAccounts) {
    rawDb.execSync(
      `INSERT INTO accounts (
        id, name, balance, currency, display_order, hidden, monthly_target, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        account.name,
        account.balance,
        account.currency,
        account.display_order,
        account.hidden,
        account.monthly_target,
        account.created_at,
        account.updated_at,
      ]
    );

    idMap[account.id] = newId;
    newId++;
  }

  console.log(`  Migrated ${oldAccounts.length} accounts`);
  return idMap;
};

/**
 * Migrate categories from old table to new table
 * @returns {Object} Map of old UUID to new integer ID
 */
const migrateCategories = async () => {
  const oldCategories = rawDb.getAllSync('SELECT * FROM categories_old ORDER BY created_at');

  const idMap = {};
  let userCategoryId = 1000; // Start user categories at 1000

  // First pass: Insert categories without parent_id
  for (const category of oldCategories) {
    const oldId = category.id;

    // Check if this is a default category
    let newId;
    if (defaultCategoryIdMap[oldId]) {
      // Use fixed ID for default categories
      newId = defaultCategoryIdMap[oldId];
    } else {
      // Use auto-incrementing ID for user categories
      newId = userCategoryId++;
    }

    rawDb.execSync(
      `INSERT INTO categories (
        id, name, type, category_type, parent_id, icon, color,
        is_shadow, exclude_from_forecast, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        category.name,
        category.type,
        category.category_type,
        null, // Will update in second pass
        category.icon,
        category.color,
        category.is_shadow,
        category.exclude_from_forecast,
        category.created_at,
        category.updated_at,
      ]
    );

    idMap[oldId] = newId;
  }

  // Second pass: Update parent_id references
  for (const category of oldCategories) {
    if (category.parent_id) {
      const newId = idMap[category.id];
      const newParentId = idMap[category.parent_id];

      if (newParentId) {
        rawDb.execSync('UPDATE categories SET parent_id = ? WHERE id = ?', [
          newParentId,
          newId,
        ]);
      }
    }
  }

  console.log(`  Migrated ${oldCategories.length} categories (${oldCategories.length - (userCategoryId - 1000)} user-created)`);
  return idMap;
};

/**
 * Migrate operations from old table to new table
 * @param {Object} accountIdMap - Map of old account UUIDs to new integer IDs
 * @param {Object} categoryIdMap - Map of old category UUIDs to new integer IDs
 */
const migrateOperations = async (accountIdMap, categoryIdMap) => {
  const oldOperations = rawDb.getAllSync('SELECT * FROM operations_old ORDER BY created_at');

  for (const operation of oldOperations) {
    const newAccountId = accountIdMap[operation.account_id];
    const newCategoryId = operation.category_id ? categoryIdMap[operation.category_id] : null;
    const newToAccountId = operation.to_account_id ? accountIdMap[operation.to_account_id] : null;

    if (!newAccountId) {
      console.warn(`  Skipping operation ${operation.id} - account not found`);
      continue;
    }

    rawDb.execSync(
      `INSERT INTO operations (
        type, amount, account_id, category_id, to_account_id, date, created_at,
        description, exchange_rate, destination_amount, source_currency, destination_currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operation.type,
        operation.amount,
        newAccountId,
        newCategoryId,
        newToAccountId,
        operation.date,
        operation.created_at,
        operation.description,
        operation.exchange_rate,
        operation.destination_amount,
        operation.source_currency,
        operation.destination_currency,
      ]
    );
  }

  console.log(`  Migrated ${oldOperations.length} operations`);
};

/**
 * Migrate budgets from old table to new table
 * @param {Object} categoryIdMap - Map of old category UUIDs to new integer IDs
 */
const migrateBudgets = async (categoryIdMap) => {
  const oldBudgets = rawDb.getAllSync('SELECT * FROM budgets_old ORDER BY created_at');

  for (const budget of oldBudgets) {
    const newCategoryId = categoryIdMap[budget.category_id];

    if (!newCategoryId) {
      console.warn(`  Skipping budget ${budget.id} - category not found`);
      continue;
    }

    rawDb.execSync(
      `INSERT INTO budgets (
        category_id, amount, currency, period_type, start_date, end_date,
        is_recurring, rollover_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newCategoryId,
        budget.amount,
        budget.currency,
        budget.period_type,
        budget.start_date,
        budget.end_date,
        budget.is_recurring,
        budget.rollover_enabled,
        budget.created_at,
        budget.updated_at,
      ]
    );
  }

  console.log(`  Migrated ${oldBudgets.length} budgets`);
};

/**
 * Verify data integrity after migration
 */
const verifyDataIntegrity = async () => {
  const checks = [
    { table: 'accounts', oldTable: 'accounts_old' },
    { table: 'categories', oldTable: 'categories_old' },
    { table: 'operations', oldTable: 'operations_old' },
    { table: 'budgets', oldTable: 'budgets_old' },
  ];

  for (const { table, oldTable } of checks) {
    const oldCount = rawDb.getFirstSync(`SELECT COUNT(*) as count FROM ${oldTable}`);
    const newCount = rawDb.getFirstSync(`SELECT COUNT(*) as count FROM ${table}`);

    if (oldCount.count !== newCount.count) {
      throw new Error(
        `Data integrity check failed for ${table}: ` +
          `expected ${oldCount.count} records, got ${newCount.count}`
      );
    }

    console.log(`  ✓ ${table}: ${newCount.count} records verified`);
  }

  // Check foreign key integrity
  const orphanedOperations = rawDb.getFirstSync(`
    SELECT COUNT(*) as count FROM operations
    WHERE account_id NOT IN (SELECT id FROM accounts)
  `);

  if (orphanedOperations.count > 0) {
    throw new Error(`Found ${orphanedOperations.count} orphaned operations`);
  }

  console.log('  ✓ Foreign key integrity verified');
};

/**
 * Drop backup tables after successful migration
 */
const dropBackupTables = async () => {
  const tables = ['accounts_old', 'categories_old', 'operations_old', 'budgets_old'];

  for (const table of tables) {
    rawDb.execSync(`DROP TABLE IF EXISTS ${table}`);
  }
};

/**
 * Restore from backup tables if migration fails
 */
const restoreFromBackup = async () => {
  // Drop failed new tables
  await dropOldTables();

  // Rename backup tables back to original names
  const tables = ['accounts', 'categories', 'operations', 'budgets'];

  for (const table of tables) {
    rawDb.execSync(`ALTER TABLE ${table}_old RENAME TO ${table}`);
  }
};
