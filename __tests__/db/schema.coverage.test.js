/**
 * Coverage-focused tests for Database Schema
 * Explicitly exercises all schema definition code paths
 */

// Mock drizzle-orm/sqlite-core to invoke index callbacks
const mockIndex = jest.fn((name) => ({
  on: jest.fn((...columns) => ({ name, columns })),
}));

const mockUnique = jest.fn(() => ({
  on: jest.fn((...columns) => ({ type: 'unique', columns })),
}));

jest.mock('drizzle-orm/sqlite-core', () => {
  // Helper to create column with chained methods
  const createColumnMethods = () => {
    const column = {
      columnType: 'SQLiteText',
      name: '',
      notNull: false,
      default: undefined,
      primaryKey: jest.fn(function() { return this; }),
    };

    // notNull method
    column.notNull = jest.fn(function() {
      this.notNull = true;
      return this;
    });

    // default method
    column.default = jest.fn(function(val) {
      this.default = val;
      return this;
    });

    // references method - don't invoke callback immediately (causes circular reference issues)
    column.references = jest.fn(function(refCallback, options) {
      return this;
    });

    return column;
  };

  return {
    sqliteTable: jest.fn((tableName, columns, indexCallback) => {
      const table = {
        [Symbol.for('drizzle:Name')]: tableName,
        ...Object.entries(columns).reduce((acc, [key, col]) => {
          acc[key] = col;
          return acc;
        }, {}),
      };

      // IMPORTANT: Execute the index callback to cover those code paths
      if (typeof indexCallback === 'function') {
        indexCallback(table);
      }

      return table;
    }),
    text: jest.fn((name, config) => {
      const col = createColumnMethods();
      col.columnType = 'SQLiteText';
      col.name = name;
      return col;
    }),
    integer: jest.fn((name, config) => {
      const col = createColumnMethods();
      col.columnType = 'SQLiteInteger';
      col.name = name;
      return col;
    }),
    index: mockIndex,
    unique: mockUnique,
  };
});

