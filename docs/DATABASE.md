# Database Architecture

This document describes the database architecture for the Penny personal finance tracking app, including the Drizzle ORM implementation, schema design, and development workflow.

## Overview

Penny uses **SQLite** as its local database with **Drizzle ORM** for type-safe schema management and queries. The app stores all financial data locally on the device using Expo SQLite.

### Technology Stack

- **Database**: SQLite (via `expo-sqlite`)
- **ORM**: Drizzle ORM for schema definition and queries
- **Migration Tool**: Drizzle Kit for generating and managing migrations
- **Query Builder**: Drizzle's type-safe query builder + raw SQL for complex operations

## Database Schema

The database consists of five main tables:

### 1. app_metadata

Tracks database version and migration status:

```javascript
{
  key: TEXT PRIMARY KEY,
  value: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

### 2. accounts

Financial accounts (bank accounts, cash, credit cards):

```javascript
{
  id: TEXT PRIMARY KEY,
  name: TEXT NOT NULL,
  balance: TEXT NOT NULL DEFAULT '0',  // Stored as string to avoid floating-point errors
  currency: TEXT NOT NULL DEFAULT 'USD',
  display_order: INTEGER,
  hidden: INTEGER DEFAULT 0,  // SQLite uses integers for booleans
  created_at: TEXT NOT NULL,  // ISO 8601 format
  updated_at: TEXT NOT NULL
}
```

**Indexes**: `display_order`, `hidden`

### 3. categories

Transaction categories with hierarchical structure:

```javascript
{
  id: TEXT PRIMARY KEY,
  name: TEXT NOT NULL,
  type: TEXT NOT NULL,  // 'folder' or 'entry'
  category_type: TEXT NOT NULL,  // 'expense' or 'income'
  parent_id: TEXT REFERENCES categories(id) ON DELETE CASCADE,
  icon: TEXT,
  color: TEXT,
  is_shadow: INTEGER DEFAULT 0,
  created_at: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

**Indexes**: `parent_id`, `type`, `category_type`, `is_shadow`

### 4. operations

Financial transactions (expenses, income, transfers):

```javascript
{
  id: TEXT PRIMARY KEY,
  type: TEXT NOT NULL,  // 'expense', 'income', or 'transfer'
  amount: TEXT NOT NULL,  // String for precision
  account_id: TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id: TEXT REFERENCES categories(id) ON DELETE SET NULL,
  to_account_id: TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  date: TEXT NOT NULL,  // ISO 8601 format
  created_at: TEXT NOT NULL,
  description: TEXT,
  exchange_rate: TEXT,
  destination_amount: TEXT,
  source_currency: TEXT,
  destination_currency: TEXT
}
```

**Indexes**: `date`, `account_id`, `category_id`, `type`

### 5. budgets

Budget tracking for categories:

```javascript
{
  id: TEXT PRIMARY KEY,
  category_id: TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount: TEXT NOT NULL,
  currency: TEXT NOT NULL,
  period_type: TEXT NOT NULL,  // 'weekly', 'monthly', or 'yearly'
  start_date: TEXT NOT NULL,
  end_date: TEXT,
  is_recurring: INTEGER DEFAULT 1,
  rollover_enabled: INTEGER DEFAULT 0,
  created_at: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

**Indexes**: `category_id`, `period_type`, `start_date`+`end_date`, `currency`, `is_recurring`

## Design Principles

### 1. Currency Precision

All monetary amounts are stored as **strings** (e.g., `"123.45"`) to avoid floating-point precision errors. The `app/services/currency.js` module handles all currency arithmetic using integer cents internally:

```javascript
// ✓ Correct: stored as string
balance: "123.45"

// ✗ Wrong: floating-point can cause errors
balance: 123.45
```

### 2. Date Storage

All dates are stored as **ISO 8601 strings** in UTC:

```javascript
created_at: "2025-12-03T10:30:00.000Z"
date: "2025-12-03"
```

### 3. Boolean Values

SQLite uses **integers for booleans** (0 = false, 1 = true):

```javascript
hidden: 0  // Not hidden
is_shadow: 1  // Is shadow category
```

### 4. Foreign Key Constraints

All foreign keys use appropriate cascade behaviors:

- **ON DELETE CASCADE**: When parent is deleted, children are deleted (e.g., deleting account deletes its operations)
- **ON DELETE SET NULL**: When parent is deleted, children keep orphaned (e.g., deleting category doesn't delete operations)

### 5. Indexes

Strategic indexes are created for:
- Foreign key columns (e.g., `account_id`, `category_id`)
- Frequently filtered columns (e.g., `date`, `type`, `hidden`)
- Sorting columns (e.g., `display_order`)

## Drizzle ORM Implementation

### File Structure

```
app/
├── db/
│   ├── schema.js          # Unified database schema and migration utilities
├── services/
│   ├── db.js              # Database wrapper (Drizzle + raw SQL)
│   ├── AccountsDB.js      # Account operations
│   ├── CategoriesDB.js    # Category operations
│   ├── OperationsDB.js    # Transaction operations
│   └── currency.js        # Currency arithmetic
drizzle/                   # Generated migration files
drizzle.config.js          # Drizzle Kit configuration
```

### Schema Definition

The schema is defined in `app/db/schema.js` using Drizzle's declarative syntax:

```javascript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  balance: text('balance').notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  displayOrder: integer('display_order'),
  hidden: integer('hidden').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  orderIdx: index('idx_accounts_order').on(table.displayOrder),
  hiddenIdx: index('idx_accounts_hidden').on(table.hidden),
}));
```

### Database Initialization

The `app/services/db.js` module provides two ways to access the database:

```javascript
import { getDatabase, getDrizzle } from './services/db';

