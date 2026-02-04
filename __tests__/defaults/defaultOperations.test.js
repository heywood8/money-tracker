/**
 * Tests for defaultOperations - Default operations seed data generator
 */

import getDefaultOperations from '../../app/defaults/defaultOperations';

describe('defaultOperations', () => {
  describe('getDefaultOperations', () => {
    it('returns operations with today date', () => {
      const today = new Date().toISOString().split('T')[0];
      const operations = getDefaultOperations(1);

      operations.forEach(op => {
        expect(op.date).toBe(today);
      });
    });

    it('returns 4 operations when no secondary account provided', () => {
      const operations = getDefaultOperations(1);

      expect(operations).toHaveLength(4);
    });

    it('returns 4 operations when secondary account is same as primary', () => {
      const operations = getDefaultOperations(1, 1);

      expect(operations).toHaveLength(4);
    });

    it('returns 5 operations when secondary account is different', () => {
      const operations = getDefaultOperations(1, 2);

      expect(operations).toHaveLength(5);
    });

    it('includes correct operation types', () => {
      const operations = getDefaultOperations(1, 2);

      const types = operations.map(op => op.type);
      expect(types).toContain('income');
      expect(types).toContain('expense');
      expect(types).toContain('transfer');

      // Should have 1 income, 3 expenses, 1 transfer
      expect(types.filter(t => t === 'income')).toHaveLength(1);
      expect(types.filter(t => t === 'expense')).toHaveLength(3);
      expect(types.filter(t => t === 'transfer')).toHaveLength(1);
    });

    it('uses provided accountId for all operations', () => {
      const accountId = 123;
      const operations = getDefaultOperations(accountId);

      operations.forEach(op => {
        expect(op.accountId).toBe(accountId);
      });
    });

    it('uses toAccountId for transfer operation', () => {
      const accountId = 1;
      const toAccountId = 2;
      const operations = getDefaultOperations(accountId, toAccountId);

      const transfer = operations.find(op => op.type === 'transfer');
      expect(transfer).toBeDefined();
      expect(transfer.accountId).toBe(accountId);
      expect(transfer.toAccountId).toBe(toAccountId);
    });

    it('sets categoryId to null for transfer operation', () => {
      const operations = getDefaultOperations(1, 2);

      const transfer = operations.find(op => op.type === 'transfer');
      expect(transfer.categoryId).toBeNull();
    });

    it('includes valid category IDs for non-transfer operations', () => {
      const operations = getDefaultOperations(1);

      const nonTransfers = operations.filter(op => op.type !== 'transfer');
      nonTransfers.forEach(op => {
        expect(op.categoryId).toBeTruthy();
        expect(typeof op.categoryId).toBe('string');
      });
    });

    it('includes descriptions for all operations', () => {
      const operations = getDefaultOperations(1, 2);

      operations.forEach(op => {
        expect(op.description).toBeTruthy();
        expect(typeof op.description).toBe('string');
      });
    });

    it('includes valid amounts as strings', () => {
      const operations = getDefaultOperations(1, 2);

      operations.forEach(op => {
        expect(typeof op.amount).toBe('string');
        expect(parseFloat(op.amount)).toBeGreaterThan(0);
      });
    });

    it('handles null toAccountId', () => {
      const operations = getDefaultOperations(1, null);

      expect(operations).toHaveLength(4);
      expect(operations.every(op => op.type !== 'transfer')).toBe(true);
    });

    it('handles undefined toAccountId', () => {
      const operations = getDefaultOperations(1, undefined);

      expect(operations).toHaveLength(4);
      expect(operations.every(op => op.type !== 'transfer')).toBe(true);
    });

    describe('operation amounts', () => {
      it('has income amount of 2500.00', () => {
        const operations = getDefaultOperations(1);
        const income = operations.find(op => op.type === 'income');

        expect(income.amount).toBe('2500.00');
      });

      it('has transfer amount of 100.00', () => {
        const operations = getDefaultOperations(1, 2);
        const transfer = operations.find(op => op.type === 'transfer');

        expect(transfer.amount).toBe('100.00');
      });

      it('has expense amounts that sum correctly', () => {
        const operations = getDefaultOperations(1);
        const expenses = operations.filter(op => op.type === 'expense');

        const total = expenses.reduce((sum, op) => sum + parseFloat(op.amount), 0);
        expect(total).toBeCloseTo(25.50 + 4.50 + 12.00); // 42.00
      });
    });

    describe('category IDs', () => {
      it('uses income-salary for income operation', () => {
        const operations = getDefaultOperations(1);
        const income = operations.find(op => op.type === 'income');

        expect(income.categoryId).toBe('income-salary');
      });

      it('uses expense-food-groceries for groceries', () => {
        const operations = getDefaultOperations(1);
        const groceries = operations.find(op => op.description === 'Weekly groceries');

        expect(groceries.categoryId).toBe('expense-food-groceries');
      });

      it('uses expense-food-coffee-cafe for coffee', () => {
        const operations = getDefaultOperations(1);
        const coffee = operations.find(op => op.description === 'Morning coffee');

        expect(coffee.categoryId).toBe('expense-food-coffee-cafe');
      });

      it('uses expense-transportation-public-transport for metro', () => {
        const operations = getDefaultOperations(1);
        const metro = operations.find(op => op.description === 'Metro pass');

        expect(metro.categoryId).toBe('expense-transportation-public-transport');
      });
    });
  });
});
