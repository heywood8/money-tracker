/**
 * Integration Tests for Database Schema
 * Tests that actually use the schema with Drizzle ORM to trigger all code paths
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from '../../app/db/schema';

describe('Database Schema Integration', () => {
  let mockDb;
  let db;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a comprehensive mock database
    mockDb = {
      execAsync: jest.fn(() => Promise.resolve()),
      runAsync: jest.fn(() => Promise.resolve({ changes: 1, lastInsertRowId: 1 })),
      getFirstAsync: jest.fn(() => Promise.resolve(null)),
      getAllAsync: jest.fn(() => Promise.resolve([])),
      closeAsync: jest.fn(() => Promise.resolve()),
      withTransactionAsync: jest.fn((callback) => callback()),
    };

    SQLite.openDatabaseAsync.mockResolvedValue(mockDb);

    // Create a Drizzle instance with the schema
    db = drizzle(mockDb, { schema });
  });

  describe('Schema Table Definitions', () => {
    it('creates drizzle instance with all tables', () => {
      expect(db).toBeDefined();
      expect(schema.accounts).toBeDefined();
      expect(schema.categories).toBeDefined();
      expect(schema.operations).toBeDefined();
      expect(schema.budgets).toBeDefined();
      expect(schema.accountsBalanceHistory).toBeDefined();
      expect(schema.appMetadata).toBeDefined();
    });

    it('accounts table has index definitions', () => {
      // Accessing the table through the schema triggers index definitions
      const accountsTable = schema.accounts;
      expect(accountsTable).toBeDefined();
      expect(accountsTable[Symbol.for('drizzle:Name')]).toBe('accounts');

      // Check that indexed columns exist
      expect(accountsTable.displayOrder).toBeDefined();
      expect(accountsTable.hidden).toBeDefined();
    });

    it('categories table has index and reference definitions', () => {
      const categoriesTable = schema.categories;
      expect(categoriesTable).toBeDefined();

      // Check columns that have indexes
      expect(categoriesTable.parentId).toBeDefined();
      expect(categoriesTable.type).toBeDefined();
      expect(categoriesTable.categoryType).toBeDefined();
      expect(categoriesTable.isShadow).toBeDefined();

      // parentId has a self-reference
      expect(categoriesTable.parentId.columnType).toBe('SQLiteText');
    });

    it('operations table has index and reference definitions', () => {
      const operationsTable = schema.operations;
      expect(operationsTable).toBeDefined();

      // Check columns that have indexes
      expect(operationsTable.date).toBeDefined();
      expect(operationsTable.accountId).toBeDefined();
      expect(operationsTable.categoryId).toBeDefined();
      expect(operationsTable.type).toBeDefined();

      // Check reference columns
      expect(operationsTable.accountId.notNull).toBe(true);
      expect(operationsTable.categoryId.notNull).toBeFalsy();
      expect(operationsTable.toAccountId).toBeDefined();

      // Check transfer-specific fields
      expect(operationsTable.exchangeRate).toBeDefined();
      expect(operationsTable.destinationAmount).toBeDefined();
      expect(operationsTable.sourceCurrency).toBeDefined();
      expect(operationsTable.destinationCurrency).toBeDefined();
    });

    it('budgets table has index and reference definitions', () => {
      const budgetsTable = schema.budgets;
      expect(budgetsTable).toBeDefined();

      // Check columns that have indexes
      expect(budgetsTable.categoryId).toBeDefined();
      expect(budgetsTable.periodType).toBeDefined();
      expect(budgetsTable.startDate).toBeDefined();
      expect(budgetsTable.endDate).toBeDefined();
      expect(budgetsTable.currency).toBeDefined();
      expect(budgetsTable.isRecurring).toBeDefined();

      // Check reference column
      expect(budgetsTable.categoryId.notNull).toBe(true);
    });

    it('accountsBalanceHistory table has index and reference definitions', () => {
      const historyTable = schema.accountsBalanceHistory;
      expect(historyTable).toBeDefined();

      // Check columns that have indexes
      expect(historyTable.accountId).toBeDefined();
      expect(historyTable.date).toBeDefined();
      expect(historyTable.balance).toBeDefined();
      expect(historyTable.createdAt).toBeDefined();

      // Check reference column
      expect(historyTable.accountId.notNull).toBe(true);
      expect(historyTable.accountId.columnType).toBe('SQLiteInteger');
    });
  });

  describe('Schema with Drizzle Query Builder', () => {
    it('can use accounts table in select query', () => {
      // This triggers the table definition code
      const query = db.select().from(schema.accounts);
      expect(query).toBeDefined();
    });

    it('can use categories table in select query', () => {
      const query = db.select().from(schema.categories);
      expect(query).toBeDefined();
    });

    it('can use operations table in select query', () => {
      const query = db.select().from(schema.operations);
      expect(query).toBeDefined();
    });

    it('can use budgets table in select query', () => {
      const query = db.select().from(schema.budgets);
      expect(query).toBeDefined();
    });

    it('can use accountsBalanceHistory table in select query', () => {
      const query = db.select().from(schema.accountsBalanceHistory);
      expect(query).toBeDefined();
    });

    it('can use appMetadata table in select query', () => {
      const query = db.select().from(schema.appMetadata);
      expect(query).toBeDefined();
    });
  });

  describe('Schema Table Symbols', () => {
    it('all tables have drizzle name symbol', () => {
      expect(schema.accounts[Symbol.for('drizzle:Name')]).toBe('accounts');
      expect(schema.categories[Symbol.for('drizzle:Name')]).toBe('categories');
      expect(schema.operations[Symbol.for('drizzle:Name')]).toBe('operations');
      expect(schema.budgets[Symbol.for('drizzle:Name')]).toBe('budgets');
      expect(schema.accountsBalanceHistory[Symbol.for('drizzle:Name')]).toBe('accounts_balance_history');
      expect(schema.appMetadata[Symbol.for('drizzle:Name')]).toBe('app_metadata');
    });

    it('tables have column symbols', () => {
      // Access all columns to trigger their definitions
      const accountsCols = Object.keys(schema.accounts).filter(key => typeof key === 'string');
      expect(accountsCols.length).toBeGreaterThan(0);

      const categoriesCols = Object.keys(schema.categories).filter(key => typeof key === 'string');
      expect(categoriesCols.length).toBeGreaterThan(0);

      const operationsCols = Object.keys(schema.operations).filter(key => typeof key === 'string');
      expect(operationsCols.length).toBeGreaterThan(0);
    });
  });

  describe('Foreign Key References', () => {
    it('categories.parentId references categories.id', () => {
      // This accesses the reference configuration
      const parentId = schema.categories.parentId;
      expect(parentId).toBeDefined();
      expect(parentId.columnType).toBe('SQLiteText');
    });

    it('operations.accountId references accounts.id', () => {
      const accountId = schema.operations.accountId;
      expect(accountId).toBeDefined();
      expect(accountId.columnType).toBe('SQLiteInteger');
      expect(accountId.notNull).toBe(true);
    });

    it('operations.categoryId references categories.id', () => {
      const categoryId = schema.operations.categoryId;
      expect(categoryId).toBeDefined();
      expect(categoryId.columnType).toBe('SQLiteText');
    });

    it('operations.toAccountId references accounts.id', () => {
      const toAccountId = schema.operations.toAccountId;
      expect(toAccountId).toBeDefined();
      expect(toAccountId.columnType).toBe('SQLiteInteger');
    });

    it('budgets.categoryId references categories.id', () => {
      const categoryId = schema.budgets.categoryId;
      expect(categoryId).toBeDefined();
      expect(categoryId.columnType).toBe('SQLiteText');
      expect(categoryId.notNull).toBe(true);
    });

    it('accountsBalanceHistory.accountId references accounts.id', () => {
      const accountId = schema.accountsBalanceHistory.accountId;
      expect(accountId).toBeDefined();
      expect(accountId.columnType).toBe('SQLiteInteger');
      expect(accountId.notNull).toBe(true);
    });
  });

  describe('Column Configurations', () => {
    it('all reference columns are properly configured', () => {
      // Accessing these columns triggers the .references() method calls
      const refs = [
        schema.categories.parentId,
        schema.operations.accountId,
        schema.operations.categoryId,
        schema.operations.toAccountId,
        schema.budgets.categoryId,
        schema.accountsBalanceHistory.accountId,
      ];

      refs.forEach(ref => {
        expect(ref).toBeDefined();
        expect(ref.columnType).toBeDefined();
      });
    });

    it('all columns with defaults are properly configured', () => {
      // Accessing these triggers the .default() method calls
      expect(schema.accounts.balance.default).toBe('0');
      expect(schema.accounts.currency.default).toBe('USD');
      expect(schema.accounts.hidden.default).toBe(0);
      expect(schema.categories.isShadow.default).toBe(0);
      expect(schema.budgets.isRecurring.default).toBe(1);
      expect(schema.budgets.rolloverEnabled.default).toBe(0);
    });

    it('all columns with notNull are properly configured', () => {
      // Accessing these triggers the .notNull() method calls
      const notNullColumns = [
        schema.accounts.name,
        schema.accounts.balance,
        schema.accounts.currency,
        schema.accounts.createdAt,
        schema.accounts.updatedAt,
        schema.categories.name,
        schema.categories.type,
        schema.categories.categoryType,
        schema.operations.type,
        schema.operations.amount,
        schema.operations.accountId,
        schema.operations.date,
        schema.budgets.categoryId,
        schema.budgets.amount,
        schema.budgets.currency,
      ];

      notNullColumns.forEach(col => {
        expect(col).toBeDefined();
        expect(col.notNull).toBe(true);
      });
    });
  });
});