// Option 1: Get both raw SQLite and Drizzle instances
const { raw, drizzle: db } = await getDatabase();

// Option 2: Get only Drizzle instance (most common)
const db = await getDrizzle();
```

### Query Patterns

#### Using Drizzle (Recommended for new code)

Type-safe queries with IntelliSense support:

```javascript
import { getDrizzle } from './services/db';
import { eq, and, desc, asc } from 'drizzle-orm';
import { accounts, operations } from '../db/schema';

// SELECT
const db = await getDrizzle();
const allAccounts = await db.select()
  .from(accounts)
  .where(eq(accounts.hidden, 0))
  .orderBy(asc(accounts.displayOrder));

// INSERT
await db.insert(accounts).values({
  id: uuid.v4(),
  name: 'Checking Account',
  balance: '1000.00',
  currency: 'USD',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// UPDATE
await db.update(accounts)
  .set({ balance: '1500.00', updatedAt: new Date().toISOString() })
  .where(eq(accounts.id, accountId));

// DELETE
await db.delete(accounts)
  .where(eq(accounts.id, accountId));

// JOIN
const accountsWithOperations = await db.select()
  .from(accounts)
  .leftJoin(operations, eq(operations.accountId, accounts.id))
  .where(eq(accounts.hidden, 0));
```

#### Using Raw SQL (For complex operations)

The legacy SQL functions remain available for complex transactions:

```javascript
import { executeQuery, queryAll, queryFirst, executeTransaction } from './services/db';

// Simple query
const accounts = await queryAll('SELECT * FROM accounts WHERE hidden = 0');

// Query with parameters
const account = await queryFirst('SELECT * FROM accounts WHERE id = ?', [accountId]);

// Transaction with multiple steps
await executeTransaction(async (db) => {
  const account = db.getFirstSync('SELECT balance FROM accounts WHERE id = ?', [accountId]);
  const newBalance = calculateNewBalance(account.balance, amount);

  db.runSync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
    [newBalance, new Date().toISOString(), accountId]);

  db.runSync('INSERT INTO operations (id, type, amount, account_id, date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [uuid.v4(), 'expense', amount, accountId, date, new Date().toISOString()]);
});
```

### Hybrid Approach

Services use a **hybrid approach** combining Drizzle and raw SQL:

- **Simple queries** → Use Drizzle for type safety and clean syntax
- **Complex transactions** → Use raw SQL for precise control
- **Performance-critical** → Benchmark and use the faster approach

Example from `app/services/AccountsDB.js`:

```javascript
// Drizzle for simple reads
export const getAllAccounts = async () => {
  const db = await getDrizzle();
  return await db.select()
    .from(accounts)
    .where(eq(accounts.hidden, 0))
    .orderBy(asc(accounts.displayOrder), desc(accounts.createdAt));
};

// Raw SQL for complex multi-step operations
export const adjustAccountBalance = async (accountId, newBalance, description) => {
  await executeTransaction(async (db) => {
    const account = db.getFirstSync('SELECT balance FROM accounts WHERE id = ?', [accountId]);
    const difference = subtract(newBalance, account.balance);

    db.runSync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
      [newBalance, new Date().toISOString(), accountId]);

    db.runSync('INSERT INTO operations (id, type, amount, account_id, description, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid.v4(), difference >= 0 ? 'income' : 'expense', Math.abs(difference), accountId, description, new Date().toISOString(), new Date().toISOString()]);
  });
};
```

## Migration Workflow

### Generating Migrations

When you modify the schema in `app/db/schema.js`, generate migration files:

```bash
npm run db:generate
```

This creates timestamped SQL migration files in the `drizzle/` directory.

### Migration Tracking

Drizzle automatically tracks applied migrations in the `__drizzle_migrations` table (created automatically). This prevents:
- Re-applying the same migration
- Inconsistent schema states
- Manual version tracking

### Database Studio (Limited Support)

Drizzle Kit includes a browser-based database viewer:

```bash
npm run db:studio
```

**Note:** This may not work well with Expo SQLite since the database is on the device/emulator, not the host machine.

## Data Persistence Strategy

### SQLite Database

All persistent financial data is stored in the SQLite database (`penny.db`):
- Accounts
- Categories
- Operations (transactions)
- Budgets
- App metadata

### AsyncStorage

Application preferences are stored separately in AsyncStorage:
- Theme preference (`theme_preference`)
- Language preference (`app_language`)

## Data Integrity

### Transaction Safety

All multi-step operations use SQLite transactions for atomicity:

```javascript
await executeTransaction(async (db) => {
  // Multiple operations here
  // Either all succeed or all are rolled back
});
```

### Foreign Key Constraints

Foreign keys are enforced by SQLite to maintain referential integrity:

```javascript
// Deleting an account cascades to its operations
account_id: text('account_id')
  .notNull()
  .references(() => accounts.id, { onDelete: 'cascade' })

// Deleting a category sets operations.category_id to NULL
category_id: text('category_id')
  .references(() => categories.id, { onDelete: 'set null' })
```

### Currency Precision

The `app/services/currency.js` module ensures accurate financial calculations:

```javascript
import { add, subtract, multiply, divide } from './services/currency';

// All operations use integer arithmetic internally
const total = add("123.45", "67.89");  // Returns "191.34"
const difference = subtract("100.00", "33.33");  // Returns "66.67"
```

## Testing

### Test Database

Tests use the same database layer with mocked SQLite:

```javascript
// In jest.setup.js
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    closeAsync: jest.fn(),
  })),
}));
```

### Test Structure

Tests are organized in `__tests__/`:
- `contexts/` - Context provider tests
- `services/` - Business logic and utility tests
- `integration/` - End-to-end workflow tests
- `components/` - UI component tests (future)

See `CLAUDE.md` for detailed testing patterns and best practices.

## Performance Considerations

### Indexes

Strategic indexes are created for frequently queried columns:
- Foreign keys for JOIN operations
- Date fields for range queries
- Type/status fields for filtering

### Query Optimization

- Use `WHERE` clauses to filter data at the database level
- Add indexes for columns used in `WHERE` and `ORDER BY`
- Use transactions for batch operations
- Avoid N+1 queries by using JOINs

### Data Volume

SQLite handles thousands of transactions efficiently. For very large datasets (>100k records):
- Consider archiving old data
- Use pagination for list views
- Add composite indexes for complex queries

## Backup and Recovery

### Manual Backup

To manually backup the database:

```javascript
import { getDatabase } from './services/db';

