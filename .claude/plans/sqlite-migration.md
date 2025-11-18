# SQLite Migration Plan - Money Tracker

**Document Version:** 1.0
**Created:** 2025-01-18
**Status:** Ready for Implementation
**Estimated Timeline:** 8-10 days

---

## Executive Summary

This document outlines the plan to migrate financial data (accounts, operations, categories) from AsyncStorage to SQLite while keeping app preferences (theme, language) in AsyncStorage. This migration will:

- **Eliminate scalability bottlenecks** - Support unlimited operations (currently limited to ~10MB)
- **Enable advanced features** - Complex queries for graphs, reports, and search
- **Improve performance** - 10-50x faster for large datasets
- **Ensure data integrity** - ACID transactions and foreign key constraints
- **Maintain offline-first** - No cloud dependencies

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [SQLite Schema Design](#sqlite-schema-design)
3. [Database Service Layer](#database-service-layer)
4. [Migration Strategy](#migration-strategy)
5. [Implementation Phases](#implementation-phases)
6. [Testing Strategy](#testing-strategy)
7. [Rollback Plan](#rollback-plan)
8. [Performance Considerations](#performance-considerations)
9. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### Current State
```
┌─────────────────────────────────────────┐
│         AsyncStorage (All Data)         │
├─────────────────────────────────────────┤
│ • accounts                              │
│ • operations                            │
│ • categories                            │
│ • theme_preference                      │
│ • app_language                          │
└─────────────────────────────────────────┘
```

### Target State
```
┌──────────────────┐    ┌──────────────────┐
│   AsyncStorage   │    │      SQLite      │
│   (Settings)     │    │  (Financial Data)│
├──────────────────┤    ├──────────────────┤
│ • theme_pref     │    │ • accounts       │
│ • app_language   │    │ • operations     │
└──────────────────┘    │ • categories     │
                        │ • app_metadata   │
                        └──────────────────┘
```

### Why This Split?

**AsyncStorage for Settings:**
- Fast, simple access for frequently-read preferences
- No need for complex queries
- Small data size (< 1KB)
- Synchronous-like behavior with MMKV (future upgrade path)

**SQLite for Financial Data:**
- Complex queries needed (date ranges, aggregations, filtering)
- Large dataset (grows unbounded over time)
- Relationships between entities (operations → accounts → categories)
- Transaction support for balance updates
- Indexes for performance

---

## SQLite Schema Design

### Database File
**Location:** `money-tracker.db` (managed by expo-sqlite)
**Initial Version:** 1

### Schema Version Control
```sql
CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Track schema version
INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '1');

-- Track migration status
INSERT INTO app_metadata (key, value)
VALUES ('migrated_from_asyncstorage', 'false');
```

### Accounts Table
```sql
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  balance TEXT NOT NULL,
  currency TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CHECK (length(name) > 0),
  CHECK (length(currency) = 3)
);

-- Index for sorting by name
CREATE INDEX IF NOT EXISTS idx_accounts_name
ON accounts(name COLLATE NOCASE);

-- Track balance update history (trigger)
CREATE TRIGGER IF NOT EXISTS accounts_updated
AFTER UPDATE ON accounts
BEGIN
  UPDATE accounts SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
```

**Design Notes:**
- `balance` stored as TEXT (not REAL) to preserve exact decimal precision
- `currency` enforced as 3-character code (ISO 4217)
- Triggers automatically update `updated_at` timestamp
- Case-insensitive index on name for sorting

### Categories Table
```sql
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT,
  type TEXT NOT NULL,
  parent_id TEXT,
  icon TEXT NOT NULL,
  category_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CHECK (type IN ('folder', 'subfolder', 'entry')),
  CHECK (category_type IN ('expense', 'income')),
  CHECK (length(name) > 0),

  FOREIGN KEY (parent_id)
    REFERENCES categories(id)
    ON DELETE CASCADE
);

-- Index for hierarchical queries
CREATE INDEX IF NOT EXISTS idx_categories_parent
ON categories(parent_id);

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_categories_type
ON categories(category_type, type);

-- Index for localization lookups
CREATE INDEX IF NOT EXISTS idx_categories_name_key
ON categories(name_key)
WHERE name_key IS NOT NULL;
```

**Design Notes:**
- `parent_id` with CASCADE DELETE ensures orphaned categories are cleaned up
- `name_key` is optional (for localized default categories)
- Composite index on `(category_type, type)` for filtering expense/income entries
- CHECK constraints enforce valid enum values

### Operations Table
```sql
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount TEXT NOT NULL,
  account_id TEXT NOT NULL,
  category_id TEXT,
  to_account_id TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  description TEXT,

  CHECK (type IN ('expense', 'income', 'transfer')),
  CHECK (CAST(amount AS REAL) > 0),
  CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL) OR
    (type != 'transfer' AND category_id IS NOT NULL)
  ),

  FOREIGN KEY (account_id)
    REFERENCES accounts(id)
    ON DELETE CASCADE,
  FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE SET NULL,
  FOREIGN KEY (to_account_id)
    REFERENCES accounts(id)
    ON DELETE SET NULL
);

-- Primary index for date-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_operations_date
ON operations(date DESC);

-- Index for account-based filtering
CREATE INDEX IF NOT EXISTS idx_operations_account
ON operations(account_id, date DESC);

-- Index for category-based filtering
CREATE INDEX IF NOT EXISTS idx_operations_category
ON operations(category_id, date DESC)
WHERE category_id IS NOT NULL;

-- Index for type-based filtering (expense/income/transfer)
CREATE INDEX IF NOT EXISTS idx_operations_type
ON operations(type, date DESC);

-- Composite index for common queries (account + date range)
CREATE INDEX IF NOT EXISTS idx_operations_account_date
ON operations(account_id, date DESC, type);

-- Full-text search on description (for future search feature)
CREATE VIRTUAL TABLE IF NOT EXISTS operations_fts
USING fts5(description, content=operations, content_rowid=id);

-- Trigger to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS operations_fts_insert
AFTER INSERT ON operations
BEGIN
  INSERT INTO operations_fts(rowid, description)
  VALUES (NEW.rowid, NEW.description);
END;

CREATE TRIGGER IF NOT EXISTS operations_fts_delete
AFTER DELETE ON operations
BEGIN
  DELETE FROM operations_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER IF NOT EXISTS operations_fts_update
AFTER UPDATE ON operations
BEGIN
  UPDATE operations_fts
  SET description = NEW.description
  WHERE rowid = NEW.rowid;
END;
```

**Design Notes:**
- `date` stored as ISO 8601 string (YYYY-MM-DD) for easy JS interop
- `amount` stored as TEXT for decimal precision, with CHECK constraint
- CHECK constraint enforces: transfers must have `to_account_id`, others must have `category_id`
- Multiple indexes optimized for different query patterns
- FTS5 virtual table enables full-text search on descriptions
- Triggers automatically maintain FTS index

### Schema Diagram
```
┌──────────────┐
│   accounts   │
│──────────────│
│ id (PK)      │←──┐
│ name         │   │
│ balance      │   │  ┌─────────────┐
│ currency     │   │  │ categories  │
└──────────────┘   │  │─────────────│
       ↑           │  │ id (PK)     │←──┐
       │           │  │ name        │   │
       │           │  │ type        │   │
       │           │  │ parent_id   │──→┘
       │           │  │ category_   │
       │           │  │   type      │
       │           │  └─────────────┘
       │           │         ↑
       │           │         │
┌──────────────┐  │         │
│  operations  │  │         │
│──────────────│  │         │
│ id (PK)      │  │         │
│ type         │  │         │
│ amount       │  │         │
│ account_id   │──┘         │
│ category_id  │────────────┘
│ to_account_id│ (nullable)
│ date         │
│ description  │
└──────────────┘
```

---

## Database Service Layer

### File Structure
```
app/
├── database/
│   ├── db.js                  # Database initialization
│   ├── migrations.js          # Schema creation & migrations
│   ├── AccountsDB.js          # Accounts CRUD operations
│   ├── CategoriesDB.js        # Categories CRUD operations
│   ├── OperationsDB.js        # Operations CRUD operations
│   └── utils.js               # Shared utilities
```

### Core Database Service

**File:** `app/database/db.js`

```javascript
import * as SQLite from 'expo-sqlite';
import { createTables, checkMigrationStatus } from './migrations';

let database = null;

/**
 * Initialize and open the database
 * @returns {Promise<SQLite.WebSQLDatabase>}
 */
export async function openDatabase() {
  if (database) {
    return database;
  }

  try {
    database = SQLite.openDatabase('money-tracker.db');

    // Create tables if they don't exist
    await createTables(database);

    // Check if we need to migrate from AsyncStorage
    const needsMigration = await checkMigrationStatus(database);
    if (needsMigration) {
      console.log('Migration from AsyncStorage required');
      // Migration will be handled by contexts
    }

    return database;
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (database) {
    // expo-sqlite doesn't have explicit close method
    // Just clear the reference
    database = null;
  }
}

/**
 * Execute a SQL query with error handling
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<{rows: Array, insertId?: number, rowsAffected?: number}>}
 */
export function executeSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!database) {
      reject(new Error('Database not initialized'));
      return;
    }

    database.transaction(
      tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => {
            resolve({
              rows: result.rows._array || [],
              insertId: result.insertId,
              rowsAffected: result.rowsAffected,
            });
          },
          (_, error) => {
            console.error('SQL Error:', error);
            console.error('Query:', sql);
            console.error('Params:', params);
            reject(error);
            return true; // Return true to rollback transaction
          }
        );
      },
      error => {
        console.error('Transaction Error:', error);
        reject(error);
      }
    );
  });
}

/**
 * Execute multiple SQL statements in a transaction
 * @param {Function} callback - Transaction callback
 * @returns {Promise<void>}
 */
export function executeTransaction(callback) {
  return new Promise((resolve, reject) => {
    if (!database) {
      reject(new Error('Database not initialized'));
      return;
    }

    database.transaction(
      callback,
      error => {
        console.error('Transaction failed:', error);
        reject(error);
      },
      () => {
        resolve();
      }
    );
  });
}
```

### Migration Service

**File:** `app/database/migrations.js`

```javascript
import { executeSql } from './db';

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Create all database tables
 */
export async function createTables(database) {
  // Metadata table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Accounts table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance TEXT NOT NULL,
      currency TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (length(name) > 0),
      CHECK (length(currency) = 3)
    )
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_accounts_name
    ON accounts(name COLLATE NOCASE)
  `);

  await executeSql(`
    CREATE TRIGGER IF NOT EXISTS accounts_updated
    AFTER UPDATE ON accounts
    BEGIN
      UPDATE accounts SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END
  `);

  // Categories table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT,
      type TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT NOT NULL,
      category_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (type IN ('folder', 'subfolder', 'entry')),
      CHECK (category_type IN ('expense', 'income')),
      CHECK (length(name) > 0),
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_categories_parent
    ON categories(parent_id)
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_categories_type
    ON categories(category_type, type)
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_categories_name_key
    ON categories(name_key) WHERE name_key IS NOT NULL
  `);

  // Operations table
  await executeSql(`
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount TEXT NOT NULL,
      account_id TEXT NOT NULL,
      category_id TEXT,
      to_account_id TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      description TEXT,
      CHECK (type IN ('expense', 'income', 'transfer')),
      CHECK (CAST(amount AS REAL) > 0),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    )
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_operations_date
    ON operations(date DESC)
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_operations_account
    ON operations(account_id, date DESC)
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_operations_category
    ON operations(category_id, date DESC) WHERE category_id IS NOT NULL
  `);

  await executeSql(`
    CREATE INDEX IF NOT EXISTS idx_operations_type
    ON operations(type, date DESC)
  `);

  // Initialize schema version
  const versionCheck = await executeSql(
    'SELECT value FROM app_metadata WHERE key = ?',
    ['schema_version']
  );

  if (versionCheck.rows.length === 0) {
    await executeSql(
      'INSERT INTO app_metadata (key, value) VALUES (?, ?)',
      ['schema_version', String(CURRENT_SCHEMA_VERSION)]
    );
  }
}

/**
 * Check if migration from AsyncStorage is needed
 */
export async function checkMigrationStatus() {
  const result = await executeSql(
    'SELECT value FROM app_metadata WHERE key = ?',
    ['migrated_from_asyncstorage']
  );

  if (result.rows.length === 0) {
    // No migration record = needs migration
    await executeSql(
      'INSERT INTO app_metadata (key, value) VALUES (?, ?)',
      ['migrated_from_asyncstorage', 'pending']
    );
    return true;
  }

  return result.rows[0].value === 'pending';
}

/**
 * Mark migration as complete
 */
export async function markMigrationComplete() {
  await executeSql(
    'UPDATE app_metadata SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    ['complete', 'migrated_from_asyncstorage']
  );
}

/**
 * Get current schema version
 */
export async function getSchemaVersion() {
  const result = await executeSql(
    'SELECT value FROM app_metadata WHERE key = ?',
    ['schema_version']
  );

  if (result.rows.length === 0) {
    return 0;
  }

  return parseInt(result.rows[0].value, 10);
}
```

### Accounts Database Service

**File:** `app/database/AccountsDB.js`

```javascript
import { executeSql, executeTransaction } from './db';
import uuid from 'react-native-uuid';

/**
 * Get all accounts
 */
export async function getAllAccounts() {
  const result = await executeSql(
    'SELECT * FROM accounts ORDER BY name COLLATE NOCASE ASC'
  );
  return result.rows;
}

/**
 * Get account by ID
 */
export async function getAccountById(id) {
  const result = await executeSql(
    'SELECT * FROM accounts WHERE id = ?',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create new account
 */
export async function createAccount(account) {
  const id = uuid.v4();
  await executeSql(
    `INSERT INTO accounts (id, name, balance, currency)
     VALUES (?, ?, ?, ?)`,
    [id, account.name, account.balance, account.currency]
  );
  return { ...account, id };
}

/**
 * Update account
 */
export async function updateAccount(id, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.balance !== undefined) {
    fields.push('balance = ?');
    values.push(updates.balance);
  }
  if (updates.currency !== undefined) {
    fields.push('currency = ?');
    values.push(updates.currency);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(id);

  await executeSql(
    `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Delete account (and cascade to operations)
 */
export async function deleteAccount(id) {
  await executeSql('DELETE FROM accounts WHERE id = ?', [id]);
}

/**
 * Batch import accounts (for migration)
 */
export async function batchCreateAccounts(accounts) {
  await executeTransaction(tx => {
    accounts.forEach(account => {
      tx.executeSql(
        `INSERT INTO accounts (id, name, balance, currency)
         VALUES (?, ?, ?, ?)`,
        [account.id, account.name, account.balance, account.currency]
      );
    });
  });
}

/**
 * Update account balance (used by operations)
 */
export async function updateAccountBalance(accountId, newBalance) {
  await executeSql(
    'UPDATE accounts SET balance = ? WHERE id = ?',
    [newBalance, accountId]
  );
}

/**
 * Get account balance
 */
export async function getAccountBalance(accountId) {
  const result = await executeSql(
    'SELECT balance FROM accounts WHERE id = ?',
    [accountId]
  );
  if (result.rows.length === 0) {
    throw new Error(`Account not found: ${accountId}`);
  }
  return result.rows[0].balance;
}
```

### Categories Database Service

**File:** `app/database/CategoriesDB.js`

```javascript
import { executeSql, executeTransaction } from './db';
import uuid from 'react-native-uuid';

/**
 * Get all categories
 */
export async function getAllCategories() {
  const result = await executeSql(
    'SELECT * FROM categories ORDER BY category_type, name'
  );
  return result.rows;
}

/**
 * Get category by ID
 */
export async function getCategoryById(id) {
  const result = await executeSql(
    'SELECT * FROM categories WHERE id = ?',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get child categories
 */
export async function getChildCategories(parentId) {
  const result = await executeSql(
    'SELECT * FROM categories WHERE parent_id = ? ORDER BY name',
    [parentId]
  );
  return result.rows;
}

/**
 * Get categories by type
 */
export async function getCategoriesByType(categoryType) {
  const result = await executeSql(
    'SELECT * FROM categories WHERE category_type = ? AND type = ? ORDER BY name',
    [categoryType, 'entry']
  );
  return result.rows;
}

/**
 * Create new category
 */
export async function createCategory(category) {
  const id = uuid.v4();
  await executeSql(
    `INSERT INTO categories (id, name, name_key, type, parent_id, icon, category_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      category.name,
      category.nameKey || null,
      category.type,
      category.parentId || null,
      category.icon,
      category.categoryType,
    ]
  );
  return { ...category, id };
}

/**
 * Update category
 */
export async function updateCategory(id, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon);
  }
  if (updates.parentId !== undefined) {
    fields.push('parent_id = ?');
    values.push(updates.parentId);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(id);

  await executeSql(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Delete category (cascades to children)
 */
export async function deleteCategory(id) {
  await executeSql('DELETE FROM categories WHERE id = ?', [id]);
}

/**
 * Batch import categories (for migration)
 */
export async function batchCreateCategories(categories) {
  await executeTransaction(tx => {
    categories.forEach(category => {
      tx.executeSql(
        `INSERT INTO categories (id, name, name_key, type, parent_id, icon, category_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          category.name,
          category.nameKey || null,
          category.type,
          category.parentId || null,
          category.icon,
          category.categoryType,
        ]
      );
    });
  });
}
```

### Operations Database Service

**File:** `app/database/OperationsDB.js`

```javascript
import { executeSql, executeTransaction } from './db';
import uuid from 'react-native-uuid';

/**
 * Get all operations (sorted by date desc)
 */
export async function getAllOperations() {
  const result = await executeSql(
    'SELECT * FROM operations ORDER BY date DESC, created_at DESC'
  );
  return result.rows;
}

/**
 * Get operation by ID
 */
export async function getOperationById(id) {
  const result = await executeSql(
    'SELECT * FROM operations WHERE id = ?',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get operations by account
 */
export async function getOperationsByAccount(accountId) {
  const result = await executeSql(
    'SELECT * FROM operations WHERE account_id = ? ORDER BY date DESC',
    [accountId]
  );
  return result.rows;
}

/**
 * Get operations by category
 */
export async function getOperationsByCategory(categoryId) {
  const result = await executeSql(
    'SELECT * FROM operations WHERE category_id = ? ORDER BY date DESC',
    [categoryId]
  );
  return result.rows;
}

/**
 * Get operations by date range
 */
export async function getOperationsByDateRange(startDate, endDate) {
  const result = await executeSql(
    'SELECT * FROM operations WHERE date BETWEEN ? AND ? ORDER BY date DESC',
    [startDate, endDate]
  );
  return result.rows;
}

/**
 * Get operations by type
 */
export async function getOperationsByType(type) {
  const result = await executeSql(
    'SELECT * FROM operations WHERE type = ? ORDER BY date DESC',
    [type]
  );
  return result.rows;
}

/**
 * Create new operation
 */
export async function createOperation(operation) {
  const id = uuid.v4();
  const createdAt = new Date().toISOString();

  await executeSql(
    `INSERT INTO operations (id, type, amount, account_id, category_id, to_account_id, date, created_at, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      operation.type,
      operation.amount,
      operation.accountId,
      operation.categoryId || null,
      operation.toAccountId || null,
      operation.date,
      createdAt,
      operation.description || null,
    ]
  );

  return { ...operation, id, createdAt };
}

/**
 * Update operation
 */
export async function updateOperation(id, updates) {
  const fields = [];
  const values = [];

  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.amount !== undefined) {
    fields.push('amount = ?');
    values.push(updates.amount);
  }
  if (updates.accountId !== undefined) {
    fields.push('account_id = ?');
    values.push(updates.accountId);
  }
  if (updates.categoryId !== undefined) {
    fields.push('category_id = ?');
    values.push(updates.categoryId);
  }
  if (updates.toAccountId !== undefined) {
    fields.push('to_account_id = ?');
    values.push(updates.toAccountId);
  }
  if (updates.date !== undefined) {
    fields.push('date = ?');
    values.push(updates.date);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  if (fields.length === 0) {
    return;
  }

  values.push(id);

  await executeSql(
    `UPDATE operations SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Delete operation
 */
export async function deleteOperation(id) {
  await executeSql('DELETE FROM operations WHERE id = ?', [id]);
}

/**
 * Batch import operations (for migration)
 */
export async function batchCreateOperations(operations) {
  await executeTransaction(tx => {
    operations.forEach(operation => {
      tx.executeSql(
        `INSERT INTO operations (id, type, amount, account_id, category_id, to_account_id, date, created_at, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operation.id,
          operation.type,
          operation.amount,
          operation.accountId,
          operation.categoryId || null,
          operation.toAccountId || null,
          operation.date,
          operation.createdAt,
          operation.description || null,
        ]
      );
    });
  });
}

/**
 * Search operations by description
 */
export async function searchOperations(searchTerm) {
  const result = await executeSql(
    `SELECT o.* FROM operations o
     WHERE o.description LIKE ?
     ORDER BY o.date DESC`,
    [`%${searchTerm}%`]
  );
  return result.rows;
}

/**
 * Get operation count
 */
export async function getOperationCount() {
  const result = await executeSql('SELECT COUNT(*) as count FROM operations');
  return result.rows[0].count;
}
```

---

## Migration Strategy

### Overview

The migration will be **one-time and automatic** when users update to the new version. The process:

1. App launches → Database initialized
2. Check if migration needed → Read AsyncStorage
3. If data exists in AsyncStorage → Import to SQLite
4. Mark migration complete → Never run again
5. (Optional) Clear AsyncStorage after successful migration

### Migration Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. App Launch                                           │
│    └─> Initialize SQLite database                       │
│        └─> Create tables and indexes                    │
│            └─> Check migration status                   │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Migration Check                                      │
│    └─> Query app_metadata table                         │
│        └─> If 'migrated_from_asyncstorage' = 'pending'  │
│            └─> Trigger migration                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Data Migration                                       │
│    └─> Read AsyncStorage keys:                          │
│        ├─> 'accounts'                                    │
│        ├─> 'categories'                                  │
│        └─> 'operations'                                  │
│    └─> Parse JSON                                       │
│    └─> Batch insert into SQLite                         │
│    └─> Verify row counts match                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Verification                                         │
│    └─> Compare counts:                                  │
│        ├─> AsyncStorage accounts = SQLite accounts?     │
│        ├─> AsyncStorage categories = SQLite categories? │
│        └─> AsyncStorage operations = SQLite operations? │
│    └─> If all match → Mark complete                     │
│    └─> If mismatch → Alert user, keep AsyncStorage      │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Completion                                           │
│    └─> Update app_metadata:                             │
│        └─> 'migrated_from_asyncstorage' = 'complete'    │
│    └─> (Optional) Clear AsyncStorage financial keys     │
│    └─> Continue normal app operation                    │
└─────────────────────────────────────────────────────────┘
```

### Migration Script

**File:** `app/database/migration/migrateFromAsyncStorage.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { executeTransaction } from '../db';
import { batchCreateAccounts } from '../AccountsDB';
import { batchCreateCategories } from '../CategoriesDB';
import { batchCreateOperations } from '../OperationsDB';
import { markMigrationComplete } from '../migrations';
import defaultCategories from '../../../assets/defaultCategories.json';

/**
 * Migrate data from AsyncStorage to SQLite
 * @returns {Promise<{success: boolean, errors: Array}>}
 */
export async function migrateFromAsyncStorage() {
  const errors = [];

  try {
    console.log('Starting migration from AsyncStorage to SQLite...');

    // Step 1: Read data from AsyncStorage
    const [accountsData, categoriesData, operationsData] = await Promise.all([
      AsyncStorage.getItem('accounts'),
      AsyncStorage.getItem('categories'),
      AsyncStorage.getItem('operations'),
    ]);

    console.log('Read AsyncStorage data:', {
      accountsData: accountsData ? 'present' : 'null',
      categoriesData: categoriesData ? 'present' : 'null',
      operationsData: operationsData ? 'present' : 'null',
    });

    // Step 2: Parse JSON
    let accounts = [];
    let categories = [];
    let operations = [];

    try {
      accounts = accountsData ? JSON.parse(accountsData) : [];
    } catch (error) {
      errors.push({ type: 'accounts', error: 'Failed to parse accounts data' });
      console.error('Failed to parse accounts:', error);
    }

    try {
      categories = categoriesData ? JSON.parse(categoriesData) : defaultCategories;
    } catch (error) {
      errors.push({ type: 'categories', error: 'Failed to parse categories data' });
      console.error('Failed to parse categories:', error);
      categories = defaultCategories;
    }

    try {
      operations = operationsData ? JSON.parse(operationsData) : [];
    } catch (error) {
      errors.push({ type: 'operations', error: 'Failed to parse operations data' });
      console.error('Failed to parse operations:', error);
    }

    console.log('Parsed data counts:', {
      accounts: accounts.length,
      categories: categories.length,
      operations: operations.length,
    });

    // Step 3: Validate data structures
    accounts = accounts.filter(validateAccount);
    categories = categories.filter(validateCategory);
    operations = operations.filter(validateOperation);

    // Step 4: Import data to SQLite in transaction
    await executeTransaction(async tx => {
      // Import in order: accounts → categories → operations (due to foreign keys)
      if (accounts.length > 0) {
        await batchCreateAccounts(accounts);
        console.log(`Imported ${accounts.length} accounts`);
      }

      if (categories.length > 0) {
        await batchCreateCategories(categories);
        console.log(`Imported ${categories.length} categories`);
      }

      if (operations.length > 0) {
        await batchCreateOperations(operations);
        console.log(`Imported ${operations.length} operations`);
      }
    });

    // Step 5: Verify counts
    const verification = await verifyMigration(
      accounts.length,
      categories.length,
      operations.length
    );

    if (!verification.success) {
      errors.push({ type: 'verification', error: verification.message });
    }

    // Step 6: Mark migration complete
    await markMigrationComplete();
    console.log('Migration completed successfully');

    // Step 7: (Optional) Clear AsyncStorage
    // Uncomment to delete old data after successful migration
    // await AsyncStorage.multiRemove(['accounts', 'categories', 'operations']);

    return {
      success: errors.length === 0,
      errors,
      counts: {
        accounts: accounts.length,
        categories: categories.length,
        operations: operations.length,
      },
    };
  } catch (error) {
    console.error('Migration failed:', error);
    errors.push({ type: 'migration', error: error.message });

    // Show alert to user
    Alert.alert(
      'Migration Failed',
      'Failed to migrate your data to the new database. Your existing data is safe. Please contact support.',
      [{ text: 'OK' }]
    );

    return {
      success: false,
      errors,
    };
  }
}

/**
 * Validate account structure
 */
function validateAccount(account) {
  return (
    account &&
    typeof account.id === 'string' &&
    typeof account.name === 'string' &&
    account.name.length > 0 &&
    typeof account.balance === 'string' &&
    typeof account.currency === 'string' &&
    account.currency.length === 3
  );
}

/**
 * Validate category structure
 */
function validateCategory(category) {
  return (
    category &&
    typeof category.id === 'string' &&
    typeof category.name === 'string' &&
    category.name.length > 0 &&
    typeof category.type === 'string' &&
    ['folder', 'subfolder', 'entry'].includes(category.type) &&
    typeof category.icon === 'string' &&
    typeof category.categoryType === 'string' &&
    ['expense', 'income'].includes(category.categoryType)
  );
}

/**
 * Validate operation structure
 */
function validateOperation(operation) {
  const hasValidBasics =
    operation &&
    typeof operation.id === 'string' &&
    typeof operation.type === 'string' &&
    ['expense', 'income', 'transfer'].includes(operation.type) &&
    typeof operation.amount === 'string' &&
    parseFloat(operation.amount) > 0 &&
    typeof operation.accountId === 'string' &&
    typeof operation.date === 'string';

  if (!hasValidBasics) {
    return false;
  }

  // Type-specific validation
  if (operation.type === 'transfer') {
    return typeof operation.toAccountId === 'string';
  } else {
    return typeof operation.categoryId === 'string';
  }
}

/**
 * Verify migration was successful
 */
async function verifyMigration(
  expectedAccounts,
  expectedCategories,
  expectedOperations
) {
  const { executeSql } = require('../db');

  const [accountCount, categoryCount, operationCount] = await Promise.all([
    executeSql('SELECT COUNT(*) as count FROM accounts'),
    executeSql('SELECT COUNT(*) as count FROM categories'),
    executeSql('SELECT COUNT(*) as count FROM operations'),
  ]);

  const actual = {
    accounts: accountCount.rows[0].count,
    categories: categoryCount.rows[0].count,
    operations: operationCount.rows[0].count,
  };

  const success =
    actual.accounts === expectedAccounts &&
    actual.categories === expectedCategories &&
    actual.operations === expectedOperations;

  return {
    success,
    message: success
      ? 'Verification passed'
      : `Count mismatch - Expected: ${JSON.stringify({
          accounts: expectedAccounts,
          categories: expectedCategories,
          operations: expectedOperations,
        })}, Got: ${JSON.stringify(actual)}`,
    actual,
  };
}
```

### Error Handling Strategy

**Principle:** Never lose user data

1. **Migration Failure:** Keep AsyncStorage intact, alert user, continue with AsyncStorage
2. **Partial Import:** Rollback transaction, retry once, then alert user
3. **Verification Failure:** Keep both copies, alert user, log details
4. **Parse Errors:** Skip invalid records, import what's valid, log errors

### Migration Trigger

**In App.js:**

```javascript
import { openDatabase } from './app/database/db';
import { checkMigrationStatus } from './app/database/migrations';
import { migrateFromAsyncStorage } from './app/database/migration/migrateFromAsyncStorage';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    async function initDatabase() {
      try {
        await openDatabase();
        const needsMigration = await checkMigrationStatus();

        if (needsMigration) {
          console.log('Running migration...');
          const result = await migrateFromAsyncStorage();

          if (!result.success) {
            console.error('Migration had errors:', result.errors);
            // Continue anyway - contexts will fall back to AsyncStorage
          } else {
            console.log('Migration successful:', result.counts);
          }
        }

        setDbReady(true);
      } catch (error) {
        console.error('Database initialization failed:', error);
        Alert.alert(
          'Database Error',
          'Failed to initialize database. Please restart the app.',
          [{ text: 'OK' }]
        );
      }
    }

    initDatabase();
  }, []);

  if (!dbReady) {
    return <LoadingScreen />;
  }

  return (
    // ... rest of app
  );
}
```

---

## Implementation Phases

### Phase 1: Database Setup (Days 1-2)

**Goal:** Create database infrastructure

**Tasks:**
1. ✅ Install `expo-sqlite`
   ```bash
   npx expo install expo-sqlite
   ```

2. ✅ Create database folder structure:
   ```
   app/database/
   ├── db.js
   ├── migrations.js
   ├── AccountsDB.js
   ├── CategoriesDB.js
   ├── OperationsDB.js
   └── migration/
       └── migrateFromAsyncStorage.js
   ```

3. ✅ Implement core database service (`db.js`)
   - Database initialization
   - Transaction wrapper
   - Error handling utilities

4. ✅ Implement migrations service (`migrations.js`)
   - Create all tables
   - Create indexes
   - Version tracking

5. ✅ Write unit tests for database layer
   - Test table creation
   - Test CRUD operations
   - Test transaction rollback

**Success Criteria:**
- Database initializes without errors
- All tables and indexes created
- Can insert/query test data

**Testing:**
```javascript
// Test script
import { openDatabase, executeSql } from './app/database/db';

async function testDatabase() {
  await openDatabase();

  // Test insert
  await executeSql(
    'INSERT INTO accounts (id, name, balance, currency) VALUES (?, ?, ?, ?)',
    ['test-1', 'Test Account', '100.00', 'USD']
  );

  // Test query
  const result = await executeSql('SELECT * FROM accounts WHERE id = ?', ['test-1']);
  console.log('Account:', result.rows[0]);

  // Cleanup
  await executeSql('DELETE FROM accounts WHERE id = ?', ['test-1']);
}
```

---

### Phase 2: AccountsContext Migration (Days 3-4)

**Goal:** Migrate AccountsContext from AsyncStorage to SQLite

**Tasks:**
1. ✅ Implement `AccountsDB.js` with all CRUD methods
2. ✅ Create new `AccountsContext.js` version with SQLite
3. ✅ Add migration logic to check for existing AsyncStorage data
4. ✅ Implement balance update methods
5. ✅ Update all account-related components
6. ✅ Write integration tests

**File Changes:**

**`app/AccountsContext.js` - Before:**
```javascript
const [accounts, setAccounts] = useState([]);

useEffect(() => {
  AsyncStorage.getItem('accounts').then(data => {
    if (data) setAccounts(JSON.parse(data));
  });
}, []);

useEffect(() => {
  if (dataLoaded) {
    AsyncStorage.setItem('accounts', JSON.stringify(accounts));
  }
}, [accounts, dataLoaded]);
```

**`app/AccountsContext.js` - After:**
```javascript
import { openDatabase } from './database/db';
import * as AccountsDB from './database/AccountsDB';

const [accounts, setAccounts] = useState([]);

useEffect(() => {
  async function loadAccounts() {
    try {
      await openDatabase();
      const data = await AccountsDB.getAllAccounts();
      setAccounts(data);
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  }
  loadAccounts();
}, []);

const addAccount = useCallback(async (account) => {
  try {
    const newAccount = await AccountsDB.createAccount(account);
    setAccounts(accs => [...accs, newAccount]);
    return newAccount;
  } catch (error) {
    console.error('Failed to add account:', error);
    Alert.alert('Error', 'Failed to create account');
  }
}, []);

const updateAccount = useCallback(async (id, updates) => {
  try {
    await AccountsDB.updateAccount(id, updates);
    setAccounts(accs =>
      accs.map(acc => (acc.id === id ? { ...acc, ...updates } : acc))
    );
  } catch (error) {
    console.error('Failed to update account:', error);
    Alert.alert('Error', 'Failed to update account');
  }
}, []);

const deleteAccount = useCallback(async (id) => {
  try {
    await AccountsDB.deleteAccount(id);
    setAccounts(accs => accs.filter(acc => acc.id !== id));
  } catch (error) {
    console.error('Failed to delete account:', error);
    Alert.alert('Error', 'Failed to delete account');
  }
}, []);
```

**Success Criteria:**
- Accounts load from SQLite
- CRUD operations work correctly
- Balance updates persist
- No data loss during migration
- AccountsScreen functions normally

**Testing:**
- Create new account → Verify in database
- Edit account name → Verify persisted
- Delete account → Verify removed from database
- Restart app → Verify accounts load correctly

---

### Phase 3: CategoriesContext Migration (Days 4-5)

**Goal:** Migrate CategoriesContext from AsyncStorage to SQLite

**Tasks:**
1. ✅ Implement `CategoriesDB.js` with all CRUD methods
2. ✅ Handle hierarchical queries (parent-child relationships)
3. ✅ Migrate CategoriesContext to use SQLite
4. ✅ Test category tree operations
5. ✅ Ensure default categories import correctly

**File Changes:**

Similar pattern to AccountsContext:
- Replace AsyncStorage with `CategoriesDB` calls
- Maintain same React state structure for UI compatibility
- Add error handling for CASCADE DELETE operations

**Special Considerations:**
- Categories have parent-child relationships
- Deleting parent must cascade to children
- Need efficient queries for tree traversal

**Success Criteria:**
- Categories load from SQLite
- Hierarchical structure preserved
- Expand/collapse works correctly
- Delete cascades to children
- Default categories import on first launch

**Testing:**
- Create folder with subfolders → Verify hierarchy
- Delete folder → Verify children deleted
- Query by category type → Verify filtering

---

### Phase 4: OperationsContext Migration (Days 5-7)

**Goal:** Migrate OperationsContext from AsyncStorage to SQLite

**Tasks:**
1. ✅ Implement `OperationsDB.js` with all CRUD methods
2. ✅ Implement complex query methods (date ranges, filtering)
3. ✅ Migrate OperationsContext to use SQLite
4. ✅ Update balance update logic to use SQLite transactions
5. ✅ Test all operation types (expense, income, transfer)
6. ✅ Optimize FlatList rendering with lazy loading

**File Changes:**

**`app/OperationsContext.js` - Critical Changes:**

```javascript
// Before: Load all operations into memory
const [operations, setOperations] = useState([]);

useEffect(() => {
  AsyncStorage.getItem('operations').then(data => {
    if (data) setOperations(JSON.parse(data));
  });
}, []);

// After: Load from SQLite (can add pagination later)
const [operations, setOperations] = useState([]);

useEffect(() => {
  async function loadOperations() {
    try {
      await openDatabase();
      const data = await OperationsDB.getAllOperations();
      setOperations(data);
    } catch (error) {
      console.error('Failed to load operations:', error);
    } finally {
      setLoading(false);
    }
  }
  loadOperations();
}, []);

// Before: Update balances with multiple calls
const addOperation = useCallback((operation) => {
  // ... balance updates via AccountsContext
  setOperations(ops => [newOperation, ...ops]);
}, []);

// After: Use SQLite transaction for atomicity
const addOperation = useCallback(async (operation) => {
  try {
    await executeTransaction(async tx => {
      // 1. Create operation
      const newOp = await OperationsDB.createOperation(operation);

      // 2. Update account balances atomically
      const balanceChanges = calculateBalanceChanges(operation);
      for (const [accountId, change] of balanceChanges) {
        const currentBalance = await AccountsDB.getAccountBalance(accountId);
        const newBalance = String(parseFloat(currentBalance) + change);
        await AccountsDB.updateAccountBalance(accountId, newBalance);
      }

      // 3. Update React state
      setOperations(ops => [newOp, ...ops]);
    });
  } catch (error) {
    console.error('Failed to add operation:', error);
    Alert.alert('Error', 'Failed to create operation');
  }
}, []);
```

**Special Considerations:**
- Operations is the largest dataset (will grow unbounded)
- Balance updates must be atomic (transaction required)
- Need efficient date range queries for graphs
- FlatList must remain performant with 1000+ operations

**Success Criteria:**
- Operations load from SQLite
- Balance updates are atomic
- No race conditions in balance calculations
- FlatList scrolls smoothly
- Date range queries are fast (<10ms)

**Testing:**
- Add 1000 test operations → Verify performance
- Add expense → Verify balance deducted
- Delete operation → Verify balance restored
- Transfer between accounts → Verify both balances updated
- Query operations by date range → Verify correct results

---

### Phase 5: Testing & Optimization (Days 7-8)

**Goal:** Comprehensive testing and performance tuning

**Tasks:**
1. ✅ End-to-end testing of all features
2. ✅ Performance testing with large datasets
3. ✅ Migration testing (fresh install vs upgrade)
4. ✅ Error handling and edge cases
5. ✅ Code cleanup and documentation

**Test Scenarios:**

**1. Fresh Install (No AsyncStorage data)**
- App initializes with empty SQLite database
- Default categories imported
- Can create accounts and operations normally

**2. Upgrade from AsyncStorage**
- Existing data migrates to SQLite
- All counts match
- No data loss
- App continues working normally

**3. Large Dataset Performance**
- Generate 10,000 test operations
- Measure load time (<500ms acceptable)
- Measure scroll performance (60fps)
- Measure query time (<50ms for common queries)

**4. Error Recovery**
- Simulate database corruption → Verify graceful fallback
- Simulate migration failure → Verify keeps AsyncStorage
- Simulate transaction failure → Verify rollback

**5. Edge Cases**
- Delete account with operations → Verify cascade
- Delete category with operations → Verify operations updated
- Transfer to deleted account → Verify constraint
- Concurrent operations → Verify no race conditions

**Performance Benchmarks:**

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Load 1000 operations | <100ms | <500ms |
| Add operation | <10ms | <50ms |
| Update operation | <10ms | <50ms |
| Delete operation | <10ms | <50ms |
| Date range query | <10ms | <50ms |
| Category filter | <10ms | <50ms |
| FlatList scroll | 60fps | 50fps |

---

### Phase 6: Documentation & Deployment (Day 9-10)

**Goal:** Document changes and deploy to users

**Tasks:**
1. ✅ Update README with database information
2. ✅ Write migration guide for developers
3. ✅ Add inline code documentation
4. ✅ Create changelog entry
5. ✅ Prepare rollback plan
6. ✅ Deploy to TestFlight/Google Play Beta
7. ✅ Monitor for issues

**Documentation Updates:**

**README.md additions:**
```markdown
## Data Storage

Money Tracker uses SQLite for financial data storage:

- **Accounts** - User's financial accounts
- **Categories** - Hierarchical expense/income categories
- **Operations** - All transactions (expenses, income, transfers)

App preferences (theme, language) continue to use AsyncStorage.

### Database Location
- iOS: `~/Library/Application Support/money-tracker.db`
- Android: `/data/data/com.heywood8.monkeep/databases/money-tracker.db`

### Backup
Export your data: Settings → Export Data
```

**CHANGELOG.md entry:**
```markdown
## [Version X.X.0] - 2025-XX-XX

### Changed
- **Major:** Migrated financial data storage from AsyncStorage to SQLite
  - Unlimited storage capacity (no more 10MB limit)
  - Faster performance with large datasets
  - Enables advanced features (graphs, reports, search)
  - Automatic one-time migration from AsyncStorage

### Performance Improvements
- Operations list now handles 10,000+ transactions smoothly
- Date range queries 10-50x faster
- Balance updates are now atomic (no race conditions)

### Developer Notes
- New database layer in `app/database/`
- See migration guide in `.claude/plans/sqlite-migration.md`
```

---

## Testing Strategy

### Unit Tests

**Test File:** `app/database/__tests__/db.test.js`

```javascript
import { openDatabase, executeSql, executeTransaction } from '../db';
import { getAllAccounts, createAccount, updateAccount, deleteAccount } from '../AccountsDB';

describe('Database', () => {
  beforeAll(async () => {
    await openDatabase();
  });

  afterEach(async () => {
    // Clean up test data
    await executeSql('DELETE FROM accounts WHERE name LIKE ?', ['Test%']);
  });

  test('should create account', async () => {
    const account = {
      name: 'Test Account',
      balance: '100.00',
      currency: 'USD',
    };

    const created = await createAccount(account);
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Test Account');

    const accounts = await getAllAccounts();
    const found = accounts.find(a => a.id === created.id);
    expect(found).toBeDefined();
  });

  test('should update account', async () => {
    const account = await createAccount({
      name: 'Test Account',
      balance: '100.00',
      currency: 'USD',
    });

    await updateAccount(account.id, { name: 'Updated Name' });

    const accounts = await getAllAccounts();
    const updated = accounts.find(a => a.id === account.id);
    expect(updated.name).toBe('Updated Name');
  });

  test('should delete account', async () => {
    const account = await createAccount({
      name: 'Test Account',
      balance: '100.00',
      currency: 'USD',
    });

    await deleteAccount(account.id);

    const accounts = await getAllAccounts();
    const found = accounts.find(a => a.id === account.id);
    expect(found).toBeUndefined();
  });

  test('should handle transaction rollback', async () => {
    const accountsBefore = await getAllAccounts();

    try {
      await executeTransaction(async tx => {
        await createAccount({ name: 'Test 1', balance: '100', currency: 'USD' });
        await createAccount({ name: 'Test 2', balance: '200', currency: 'USD' });
        throw new Error('Force rollback');
      });
    } catch (error) {
      // Expected
    }

    const accountsAfter = await getAllAccounts();
    expect(accountsAfter.length).toBe(accountsBefore.length);
  });
});
```

### Integration Tests

**Test File:** `app/__tests__/integration/operations.test.js`

```javascript
import { openDatabase } from '../../database/db';
import * as AccountsDB from '../../database/AccountsDB';
import * as OperationsDB from '../../database/OperationsDB';

describe('Operations Integration', () => {
  let account1, account2;

  beforeAll(async () => {
    await openDatabase();

    account1 = await AccountsDB.createAccount({
      name: 'Test Account 1',
      balance: '1000.00',
      currency: 'USD',
    });

    account2 = await AccountsDB.createAccount({
      name: 'Test Account 2',
      balance: '500.00',
      currency: 'USD',
    });
  });

  afterAll(async () => {
    await AccountsDB.deleteAccount(account1.id);
    await AccountsDB.deleteAccount(account2.id);
  });

  test('should create expense and update balance', async () => {
    const operation = await OperationsDB.createOperation({
      type: 'expense',
      amount: '50.00',
      accountId: account1.id,
      categoryId: 'some-category-id',
      date: '2025-01-18',
    });

    // Manually update balance (in real app, context does this)
    await AccountsDB.updateAccountBalance(
      account1.id,
      '950.00'
    );

    const account = await AccountsDB.getAccountById(account1.id);
    expect(account.balance).toBe('950.00');

    await OperationsDB.deleteOperation(operation.id);
  });

  test('should handle transfer between accounts', async () => {
    const operation = await OperationsDB.createOperation({
      type: 'transfer',
      amount: '100.00',
      accountId: account1.id,
      toAccountId: account2.id,
      date: '2025-01-18',
    });

    // Update balances
    await AccountsDB.updateAccountBalance(account1.id, '900.00');
    await AccountsDB.updateAccountBalance(account2.id, '600.00');

    const acc1 = await AccountsDB.getAccountById(account1.id);
    const acc2 = await AccountsDB.getAccountById(account2.id);

    expect(acc1.balance).toBe('900.00');
    expect(acc2.balance).toBe('600.00');

    await OperationsDB.deleteOperation(operation.id);
  });
});
```

### Manual Testing Checklist

- [ ] **Fresh Install**
  - [ ] App launches without errors
  - [ ] Default categories appear
  - [ ] Can create account
  - [ ] Can create operation
  - [ ] Balance updates correctly

- [ ] **Migration from AsyncStorage**
  - [ ] All accounts migrated
  - [ ] All categories migrated
  - [ ] All operations migrated
  - [ ] Balances are correct
  - [ ] No duplicate data

- [ ] **CRUD Operations**
  - [ ] Create account → persists after restart
  - [ ] Update account → changes persist
  - [ ] Delete account → cascades to operations
  - [ ] Create operation → balance updates
  - [ ] Update operation → balance recalculates
  - [ ] Delete operation → balance restores

- [ ] **Performance**
  - [ ] List of 100 operations scrolls smoothly
  - [ ] List of 1000 operations loads quickly
  - [ ] Date range filtering is instant
  - [ ] Category filtering is instant

- [ ] **Edge Cases**
  - [ ] Delete account with many operations → no errors
  - [ ] Rapid operation creation → no race conditions
  - [ ] App restart during migration → recovers gracefully

---

## Rollback Plan

### If Critical Issues Arise Post-Deployment

**Scenario:** Users report data loss or app crashes after update

**Immediate Actions:**

1. **Revert to Previous Version**
   ```bash
   # Rollback app version in stores
   # This gives users the old AsyncStorage-based version
   ```

2. **Preserve User Data**
   - SQLite database file is preserved on device
   - AsyncStorage data (if not cleared) is also preserved
   - Users don't lose any data

3. **Hotfix Plan**
   - Option A: Ship hotfix with SQLite fixes
   - Option B: Ship interim version that reads from both SQLite and AsyncStorage
   - Option C: Ship version that exports SQLite to AsyncStorage (temporary rollback)

### Rollback to AsyncStorage (Emergency Only)

**File:** `app/database/rollbackToAsyncStorage.js`

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AccountsDB from './database/AccountsDB';
import * as CategoriesDB from './database/CategoriesDB';
import * as OperationsDB from './database/OperationsDB';

/**
 * Emergency rollback: Export SQLite data back to AsyncStorage
 * Only use if SQLite has critical bugs
 */
export async function rollbackToAsyncStorage() {
  try {
    console.log('Starting emergency rollback to AsyncStorage...');

    // Read from SQLite
    const accounts = await AccountsDB.getAllAccounts();
    const categories = await CategoriesDB.getAllCategories();
    const operations = await OperationsDB.getAllOperations();

    // Write to AsyncStorage
    await AsyncStorage.multiSet([
      ['accounts', JSON.stringify(accounts)],
      ['categories', JSON.stringify(categories)],
      ['operations', JSON.stringify(operations)],
    ]);

    // Mark rollback complete
    await AsyncStorage.setItem('rolled_back_from_sqlite', 'true');

    console.log('Rollback complete:', {
      accounts: accounts.length,
      categories: categories.length,
      operations: operations.length,
    });

    Alert.alert(
      'Data Restored',
      'Your data has been restored to the previous storage system. Please restart the app.',
      [{ text: 'OK' }]
    );

    return true;
  } catch (error) {
    console.error('Rollback failed:', error);
    Alert.alert(
      'Rollback Failed',
      'Could not restore data. Please contact support immediately.',
      [{ text: 'OK' }]
    );
    return false;
  }
}
```

**Trigger Rollback:**
- Add hidden button in Settings → About → (tap version 10 times)
- Or ship hotfix update with automatic rollback

---

## Performance Considerations

### Query Optimization

**1. Index Usage**

All queries should use indexes. Verify with `EXPLAIN QUERY PLAN`:

```sql
-- Good: Uses idx_operations_date
EXPLAIN QUERY PLAN
SELECT * FROM operations WHERE date BETWEEN '2025-01-01' AND '2025-01-31' ORDER BY date DESC;

-- Output: SEARCH operations USING INDEX idx_operations_date
```

**2. Limit Results for Lists**

For FlatList, initially load only recent operations:

```javascript
export async function getRecentOperations(limit = 100) {
  const result = await executeSql(
    'SELECT * FROM operations ORDER BY date DESC, created_at DESC LIMIT ?',
    [limit]
  );
  return result.rows;
}
```

**3. Pagination for Large Lists**

Implement infinite scroll with offset:

```javascript
export async function getOperationsPaginated(offset, limit = 50) {
  const result = await executeSql(
    'SELECT * FROM operations ORDER BY date DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return result.rows;
}
```

### Memory Optimization

**1. Don't Load All Operations at Once**

Instead of:
```javascript
const operations = await getAllOperations(); // Loads 10,000 operations
```

Do:
```javascript
const operations = await getRecentOperations(100); // Loads 100 operations
// Load more on scroll
```

**2. Use FlatList windowSize**

```javascript
<FlatList
  data={operations}
  windowSize={5}
  maxToRenderPerBatch={10}
  initialNumToRender={20}
  removeClippedSubviews={true}
/>
```

### Transaction Batching

**Batch multiple operations in one transaction:**

```javascript
async function importOperations(operations) {
  await executeTransaction(tx => {
    operations.forEach(op => {
      tx.executeSql(
        'INSERT INTO operations (id, type, amount, ...) VALUES (?, ?, ?, ...)',
        [op.id, op.type, op.amount, ...]
      );
    });
  });
}
```

**Benefits:**
- 10-100x faster than individual inserts
- Atomic: all or nothing
- Reduces disk I/O

---

## Future Enhancements

### Phase 2 Features (Enabled by SQLite)

**1. Advanced Filtering**
```sql
-- Filter by multiple criteria
SELECT * FROM operations
WHERE account_id = ?
  AND category_id IN (?, ?, ?)
  AND date BETWEEN ? AND ?
  AND CAST(amount AS REAL) > ?
ORDER BY date DESC;
```

**2. Aggregations for Reports**
```sql
-- Monthly spending by category
SELECT
  strftime('%Y-%m', date) as month,
  category_id,
  SUM(CAST(amount AS REAL)) as total
FROM operations
WHERE type = 'expense'
GROUP BY month, category_id
ORDER BY month DESC, total DESC;
```

**3. Full-Text Search**
```sql
-- Search operation descriptions
SELECT o.*
FROM operations o
JOIN operations_fts fts ON o.rowid = fts.rowid
WHERE operations_fts MATCH ?
ORDER BY rank;
```

**4. Balance History**
```sql
-- Calculate balance at any point in time
SELECT
  date,
  SUM(CASE
    WHEN type = 'income' THEN CAST(amount AS REAL)
    WHEN type = 'expense' THEN -CAST(amount AS REAL)
    ELSE 0
  END) OVER (ORDER BY date) as running_balance
FROM operations
WHERE account_id = ?
ORDER BY date;
```

**5. Category Analytics**
```sql
-- Top spending categories this month
SELECT
  c.name,
  SUM(CAST(o.amount AS REAL)) as total
FROM operations o
JOIN categories c ON o.category_id = c.id
WHERE o.type = 'expense'
  AND o.date >= date('now', 'start of month')
GROUP BY c.id
ORDER BY total DESC
LIMIT 10;
```

### Potential Optimizations

**1. Add Virtual Table for Search**
Already included in schema (FTS5)

**2. Materialized Views for Reports**
Pre-calculate common aggregations

**3. Archive Old Operations**
Move operations older than 2 years to archive table

**4. Database Compression**
SQLite already compresses, but could add VACUUM on schedule

---

## Timeline Summary

| Phase | Duration | Tasks | Deliverable |
|-------|----------|-------|-------------|
| **Phase 1** | 2 days | Database setup, schema, migrations | Working database layer |
| **Phase 2** | 1.5 days | Migrate AccountsContext | Accounts in SQLite |
| **Phase 3** | 1 day | Migrate CategoriesContext | Categories in SQLite |
| **Phase 4** | 2 days | Migrate OperationsContext | Operations in SQLite |
| **Phase 5** | 1.5 days | Testing & optimization | Verified migration |
| **Phase 6** | 1 day | Documentation & deployment | Released to users |
| **Total** | **8-10 days** | | **Production ready** |

---

## Success Metrics

### Technical Metrics

- ✅ All unit tests pass (>95% coverage)
- ✅ All integration tests pass
- ✅ Performance benchmarks met (see Phase 5)
- ✅ Zero data loss in migration
- ✅ No crashes in beta testing

### User Metrics

- ✅ App size increase < 1MB
- ✅ First launch time increase < 500ms
- ✅ Migration completes < 5 seconds (typical user)
- ✅ No user reports of data loss
- ✅ Positive feedback on performance

### Code Quality Metrics

- ✅ All database code documented
- ✅ Error handling in all CRUD operations
- ✅ Transaction usage for multi-operation changes
- ✅ No SQL injection vulnerabilities
- ✅ Proper index usage (verified with EXPLAIN)

---

## Conclusion

This migration plan provides a comprehensive, phased approach to moving Money Tracker's financial data from AsyncStorage to SQLite. The migration:

1. **Preserves Data:** Automatic migration with verification
2. **Improves Performance:** 10-50x faster for large datasets
3. **Enables Features:** Complex queries for graphs, reports, search
4. **Maintains Simplicity:** Settings remain in AsyncStorage
5. **Minimizes Risk:** Phased approach with rollback plan

**Next Steps:**
1. Review and approve this plan
2. Create implementation branch
3. Begin Phase 1 (database setup)
4. Follow phases sequentially
5. Deploy to beta users
6. Monitor and iterate

**Questions or concerns?** Review each phase and raise any issues before starting implementation.

---

**Document History:**
- v1.0 (2025-01-18): Initial plan created
