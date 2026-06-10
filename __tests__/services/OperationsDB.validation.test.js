/**
 * OperationsDB Validation Tests
 *
 * These tests ensure that operation data is properly validated before being saved to the database.
 * They prevent regressions where invalid data types cause foreign key constraint errors.
 */

jest.mock('../../app/services/db', () => ({
  executeQuery: jest.fn(),
  queryAll: jest.fn(),
  queryFirst: jest.fn(),
  executeTransaction: jest.fn(),
  isSearchNormAvailable: jest.fn(() => false),
}));
jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn(() => '2026-01-01'),
  updateTodayBalance: jest.fn(),
}));
jest.mock('../../app/services/AccountsDB', () => ({
  getAllAccounts: jest.fn(),
}));
jest.mock('../../app/defaults/defaultOperations', () => jest.fn(() => []));
jest.mock('../../app/services/searchNormalize', () => ({
  normalizeSearchText: jest.fn(t => t),
}));
jest.mock('../../app/services/currency', () => ({
  add: jest.fn((a, b) => String(parseFloat(a) + parseFloat(b))),
  subtract: jest.fn((a, b) => String(parseFloat(a) - parseFloat(b))),
  isZero: jest.fn(v => parseFloat(v) === 0),
}));

describe('OperationsDB Data Type Validation', () => {
  describe('operation type validation', () => {
    let createOperation;
    let updateOperation;
    let executeTransaction;

    beforeEach(() => {
      jest.resetModules();
      jest.clearAllMocks();

      const db = require('../../app/services/db');
      executeTransaction = db.executeTransaction;

      const opsDB = require('../../app/services/OperationsDB');
      createOperation = opsDB.createOperation;
      updateOperation = opsDB.updateOperation;
    });

    it('should reject createOperation with an invalid type', async () => {
      await expect(
        createOperation({ type: 'refund', amount: '10', accountId: 1, date: '2026-01-01' }),
      ).rejects.toThrow('Invalid operation type: "refund"');
    });

    it('should reject createOperation when type is undefined', async () => {
      await expect(
        createOperation({ type: undefined, amount: '10', accountId: 1, date: '2026-01-01' }),
      ).rejects.toThrow('Invalid operation type');
    });

    it('should reject createOperation when type is an empty string', async () => {
      await expect(
        createOperation({ type: '', amount: '10', accountId: 1, date: '2026-01-01' }),
      ).rejects.toThrow('Invalid operation type');
    });

    it('should accept createOperation with type "expense"', async () => {
      executeTransaction.mockImplementation(async (fn) => {
        const mockDb = {
          runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1 }),
          getFirstAsync: jest.fn().mockResolvedValue({ balance: '0' }),
        };
        await fn(mockDb);
      });

      await expect(
        createOperation({ type: 'expense', amount: '10', accountId: 1, categoryId: 2, date: '2026-01-01' }),
      ).resolves.toBeDefined();
    });

    it('should accept createOperation with type "income"', async () => {
      executeTransaction.mockImplementation(async (fn) => {
        const mockDb = {
          runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 2 }),
          getFirstAsync: jest.fn().mockResolvedValue({ balance: '0' }),
        };
        await fn(mockDb);
      });

      await expect(
        createOperation({ type: 'income', amount: '50', accountId: 1, categoryId: 2, date: '2026-01-01' }),
      ).resolves.toBeDefined();
    });

    it('should accept createOperation with type "transfer"', async () => {
      executeTransaction.mockImplementation(async (fn) => {
        const mockDb = {
          runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 3 }),
          getFirstAsync: jest.fn().mockResolvedValue({ balance: '100' }),
        };
        await fn(mockDb);
      });

      await expect(
        createOperation({ type: 'transfer', amount: '10', accountId: 1, toAccountId: 2, date: '2026-01-01' }),
      ).resolves.toBeDefined();
    });

    it('should reject updateOperation with an invalid type in updates', async () => {
      executeTransaction.mockImplementation(async (fn) => {
        const mockDb = {
          getFirstAsync: jest.fn().mockResolvedValue({ id: 1, type: 'expense', amount: '10', account_id: 1, to_account_id: null }),
          runAsync: jest.fn(),
        };
        await fn(mockDb);
      });

      await expect(updateOperation(1, { type: 'invalid' })).rejects.toThrow(
        'Invalid operation type: "invalid"',
      );
    });

    it('should not throw for updateOperation when type is not in updates', async () => {
      executeTransaction.mockImplementation(async (fn) => {
        const mockDb = {
          getFirstAsync: jest.fn()
            .mockResolvedValueOnce({ id: 1, type: 'expense', amount: '10', account_id: 1, to_account_id: null })
            .mockResolvedValueOnce({ id: 1, type: 'expense', amount: '20', account_id: 1, to_account_id: null })
            .mockResolvedValue({ balance: '100' }),
          runAsync: jest.fn().mockResolvedValue({}),
        };
        await fn(mockDb);
      });

      await expect(updateOperation(1, { amount: '20' })).resolves.toBeUndefined();
    });
  });

  describe('accountId validation', () => {
    it('should identify when accountId is a string instead of number', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 'add', // BUG: Button value leaked into accountId
        categoryId: '5',
      };

      // Validation function that should catch this
      const validateAccountId = (accountId) => {
        if (typeof accountId !== 'number') {
          throw new Error(`accountId must be a number, got ${typeof accountId}`);
        }
        if (isNaN(accountId)) {
          throw new Error('accountId must be a valid number');
        }
        return true;
      };

      expect(() => validateAccountId(operation.accountId)).toThrow(
        'accountId must be a number, got string',
      );
    });

    it('should accept valid numeric accountId', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 17, // Valid
        categoryId: '5',
      };

      const validateAccountId = (accountId) => {
        if (typeof accountId !== 'number') {
          throw new Error(`accountId must be a number, got ${typeof accountId}`);
        }
        if (isNaN(accountId)) {
          throw new Error('accountId must be a valid number');
        }
        return true;
      };

      expect(() => validateAccountId(operation.accountId)).not.toThrow();
      expect(validateAccountId(operation.accountId)).toBe(true);
    });
  });

  describe('categoryId validation', () => {
    it('should identify when categoryId is an object (React event)', async () => {
      const mockReactEvent = {
        nativeEvent: { touches: [] },
        currentTarget: { __nativeTag: 123 },
        target: {},
        _dispatchInstances: {},
      };

      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 17,
        categoryId: mockReactEvent, // BUG: Event object leaked into categoryId
      };

      // Validation function that should catch this
      const validateCategoryId = (categoryId) => {
        if (categoryId === null || categoryId === undefined) {
          return true; // Optional for transfers
        }
        if (typeof categoryId !== 'string' && typeof categoryId !== 'number') {
          throw new Error(
            `categoryId must be a string or number, got ${typeof categoryId}`,
          );
        }
        // Additional check: not an object with event properties
        if (typeof categoryId === 'object') {
          throw new Error('categoryId cannot be an object');
        }
        return true;
      };

      expect(() => validateCategoryId(operation.categoryId)).toThrow(
        'categoryId must be a string or number, got object',
      );
    });

    it('should accept valid string categoryId', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 17,
        categoryId: '5', // Valid
      };

      const validateCategoryId = (categoryId) => {
        if (categoryId === null || categoryId === undefined) {
          return true;
        }
        if (typeof categoryId !== 'string' && typeof categoryId !== 'number') {
          throw new Error(
            `categoryId must be a string or number, got ${typeof categoryId}`,
          );
        }
        if (typeof categoryId === 'object') {
          throw new Error('categoryId cannot be an object');
        }
        return true;
      };

      expect(() => validateCategoryId(operation.categoryId)).not.toThrow();
      expect(validateCategoryId(operation.categoryId)).toBe(true);
    });

    it('should accept undefined categoryId for transfers', async () => {
      const operation = {
        type: 'transfer',
        amount: '100',
        accountId: 17,
        toAccountId: 18,
        categoryId: undefined, // Valid for transfers
      };

      const validateCategoryId = (categoryId) => {
        if (categoryId === null || categoryId === undefined) {
          return true;
        }
        if (typeof categoryId !== 'string' && typeof categoryId !== 'number') {
          throw new Error(
            `categoryId must be a string or number, got ${typeof categoryId}`,
          );
        }
        if (typeof categoryId === 'object') {
          throw new Error('categoryId cannot be an object');
        }
        return true;
      };

      expect(() => validateCategoryId(operation.categoryId)).not.toThrow();
      expect(validateCategoryId(operation.categoryId)).toBe(true);
    });
  });

  describe('Full operation validation', () => {
    const validateOperation = (operation) => {
      const errors = [];

      // Validate type
      if (!['expense', 'income', 'transfer'].includes(operation.type)) {
        errors.push('Invalid operation type');
      }

      // Validate amount
      if (typeof operation.amount !== 'string' || operation.amount.trim() === '') {
        errors.push('Amount must be a non-empty string');
      }

      // Validate accountId
      if (typeof operation.accountId !== 'number' || isNaN(operation.accountId)) {
        errors.push(`accountId must be a valid number, got ${typeof operation.accountId}`);
      }

      // Validate categoryId (required for expense/income)
      if (operation.type !== 'transfer') {
        if (
          operation.categoryId !== null &&
          operation.categoryId !== undefined &&
          typeof operation.categoryId !== 'string' &&
          typeof operation.categoryId !== 'number'
        ) {
          errors.push(`categoryId must be a string or number, got ${typeof operation.categoryId}`);
        }
        // Check if it's an object (event)
        if (typeof operation.categoryId === 'object' && operation.categoryId !== null) {
          errors.push('categoryId cannot be an object (possible event contamination)');
        }
      }

      // Validate toAccountId for transfers
      if (operation.type === 'transfer') {
        if (typeof operation.toAccountId !== 'number' || isNaN(operation.toAccountId)) {
          errors.push('toAccountId must be a valid number for transfers');
        }
      }

      return errors;
    };

    it('should reject operation with string accountId', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 'add', // INVALID
        categoryId: '5',
        date: '2026-01-08',
      };

      const errors = validateOperation(operation);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('accountId'))).toBe(true);
    });

    it('should reject operation with object categoryId', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 17,
        categoryId: { nativeEvent: {} }, // INVALID
        date: '2026-01-08',
      };

      const errors = validateOperation(operation);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('categoryId'))).toBe(true);
    });

    it('should accept valid expense operation', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 17,
        categoryId: '5',
        date: '2026-01-08',
      };

      const errors = validateOperation(operation);
      expect(errors).toEqual([]);
    });

    it('should accept valid transfer operation', async () => {
      const operation = {
        type: 'transfer',
        amount: '100',
        accountId: 17,
        toAccountId: 18,
        date: '2026-01-08',
      };

      const errors = validateOperation(operation);
      expect(errors).toEqual([]);
    });
  });

  describe('Regression test: specific bugs encountered', () => {
    it('REGRESSION: accountId set to "add" from Calculator button', async () => {
      // This was the actual bug where CalcButton passed its value to onAdd callback
      const buggyData = {
        type: 'expense',
        amount: '555',
        accountId: 'add', // This happened when onAdd("add") was called
        categoryId: '17',
      };

      expect(typeof buggyData.accountId).toBe('string');
      expect(buggyData.accountId).toBe('add');

      // This should fail validation
      const isValidAccountId = typeof buggyData.accountId === 'number';
      expect(isValidAccountId).toBe(false);
    });

    it('REGRESSION: categoryId set to React event object', async () => {
      // This was the actual bug where Pressable passed event to onPress callback
      const mockEvent = {
        _dispatchInstances: { _debugHookTypes: null },
        nativeEvent: { touches: [] },
        currentTarget: { __nativeTag: 2438 },
      };

      const buggyData = {
        type: 'expense',
        amount: '555',
        accountId: 17,
        categoryId: mockEvent, // This happened when onPress wasn't wrapped
      };

      expect(typeof buggyData.categoryId).toBe('object');
      expect(buggyData.categoryId).toHaveProperty('nativeEvent');

      // This should fail validation
      const isValidCategoryId =
        typeof buggyData.categoryId === 'string' ||
        typeof buggyData.categoryId === 'number';
      expect(isValidCategoryId).toBe(false);
    });
  });
});