const { raw: db } = await getDatabase();
// Access database file at: db._filepath
```

### Database File Location

The SQLite database file is stored at:
```
{expo-file-system}/SQLite/penny.db
```

## Development Tools

### Drizzle Kit Commands

```bash
# Generate migrations from schema changes
npm run db:generate

# View database in browser (limited support with Expo)
npm run db:studio

# Push schema changes directly (development only, not recommended)
npx drizzle-kit push:sqlite
```

### Database Inspection

Use SQLite tools to inspect the database on device/emulator:

```bash
# Android
adb shell "run-as com.heywood8.monkeep cat /data/data/com.heywood8.monkeep/databases/penny.db" > penny.db

# Then open with any SQLite browser
sqlite3 penny.db
```

## Future Improvements

1. **TypeScript Migration** - Convert schema to TypeScript for enhanced type safety
2. **Query Optimization** - Profile and optimize slow queries
3. **Full Drizzle Adoption** - Migrate all raw SQL to Drizzle queries where appropriate
4. **Schema Versioning** - Implement explicit version tracking in app_metadata
5. **Cloud Sync** - Consider adding optional cloud backup/sync
6. **Data Export** - Add CSV/JSON export functionality
7. **Testing Improvements** - Use Drizzle's testing utilities for better test coverage

## Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle with Expo SQLite](https://orm.drizzle.team/docs/get-started-sqlite#expo-sqlite)
- [Drizzle Kit CLI](https://orm.drizzle.team/kit-docs/overview)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
