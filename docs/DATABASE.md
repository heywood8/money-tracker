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

The database consists of seven main tables:

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
  destination_currency: TEXT,
  original_balance: TEXT,        // balance before a balance-adjustment op (0006)
  latitude: TEXT,                // optional capture location (0009)
  longitude: TEXT,
  exclude_from_avg: INTEGER DEFAULT 0,    // 1 = out of the daily average / forecast only (0013)
  exclude_from_charts: INTEGER DEFAULT 0  // 1 = out of every chart (0023)
}
```

**Indexes**: `date`, `account_id`, `category_id`, `type`

**Analytic visibility**: `exclude_from_charts = 1` removes the operation from
every analytic surface — the expense/income donuts, the 12-month spending trend,
the category drill-down list, the summary totals and the burndown forecast —
while leaving its money in place (account balances, balance history and the
operations list are unaffected). Settable on balance adjustments too, from the
operations list's long-press menu, since their editor is read-only.
`exclude_from_avg` is narrower: it only keeps an operation out of the daily
average / burndown forecast and deliberately leaves it in the charts.

### 5. budgets (legacy — superseded by budget_plan_lines)

Per-category budget caps (Budgets v1). **Budgets v3 phase 2** consolidated this
model into `budget_plan_lines` as recurring lines (see below): every row here is
mirrored into a recurring `budget_plan_lines` row by a one-time, idempotent
bridge (`BudgetPlansDB.migrateLegacyBudgetsToRecurringLines`, gated by the
`post_migration_m0019_completed` `app_metadata` flag) — weekly/yearly amounts
are converted to their monthly equivalent (weekly × 365/12/7, yearly ÷ 12). The
table itself is kept **append-only** (never dropped) and is no longer read by
the app; it exists only for historical/backup continuity.

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

### 6. planned_operations (legacy — superseded by budget_plan_lines)

Templates for recurring or one-time planned expenses/income/transfers.
**Budgets v3 phase 3** absorbed this model into `budget_plan_lines`: every row
here is mirrored into a plan line carrying an executable template
(`kind` / `account_id` / `last_executed_month`) by a one-time, idempotent bridge
(`BudgetPlansDB.migratePlannedOperationsToLines`, gated by the
`post_migration_m0020_completed` `app_metadata` flag) — recurring templates
become recurring lines, one-time ones become one-off lines on the current
month's plan. Like `budgets`, the table is kept **append-only** (never dropped)
and is no longer read by the app; it exists only for historical/backup
continuity (an older backup still restores into it, and the same bridge then
converts it).

```javascript
{
  id: TEXT PRIMARY KEY,
  name: TEXT NOT NULL,
  type: TEXT NOT NULL,  // 'expense', 'income', or 'transfer'
  amount: TEXT NOT NULL,
  account_id: INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id: TEXT REFERENCES categories(id) ON DELETE SET NULL,
  to_account_id: INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  description: TEXT,
  is_recurring: INTEGER NOT NULL DEFAULT 1,
  last_executed_month: TEXT,  // ISO date string, tracks when last auto-applied
  display_order: INTEGER,
  created_at: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

**Indexes**: `account_id`, `type`, `is_recurring`

### 7. accounts_balance_history

Tracks daily end-of-day balances per account for the balance history graph:

```javascript
{
  id: INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id: INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date: TEXT NOT NULL,     // ISO date string (YYYY-MM-DD)
  balance: TEXT NOT NULL,  // String for precision
  created_at: TEXT NOT NULL
}
```

**Indexes**: `(account_id, date)` composite (unique), `date`

### 8. budget_plans (Budgets v2)

One monthly envelope-style plan per calendar month. The un-allocated remainder
(expected income − Σ allocation lines) is always computed, never stored.

`expected_income` itself is **legacy since Budgets v3 phase 3**: the month's
expected income is now the sum of its `kind = 'income'` lines, and migration
0020 bridges each plan's stored figure into such a line. The column is kept
append-only and is only read as a fallback for a plan that has no income line.

```javascript
{
  id: TEXT PRIMARY KEY,
  month: TEXT NOT NULL,             // YYYY-MM, unique — one plan per month
  currency: TEXT NOT NULL,
  expected_income: TEXT NOT NULL DEFAULT '0',
  created_at: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

**Indexes**: `month` (unique)

### 9. budget_plan_lines (Budgets v2 + v3)

Each line allocates an amount to exactly one tracking target: an expense
`category_id` or a transfer destination `to_account_id` (enforced in
`BudgetPlansDB`, not by SQL — a line whose target is deleted becomes "broken"
instead of crashing).

**Budgets v3 phase 2** (migration 0019) added `is_recurring` and `currency`,
and made `plan_id` nullable (a recreate-table migration, since SQLite has no
`ALTER COLUMN DROP NOT NULL`), turning this into the single "budget row" model
that also absorbs the old per-category `budgets` (v1) caps:

- `is_recurring = 0` (one-time): scoped to a single month via `plan_id`
  (the original Budgets v2 line). `currency` is usually NULL — it then inherits
  the parent plan's currency; since phase 3 a one-off line with a template
  carries the currency of its execution account. A one-time template is consumed
  (deleted) by its execution, exactly as a one-time planned operation was.
- `is_recurring = 1` (recurring): a global template, **not** tied to any one
  month's plan — `plan_id` is NULL. It applies to every calendar month
  automatically (mirroring how v1 `budgets` behaved) and carries its own
  `currency`, since it has no plan to inherit one from.

A month's full set of lines is the recurring lines UNION that month's one-off
lines (`BudgetPlansDB.getLinesForMonth`) — recurring lines show even for a
month that has no `budget_plans` row yet.

**Budgets v3 phase 3** (migration 0020) added `kind`, `account_id` and
`last_executed_month`, which turn a line into an optionally EXECUTABLE template
— the last of the three planning models folded into this one:

- `kind`: `'income'`, `'expense'` or `'transfer'`. NULL on pre-0020 rows, where
  the effective kind is inferred from the target (`to_account_id` set →
  transfer, otherwise expense).
- `account_id`: the account an execution touches — same meaning as
  `operations.account_id` (source for an expense/transfer, destination for
  income). Set = the line shows the execute action; NULL = a pure analytic
  target, exactly as before.
- `last_executed_month`: `YYYY-MM` of the last execution or manual
  "mark as done", like the old `planned_operations.last_executed_month`.

Executing a line inserts the real operation (dated today), marks the line for the
current month and — for a ONE-OFF template — deletes it, all in one transaction
(`BudgetPlansDB.executeLine`, the phase-3 home of the old
`PlannedOperationsDB.executeAndMark`).

Income lines declare the month's expected income: they are excluded from the
allocation total and have no per-line actual (the income section compares their
sum against the month's real income). They are the only lines allowed to have no
tracking target.

```javascript
{
  id: TEXT PRIMARY KEY,
  plan_id: TEXT REFERENCES budget_plans(id) ON DELETE CASCADE,  // NULL = recurring
  label: TEXT,                      // optional; falls back to the target's name
  amount: TEXT NOT NULL,
  comment: TEXT,
  category_id: TEXT REFERENCES categories(id) ON DELETE SET NULL,
  to_account_id: INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  sort_order: INTEGER NOT NULL DEFAULT 0,
  is_recurring: INTEGER NOT NULL DEFAULT 0,
  currency: TEXT,                   // NULL = inherit the plan's currency
  kind: TEXT,                       // 'income' | 'expense' | 'transfer' (NULL = legacy)
  account_id: INTEGER REFERENCES accounts(id) ON DELETE SET NULL,  // set = executable
  last_executed_month: TEXT,        // YYYY-MM of the last execution
  include_children: INTEGER NOT NULL DEFAULT 1,  // migration 0021, always 1 now
  group_id: TEXT REFERENCES budget_plan_line_groups(id) ON DELETE SET NULL,
  created_at: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

**Indexes**: `plan_id`, `is_recurring`, `kind`, `group_id`

Since **migration 0021** a line tracks a SET of categories via the
`budget_plan_line_categories` junction (line_id, category_id), which is the
source of truth; `category_id` above is the denormalized primary entry, kept for
the backup/Sheets shape. `include_children` survives from that migration but no
longer expresses a choice — descendant spending always rolls up.

### 10. budget_plan_line_groups (migration 0022)

An envelope over several `budget_plan_lines`. Members may mix category targets
from unrelated trees with transfer targets, and recurring lines with one-off
ones — membership is the only thing a group asserts.

Groups are **global**, like recurring lines: no `plan_id`, so a group outlives
any single month and renders in every month where at least one of its lines
does. That is what lets one group hold a recurring line (which belongs to no
plan) beside a one-off line (which belongs to exactly one).

- `amount` NULL — the default — means the group's budget is **derived**: the sum
  of its lines' targets, in whatever currency the screen is read in.
- A non-null `amount` is an explicit override and **replaces** the children's sum
  in the month's `allocated` total (`BudgetPlansDB.calculatePlanStatus`), so the
  figure on the group's row and the totals printed under it always agree.
  `currency` accompanies it (a group has no plan to inherit one from) and is
  cleared whenever the override is.
- A group's ACTUAL is always the sum of its children's actuals — an override
  changes the target, never what was really spent.

`budget_plan_lines.group_id` is ON DELETE SET NULL: deleting a group ungroups its
lines, it never deletes the budgets inside it.

```javascript
{
  id: TEXT PRIMARY KEY,
  label: TEXT NOT NULL,        // required: a group has no target to borrow a name from
  amount: TEXT,                // NULL = derived from the group's lines
  currency: TEXT,              // set only alongside an override amount
  sort_order: INTEGER NOT NULL DEFAULT 0,
  created_at: TEXT NOT NULL,
  updated_at: TEXT NOT NULL
}
```

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

### Startup Fast Path (schema fingerprint)

To keep the up-to-date cold start cheap, `initializeDatabase` (`app/services/db.js`)
stores a schema fingerprint in `PRAGMA user_version` after every fully successful
init, and on the next start reads that one value first. If it equals
`SCHEMA_VERSION`, the expensive schema-inspection + migration-detection sweep
(`isSchemaComplete`, `detectAppliedMigrations`, corruption re-scan) is skipped.

`SCHEMA_VERSION` is **derived** from the migrations journal
(`migrations.journal.entries.length`), so **adding a migration bumps it
automatically — there is nothing to hand-edit.** An existing install carries the
older fingerprint it was stamped with, so `stored !== SCHEMA_VERSION` and the full
migrate path runs; a pending migration can never be skipped by the fast path.

When you add a migration you still MUST keep `isSchemaComplete` and
`detectAppliedMigrations` in sync with the new column/table markers (they gate the
*slow* path that actually applies the migration for older installs). The fast path
only decides whether that slow path needs to run at all.

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
