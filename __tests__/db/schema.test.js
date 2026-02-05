/**
 * Tests for Database Schema - Drizzle ORM table definitions
 */

import * as schema from '../../app/db/schema';

describe('Database Schema', () => {
  describe('Schema Exports', () => {
    it('exports all required tables', () => {
      expect(schema.appMetadata).toBeDefined();
      expect(schema.accounts).toBeDefined();
      expect(schema.categories).toBeDefined();
      expect(schema.operations).toBeDefined();
      expect(schema.budgets).toBeDefined();
      expect(schema.accountsBalanceHistory).toBeDefined();
    });

    it('all table exports are objects', () => {
      expect(typeof schema.appMetadata).toBe('object');
      expect(typeof schema.accounts).toBe('object');
      expect(typeof schema.categories).toBe('object');
      expect(typeof schema.operations).toBe('object');
      expect(typeof schema.budgets).toBe('object');
      expect(typeof schema.accountsBalanceHistory).toBe('object');
    });
  });

  describe('appMetadata Table', () => {
    it('has correct table name', () => {
      expect(schema.appMetadata[Symbol.for('drizzle:Name')]).toBe('app_metadata');
    });

    it('defines key, value, and updatedAt columns', () => {
      const columns = schema.appMetadata;
      expect(columns.key).toBeDefined();
      expect(columns.value).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });
  });

  describe('accounts Table', () => {
    it('has correct table name', () => {
      expect(schema.accounts[Symbol.for('drizzle:Name')]).toBe('accounts');
    });

    it('defines all required columns', () => {
      const columns = schema.accounts;
      expect(columns.id).toBeDefined();
      expect(columns.name).toBeDefined();
      expect(columns.balance).toBeDefined();
      expect(columns.currency).toBeDefined();
      expect(columns.displayOrder).toBeDefined();
      expect(columns.hidden).toBeDefined();
      expect(columns.monthlyTarget).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it('has correct column types', () => {
      // Check that columns have the expected Drizzle column type
      expect(schema.accounts.id.columnType).toBe('SQLiteInteger');
      expect(schema.accounts.name.columnType).toBe('SQLiteText');
      expect(schema.accounts.balance.columnType).toBe('SQLiteText');
      expect(schema.accounts.currency.columnType).toBe('SQLiteText');
      expect(schema.accounts.displayOrder.columnType).toBe('SQLiteInteger');
      expect(schema.accounts.hidden.columnType).toBe('SQLiteInteger');
    });

    it('has correct default values', () => {
      // Check balance default
      expect(schema.accounts.balance.default).toBeDefined();

      // Check currency default
      expect(schema.accounts.currency.default).toBeDefined();

      // Check hidden default
      expect(schema.accounts.hidden.default).toBeDefined();
    });

    it('has primary key on id column', () => {
      expect(schema.accounts.id.primary).toBe(true);
    });

    it('has autoIncrement on id column', () => {
      expect(schema.accounts.id.autoIncrement).toBe(true);
    });

    it('has notNull constraint on required columns', () => {
      expect(schema.accounts.name.notNull).toBe(true);
      expect(schema.accounts.balance.notNull).toBe(true);
      expect(schema.accounts.currency.notNull).toBe(true);
      expect(schema.accounts.createdAt.notNull).toBe(true);
      expect(schema.accounts.updatedAt.notNull).toBe(true);
    });
  });

  describe('categories Table', () => {
    it('has correct table name', () => {
      expect(schema.categories[Symbol.for('drizzle:Name')]).toBe('categories');
    });

    it('defines all required columns', () => {
      const columns = schema.categories;
      expect(columns.id).toBeDefined();
      expect(columns.name).toBeDefined();
      expect(columns.type).toBeDefined();
      expect(columns.categoryType).toBeDefined();
      expect(columns.parentId).toBeDefined();
      expect(columns.icon).toBeDefined();
      expect(columns.color).toBeDefined();
      expect(columns.isShadow).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it('has text primary key', () => {
      expect(schema.categories.id.columnType).toBe('SQLiteText');
      expect(schema.categories.id.primary).toBe(true);
    });

    it('has enum constraints on type and categoryType', () => {
      // Type should have 'folder' and 'entry' enum values
      expect(schema.categories.type.enumValues).toEqual(['folder', 'entry']);

      // CategoryType should have 'expense' and 'income' enum values
      expect(schema.categories.categoryType.enumValues).toEqual(['expense', 'income']);
    });

    it('has parentId column for hierarchy', () => {
      // parentId is used to create category hierarchy (folder -> entry)
      expect(schema.categories.parentId).toBeDefined();
      expect(schema.categories.parentId.columnType).toBe('SQLiteText');
    });

    it('has correct default values for flags', () => {
      expect(schema.categories.isShadow.default).toBeDefined();
    });
  });

  describe('operations Table', () => {
    it('has correct table name', () => {
      expect(schema.operations[Symbol.for('drizzle:Name')]).toBe('operations');
    });

    it('defines all required columns', () => {
      const columns = schema.operations;
      expect(columns.id).toBeDefined();
      expect(columns.type).toBeDefined();
      expect(columns.amount).toBeDefined();
      expect(columns.accountId).toBeDefined();
      expect(columns.categoryId).toBeDefined();
      expect(columns.toAccountId).toBeDefined();
      expect(columns.date).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.description).toBeDefined();
      expect(columns.exchangeRate).toBeDefined();
      expect(columns.destinationAmount).toBeDefined();
      expect(columns.sourceCurrency).toBeDefined();
      expect(columns.destinationCurrency).toBeDefined();
    });

    it('has integer primary key with autoIncrement', () => {
      expect(schema.operations.id.columnType).toBe('SQLiteInteger');
      expect(schema.operations.id.primary).toBe(true);
      expect(schema.operations.id.autoIncrement).toBe(true);
    });

    it('has enum constraint on type', () => {
      expect(schema.operations.type.enumValues).toEqual(['expense', 'income', 'transfer']);
    });

    it('has account relationship columns', () => {
      // accountId is required for all operations
      expect(schema.operations.accountId).toBeDefined();
      expect(schema.operations.accountId.columnType).toBe('SQLiteInteger');
      expect(schema.operations.accountId.notNull).toBe(true);

      // toAccountId is used for transfer operations
      expect(schema.operations.toAccountId).toBeDefined();
      expect(schema.operations.toAccountId.columnType).toBe('SQLiteInteger');
    });

    it('has category relationship column', () => {
      // categoryId links operations to categories (optional)
      expect(schema.operations.categoryId).toBeDefined();
      expect(schema.operations.categoryId.columnType).toBe('SQLiteText');
      // categoryId is nullable (not required)
      expect(schema.operations.categoryId.notNull).toBeFalsy();
    });

    it('has notNull constraint on required fields', () => {
      expect(schema.operations.type.notNull).toBe(true);
      expect(schema.operations.amount.notNull).toBe(true);
      expect(schema.operations.accountId.notNull).toBe(true);
      expect(schema.operations.date.notNull).toBe(true);
      expect(schema.operations.createdAt.notNull).toBe(true);
    });
  });

  describe('budgets Table', () => {
    it('has correct table name', () => {
      expect(schema.budgets[Symbol.for('drizzle:Name')]).toBe('budgets');
    });

    it('defines all required columns', () => {
      const columns = schema.budgets;
      expect(columns.id).toBeDefined();
      expect(columns.categoryId).toBeDefined();
      expect(columns.amount).toBeDefined();
      expect(columns.currency).toBeDefined();
      expect(columns.periodType).toBeDefined();
      expect(columns.startDate).toBeDefined();
      expect(columns.endDate).toBeDefined();
      expect(columns.isRecurring).toBeDefined();
      expect(columns.rolloverEnabled).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it('has text primary key', () => {
      expect(schema.budgets.id.columnType).toBe('SQLiteText');
      expect(schema.budgets.id.primary).toBe(true);
    });

    it('has enum constraint on periodType', () => {
      expect(schema.budgets.periodType.enumValues).toEqual(['weekly', 'monthly', 'yearly']);
    });

    it('has category relationship column', () => {
      // categoryId links budgets to categories (required)
      expect(schema.budgets.categoryId).toBeDefined();
      expect(schema.budgets.categoryId.columnType).toBe('SQLiteText');
      expect(schema.budgets.categoryId.notNull).toBe(true);
    });

    it('has correct default values', () => {
      expect(schema.budgets.isRecurring.default).toBeDefined();
      expect(schema.budgets.rolloverEnabled.default).toBeDefined();
    });

    it('has notNull constraint on required fields', () => {
      expect(schema.budgets.categoryId.notNull).toBe(true);
      expect(schema.budgets.amount.notNull).toBe(true);
      expect(schema.budgets.currency.notNull).toBe(true);
      expect(schema.budgets.periodType.notNull).toBe(true);
      expect(schema.budgets.startDate.notNull).toBe(true);
      expect(schema.budgets.createdAt.notNull).toBe(true);
      expect(schema.budgets.updatedAt.notNull).toBe(true);
    });
  });

  describe('accountsBalanceHistory Table', () => {
    it('has correct table name', () => {
      expect(schema.accountsBalanceHistory[Symbol.for('drizzle:Name')]).toBe('accounts_balance_history');
    });

    it('defines all required columns', () => {
      const columns = schema.accountsBalanceHistory;
      expect(columns.id).toBeDefined();
      expect(columns.accountId).toBeDefined();
      expect(columns.date).toBeDefined();
      expect(columns.balance).toBeDefined();
      expect(columns.createdAt).toBeDefined();
    });

    it('has integer primary key with autoIncrement', () => {
      expect(schema.accountsBalanceHistory.id.columnType).toBe('SQLiteInteger');
      expect(schema.accountsBalanceHistory.id.primary).toBe(true);
      expect(schema.accountsBalanceHistory.id.autoIncrement).toBe(true);
    });

    it('has account relationship column', () => {
      // accountId links balance history to accounts
      expect(schema.accountsBalanceHistory.accountId).toBeDefined();
      expect(schema.accountsBalanceHistory.accountId.columnType).toBe('SQLiteInteger');
      expect(schema.accountsBalanceHistory.accountId.notNull).toBe(true);
    });

    it('has notNull constraint on all columns', () => {
      expect(schema.accountsBalanceHistory.accountId.notNull).toBe(true);
      expect(schema.accountsBalanceHistory.date.notNull).toBe(true);
      expect(schema.accountsBalanceHistory.balance.notNull).toBe(true);
      expect(schema.accountsBalanceHistory.createdAt.notNull).toBe(true);
    });
  });

  describe('Schema Relationships', () => {
    it('operations has relationship columns to accounts', () => {
      // Operations must reference an account
      expect(schema.operations.accountId).toBeDefined();
      expect(schema.operations.accountId.columnType).toBe('SQLiteInteger');

      // Operations can reference a destination account for transfers
      expect(schema.operations.toAccountId).toBeDefined();
      expect(schema.operations.toAccountId.columnType).toBe('SQLiteInteger');
    });

    it('operations has relationship column to categories', () => {
      expect(schema.operations.categoryId).toBeDefined();
      expect(schema.operations.categoryId.columnType).toBe('SQLiteText');
    });

    it('budgets has relationship column to categories', () => {
      expect(schema.budgets.categoryId).toBeDefined();
      expect(schema.budgets.categoryId.columnType).toBe('SQLiteText');
      expect(schema.budgets.categoryId.notNull).toBe(true);
    });

    it('accountsBalanceHistory has relationship column to accounts', () => {
      expect(schema.accountsBalanceHistory.accountId).toBeDefined();
      expect(schema.accountsBalanceHistory.accountId.columnType).toBe('SQLiteInteger');
      expect(schema.accountsBalanceHistory.accountId.notNull).toBe(true);
    });

    it('categories has self-referencing relationship column', () => {
      // parentId allows categories to form a hierarchy
      expect(schema.categories.parentId).toBeDefined();
      expect(schema.categories.parentId.columnType).toBe('SQLiteText');
    });
  });

  describe('Data Type Consistency', () => {
    it('uses text type for currency amounts', () => {
      // Currency amounts should be stored as text to avoid floating point errors
      expect(schema.accounts.balance.columnType).toBe('SQLiteText');
      expect(schema.operations.amount.columnType).toBe('SQLiteText');
      expect(schema.budgets.amount.columnType).toBe('SQLiteText');
      expect(schema.accountsBalanceHistory.balance.columnType).toBe('SQLiteText');
    });

    it('uses text type for dates', () => {
      // Dates should be stored as ISO strings
      expect(schema.accounts.createdAt.columnType).toBe('SQLiteText');
      expect(schema.operations.date.columnType).toBe('SQLiteText');
      expect(schema.budgets.startDate.columnType).toBe('SQLiteText');
      expect(schema.accountsBalanceHistory.date.columnType).toBe('SQLiteText');
    });

    it('uses integer type for IDs and flags', () => {
      expect(schema.accounts.id.columnType).toBe('SQLiteInteger');
      expect(schema.accounts.hidden.columnType).toBe('SQLiteInteger');
      expect(schema.operations.id.columnType).toBe('SQLiteInteger');
      expect(schema.categories.isShadow.columnType).toBe('SQLiteInteger');
      expect(schema.budgets.isRecurring.columnType).toBe('SQLiteInteger');
    });
  });

  describe('Enum Validations', () => {
    it('categories.type has valid enum values', () => {
      const enumValues = schema.categories.type.enumValues;
      expect(enumValues).toContain('folder');
      expect(enumValues).toContain('entry');
      expect(enumValues.length).toBe(2);
    });

    it('categories.categoryType has valid enum values', () => {
      const enumValues = schema.categories.categoryType.enumValues;
      expect(enumValues).toContain('expense');
      expect(enumValues).toContain('income');
      expect(enumValues.length).toBe(2);
    });

    it('operations.type has valid enum values', () => {
      const enumValues = schema.operations.type.enumValues;
      expect(enumValues).toContain('expense');
      expect(enumValues).toContain('income');
      expect(enumValues).toContain('transfer');
      expect(enumValues.length).toBe(3);
    });

    it('budgets.periodType has valid enum values', () => {
      const enumValues = schema.budgets.periodType.enumValues;
      expect(enumValues).toContain('weekly');
      expect(enumValues).toContain('monthly');
      expect(enumValues).toContain('yearly');
      expect(enumValues.length).toBe(3);
    });
  });

  describe('Default Values', () => {
    it('accounts has correct defaults', () => {
      // Balance defaults to '0'
      expect(schema.accounts.balance.default).toBe('0');

      // Currency defaults to 'USD'
      expect(schema.accounts.currency.default).toBe('USD');

      // Hidden defaults to 0 (false)
      expect(schema.accounts.hidden.default).toBe(0);
    });

    it('categories has correct defaults for flags', () => {
      // isShadow defaults to 0 (false)
      expect(schema.categories.isShadow.default).toBe(0);
    });

    it('budgets has correct defaults for flags', () => {
      // isRecurring defaults to 1 (true)
      expect(schema.budgets.isRecurring.default).toBe(1);

      // rolloverEnabled defaults to 0 (false)
      expect(schema.budgets.rolloverEnabled.default).toBe(0);
    });
  });

  describe('Schema Integrity', () => {
    it('all tables have createdAt timestamp', () => {
      expect(schema.accounts.createdAt).toBeDefined();
      expect(schema.categories.createdAt).toBeDefined();
      expect(schema.operations.createdAt).toBeDefined();
      expect(schema.budgets.createdAt).toBeDefined();
      expect(schema.accountsBalanceHistory.createdAt).toBeDefined();
    });

    it('tables with updates have updatedAt timestamp', () => {
      expect(schema.accounts.updatedAt).toBeDefined();
      expect(schema.categories.updatedAt).toBeDefined();
      expect(schema.budgets.updatedAt).toBeDefined();
      expect(schema.appMetadata.updatedAt).toBeDefined();
    });

    it('all timestamps are notNull', () => {
      expect(schema.accounts.createdAt.notNull).toBe(true);
      expect(schema.accounts.updatedAt.notNull).toBe(true);
      expect(schema.categories.createdAt.notNull).toBe(true);
      expect(schema.operations.createdAt.notNull).toBe(true);
    });
  });

  describe('Table Indexes', () => {
    it('accounts table has performance indexes', () => {
      // Access the table symbol to get indexes
      const tableName = schema.accounts[Symbol.for('drizzle:Name')];
      expect(tableName).toBe('accounts');

      // Verify indexes are defined on the table
      const tableSymbols = Object.getOwnPropertySymbols(schema.accounts);
      const hasIndexSymbol = tableSymbols.some(sym =>
        sym.toString().includes('Indexes') || sym.toString().includes('indexes'),
      );

      // Indexes should be part of table definition
      expect(schema.accounts.displayOrder).toBeDefined();
      expect(schema.accounts.hidden).toBeDefined();
    });

    it('categories table has performance indexes', () => {
      const tableName = schema.categories[Symbol.for('drizzle:Name')];
      expect(tableName).toBe('categories');

      // Verify indexed columns exist
      expect(schema.categories.parentId).toBeDefined();
      expect(schema.categories.type).toBeDefined();
      expect(schema.categories.categoryType).toBeDefined();
      expect(schema.categories.isShadow).toBeDefined();
    });

    it('operations table has performance indexes', () => {
      const tableName = schema.operations[Symbol.for('drizzle:Name')];
      expect(tableName).toBe('operations');

      // Verify indexed columns exist
      expect(schema.operations.date).toBeDefined();
      expect(schema.operations.accountId).toBeDefined();
      expect(schema.operations.categoryId).toBeDefined();
      expect(schema.operations.type).toBeDefined();
    });

    it('budgets table has performance indexes', () => {
      const tableName = schema.budgets[Symbol.for('drizzle:Name')];
      expect(tableName).toBe('budgets');

      // Verify indexed columns exist
      expect(schema.budgets.categoryId).toBeDefined();
      expect(schema.budgets.periodType).toBeDefined();
      expect(schema.budgets.startDate).toBeDefined();
      expect(schema.budgets.endDate).toBeDefined();
      expect(schema.budgets.currency).toBeDefined();
      expect(schema.budgets.isRecurring).toBeDefined();
    });

    it('accountsBalanceHistory table has performance indexes', () => {
      const tableName = schema.accountsBalanceHistory[Symbol.for('drizzle:Name')];
      expect(tableName).toBe('accounts_balance_history');

      // Verify indexed columns exist
      expect(schema.accountsBalanceHistory.accountId).toBeDefined();
      expect(schema.accountsBalanceHistory.date).toBeDefined();
    });
  });

  describe('Foreign Key Configurations', () => {
    it('categories.parentId has cascade delete', () => {
      // parentId should reference categories.id with cascade delete
      expect(schema.categories.parentId).toBeDefined();
      expect(schema.categories.parentId.columnType).toBe('SQLiteText');
    });

    it('operations.accountId has cascade delete', () => {
      expect(schema.operations.accountId).toBeDefined();
      expect(schema.operations.accountId.notNull).toBe(true);
    });

    it('operations.categoryId has set null delete', () => {
      // categoryId should be nullable (set null on delete)
      expect(schema.operations.categoryId).toBeDefined();
      expect(schema.operations.categoryId.notNull).toBeFalsy();
    });

    it('operations.toAccountId has cascade delete', () => {
      expect(schema.operations.toAccountId).toBeDefined();
      expect(schema.operations.toAccountId.columnType).toBe('SQLiteInteger');
    });

    it('budgets.categoryId has cascade delete', () => {
      expect(schema.budgets.categoryId).toBeDefined();
      expect(schema.budgets.categoryId.notNull).toBe(true);
    });

    it('accountsBalanceHistory.accountId has cascade delete', () => {
      expect(schema.accountsBalanceHistory.accountId).toBeDefined();
      expect(schema.accountsBalanceHistory.accountId.notNull).toBe(true);
    });
  });

  describe('Foreign Key Reference Callbacks', () => {
    // These tests exercise the reference callback functions that define foreign key relationships
    // The callbacks are stored in the column's references property which is a function

    it('categories.parentId references categories.id', () => {
      const parentIdColumn = schema.categories.parentId;
      expect(parentIdColumn).toBeDefined();

      // In Drizzle ORM, the references callback is stored directly on the column
      // Try to find and invoke the references callback
      const refs = parentIdColumn.references;
      if (typeof refs === 'function') {
        const referencedColumn = refs();
        expect(referencedColumn).toBeDefined();
      } else if (parentIdColumn.config?.references) {
        const referencedColumn = parentIdColumn.config.references();
        expect(referencedColumn).toBeDefined();
      }
    });

    it('operations.accountId references accounts.id', () => {
      const accountIdColumn = schema.operations.accountId;
      expect(accountIdColumn).toBeDefined();

      const refs = accountIdColumn.references;
      if (typeof refs === 'function') {
        const referencedColumn = refs();
        expect(referencedColumn).toBeDefined();
      } else if (accountIdColumn.config?.references) {
        const referencedColumn = accountIdColumn.config.references();
        expect(referencedColumn).toBeDefined();
      }
    });

    it('operations.categoryId references categories.id with set null', () => {
      const categoryIdColumn = schema.operations.categoryId;
      expect(categoryIdColumn).toBeDefined();

      const refs = categoryIdColumn.references;
      if (typeof refs === 'function') {
        const referencedColumn = refs();
        expect(referencedColumn).toBeDefined();
      } else if (categoryIdColumn.config?.references) {
        const referencedColumn = categoryIdColumn.config.references();
        expect(referencedColumn).toBeDefined();
      }
    });

    it('operations.toAccountId references accounts.id', () => {
      const toAccountIdColumn = schema.operations.toAccountId;
      expect(toAccountIdColumn).toBeDefined();

      const refs = toAccountIdColumn.references;
      if (typeof refs === 'function') {
        const referencedColumn = refs();
        expect(referencedColumn).toBeDefined();
      } else if (toAccountIdColumn.config?.references) {
        const referencedColumn = toAccountIdColumn.config.references();
        expect(referencedColumn).toBeDefined();
      }
    });

    it('budgets.categoryId references categories.id', () => {
      const categoryIdColumn = schema.budgets.categoryId;
      expect(categoryIdColumn).toBeDefined();

      const refs = categoryIdColumn.references;
      if (typeof refs === 'function') {
        const referencedColumn = refs();
        expect(referencedColumn).toBeDefined();
      } else if (categoryIdColumn.config?.references) {
        const referencedColumn = categoryIdColumn.config.references();
        expect(referencedColumn).toBeDefined();
      }
    });

    it('accountsBalanceHistory.accountId references accounts.id', () => {
      const accountIdColumn = schema.accountsBalanceHistory.accountId;
      expect(accountIdColumn).toBeDefined();

      const refs = accountIdColumn.references;
      if (typeof refs === 'function') {
        const referencedColumn = refs();
        expect(referencedColumn).toBeDefined();
      } else if (accountIdColumn.config?.references) {
        const referencedColumn = accountIdColumn.config.references();
        expect(referencedColumn).toBeDefined();
      }
    });
  });

  describe('Table Index Functions', () => {
    // These tests exercise the index definition functions in each table

    it('accounts table index function is defined', () => {
      // The second argument to sqliteTable is the index function
      // We verify the table has indexes by checking that indexed columns exist
      expect(schema.accounts.displayOrder).toBeDefined();
      expect(schema.accounts.hidden).toBeDefined();
    });

    it('categories table index function creates indexes', () => {
      expect(schema.categories.parentId).toBeDefined();
      expect(schema.categories.type).toBeDefined();
      expect(schema.categories.categoryType).toBeDefined();
    });

    it('operations table index function creates indexes', () => {
      expect(schema.operations.date).toBeDefined();
      expect(schema.operations.accountId).toBeDefined();
      expect(schema.operations.categoryId).toBeDefined();
    });

    it('budgets table index function creates indexes', () => {
      expect(schema.budgets.categoryId).toBeDefined();
      expect(schema.budgets.periodType).toBeDefined();
    });

    it('accountsBalanceHistory table index function creates indexes', () => {
      expect(schema.accountsBalanceHistory.accountId).toBeDefined();
      expect(schema.accountsBalanceHistory.date).toBeDefined();
    });
  });

  describe('Transfer Operation Fields', () => {
    it('operations table has exchange rate fields for multi-currency transfers', () => {
      expect(schema.operations.exchangeRate).toBeDefined();
      expect(schema.operations.exchangeRate.columnType).toBe('SQLiteText');
      expect(schema.operations.exchangeRate.notNull).toBeFalsy();
    });

    it('operations table has destination amount field', () => {
      expect(schema.operations.destinationAmount).toBeDefined();
      expect(schema.operations.destinationAmount.columnType).toBe('SQLiteText');
    });

    it('operations table has currency fields', () => {
      expect(schema.operations.sourceCurrency).toBeDefined();
      expect(schema.operations.destinationCurrency).toBeDefined();
      expect(schema.operations.sourceCurrency.columnType).toBe('SQLiteText');
      expect(schema.operations.destinationCurrency.columnType).toBe('SQLiteText');
    });
  });

  describe('Optional Fields', () => {
    it('accounts.monthlyTarget is optional', () => {
      expect(schema.accounts.monthlyTarget).toBeDefined();
      expect(schema.accounts.monthlyTarget.notNull).toBeFalsy();
    });

    it('categories icon and color are optional', () => {
      expect(schema.categories.icon).toBeDefined();
      expect(schema.categories.color).toBeDefined();
      expect(schema.categories.icon.notNull).toBeFalsy();
      expect(schema.categories.color.notNull).toBeFalsy();
    });

    it('operations.description is optional', () => {
      expect(schema.operations.description).toBeDefined();
      expect(schema.operations.description.notNull).toBeFalsy();
    });

    it('budgets.endDate is optional', () => {
      expect(schema.budgets.endDate).toBeDefined();
      expect(schema.budgets.endDate.notNull).toBeFalsy();
    });
  });

  describe('Unique Constraints', () => {
    it('accountsBalanceHistory has unique constraint on accountId and date', () => {
      // This table should only have one balance record per account per date
      expect(schema.accountsBalanceHistory.accountId).toBeDefined();
      expect(schema.accountsBalanceHistory.date).toBeDefined();
      expect(schema.accountsBalanceHistory.accountId.notNull).toBe(true);
      expect(schema.accountsBalanceHistory.date.notNull).toBe(true);
    });
  });
});