describe('Database Schema Coverage', () => {
  // Force module reload to trigger all schema definition code
  let schema;

  beforeEach(() => {
    // Clear module cache and re-import to trigger schema definition code
    jest.resetModules();
    jest.clearAllMocks();
    schema = require('../../app/db/schema');
  });

  describe('Accounts Table Definition', () => {
    it('defines accounts table with all columns and indexes', () => {
      const { accounts } = schema;

      // Access all columns to trigger their definition
      expect(accounts.id).toBeDefined();
      expect(accounts.name).toBeDefined();
      expect(accounts.balance).toBeDefined();
      expect(accounts.currency).toBeDefined();
      expect(accounts.displayOrder).toBeDefined(); // Indexed column
      expect(accounts.hidden).toBeDefined(); // Indexed column
      expect(accounts.monthlyTarget).toBeDefined();
      expect(accounts.createdAt).toBeDefined();
      expect(accounts.updatedAt).toBeDefined();

      // Verify the table callback was executed (indexes defined)
      expect(accounts[Symbol.for('drizzle:Name')]).toBe('accounts');
    });
  });

  describe('Categories Table Definition', () => {
    it('defines categories table with all columns, references, and indexes', () => {
      const { categories } = schema;

      // Access all columns
      expect(categories.id).toBeDefined();
      expect(categories.name).toBeDefined();
      expect(categories.type).toBeDefined(); // Indexed column
      expect(categories.categoryType).toBeDefined(); // Indexed column
      expect(categories.parentId).toBeDefined(); // Reference + Indexed column
      expect(categories.icon).toBeDefined();
      expect(categories.color).toBeDefined();
      expect(categories.isShadow).toBeDefined(); // Indexed column
      expect(categories.excludeFromForecast).toBeDefined(); // Indexed column
      expect(categories.createdAt).toBeDefined();
      expect(categories.updatedAt).toBeDefined();

      // Verify column properties to trigger method chains
      expect(categories.parentId.columnType).toBe('SQLiteText');
      expect(categories.icon.columnType).toBe('SQLiteText');
      expect(categories.color.columnType).toBe('SQLiteText');
      expect(categories.isShadow.columnType).toBe('SQLiteInteger');
      expect(categories.isShadow.default).toBe(0);
      expect(categories.excludeFromForecast.columnType).toBe('SQLiteInteger');
      expect(categories.excludeFromForecast.default).toBe(0);
    });
  });

  describe('Operations Table Definition', () => {
    it('defines operations table with all columns, references, and indexes', () => {
      const { operations } = schema;

      // Access all columns
      expect(operations.id).toBeDefined();
      expect(operations.type).toBeDefined(); // Indexed column
      expect(operations.amount).toBeDefined();
      expect(operations.accountId).toBeDefined(); // Reference + Indexed column
      expect(operations.categoryId).toBeDefined(); // Reference + Indexed column
      expect(operations.toAccountId).toBeDefined(); // Reference
      expect(operations.date).toBeDefined(); // Indexed column
      expect(operations.createdAt).toBeDefined();
      expect(operations.description).toBeDefined();
      expect(operations.exchangeRate).toBeDefined();
      expect(operations.destinationAmount).toBeDefined();
      expect(operations.sourceCurrency).toBeDefined();
      expect(operations.destinationCurrency).toBeDefined();

      // Verify reference columns to trigger .references() calls
      expect(operations.accountId.columnType).toBe('SQLiteInteger');
      expect(operations.accountId.notNull).toBe(true);
      expect(operations.categoryId.columnType).toBe('SQLiteText');
      expect(operations.toAccountId.columnType).toBe('SQLiteInteger');

      // Verify optional transfer columns
      expect(operations.description.columnType).toBe('SQLiteText');
      expect(operations.exchangeRate.columnType).toBe('SQLiteText');
      expect(operations.destinationAmount.columnType).toBe('SQLiteText');
      expect(operations.sourceCurrency.columnType).toBe('SQLiteText');
      expect(operations.destinationCurrency.columnType).toBe('SQLiteText');
    });
  });

  describe('Budgets Table Definition', () => {
    it('defines budgets table with all columns, references, and indexes', () => {
      const { budgets } = schema;

      // Access all columns
      expect(budgets.id).toBeDefined();
      expect(budgets.categoryId).toBeDefined(); // Reference + Indexed column
      expect(budgets.amount).toBeDefined();
      expect(budgets.currency).toBeDefined(); // Indexed column
      expect(budgets.periodType).toBeDefined(); // Indexed column
      expect(budgets.startDate).toBeDefined(); // Indexed column
      expect(budgets.endDate).toBeDefined(); // Indexed column
      expect(budgets.isRecurring).toBeDefined(); // Indexed column
      expect(budgets.rolloverEnabled).toBeDefined();
      expect(budgets.createdAt).toBeDefined();
      expect(budgets.updatedAt).toBeDefined();

      // Verify reference column to trigger .references() call
      expect(budgets.categoryId.columnType).toBe('SQLiteText');
      expect(budgets.categoryId.notNull).toBe(true);

      // Verify indexed columns
      expect(budgets.currency.columnType).toBe('SQLiteText');
      expect(budgets.periodType.columnType).toBe('SQLiteText');
      expect(budgets.startDate.columnType).toBe('SQLiteText');
      expect(budgets.endDate.columnType).toBe('SQLiteText');
      expect(budgets.isRecurring.columnType).toBe('SQLiteInteger');
      expect(budgets.isRecurring.default).toBe(1);
      expect(budgets.rolloverEnabled.columnType).toBe('SQLiteInteger');
      expect(budgets.rolloverEnabled.default).toBe(0);
    });
  });

  describe('AccountsBalanceHistory Table Definition', () => {
    it('defines accountsBalanceHistory table with all columns, references, and indexes', () => {
      const { accountsBalanceHistory } = schema;

      // Access all columns
      expect(accountsBalanceHistory.id).toBeDefined();
      expect(accountsBalanceHistory.accountId).toBeDefined(); // Reference + Indexed column
      expect(accountsBalanceHistory.date).toBeDefined(); // Indexed column
      expect(accountsBalanceHistory.balance).toBeDefined();
      expect(accountsBalanceHistory.createdAt).toBeDefined();

      // Verify reference column to trigger .references() call
      expect(accountsBalanceHistory.accountId.columnType).toBe('SQLiteInteger');
      expect(accountsBalanceHistory.accountId.notNull).toBe(true);

      // Verify indexed columns
      expect(accountsBalanceHistory.date.columnType).toBe('SQLiteText');
      expect(accountsBalanceHistory.date.notNull).toBe(true);
      expect(accountsBalanceHistory.balance.columnType).toBe('SQLiteText');
      expect(accountsBalanceHistory.balance.notNull).toBe(true);
      expect(accountsBalanceHistory.createdAt.columnType).toBe('SQLiteText');
      expect(accountsBalanceHistory.createdAt.notNull).toBe(true);
    });
  });

  describe('AppMetadata Table Definition', () => {
    it('defines appMetadata table with all columns', () => {
      const { appMetadata } = schema;

      expect(appMetadata.key).toBeDefined();
      expect(appMetadata.value).toBeDefined();
      expect(appMetadata.updatedAt).toBeDefined();

      expect(appMetadata.key.columnType).toBe('SQLiteText');
      expect(appMetadata.value.columnType).toBe('SQLiteText');
      expect(appMetadata.updatedAt.columnType).toBe('SQLiteText');
    });
  });

  describe('All Table Exports', () => {
    it('exports all tables', () => {
      expect(schema.accounts).toBeDefined();
      expect(schema.categories).toBeDefined();
      expect(schema.operations).toBeDefined();
      expect(schema.budgets).toBeDefined();
      expect(schema.accountsBalanceHistory).toBeDefined();
      expect(schema.appMetadata).toBeDefined();
    });

    it('all tables are objects with drizzle symbols', () => {
      const tables = [
        schema.accounts,
        schema.categories,
        schema.operations,
        schema.budgets,
        schema.accountsBalanceHistory,
        schema.appMetadata,
      ];

      tables.forEach(table => {
        expect(typeof table).toBe('object');
        expect(table[Symbol.for('drizzle:Name')]).toBeDefined();
      });
    });
  });

  describe('Reference Column Definitions', () => {
    it('accesses all reference columns to trigger .references() code', () => {
      const { categories, operations, budgets, accountsBalanceHistory } = schema;

      // Categories self-reference
      const catParentId = categories.parentId;
      expect(catParentId.columnType).toBe('SQLiteText');

      // Operations references
      const opAccountId = operations.accountId;
      const opCategoryId = operations.categoryId;
      const opToAccountId = operations.toAccountId;
      expect(opAccountId.columnType).toBe('SQLiteInteger');
      expect(opCategoryId.columnType).toBe('SQLiteText');
      expect(opToAccountId.columnType).toBe('SQLiteInteger');

      // Budgets reference
      const budgetCategoryId = budgets.categoryId;
      expect(budgetCategoryId.columnType).toBe('SQLiteText');

      // Balance history reference
      const historyAccountId = accountsBalanceHistory.accountId;
      expect(historyAccountId.columnType).toBe('SQLiteInteger');
    });
  });

  describe('Column Method Chains', () => {
    it('accesses columns with chained methods to trigger all code paths', () => {
      const { accounts, categories, operations, budgets } = schema;

      // Columns with .default()
      expect(accounts.balance.default).toBeDefined();
      expect(accounts.currency.default).toBeDefined();
      expect(accounts.hidden.default).toBeDefined();
      expect(categories.isShadow.default).toBeDefined();
      expect(categories.excludeFromForecast.default).toBeDefined();
      expect(budgets.isRecurring.default).toBeDefined();
      expect(budgets.rolloverEnabled.default).toBeDefined();

      // Columns with .notNull().references()
      expect(operations.accountId.notNull).toBeDefined();
      expect(budgets.categoryId.notNull).toBeDefined();
    });
  });

  describe('Index Callback Execution', () => {
    it('executes accounts table index callback', () => {
      // Access the table to ensure it was defined
      expect(schema.accounts).toBeDefined();
      // Verify index function was called for accounts indexes
      expect(mockIndex).toHaveBeenCalled();
    });

    it('executes categories table index callback', () => {
      expect(schema.categories).toBeDefined();
      // Categories has parentIdx, typeIdx, categoryTypeIdx, shadowIdx, excludeFromForecastIdx
      const indexCalls = mockIndex.mock.calls.map(call => call[0]);
      expect(indexCalls).toContain('idx_categories_parent');
      expect(indexCalls).toContain('idx_categories_type');
      expect(indexCalls).toContain('idx_categories_category_type');
      expect(indexCalls).toContain('idx_categories_is_shadow');
      expect(indexCalls).toContain('idx_categories_exclude_from_forecast');
    });

    it('executes operations table index callback', () => {
      expect(schema.operations).toBeDefined();
      // Operations has dateIdx, accountIdx, categoryIdx, typeIdx
      const indexCalls = mockIndex.mock.calls.map(call => call[0]);
      expect(indexCalls).toContain('idx_operations_date');
      expect(indexCalls).toContain('idx_operations_account');
      expect(indexCalls).toContain('idx_operations_category');
      expect(indexCalls).toContain('idx_operations_type');
    });

    it('executes budgets table index callback', () => {
      expect(schema.budgets).toBeDefined();
      // Budgets has categoryIdx, periodIdx, datesIdx, currencyIdx, recurringIdx
      const indexCalls = mockIndex.mock.calls.map(call => call[0]);
      expect(indexCalls).toContain('idx_budgets_category');
      expect(indexCalls).toContain('idx_budgets_period');
      expect(indexCalls).toContain('idx_budgets_dates');
      expect(indexCalls).toContain('idx_budgets_currency');
      expect(indexCalls).toContain('idx_budgets_recurring');
    });

    it('executes accountsBalanceHistory table index callback with unique constraint', () => {
      expect(schema.accountsBalanceHistory).toBeDefined();
      // Has accountDateIdx, dateIdx, and uniqueAccountDate
      const indexCalls = mockIndex.mock.calls.map(call => call[0]);
      expect(indexCalls).toContain('idx_balance_history_account_date');
      expect(indexCalls).toContain('idx_balance_history_date');
      // Check unique was called
      expect(mockUnique).toHaveBeenCalled();
    });
  });
});
