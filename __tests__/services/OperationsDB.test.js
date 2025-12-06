/**
 * Tests for OperationsDB Service - Database operations for financial transactions
 * These tests ensure CRUD operations, balance updates, queries, and data integrity work correctly
 */

import * as OperationsDB from '../../app/services/OperationsDB';
import * as Currency from '../../app/services/currency';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';

// Mock dependencies
jest.mock('../../app/services/db');
jest.mock('../../app/services/currency');

describe('OperationsDB Service', () => {
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database object for transactions
    mockDb = {
      runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(),
    };

    // Default mock implementations
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    executeTransaction.mockImplementation(async (callback) => {
      return await callback(mockDb);
    });

    // Currency mock defaults
    Currency.add.mockImplementation((a, b) => String(parseFloat(a) + parseFloat(b)));
  });

  describe('Query Operations', () => {
    it('gets all operations ordered by date DESC', async () => {
      const mockOperations = [
        {
          id: 'op1',
          type: 'expense',
          amount: '100',
          account_id: 'acc1',
          category_id: 'cat1',
          to_account_id: null,
          date: '2025-12-05',
          description: 'Test',
          created_at: '2025-12-05T10:00:00Z',
        },
      ];
      queryAll.mockResolvedValue(mockOperations);

      const result = await OperationsDB.getAllOperations();

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations ORDER BY date DESC, created_at DESC'
      );
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe('acc1'); // Mapped to camelCase
      expect(result[0].categoryId).toBe('cat1');
    });

    it('handles empty operations list', async () => {
      queryAll.mockResolvedValue([]);

      const result = await OperationsDB.getAllOperations();

      expect(result).toEqual([]);
    });

    it('gets operation by ID', async () => {
      const mockOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
        created_at: '2025-12-05T10:00:00Z',
      };
      queryFirst.mockResolvedValue(mockOperation);

      const result = await OperationsDB.getOperationById('op1');

      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE id = ?',
        ['op1']
      );
      expect(result.accountId).toBe('acc1');
    });

    it('returns null for non-existent operation', async () => {
      queryFirst.mockResolvedValue(null);

      const result = await OperationsDB.getOperationById('non-existent');

      expect(result).toBeNull();
    });

    it('gets operations by account', async () => {
      const mockOperations = [
        { id: 'op1', account_id: 'acc1', to_account_id: null },
        { id: 'op2', account_id: 'acc2', to_account_id: 'acc1' },
      ];
      queryAll.mockResolvedValue(mockOperations);

      await OperationsDB.getOperationsByAccount('acc1');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE account_id = ? OR to_account_id = ? ORDER BY date DESC, created_at DESC',
        ['acc1', 'acc1']
      );
    });

    it('gets operations by category', async () => {
      await OperationsDB.getOperationsByCategory('cat1');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE category_id = ? ORDER BY date DESC, created_at DESC',
        ['cat1']
      );
    });

    it('gets operations by date range', async () => {
      await OperationsDB.getOperationsByDateRange('2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
        ['2025-12-01', '2025-12-31']
      );
    });

    it('gets operations by type', async () => {
      await OperationsDB.getOperationsByType('expense');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE type = ? ORDER BY date DESC, created_at DESC',
        ['expense']
      );
    });
  });

  describe('Create Operation', () => {
    it('creates expense operation and updates account balance', async () => {
      const operation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
        description: 'Test expense',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      // Should insert operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operations'),
        expect.arrayContaining([
          'op1',
          'expense',
          '100',
          'acc1',
          'cat1',
          null, // to_account_id
          '2025-12-05',
          expect.any(String), // created_at
          'Test expense',
        ])
      );

      // Should update account balance (expense reduces balance)
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT balance FROM accounts WHERE id = ?',
        ['acc1']
      );
      expect(Currency.add).toHaveBeenCalledWith('1000', -100);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        expect.any(Array)
      );
    });

    it('creates income operation and updates account balance', async () => {
      const operation = {
        id: 'op2',
        type: 'income',
        amount: '200',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      // Should update account balance (income increases balance)
      expect(Currency.add).toHaveBeenCalledWith('1000', 200);
    });

    it('creates transfer operation and updates both account balances', async () => {
      const operation = {
        id: 'op3',
        type: 'transfer',
        amount: '300',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ balance: '1000' }) // Source account
        .mockResolvedValueOnce({ balance: '500' });  // Destination account

      await OperationsDB.createOperation(operation);

      // Should update both accounts
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(2);

      // Source account should be reduced
      expect(Currency.add).toHaveBeenCalledWith('1000', -300);
      // Destination account should be increased
      expect(Currency.add).toHaveBeenCalledWith('500', 300);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(3); // INSERT + 2 UPDATEs
    });

    it('handles multi-currency transfers with destination_amount', async () => {
      const operation = {
        id: 'op4',
        type: 'transfer',
        amount: '100',
        accountId: 'acc1',
        toAccountId: 'acc2',
        destinationAmount: '370', // Different currency rate
        exchangeRate: '3.7',
        sourceCurrency: 'USD',
        destinationCurrency: 'AMD',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ balance: '1000' })
        .mockResolvedValueOnce({ balance: '50000' });

      await OperationsDB.createOperation(operation);

      // Source: -100 USD
      expect(Currency.add).toHaveBeenCalledWith('1000', -100);
      // Destination: +370 AMD (using destination_amount)
      expect(Currency.add).toHaveBeenCalledWith('50000', 370);
    });

    it('skips balance update when account not found', async () => {
      const operation = {
        id: 'op5',
        type: 'expense',
        amount: '100',
        accountId: 'non-existent',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue(null);

      await OperationsDB.createOperation(operation);

      // Should still insert operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operations'),
        expect.any(Array)
      );

      // Should not attempt balance update
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });

    it('uses transaction for atomic operation creation', async () => {
      const operation = {
        id: 'op6',
        type: 'expense',
        amount: '50',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      expect(executeTransaction).toHaveBeenCalled();
    });

    it('rolls back transaction on error', async () => {
      const operation = {
        id: 'op7',
        type: 'expense',
        amount: '100',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      mockDb.runAsync.mockRejectedValue(new Error('Insert failed'));

      await expect(OperationsDB.createOperation(operation)).rejects.toThrow();
    });
  });

  describe('Update Operation', () => {
    it('updates operation and recalculates balance changes', async () => {
      const oldOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      const updatedOperation = {
        ...oldOperation,
        amount: '200', // Increased amount
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)     // Get old operation
        .mockResolvedValueOnce(updatedOperation) // Get updated operation
        .mockResolvedValueOnce({ balance: '1000' }); // Get account balance

      await OperationsDB.updateOperation('op1', { amount: '200' });

      // Should update the operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE operations'),
        ['200', 'op1']
      );

      // Should recalculate balance: reverse old (-(-100) = +100) + apply new (-200) = -100 net
      expect(Currency.add).toHaveBeenCalled();
    });

    it('handles account change in update', async () => {
      const oldOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      const updatedOperation = {
        ...oldOperation,
        account_id: 'acc2', // Changed account
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)
        .mockResolvedValueOnce(updatedOperation)
        .mockResolvedValueOnce({ balance: '1000' }) // acc1
        .mockResolvedValueOnce({ balance: '500' });  // acc2

      await OperationsDB.updateOperation('op1', { accountId: 'acc2' });

      // Should update balances for both old and new accounts
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(4);
    });

    it('does not update when no fields provided', async () => {
      const oldOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
      };

      mockDb.getFirstAsync.mockResolvedValue(oldOperation);

      await OperationsDB.updateOperation('op1', {});

      // Should get old operation but not update anything
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it('throws error when operation not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(
        OperationsDB.updateOperation('non-existent', { amount: '200' })
      ).rejects.toThrow('Operation non-existent not found');
    });

    it('updates all supported fields', async () => {
      const oldOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
        description: 'Old',
      };

      const updates = {
        type: 'income',
        amount: '200',
        accountId: 'acc2',
        categoryId: 'cat2',
        date: '2025-12-06',
        description: 'New',
        exchangeRate: '1.5',
        destinationAmount: '300',
        sourceCurrency: 'USD',
        destinationCurrency: 'EUR',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)
        .mockResolvedValueOnce({ ...oldOperation, ...updates });

      await OperationsDB.updateOperation('op1', updates);

      // Should update with all fields
      const updateCall = mockDb.runAsync.mock.calls.find(call =>
        call[0].includes('UPDATE operations')
      );
      expect(updateCall[1]).toContain('income');
      expect(updateCall[1]).toContain('200');
      expect(updateCall[1]).toContain('acc2');
      expect(updateCall[1]).toContain('cat2');
    });
  });

  describe('Delete Operation', () => {
    it('deletes operation and reverses balance changes', async () => {
      const operation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce({ balance: '900' });

      await OperationsDB.deleteOperation('op1');

      // Should delete the operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM operations WHERE id = ?',
        ['op1']
      );

      // Should reverse balance change (expense was -100, so reverse is +100)
      expect(Currency.add).toHaveBeenCalledWith('900', 100);
    });

    it('reverses transfer balance changes on delete', async () => {
      const operation = {
        id: 'op1',
        type: 'transfer',
        amount: '300',
        account_id: 'acc1',
        to_account_id: 'acc2',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce({ balance: '700' })  // acc1
        .mockResolvedValueOnce({ balance: '800' }); // acc2

      await OperationsDB.deleteOperation('op1');

      // Should reverse both account changes
      expect(Currency.add).toHaveBeenCalledWith('700', 300);   // Restore source
      expect(Currency.add).toHaveBeenCalledWith('800', -300);  // Reverse destination
    });

    it('throws error when operation not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(
        OperationsDB.deleteOperation('non-existent')
      ).rejects.toThrow('Operation non-existent not found');
    });
  });

  describe('Aggregation Queries', () => {
    it('gets total expenses for account in date range', async () => {
      queryFirst.mockResolvedValue({ total: '500.50' });

      const result = await OperationsDB.getTotalExpenses('acc1', '2025-12-01', '2025-12-31');

      expect(queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SUM'),
        ['acc1', '2025-12-01', '2025-12-31']
      );
      expect(result).toBe(500.50);
    });

    it('returns 0 for no expenses', async () => {
      queryFirst.mockResolvedValue({ total: null });

      const result = await OperationsDB.getTotalExpenses('acc1', '2025-12-01', '2025-12-31');

      expect(result).toBe(0);
    });

    it('gets total income for account in date range', async () => {
      queryFirst.mockResolvedValue({ total: '1200.00' });

      const result = await OperationsDB.getTotalIncome('acc1', '2025-12-01', '2025-12-31');

      expect(result).toBe(1200.00);
    });

    it('gets spending by category', async () => {
      const mockResults = [
        { category_id: 'cat1', total: 100.5 },
        { category_id: 'cat2', total: 50.25 },
      ];
      queryAll.mockResolvedValue(mockResults);

      const result = await OperationsDB.getSpendingByCategory('2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY category_id'),
        ['2025-12-01', '2025-12-31']
      );
      expect(result).toHaveLength(2);
    });

    it('gets income by category', async () => {
      await OperationsDB.getIncomeByCategory('2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining("type = 'income'"),
        ['2025-12-01', '2025-12-31']
      );
    });

    it('gets spending by category and currency', async () => {
      await OperationsDB.getSpendingByCategoryAndCurrency('USD', '2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('JOIN accounts'),
        ['USD', '2025-12-01', '2025-12-31']
      );
    });

    it('gets income by category and currency', async () => {
      await OperationsDB.getIncomeByCategoryAndCurrency('EUR', '2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining("o.type = 'income'"),
        ['EUR', '2025-12-01', '2025-12-31']
      );
    });
  });

  describe('Utility Functions', () => {
    it('checks if operation exists', async () => {
      queryFirst.mockResolvedValue({ 1: 1 });

      const exists = await OperationsDB.operationExists('op1');

      expect(exists).toBe(true);
      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT 1 FROM operations WHERE id = ? LIMIT 1',
        ['op1']
      );
    });

    it('returns false for non-existent operation', async () => {
      queryFirst.mockResolvedValue(null);

      const exists = await OperationsDB.operationExists('non-existent');

      expect(exists).toBe(false);
    });

    it('gets today adjustment operation', async () => {
      const mockOp = {
        id: 'op1',
        type: 'income',
        amount: '50',
        account_id: 'acc1',
        category_id: 'shadow-cat',
        date: new Date().toISOString().split('T')[0],
      };
      queryFirst.mockResolvedValue(mockOp);

      const result = await OperationsDB.getTodayAdjustmentOperation('acc1');

      expect(result.accountId).toBe('acc1');
      expect(queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('c.is_shadow = 1'),
        expect.any(Array)
      );
    });

    it('gets available months', async () => {
      queryAll.mockResolvedValue([
        { year: 2025, month: 12 },
        { year: 2025, month: 11 },
      ]);

      const result = await OperationsDB.getAvailableMonths();

      expect(result).toEqual([
        { year: 2025, month: 11 }, // Converted to 0-based
        { year: 2025, month: 10 },
      ]);
    });
  });

  describe('Pagination Queries', () => {
    it('gets operations by week offset', async () => {
      const mockOps = [
        { id: 'op1', date: '2025-12-05', account_id: 'acc1' },
      ];
      queryAll.mockResolvedValue(mockOps);

      const result = await OperationsDB.getOperationsByWeekOffset(0);

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE date >= ? AND date <= ?'),
        expect.any(Array)
      );
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe('acc1');
    });

    it('gets next oldest operation before date', async () => {
      const mockOp = {
        id: 'op1',
        date: '2025-11-28',
        account_id: 'acc1',
      };
      queryFirst.mockResolvedValue(mockOp);

      const result = await OperationsDB.getNextOldestOperation('2025-12-01');

      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE date < ? ORDER BY date DESC, created_at DESC LIMIT 1',
        ['2025-12-01']
      );
      expect(result.accountId).toBe('acc1');
    });

    it('gets operations by week from date', async () => {
      const mockOps = [
        { id: 'op1', date: '2025-12-05', account_id: 'acc1' },
        { id: 'op2', date: '2025-11-30', account_id: 'acc2' },
      ];
      queryAll.mockResolvedValue(mockOps);

      const result = await OperationsDB.getOperationsByWeekFromDate('2025-12-05');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE date >= ? AND date <= ?'),
        expect.any(Array)
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('Field Mapping', () => {
    it('maps database snake_case to camelCase', async () => {
      const dbOperation = {
        id: 'op1',
        type: 'transfer',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        to_account_id: 'acc2',
        date: '2025-12-05',
        description: 'Test',
        created_at: '2025-12-05T10:00:00Z',
        exchange_rate: '1.5',
        destination_amount: '150',
        source_currency: 'USD',
        destination_currency: 'EUR',
      };

      queryFirst.mockResolvedValue(dbOperation);

      const result = await OperationsDB.getOperationById('op1');

      expect(result.accountId).toBe('acc1');
      expect(result.categoryId).toBe('cat1');
      expect(result.toAccountId).toBe('acc2');
      expect(result.createdAt).toBe('2025-12-05T10:00:00Z');
      expect(result.exchangeRate).toBe('1.5');
      expect(result.destinationAmount).toBe('150');
      expect(result.sourceCurrency).toBe('USD');
      expect(result.destinationCurrency).toBe('EUR');
    });

    it('handles null values in mapping', async () => {
      const dbOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        to_account_id: null,
        date: '2025-12-05',
        description: null,
        created_at: '2025-12-05T10:00:00Z',
      };

      queryFirst.mockResolvedValue(dbOperation);

      const result = await OperationsDB.getOperationById('op1');

      expect(result.toAccountId).toBeNull();
      expect(result.description).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('throws error on getAllOperations failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getAllOperations()).rejects.toThrow('Query failed');
    });

    it('throws error on getOperationById failure', async () => {
      queryFirst.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getOperationById('op1')).rejects.toThrow();
    });

    it('throws error on createOperation failure', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Insert failed'));

      await expect(
        OperationsDB.createOperation({
          id: 'op1',
          type: 'expense',
          amount: '100',
          accountId: 'acc1',
          categoryId: 'cat1',
          date: '2025-12-05',
        })
      ).rejects.toThrow();
    });

    it('throws error on updateOperation failure', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.updateOperation('op1', { amount: '200' })
      ).rejects.toThrow();
    });

    it('throws error on deleteOperation failure', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.deleteOperation('op1')).rejects.toThrow();
    });
  });

  describe('Regression Tests', () => {
    it('handles zero amount operation', async () => {
      const operation = {
        id: 'op1',
        type: 'expense',
        amount: '0',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      // Should not attempt balance update for zero amount
      const balanceUpdateCalls = mockDb.runAsync.mock.calls.filter(call =>
        call[0].includes('UPDATE accounts')
      );
      expect(balanceUpdateCalls).toHaveLength(0);
    });

    it('preserves precision in currency calculations', async () => {
      const operation = {
        id: 'op1',
        type: 'expense',
        amount: '0.01',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '100.50' });

      await OperationsDB.createOperation(operation);

      // Currency module should handle precision
      expect(Currency.add).toHaveBeenCalledWith('100.50', -0.01);
    });

    it('handles operations without optional fields', async () => {
      const operation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
        // No description, no multi-currency fields
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      // Should insert with null values for optional fields
      const insertCall = mockDb.runAsync.mock.calls[0];
      expect(insertCall[1]).toContain(null); // description
    });

    it('maintains data integrity during concurrent updates', async () => {
      const oldOperation = {
        id: 'op1',
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue(oldOperation);

      // Simulate concurrent updates
      await Promise.all([
        OperationsDB.updateOperation('op1', { amount: '150' }),
        OperationsDB.updateOperation('op1', { description: 'Updated' }),
      ]);

      // Both should use transactions
      expect(executeTransaction).toHaveBeenCalledTimes(2);
    });
  });
});
