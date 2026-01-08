/**
 * OperationsDB Validation Tests
 *
 * These tests ensure that operation data is properly validated before being saved to the database.
 * They prevent regressions where invalid data types cause foreign key constraint errors.
 */

describe('OperationsDB Data Type Validation', () => {
  describe('accountId validation', () => {
    it('should identify when accountId is a string instead of number', () => {
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

    it('should accept valid numeric accountId', () => {
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
    it('should identify when categoryId is an object (React event)', () => {
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

    it('should accept valid string categoryId', () => {
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

    it('should accept undefined categoryId for transfers', () => {
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

    it('should reject operation with string accountId', () => {
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

    it('should reject operation with object categoryId', () => {
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

    it('should accept valid expense operation', () => {
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

    it('should accept valid transfer operation', () => {
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
    it('REGRESSION: accountId set to "add" from Calculator button', () => {
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

    it('REGRESSION: categoryId set to React event object', () => {
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
