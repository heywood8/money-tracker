/**
 * Tests for OperationsDB Service - Database operations for financial transactions
 * These tests ensure CRUD operations, balance updates, queries, and data integrity work correctly
 */

import * as OperationsDB from '../../app/services/OperationsDB';
import * as Currency from '../../app/services/currency';
import { executeQuery, queryAll, queryFirst, executeTransaction, isSearchNormAvailable } from '../../app/services/db';

// Mock dependencies
jest.mock('../../app/services/db');
jest.mock('../../app/services/currency');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/defaults/defaultOperations');

import * as AccountsDB from '../../app/services/AccountsDB';
import getDefaultOperations from '../../app/defaults/defaultOperations';

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
    Currency.subtract.mockImplementation((a, b) => String(parseFloat(a) - parseFloat(b)));
    Currency.isZero.mockImplementation((a) => parseFloat(a) === 0);
    Currency.convertAmount.mockImplementation((amount, _from, _to, rate) =>
      String(parseFloat(amount) * parseFloat(rate)),
    );

    // SEARCH_NORM is available in tests so search SQL uses SEARCH_NORM(...)
    isSearchNormAvailable.mockReturnValue(true);
  });

  describe('Query Operations', () => {
    it('gets all operations ordered by date DESC', async () => {
      const mockOperations = [
        {
          id: 1,
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
        'SELECT * FROM operations ORDER BY date DESC, created_at DESC',
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
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
        created_at: '2025-12-05T10:00:00Z',
      };
      queryFirst.mockResolvedValue(mockOperation);

      const result = await OperationsDB.getOperationById(1);

      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE id = ?',
        [1],
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
        { id: 1, account_id: 'acc1', to_account_id: null },
        { id: 2, account_id: 'acc2', to_account_id: 'acc1' },
      ];
      queryAll.mockResolvedValue(mockOperations);

      await OperationsDB.getOperationsByAccount('acc1');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE account_id = ? OR to_account_id = ? ORDER BY date DESC, created_at DESC',
        ['acc1', 'acc1'],
      );
    });

    it('gets operations by category', async () => {
      await OperationsDB.getOperationsByCategory('cat1');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE category_id = ? ORDER BY date DESC, created_at DESC',
        ['cat1'],
      );
    });

    it('gets operations by date range', async () => {
      await OperationsDB.getOperationsByDateRange('2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
        ['2025-12-01', '2025-12-31'],
      );
    });

    it('gets operations by type', async () => {
      await OperationsDB.getOperationsByType('expense');

      expect(queryAll).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE type = ? ORDER BY date DESC, created_at DESC',
        ['expense'],
      );
    });
  });

  describe('Create Operation', () => {
    it('creates expense operation and updates account balance', async () => {
      const operation = {
        type: 'expense',
        amount: '100',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
        description: 'Test expense',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      // Should insert operation (ID is auto-generated, not passed in)
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operations'),
        expect.arrayContaining([
          'expense',
          '100',
          'acc1',
          'cat1',
          null, // to_account_id
          '2025-12-05',
          expect.any(String), // created_at
          'Test expense',
        ]),
      );

      // Should update account balance (expense reduces balance)
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT balance FROM accounts WHERE id = ?',
        ['acc1'],
      );
      expect(Currency.add).toHaveBeenCalledWith('1000', '-100');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        expect.any(Array),
      );
    });

    it('creates income operation and updates account balance', async () => {
      const operation = {
        type: 'income',
        amount: '200',
        accountId: 'acc1',
        categoryId: 'cat2',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.createOperation(operation);

      // Should update account balance (income increases balance)
      expect(Currency.add).toHaveBeenCalledWith('1000', '200');
    });

    it('creates transfer operation and updates both account balances', async () => {
      const operation = {
        id: 3,
        type: 'transfer',
        amount: '300',
        accountId: 'acc1',
        toAccountId: 'acc2',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ currency: null }) // acc1 currency (same-currency: no conversion)
        .mockResolvedValueOnce({ currency: null }) // acc2 currency
        .mockResolvedValueOnce({ balance: '1000' }) // Source account balance
        .mockResolvedValueOnce({ balance: '500' });  // Destination account balance

      await OperationsDB.createOperation(operation);

      // Should update both accounts
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(4);

      // Source account should be reduced
      expect(Currency.add).toHaveBeenCalledWith('1000', '-300');
      // Destination account should be increased
      expect(Currency.add).toHaveBeenCalledWith('500', '300');

      expect(mockDb.runAsync).toHaveBeenCalledTimes(5); // INSERT + 2 UPDATEs + 2 balance history inserts
    });

    it('handles multi-currency transfers with destination_amount', async () => {
      const operation = {
        id: 4,
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
      expect(Currency.add).toHaveBeenCalledWith('1000', '-100');
      // Destination: +370 AMD (using destination_amount)
      expect(Currency.add).toHaveBeenCalledWith('50000', '370');
    });

    it('throws and rolls back when account not found during balance update (#746)', async () => {
      // Regression test for issue #746: operation insert must not succeed when
      // the balance update step fails. Both steps must be atomic — if the account
      // lookup returns null the whole transaction should be aborted via an error,
      // ensuring the operation row is never persisted without a matching balance update.
      const operation = {
        id: 5,
        type: 'expense',
        amount: '100',
        accountId: 'non-existent',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      // Account lookup returns null — simulates a missing/deleted account
      mockDb.getFirstAsync.mockResolvedValue(null);

      // createOperation must reject — the transaction callback throws so the
      // SQLite transaction rolls back and the INSERT is not committed.
      await expect(OperationsDB.createOperation(operation)).rejects.toThrow(
        'Account non-existent not found',
      );
    });

    it('handles object IDs by extracting the id property', async () => {
      // Simulate case where account/category objects are passed instead of just IDs
      const operation = {
        type: 'transfer',
        amount: '100',
        accountId: { id: 1 }, // Object instead of primitive
        toAccountId: { id: 2 }, // Object instead of primitive
        categoryId: { id: 'cat1' }, // Object instead of primitive
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ currency: null }) // acc1 currency (same-currency: no conversion)
        .mockResolvedValueOnce({ currency: null }) // acc2 currency
        .mockResolvedValueOnce({ balance: '1000' })
        .mockResolvedValueOnce({ balance: '500' });

      await OperationsDB.createOperation(operation);

      // Should extract IDs from objects
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operations'),
        expect.arrayContaining([
          'transfer',
          '100',
          1, // Extracted from { id: 1 }
          'cat1', // Extracted from { id: 'cat1' }
          2, // Extracted from { id: 2 }
          '2025-12-05',
        ]),
      );
    });

    it('uses transaction for atomic operation creation', async () => {
      const operation = {
        id: 6,
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
        id: 7,
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
        id: 1,
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

      await OperationsDB.updateOperation(1, { amount: '200' });

      // Should update the operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE operations'),
        ['200', 1],
      );

      // Should recalculate balance: reverse old (-(-100) = +100) + apply new (-200) = -100 net
      expect(Currency.add).toHaveBeenCalled();
    });

    it('handles account change in update', async () => {
      const oldOperation = {
        id: 1,
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

      await OperationsDB.updateOperation(1, { accountId: 'acc2' });

      // Should update balances for both old and new accounts
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(4);
    });

    it('does not update when no fields provided', async () => {
      const oldOperation = {
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
      };

      mockDb.getFirstAsync.mockResolvedValue(oldOperation);

      await OperationsDB.updateOperation(1, {});

      // Should get old operation but not update anything
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it('throws error when operation not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(
        OperationsDB.updateOperation('non-existent', { amount: '200' }),
      ).rejects.toThrow('Operation non-existent not found');
    });

    it('updates all supported fields', async () => {
      const oldOperation = {
        id: 1,
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

      // The DB row for the updated operation uses snake_case fields.
      // Spread updates (camelCase) over the old row and remap to snake_case.
      const updatedDbRow = {
        ...oldOperation,
        type: updates.type,
        amount: updates.amount,
        account_id: updates.accountId,
        category_id: updates.categoryId,
        date: updates.date,
        description: updates.description,
        exchange_rate: updates.exchangeRate,
        destination_amount: updates.destinationAmount,
        source_currency: updates.sourceCurrency,
        destination_currency: updates.destinationCurrency,
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)    // get old operation
        .mockResolvedValueOnce(updatedDbRow)    // get updated operation (snake_case)
        .mockResolvedValueOnce(null)            // acc1 balance (old-only account, skipped gracefully)
        .mockResolvedValueOnce({ balance: '500' }); // acc2 balance (new operation account)

      await OperationsDB.updateOperation(1, updates);

      // Should update with all fields
      const updateCall = mockDb.runAsync.mock.calls.find(call =>
        call[0].includes('UPDATE operations'),
      );
      expect(updateCall[1]).toContain('income');
      expect(updateCall[1]).toContain('200');
      expect(updateCall[1]).toContain('acc2');
      expect(updateCall[1]).toContain('cat2');
    });

    describe('Regression Tests', () => {
      it('throws and rolls back when the new operation account is deleted mid-transaction (#745)', async () => {
        // Reproduces the bug: an account is deleted between the time an operation
        // is created and when it is edited. The update should abort entirely
        // rather than saving the operation row while skipping balance changes.
        const oldOperation = {
          id: 1,
          type: 'expense',
          amount: '100',
          account_id: 'acc1',
          category_id: 'cat1',
          date: '2025-12-05',
        };

        const updatedOperation = {
          ...oldOperation,
          amount: '200',
        };

        mockDb.getFirstAsync
          .mockResolvedValueOnce(oldOperation)     // get old operation
          .mockResolvedValueOnce(updatedOperation) // get updated operation
          .mockResolvedValueOnce(null);            // account lookup returns null — deleted mid-tx

        await expect(
          OperationsDB.updateOperation(1, { amount: '200' }),
        ).rejects.toThrow(/Account acc1 not found.*Rolling back/);
      });

      it('throws and rolls back when the transfer destination account is deleted mid-transaction (#745)', async () => {
        // Scenario: user edits the amount of a transfer. The destination account
        // (acc2) was deleted between when the operation was created and now.
        // The update should abort so the operation record and balance stay consistent.
        const oldOperation = {
          id: 2,
          type: 'transfer',
          amount: '500',
          account_id: 'acc1',
          to_account_id: 'acc2',
          date: '2025-12-05',
        };

        const updatedOperation = {
          ...oldOperation,
          amount: '600', // amount changed — net delta on acc2 will be non-zero
        };

        mockDb.getFirstAsync
          .mockResolvedValueOnce(oldOperation)        // get old operation
          .mockResolvedValueOnce(updatedOperation)    // get updated operation
          // calculateBalanceChanges for old transfer (no destination_amount → currency query)
          .mockResolvedValueOnce({ currency: 'USD' }) // old op: acc1 currency
          .mockResolvedValueOnce({ currency: 'USD' }) // old op: acc2 currency (same → no conversion)
          // calculateBalanceChanges for new transfer
          .mockResolvedValueOnce({ currency: 'USD' }) // new op: acc1 currency
          .mockResolvedValueOnce({ currency: 'USD' }) // new op: acc2 currency
          // balance lookups: acc1 has net delta -100 (source sends more), acc2 has +100
          .mockResolvedValueOnce({ balance: '2000' }) // acc1 balance lookup → exists
          .mockResolvedValueOnce(null);               // acc2 balance lookup → deleted, throws

        await expect(
          OperationsDB.updateOperation(2, { amount: '600' }),
        ).rejects.toThrow(/Account acc2 not found.*Rolling back/);
      });

      it('allows update when only the old (now-deleted) account is missing (#745)', async () => {
        // Old operation was on acc1 (now deleted). New operation moves to acc2 (exists).
        // The reversal for acc1 should be skipped gracefully; acc2 update proceeds.
        const oldOperation = {
          id: 3,
          type: 'expense',
          amount: '100',
          account_id: 'acc1',
          category_id: 'cat1',
          date: '2025-12-05',
        };

        const updatedOperation = {
          ...oldOperation,
          account_id: 'acc2', // moved to a different account
        };

        mockDb.getFirstAsync
          .mockResolvedValueOnce(oldOperation)      // get old operation
          .mockResolvedValueOnce(updatedOperation)  // get updated operation
          .mockResolvedValueOnce(null)              // acc1 balance lookup → deleted, skip
          .mockResolvedValueOnce({ balance: '500' }); // acc2 balance lookup → exists

        // Should not throw — old account missing is tolerated, new account exists
        await expect(
          OperationsDB.updateOperation(3, { accountId: 'acc2' }),
        ).resolves.not.toThrow();

        // acc2 balance should be updated
        expect(Currency.add).toHaveBeenCalledWith('500', expect.any(String));
      });
    });
  });

  describe('Delete Operation', () => {
    it('deletes operation and reverses balance changes', async () => {
      const operation = {
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce({ balance: '900' });

      await OperationsDB.deleteOperation(1);

      // Should delete the operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM operations WHERE id = ?',
        [1],
      );

      // Should reverse balance change (expense was -100, so reverse is +100)
      expect(Currency.add).toHaveBeenCalledWith('900', '100');
    });

    it('reverses transfer balance changes on delete', async () => {
      const operation = {
        id: 1,
        type: 'transfer',
        amount: '300',
        account_id: 'acc1',
        to_account_id: 'acc2',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(operation)
        .mockResolvedValueOnce({ currency: null }) // acc1 currency (same-currency: no conversion)
        .mockResolvedValueOnce({ currency: null }) // acc2 currency
        .mockResolvedValueOnce({ balance: '700' })  // acc1
        .mockResolvedValueOnce({ balance: '800' }); // acc2

      await OperationsDB.deleteOperation(1);

      // Should reverse both account changes
      expect(Currency.add).toHaveBeenCalledWith('700', '300');   // Restore source
      expect(Currency.add).toHaveBeenCalledWith('800', '-300');  // Reverse destination
    });

    it('throws error when operation not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      await expect(
        OperationsDB.deleteOperation('non-existent'),
      ).rejects.toThrow('Operation non-existent not found');
    });
  });

  describe('Aggregation Queries', () => {
    it('gets total expenses for account in date range', async () => {
      queryAll.mockResolvedValue([{ amount: '300.25' }, { amount: '200.25' }]);

      const result = await OperationsDB.getTotalExpenses('acc1', '2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining("type = 'expense'"),
        ['acc1', '2025-12-01', '2025-12-31'],
      );
      expect(result).toBe('500.5');
    });

    it('returns 0 string for no expenses', async () => {
      queryAll.mockResolvedValue([]);

      const result = await OperationsDB.getTotalExpenses('acc1', '2025-12-01', '2025-12-31');

      expect(result).toBe('0');
    });

    it('gets total income for account in date range', async () => {
      queryAll.mockResolvedValue([{ amount: '1200.00' }]);

      const result = await OperationsDB.getTotalIncome('acc1', '2025-12-01', '2025-12-31');

      expect(result).toBe('1200');
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
        ['2025-12-01', '2025-12-31'],
      );
      expect(result).toHaveLength(2);
    });

    it('gets income by category', async () => {
      await OperationsDB.getIncomeByCategory('2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining("type = 'income'"),
        ['2025-12-01', '2025-12-31'],
      );
    });

    it('gets spending by category and currency', async () => {
      await OperationsDB.getSpendingByCategoryAndCurrency('USD', '2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('JOIN accounts'),
        ['USD', '2025-12-01', '2025-12-31'],
      );
    });

    it('gets income by category and currency', async () => {
      await OperationsDB.getIncomeByCategoryAndCurrency('EUR', '2025-12-01', '2025-12-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining("o.type = 'income'"),
        ['EUR', '2025-12-01', '2025-12-31'],
      );
    });

    it('gets top categories from last 3 months', async () => {
      const mockResults = [
        { category_id: 'cat1', count: 15 },
        { category_id: 'cat2', count: 10 },
        { category_id: 'cat3', count: 8 },
      ];
      queryAll.mockResolvedValue(mockResults);

      const result = await OperationsDB.getTopCategoriesFromLastMonth(3);

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as count'),
        expect.arrayContaining([expect.any(String), expect.any(String), 3]),
      );
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ categoryId: 'cat1', count: 15 });
      expect(result[1]).toEqual({ categoryId: 'cat2', count: 10 });
      expect(result[2]).toEqual({ categoryId: 'cat3', count: 8 });
    });

    it('returns empty array when no operations in last 3 months', async () => {
      queryAll.mockResolvedValue([]);

      const result = await OperationsDB.getTopCategoriesFromLastMonth(3);

      expect(result).toEqual([]);
    });

    it('uses custom limit per type for top categories', async () => {
      const mockResults = [
        { category_id: 'cat1', count: 15 },
        { category_id: 'cat2', count: 10 },
        { category_id: 'cat3', count: 8 },
        { category_id: 'cat4', count: 5 },
        { category_id: 'cat5', count: 3 },
      ];
      queryAll.mockResolvedValue(mockResults);

      const result = await OperationsDB.getTopCategoriesFromLastMonth(5);

      expect(queryAll).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(String), expect.any(String), 5]),
      );
      expect(result).toHaveLength(5);
    });

    it('queries expense and income types separately using UNION ALL', async () => {
      queryAll.mockResolvedValue([]);
      await OperationsDB.getTopCategoriesFromLastMonth(3);

      const sql = queryAll.mock.calls[0][0];
      expect(sql).toContain('category_id IS NOT NULL');
      expect(sql).toContain("type = 'expense'");
      expect(sql).toContain("type = 'income'");
      expect(sql).toContain('UNION ALL');
    });

    it('passes limit per type (duplicated for expense and income sub-queries)', async () => {
      queryAll.mockResolvedValue([]);
      await OperationsDB.getTopCategoriesFromLastMonth(4);

      const [, params] = queryAll.mock.calls[0];
      // params: [startDate, endDate, limitExpense, startDate, endDate, limitIncome]
      expect(params).toHaveLength(6);
      expect(params[2]).toBe(4);
      expect(params[5]).toBe(4);
    });

    it('queries last 90 days including today', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getTopCategoriesFromLastMonth(3);

      const [, params] = queryAll.mock.calls[0];
      const [startDateStr, endDateStr] = params;

      const now = new Date();
      const ninetyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);

      const expectedStart = `${ninetyDaysAgo.getFullYear()}-${String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysAgo.getDate()).padStart(2, '0')}`;
      const expectedEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      expect(startDateStr).toBe(expectedStart);
      expect(endDateStr).toBe(expectedEnd);
    });

    it('includes operations from today in top categories query', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getTopCategoriesFromLastMonth(3);

      const [, params] = queryAll.mock.calls[0];
      const endDateStr = params[1];

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      expect(endDateStr).toBe(todayStr);
    });
  });

  describe('Utility Functions', () => {
    it('checks if operation exists', async () => {
      queryFirst.mockResolvedValue({ 1: 1 });

      const exists = await OperationsDB.operationExists(1);

      expect(exists).toBe(true);
      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT 1 FROM operations WHERE id = ? LIMIT 1',
        [1],
      );
    });

    it('returns false for non-existent operation', async () => {
      queryFirst.mockResolvedValue(null);

      const exists = await OperationsDB.operationExists('non-existent');

      expect(exists).toBe(false);
    });

    it('gets today adjustment operation', async () => {
      const mockOp = {
        id: 1,
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
        expect.any(Array),
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
        { id: 1, type: 'expense', date: '2025-12-05', account_id: 'acc1' },
      ];
      queryAll.mockResolvedValue(mockOps);

      const result = await OperationsDB.getOperationsByWeekOffset(0);

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE date >= ? AND date <= ?'),
        expect.any(Array),
      );
      expect(result).toHaveLength(1);
      expect(result[0].accountId).toBe('acc1');
    });

    it('gets next oldest operation before date', async () => {
      const mockOp = {
        id: 1,
        type: 'expense',
        date: '2025-11-28',
        account_id: 'acc1',
      };
      queryFirst.mockResolvedValue(mockOp);

      const result = await OperationsDB.getNextOldestOperation('2025-12-01');

      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE date < ? ORDER BY date DESC, created_at DESC LIMIT 1',
        ['2025-12-01'],
      );
      expect(result.accountId).toBe('acc1');
    });

    it('gets operations by week from date', async () => {
      const mockOps = [
        { id: 1, type: 'expense', date: '2025-12-05', account_id: 'acc1' },
        { id: 2, type: 'income', date: '2025-11-30', account_id: 'acc2' },
      ];
      queryAll.mockResolvedValue(mockOps);

      const result = await OperationsDB.getOperationsByWeekFromDate('2025-12-05');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE date >= ? AND date <= ?'),
        expect.any(Array),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('Field Mapping', () => {
    it('maps database snake_case to camelCase', async () => {
      const dbOperation = {
        id: 1,
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

      const result = await OperationsDB.getOperationById(1);

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
        id: 1,
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

      const result = await OperationsDB.getOperationById(1);

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

      await expect(OperationsDB.getOperationById(1)).rejects.toThrow();
    });

    it('throws error on createOperation failure', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Insert failed'));

      await expect(
        OperationsDB.createOperation({
          id: 1,
          type: 'expense',
          amount: '100',
          accountId: 'acc1',
          categoryId: 'cat1',
          date: '2025-12-05',
        }),
      ).rejects.toThrow();
    });

    it('throws error on updateOperation failure', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.updateOperation(1, { amount: '200' }),
      ).rejects.toThrow();
    });

    it('throws error on deleteOperation failure', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.deleteOperation(1)).rejects.toThrow();
    });
  });

  describe('Regression Tests', () => {
    it('handles zero amount operation', async () => {
      const operation = {
        id: 1,
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
        call[0].includes('UPDATE accounts'),
      );
      expect(balanceUpdateCalls).toHaveLength(0);
    });

    it('preserves precision in currency calculations', async () => {
      const operation = {
        id: 1,
        type: 'expense',
        amount: '0.01',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue({ balance: '100.50' });

      await OperationsDB.createOperation(operation);

      // Currency module should handle precision
      expect(Currency.add).toHaveBeenCalledWith('100.50', '-0.01');
    });

    it('handles operations without optional fields', async () => {
      const operation = {
        id: 1,
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
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync.mockResolvedValue(oldOperation);

      // Simulate concurrent updates
      await Promise.all([
        OperationsDB.updateOperation(1, { amount: '150' }),
        OperationsDB.updateOperation(1, { description: 'Updated' }),
      ]);

      // Both should use transactions
      expect(executeTransaction).toHaveBeenCalledTimes(2);
    });

    it('uses exchange_rate to credit destination when destination_amount is null on cross-currency transfer', async () => {
      const operation = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-usd',
        toAccountId: 'acc-eur',
        exchangeRate: '0.9',
        date: '2025-12-05',
        // destination_amount intentionally omitted (simulates data-loss scenario)
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ currency: 'USD' }) // source account currency
        .mockResolvedValueOnce({ currency: 'EUR' }) // destination account currency
        .mockResolvedValueOnce({ balance: '1000.00' }) // source account balance
        .mockResolvedValueOnce({ balance: '500.00' });  // destination account balance

      await OperationsDB.createOperation(operation);

      // Source debited 100 USD
      expect(Currency.add).toHaveBeenCalledWith('1000.00', '-100');
      // Destination credited with convertAmount(100, USD, EUR, 0.9) = 90
      expect(Currency.convertAmount).toHaveBeenCalledWith('100', 'USD', 'EUR', '0.9');
      expect(Currency.add).toHaveBeenCalledWith('500.00', '90');
    });

    it('throws when destination_amount is null, currencies differ, and exchange_rate is missing', async () => {
      const operation = {
        type: 'transfer',
        amount: '100',
        accountId: 'acc-usd',
        toAccountId: 'acc-eur',
        // No exchangeRate and no destinationAmount
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ currency: 'USD' })
        .mockResolvedValueOnce({ currency: 'EUR' });

      await expect(OperationsDB.createOperation(operation)).rejects.toThrow(
        'missing destination_amount and exchange_rate',
      );
    });

    it('falls back to source amount for same-currency transfers missing destination_amount', async () => {
      const operation = {
        type: 'transfer',
        amount: '200',
        accountId: 'acc1',
        toAccountId: 'acc2',
        // No destinationAmount — both accounts share currency
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce({ currency: 'USD' }) // source
        .mockResolvedValueOnce({ currency: 'USD' }) // destination — same currency
        .mockResolvedValueOnce({ balance: '1000.00' })
        .mockResolvedValueOnce({ balance: '500.00' });

      await OperationsDB.createOperation(operation);

      // Destination receives the source amount unchanged
      expect(Currency.add).toHaveBeenCalledWith('1000.00', '-200');
      expect(Currency.add).toHaveBeenCalledWith('500.00', '200');
      expect(Currency.convertAmount).not.toHaveBeenCalled();
    });
  });

  describe('getFilteredOperationsByDateRange', () => {
    it('returns filtered operations by date range without filters', async () => {
      const mockOperations = [
        { id: 1, type: 'expense', amount: '100', account_id: 'acc1', category_id: 'cat1', date: '2025-12-05' },
      ];
      queryAll.mockResolvedValue(mockOperations);

      const result = await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', {});

      expect(queryAll).toHaveBeenCalled();
      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('WHERE o.date >= ? AND o.date <= ?');
      expect(result).toHaveLength(1);
    });

    it('filters by operation types', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { types: ['expense', 'income'] };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('o.type IN (?,?)');
    });

    it('skips type filter when all 3 types selected', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { types: ['expense', 'income', 'transfer'] };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).not.toContain('o.type IN');
    });

    it('filters by account IDs', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { accountIds: ['acc1', 'acc2'] };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('o.account_id IN (?,?) OR o.to_account_id IN (?,?)');
    });

    it('filters by category IDs', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { categoryIds: ['cat1'] };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('o.category_id IN (?)');
    });

    it('filters by amount range (min only)', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { amountRange: { min: 50, max: null } };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
      expect(sqlCall).not.toContain('CAST(o.amount AS REAL) <= ?');
    });

    it('filters by amount range (max only)', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { amountRange: { min: null, max: 200 } };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).not.toContain('CAST(o.amount AS REAL) >= ?');
      expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
    });

    it('filters by additional date range', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { dateRange: { startDate: '2025-12-10', endDate: '2025-12-20' } };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      // Should have date range from main params AND from filters
      expect((sqlCall.match(/o\.date >=/g) || []).length).toBe(2);
      expect((sqlCall.match(/o\.date <=/g) || []).length).toBe(2);
    });

    it('filters by date range with startDate only', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { dateRange: { startDate: '2025-12-10' } };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      expect(queryAll).toHaveBeenCalled();
    });

    it('filters by date range with endDate only', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { dateRange: { endDate: '2025-12-20' } };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      expect(queryAll).toHaveBeenCalled();
    });

    it('filters by search text', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { searchText: 'grocery' };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
      expect(sqlCall).toContain('SEARCH_NORM(a.name) LIKE ?');
      expect(sqlCall).toContain('SEARCH_NORM(to_a.name) LIKE ?');
      expect(sqlCall).toContain('SEARCH_NORM(c.name) LIKE ?');
      expect(sqlCall).toContain('SEARCH_NORM(pc.name) LIKE ?');
    });

    it('falls back to an inline LOWER()+REPLACE() Cyrillic-folding expression when SEARCH_NORM is unavailable', async () => {
      // On a real device expo-sqlite has no custom-function API, so isSearchNormAvailable()
      // is false. The SQL must still fold Cyrillic case + ё/е instead of bare SEARCH_NORM/LOWER.
      isSearchNormAvailable.mockReturnValue(false);
      queryAll.mockResolvedValue([]);

      const filters = { searchText: 'Самолёт' };
      await OperationsDB.getFilteredOperationsByDateRange('2025-01-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      const params = queryAll.mock.calls[0][1];
      // No custom function is referenced...
      expect(sqlCall).not.toContain('SEARCH_NORM(');
      // ...and the inline expression wraps each searchable column in LOWER()+REPLACE().
      expect(sqlCall).toContain('LOWER(o.description)');
      expect(sqlCall).toContain('LOWER(c.name)');
      expect(sqlCall).toContain('REPLACE(');
      expect(sqlCall).toContain("'Ё', 'е'");
      // The query term is still normalized (ё → е) so both halves use the same alphabet.
      expect(params).toContain('%самолет%');
    });

    it('trims search text before searching', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { searchText: '  coffee  ' };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const params = queryAll.mock.calls[0][1];
      expect(params).toContain('%coffee%');
    });

    it('passes only the lowercased search term — SEARCH_NORM handles all scripts', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { searchText: 'GROCERY' };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const params = queryAll.mock.calls[0][1];
      expect(params).toContain('%grocery%');
      // Only the lowercase variant is needed — SEARCH_NORM() on the DB side
      // converts stored values via JS toLowerCase(), which handles all Unicode.
      expect(params).not.toContain('%GROCERY%');
    });

    it('matches non-ASCII (Cyrillic) category names via SEARCH_NORM', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { searchText: 'Газ' };
      await OperationsDB.getFilteredOperationsByDateRange('2025-01-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      const params = queryAll.mock.calls[0][1];
      // SEARCH_NORM on the DB side means we only need the lowercase JS-normalised term.
      expect(sqlCall).toContain('SEARCH_NORM(c.name) LIKE ?');
      expect(sqlCall).toContain('SEARCH_NORM(pc.name) LIKE ?');
      expect(params).toContain('%газ%');
      expect(params).not.toContain('%Газ%');
    });

    it('includes parent category JOIN for hierarchy-aware text search', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { searchText: 'transport' };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('LEFT JOIN categories c ON o.category_id = c.id');
      expect(sqlCall).toContain('LEFT JOIN categories pc ON c.parent_id = pc.id');
    });

    it('parent JOIN is present even without search text (to support future use)', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { types: ['expense'] };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('LEFT JOIN categories pc ON c.parent_id = pc.id');
    });

    it('combines all filters correctly', async () => {
      queryAll.mockResolvedValue([]);

      const filters = {
        types: ['expense'],
        accountIds: ['acc1'],
        categoryIds: ['cat1'],
        amountRange: { min: 10, max: 100 },
        dateRange: { startDate: '2025-12-10' },
        searchText: 'test',
      };
      await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('o.type IN');
      expect(sqlCall).toContain('o.account_id IN');
      expect(sqlCall).toContain('o.category_id IN');
      expect(sqlCall).toContain('CAST(o.amount AS REAL) >=');
      expect(sqlCall).toContain('CAST(o.amount AS REAL) <=');
      expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE');
    });

    it('handles null result from query', async () => {
      queryAll.mockResolvedValue(null);

      const result = await OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', {});

      expect(result).toEqual([]);
    });

    it('throws error on query failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getFilteredOperationsByDateRange('2025-12-01', '2025-12-31', {}),
      ).rejects.toThrow('Query failed');
    });
  });

  describe('Forward Pagination Functions', () => {
    describe('getNextNewestOperation', () => {
      it('finds next operation after given date', async () => {
        const mockOperation = {
          id: 1,
          type: 'expense',
          amount: '100',
          account_id: 'acc1',
          date: '2025-12-10',
          created_at: '2025-12-10T10:00:00Z',
        };
        queryFirst.mockResolvedValue(mockOperation);

        const result = await OperationsDB.getNextNewestOperation('2025-12-05');

        expect(queryFirst).toHaveBeenCalledWith(
          'SELECT * FROM operations WHERE date > ? ORDER BY date ASC, created_at ASC LIMIT 1',
          ['2025-12-05'],
        );
        expect(result.id).toBe(1);
        expect(result.accountId).toBe('acc1');
      });

      it('returns null when no newer operations exist', async () => {
        queryFirst.mockResolvedValue(null);

        const result = await OperationsDB.getNextNewestOperation('2025-12-31');

        expect(result).toBeNull();
      });

      it('throws error on query failure', async () => {
        queryFirst.mockRejectedValue(new Error('Query failed'));

        await expect(
          OperationsDB.getNextNewestOperation('2025-12-05'),
        ).rejects.toThrow('Query failed');
      });
    });

    describe('getOperationsByWeekToDate', () => {
      it('gets operations for a week starting from date going forward', async () => {
        const mockOperations = [
          { id: 1, type: 'expense', amount: '100', account_id: 'acc1', date: '2025-12-05' },
          { id: 2, type: 'income', amount: '200', account_id: 'acc2', date: '2025-12-10' },
        ];
        queryAll.mockResolvedValue(mockOperations);

        const result = await OperationsDB.getOperationsByWeekToDate('2025-12-05');

        expect(queryAll).toHaveBeenCalledWith(
          expect.stringContaining('WHERE date >= ? AND date <= ?'),
          expect.any(Array),
        );
        // Start date should be 2025-12-05, end date should be 2025-12-11 (6 days later)
        const params = queryAll.mock.calls[0][1];
        expect(params[0]).toBe('2025-12-05');
        expect(params[1]).toBe('2025-12-11');
        expect(result).toHaveLength(2);
      });

      it('returns empty array when no operations', async () => {
        queryAll.mockResolvedValue([]);

        const result = await OperationsDB.getOperationsByWeekToDate('2025-12-05');

        expect(result).toEqual([]);
      });

      it('handles null result from query', async () => {
        queryAll.mockResolvedValue(null);

        const result = await OperationsDB.getOperationsByWeekToDate('2025-12-05');

        expect(result).toEqual([]);
      });

      it('throws error on query failure', async () => {
        queryAll.mockRejectedValue(new Error('Query failed'));

        await expect(
          OperationsDB.getOperationsByWeekToDate('2025-12-05'),
        ).rejects.toThrow('Query failed');
      });
    });

    describe('getNextNewestFilteredOperation', () => {
      it('finds next operation after date matching filters', async () => {
        const mockOperation = {
          id: 1,
          type: 'expense',
          amount: '100',
          account_id: 'acc1',
          date: '2025-12-10',
          created_at: '2025-12-10T10:00:00Z',
        };
        queryFirst.mockResolvedValue(mockOperation);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getNextNewestFilteredOperation('2025-12-05', filters);

        expect(queryFirst).toHaveBeenCalled();
        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('WHERE o.date > ?');
        expect(sqlCall).toContain('o.type IN (?)');
        expect(sqlCall).toContain('ORDER BY o.date ASC, o.created_at ASC LIMIT 1');
        expect(result.id).toBe(1);
      });

      it('returns null when no matching operations exist', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getNextNewestFilteredOperation('2025-12-31', filters);

        expect(result).toBeNull();
      });

      it('applies account filters', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { accountIds: ['acc1', 'acc2'] };
        await OperationsDB.getNextNewestFilteredOperation('2025-12-05', filters);

        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('o.account_id IN (?,?) OR o.to_account_id IN (?,?)');
      });

      it('applies category filters', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { categoryIds: ['cat1'] };
        await OperationsDB.getNextNewestFilteredOperation('2025-12-05', filters);

        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('o.category_id IN (?)');
      });

      it('applies amount range filters', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { amountRange: { min: 10, max: 100 } };
        await OperationsDB.getNextNewestFilteredOperation('2025-12-05', filters);

        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
        expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
      });

      it('applies date range filters', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { dateRange: { startDate: '2025-12-01', endDate: '2025-12-31' } };
        await OperationsDB.getNextNewestFilteredOperation('2025-12-05', filters);

        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('o.date >= ?');
        expect(sqlCall).toContain('o.date <= ?');
      });

      it('applies search text filter', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { searchText: 'grocery' };
        await OperationsDB.getNextNewestFilteredOperation('2025-12-05', filters);

        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
      });

      it('throws error on query failure', async () => {
        queryFirst.mockRejectedValue(new Error('Query failed'));

        await expect(
          OperationsDB.getNextNewestFilteredOperation('2025-12-05', {}),
        ).rejects.toThrow('Query failed');
      });
    });

    describe('getFilteredOperationsByWeekToDate', () => {
      it('gets filtered operations for a week starting from date', async () => {
        const mockOperations = [
          { id: 1, type: 'expense', amount: '100', account_id: 'acc1', date: '2025-12-05' },
        ];
        queryAll.mockResolvedValue(mockOperations);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

        expect(queryAll).toHaveBeenCalled();
        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('WHERE o.date >= ? AND o.date <= ?');
        expect(sqlCall).toContain('o.type IN (?)');
        expect(result).toHaveLength(1);
      });

      it('calculates correct week range (6 days forward)', async () => {
        queryAll.mockResolvedValue([]);

        await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', {});

        const params = queryAll.mock.calls[0][1];
        expect(params[0]).toBe('2025-12-05');
        expect(params[1]).toBe('2025-12-11');
      });

      it('applies account filters', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { accountIds: ['acc1'] };
        await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.account_id IN (?)');
      });

      it('applies category filters', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { categoryIds: ['cat1', 'cat2'] };
        await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.category_id IN (?,?)');
      });

      it('applies amount range filters', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { amountRange: { min: 50, max: null } };
        await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
      });

      it('applies date range filters', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { dateRange: { startDate: '2025-12-06' } };
        await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect((sqlCall.match(/o\.date >=/g) || []).length).toBe(2);
      });

      it('applies search text filter', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: 'test' };
        await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
      });

      it('returns empty array when no operations match', async () => {
        queryAll.mockResolvedValue([]);

        const result = await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', {});

        expect(result).toEqual([]);
      });

      it('handles null result from query', async () => {
        queryAll.mockResolvedValue(null);

        const result = await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', {});

        expect(result).toEqual([]);
      });

      it('throws error on query failure', async () => {
        queryAll.mockRejectedValue(new Error('Query failed'));

        await expect(
          OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', {}),
        ).rejects.toThrow('Query failed');
      });
    });
  });

  describe('Additional Error Handling', () => {
    it('getOperationsByAccount throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getOperationsByAccount('acc1')).rejects.toThrow('Query failed');
    });

    it('getOperationsByCategory throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getOperationsByCategory('cat1')).rejects.toThrow('Query failed');
    });

    it('getOperationsByDateRange throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getOperationsByDateRange('2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('getOperationsByType throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getOperationsByType('expense')).rejects.toThrow('Query failed');
    });

    it('getTotalExpenses throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getTotalExpenses('acc1', '2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('getTotalIncome throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getTotalIncome('acc1', '2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('getSpendingByCategory throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getSpendingByCategory('2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('getIncomeByCategory throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getIncomeByCategory('2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('getSpendingByCategoryAndCurrency throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getSpendingByCategoryAndCurrency('USD', '2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('getIncomeByCategoryAndCurrency throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getIncomeByCategoryAndCurrency('USD', '2025-12-01', '2025-12-31'),
      ).rejects.toThrow('Query failed');
    });

    it('operationExists throws error on failure', async () => {
      queryFirst.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.operationExists(1)).rejects.toThrow('Query failed');
    });

    it('getTodayAdjustmentOperation throws error on failure', async () => {
      queryFirst.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getTodayAdjustmentOperation('acc1'),
      ).rejects.toThrow('Query failed');
    });

    it('getAvailableMonths throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getAvailableMonths()).rejects.toThrow('Query failed');
    });

    it('getOperationsByWeekOffset throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(OperationsDB.getOperationsByWeekOffset(0)).rejects.toThrow('Query failed');
    });

    it('getNextOldestOperation throws error on failure', async () => {
      queryFirst.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getNextOldestOperation('2025-12-05'),
      ).rejects.toThrow('Query failed');
    });

    it('getOperationsByWeekFromDate throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getOperationsByWeekFromDate('2025-12-05'),
      ).rejects.toThrow('Query failed');
    });

    it('getFilteredOperationsByWeekFromDate throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', {}),
      ).rejects.toThrow('Query failed');
    });

    it('getNextOldestFilteredOperation throws error on failure', async () => {
      queryFirst.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getNextOldestFilteredOperation('2025-12-05', {}),
      ).rejects.toThrow('Query failed');
    });

    it('getFilteredOperationsByWeekOffset throws error on failure', async () => {
      queryAll.mockRejectedValue(new Error('Query failed'));

      await expect(
        OperationsDB.getFilteredOperationsByWeekOffset(0, {}),
      ).rejects.toThrow('Query failed');
    });
  });

  describe('Update Operation - Additional Cases', () => {
    it('updates toAccountId field', async () => {
      const oldOperation = {
        id: 1,
        type: 'transfer',
        amount: '100',
        account_id: 'acc1',
        to_account_id: 'acc2',
        date: '2025-12-05',
      };

      const updatedOperation = {
        ...oldOperation,
        to_account_id: 'acc3',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)
        .mockResolvedValueOnce(updatedOperation)
        .mockResolvedValueOnce({ currency: null }) // old op acc1 currency (same-currency)
        .mockResolvedValueOnce({ currency: null }) // old op acc2 currency
        .mockResolvedValueOnce({ currency: null }) // new op acc1 currency
        .mockResolvedValueOnce({ currency: null }) // new op acc3 currency
        .mockResolvedValueOnce({ balance: '500' })  // acc2 balance (acc1 delta is zero, skipped)
        .mockResolvedValueOnce({ balance: '800' }); // acc3 balance

      await OperationsDB.updateOperation(1, { toAccountId: 'acc3' });

      // Should update the operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('to_account_id = ?'),
        expect.arrayContaining(['acc3', 1]),
      );
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(8);
    });

    it('extracts ID from object for toAccountId', async () => {
      const oldOperation = {
        id: 1,
        type: 'transfer',
        amount: '100',
        account_id: 'acc1',
        to_account_id: 'acc2',
        date: '2025-12-05',
      };

      const updatedOperation = {
        ...oldOperation,
        to_account_id: 'acc3',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)             // get old operation
        .mockResolvedValueOnce(updatedOperation)         // get updated operation
        // calculateBalanceChanges currency queries (same-currency path for both old and new)
        .mockResolvedValueOnce({ currency: null })       // old op: acc1 currency
        .mockResolvedValueOnce({ currency: null })       // old op: acc2 currency
        .mockResolvedValueOnce({ currency: null })       // new op: acc1 currency
        .mockResolvedValueOnce({ currency: null })       // new op: acc3 currency
        // balance lookups (acc1 net delta=0 skipped; acc2 old-only; acc3 new-required)
        .mockResolvedValueOnce({ balance: '500' })       // acc2 balance (old-only account)
        .mockResolvedValueOnce({ balance: '300' });      // acc3 balance (new operation account)

      await OperationsDB.updateOperation(1, { toAccountId: { id: 'acc3' } });

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('to_account_id = ?'),
        expect.arrayContaining(['acc3', 1]),
      );
    });
  });

  describe('Delete Operation - Additional Cases', () => {
    it('throws and rolls back when account not found during balance reversal (#746)', async () => {
      // Regression test: deleteOperation must not commit the DELETE when the
      // subsequent balance-update step fails due to a missing account. The whole
      // transaction must be atomic — a missing account should abort via throw,
      // not silently skip.
      const operation = {
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        date: '2025-12-05',
      };

      mockDb.getFirstAsync
        .mockResolvedValueOnce(operation)  // Get operation
        .mockResolvedValueOnce(null);      // Account not found during balance update

      await expect(OperationsDB.deleteOperation(1)).rejects.toThrow(
        'Account acc1 not found',
      );
    });
  });

  describe('Update Operation - Atomicity Guard (#746)', () => {
    it('throws and rolls back when account not found during balance update', async () => {
      // Regression test: updateOperation must not commit the UPDATE when the
      // balance-update step fails due to a missing account. Both must be atomic.
      const oldOperation = {
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      const updatedOperation = {
        ...oldOperation,
        amount: '200',
      };

      // For expense type, calculateBalanceChanges makes no getFirstAsync calls.
      // Sequence: fetch old op, fetch updated op, then account balance lookup (missing → throw).
      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)     // Fetch old operation
        .mockResolvedValueOnce(updatedOperation) // Fetch updated operation after UPDATE
        .mockResolvedValueOnce(null);            // Account balance lookup → missing → throw

      await expect(OperationsDB.updateOperation(1, { amount: '200' })).rejects.toThrow(
        'Account acc1 not found',
      );
    });
  });

  describe('Split Operation - Atomicity Guard (#746)', () => {
    it('throws and rolls back when account not found during balance update', async () => {
      // Regression test: splitOperation must not commit either the UPDATE or the
      // INSERT when the balance-update step fails due to a missing account.
      //
      // Amounts are chosen so the net delta is non-zero (old=100 reversed=+100,
      // updated=-60, new=-80 → net=-40) so the balance loop body is reached and
      // the missing-account throw fires.
      const oldOperation = {
        id: 1,
        type: 'expense',
        amount: '100',
        account_id: 'acc1',
        category_id: 'cat1',
        date: '2025-12-05',
      };

      const updatedOperation = {
        ...oldOperation,
        amount: '60',
      };

      // For expense type, calculateBalanceChanges makes no getFirstAsync calls.
      // Sequence: fetch old op, fetch updated op, then account balance lookup (missing → throw).
      mockDb.getFirstAsync
        .mockResolvedValueOnce(oldOperation)     // Fetch old operation (step 1)
        .mockResolvedValueOnce(updatedOperation) // Fetch updated operation after UPDATE (step 2)
        .mockResolvedValueOnce(null);            // Account balance lookup → missing → throw

      mockDb.runAsync
        .mockResolvedValueOnce(undefined)                // UPDATE original operation
        .mockResolvedValueOnce({ lastInsertRowId: 42 }); // INSERT new split operation

      const newOperationData = {
        type: 'expense',
        amount: '80',
        accountId: 'acc1',
        categoryId: 'cat1',
        date: '2025-12-05',
      };

      await expect(
        OperationsDB.splitOperation(1, { amount: '60' }, newOperationData),
      ).rejects.toThrow('Account acc1 not found');
    });
  });

  describe('getNextOldestFilteredOperation - Additional Filters', () => {
    it('applies amount range min filter', async () => {
      queryFirst.mockResolvedValue(null);

      const filters = { amountRange: { min: 50, max: null } };
      await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

      const sqlCall = queryFirst.mock.calls[0][0];
      expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
    });

    it('applies amount range max filter', async () => {
      queryFirst.mockResolvedValue(null);

      const filters = { amountRange: { min: null, max: 200 } };
      await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

      const sqlCall = queryFirst.mock.calls[0][0];
      expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
    });

    it('applies date range startDate filter', async () => {
      queryFirst.mockResolvedValue(null);

      const filters = { dateRange: { startDate: '2025-11-01' } };
      await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

      const sqlCall = queryFirst.mock.calls[0][0];
      expect(sqlCall).toContain('o.date >= ?');
    });

    it('applies date range endDate filter', async () => {
      queryFirst.mockResolvedValue(null);

      const filters = { dateRange: { endDate: '2025-12-31' } };
      await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

      const sqlCall = queryFirst.mock.calls[0][0];
      expect(sqlCall).toContain('o.date <= ?');
    });

    it('applies search text filter', async () => {
      queryFirst.mockResolvedValue(null);

      const filters = { searchText: 'coffee' };
      await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

      const sqlCall = queryFirst.mock.calls[0][0];
      expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
    });

    it('applies category filters to getNextOldestFilteredOperation', async () => {
      queryFirst.mockResolvedValue(null);

      const filters = { categoryIds: ['cat1', 'cat2'] };
      await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

      const sqlCall = queryFirst.mock.calls[0][0];
      expect(sqlCall).toContain('o.category_id IN (?,?)');
      const params = queryFirst.mock.calls[0][1];
      expect(params).toContain('cat1');
      expect(params).toContain('cat2');
    });
  });

  describe('getFilteredOperationsByWeekToDate - Additional Filters', () => {
    it('applies amount range max filter', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { amountRange: { min: null, max: 500 } };
      await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
      const params = queryAll.mock.calls[0][1];
      expect(params).toContain(500);
    });

    it('applies amount range with both min and max', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { amountRange: { min: 10, max: 100 } };
      await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
      expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
    });

    it('applies date range endDate filter', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { dateRange: { endDate: '2025-12-10' } };
      await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect(sqlCall).toContain('o.date <= ?');
      const params = queryAll.mock.calls[0][1];
      expect(params).toContain('2025-12-10');
    });

    it('applies date range with both startDate and endDate', async () => {
      queryAll.mockResolvedValue([]);

      const filters = { dateRange: { startDate: '2025-12-06', endDate: '2025-12-09' } };
      await OperationsDB.getFilteredOperationsByWeekToDate('2025-12-05', filters);

      const sqlCall = queryAll.mock.calls[0][0];
      expect((sqlCall.match(/o\.date >=/g) || []).length).toBe(2);
      expect((sqlCall.match(/o\.date <=/g) || []).length).toBe(2);
    });
  });

  describe('Filtered Query Operations', () => {
    describe('getFilteredOperationsByWeekFromDate', () => {
      it('filters operations by type', async () => {
        const mockOperations = [
          {
            id: 1,
            type: 'expense',
            amount: '100',
            account_id: 'acc1',
            category_id: 'cat1',
            date: '2025-12-05',
            created_at: '2025-12-05T10:00:00Z',
          },
        ];
        queryAll.mockResolvedValue(mockOperations);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        expect(queryAll).toHaveBeenCalled();
        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.type IN (?)');
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('expense');
      });

      it('filters by multiple account IDs', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { accountIds: ['acc1', 'acc2'] };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.account_id IN (?,?) OR o.to_account_id IN (?,?)');
      });

      it('filters by category IDs', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { categoryIds: ['cat1', 'cat2'] };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.category_id IN (?,?)');
      });

      it('filters by search text across multiple fields', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: 'grocery' };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
        expect(sqlCall).toContain('o.amount LIKE ?');
        expect(sqlCall).toContain('SEARCH_NORM(a.name) LIKE ?');
        expect(sqlCall).toContain('SEARCH_NORM(c.name) LIKE ?');
        expect(sqlCall).toContain('SEARCH_NORM(pc.name) LIKE ?');
      });

      it('filters by amount range (min and max)', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { amountRange: { min: 10, max: 100 } };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
        expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
      });

      it('filters by amount range (min only)', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { amountRange: { min: 10, max: null } };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
        expect(sqlCall).not.toContain('CAST(o.amount AS REAL) <= ?');
      });

      it('filters by date range', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { dateRange: { startDate: '2025-12-01', endDate: '2025-12-31' } };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.date >= ?');
        expect(sqlCall).toContain('o.date <= ?');
      });

      it('combines multiple filters correctly', async () => {
        queryAll.mockResolvedValue([]);

        const filters = {
          types: ['expense'],
          accountIds: ['acc1'],
          searchText: 'test',
          amountRange: { min: 10, max: 100 },
        };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('o.type IN (?)');
        expect(sqlCall).toContain('o.account_id IN (?)');
        expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
        expect(sqlCall).toContain('CAST(o.amount AS REAL) >= ?');
        expect(sqlCall).toContain('CAST(o.amount AS REAL) <= ?');
      });

      it('returns empty array when no operations match', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        expect(result).toEqual([]);
      });

      it('handles special characters in search text safely', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: "'; DROP TABLE operations; --" };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        // Should use parameterized query, not string interpolation
        const params = queryAll.mock.calls[0][1];
        expect(params).toContain("%'; drop table operations; --%");
      });

      it('uses DISTINCT to avoid duplicates from JOINs', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: 'test' };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('SELECT DISTINCT o.*');
      });

      it('includes parent category JOIN for hierarchy-aware text search', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: 'путешествия' };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('LEFT JOIN categories c ON o.category_id = c.id');
        expect(sqlCall).toContain('LEFT JOIN categories pc ON c.parent_id = pc.id');
      });

      it('Cyrillic parent category name search passes lowercase term to SEARCH_NORM', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: 'Транспорт' };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const params = queryAll.mock.calls[0][1];
        expect(params).toContain('%транспорт%');
        expect(params).not.toContain('%Транспорт%');
      });

      it('orders results by date DESC and created_at DESC', async () => {
        queryAll.mockResolvedValue([]);

        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', {});

        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).toContain('ORDER BY o.date DESC, o.created_at DESC');
      });
    });

    describe('getNextOldestFilteredOperation', () => {
      it('finds next operation before given date matching filters', async () => {
        const mockOperation = {
          id: 1,
          type: 'expense',
          amount: '100',
          account_id: 'acc1',
          date: '2025-12-01',
          created_at: '2025-12-01T10:00:00Z',
        };
        queryFirst.mockResolvedValue(mockOperation);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

        expect(queryFirst).toHaveBeenCalled();
        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('WHERE o.date < ?');
        expect(sqlCall).toContain('LIMIT 1');
        expect(result.id).toBe(1);
      });

      it('returns null when no older operations match filters', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = { types: ['expense'] };
        const result = await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

        expect(result).toBeNull();
      });

      it('applies same filters as getFilteredOperationsByWeekFromDate', async () => {
        queryFirst.mockResolvedValue(null);

        const filters = {
          types: ['expense'],
          accountIds: ['acc1'],
          searchText: 'test',
        };
        await OperationsDB.getNextOldestFilteredOperation('2025-12-05', filters);

        const sqlCall = queryFirst.mock.calls[0][0];
        expect(sqlCall).toContain('o.type IN (?)');
        expect(sqlCall).toContain('o.account_id IN (?)');
        expect(sqlCall).toContain('SEARCH_NORM(o.description) LIKE ?');
      });
    });

    describe('getFilteredOperationsByWeekOffset', () => {
      it('calculates date from week offset and calls getFilteredOperationsByWeekFromDate', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { types: ['expense'] };
        await OperationsDB.getFilteredOperationsByWeekOffset(0, filters);

        expect(queryAll).toHaveBeenCalled();
      });

      it('handles week offset 0 (current week)', async () => {
        queryAll.mockResolvedValue([]);

        const filters = {};
        await OperationsDB.getFilteredOperationsByWeekOffset(0, filters);

        expect(queryAll).toHaveBeenCalled();
        const params = queryAll.mock.calls[0][1];
        expect(params).toHaveLength(2); // startDate and endDate
      });

      it('handles week offset 1 (previous week)', async () => {
        queryAll.mockResolvedValue([]);

        const filters = {};
        await OperationsDB.getFilteredOperationsByWeekOffset(1, filters);

        expect(queryAll).toHaveBeenCalled();
      });
    });

    describe('Regression Tests', () => {
      it('handles empty filters object gracefully', async () => {
        queryAll.mockResolvedValue([]);

        const result = await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', {});

        expect(result).toEqual([]);
        expect(queryAll).toHaveBeenCalled();
      });

      it('handles null/undefined filter values', async () => {
        queryAll.mockResolvedValue([]);

        const filters = {
          types: null,
          accountIds: undefined,
          searchText: null,
          amountRange: { min: null, max: null },
        };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        expect(queryAll).toHaveBeenCalled();
      });

      it('handles empty arrays in filters', async () => {
        queryAll.mockResolvedValue([]);

        const filters = {
          types: [],
          accountIds: [],
          categoryIds: [],
        };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        const sqlCall = queryAll.mock.calls[0][0];
        // Empty arrays should not add WHERE clauses
        expect(sqlCall).not.toContain('o.type IN ()');
      });

      it('handles whitespace-only search text', async () => {
        queryAll.mockResolvedValue([]);

        const filters = { searchText: '   ' };
        await OperationsDB.getFilteredOperationsByWeekFromDate('2025-12-05', filters);

        // Should trim and skip search
        const sqlCall = queryAll.mock.calls[0][0];
        expect(sqlCall).not.toContain('o.description LIKE ?');
      });
    });
  });

  describe('getMonthlySpendingByCategories', () => {
    it('returns monthly totals as Decimal-safe strings, aggregated in app code', async () => {
      // DB returns individual rows with month + amount (no SQL-level GROUP BY/SUM)
      const mockResults = [
        { month: 1, amount: '100.25' },
        { month: 1, amount: '50.25' },
        { month: 3, amount: '200.0' },
        { month: 6, amount: '75.25' },
      ];
      queryAll.mockResolvedValue(mockResults);

      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1', 'cat2']);

      expect(queryAll).toHaveBeenCalled();
      expect(result).toEqual([
        { month: 1, total: '150.5' },
        { month: 3, total: '200' },
        { month: 6, total: '75.25' },
      ]);
    });

    it('filters by currency correctly', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getMonthlySpendingByCategories('EUR', 2024, ['cat1']);

      const params = queryAll.mock.calls[0][1];
      expect(params[0]).toBe('EUR');
    });

    it('filters by year correctly', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getMonthlySpendingByCategories('USD', 2023, ['cat1']);

      const params = queryAll.mock.calls[0][1];
      expect(params[1]).toBe('2023-01-01');
      expect(params[2]).toBe('2023-12-31');
    });

    it('returns empty array when no matches', async () => {
      queryAll.mockResolvedValue([]);

      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1']);

      expect(result).toEqual([]);
    });

    it('handles multiple category IDs', async () => {
      queryAll.mockResolvedValue([{ month: 5, amount: '100' }]);

      await OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1', 'cat2', 'cat3']);

      const sql = queryAll.mock.calls[0][0];
      expect(sql).toContain('IN (?,?,?)');
      const params = queryAll.mock.calls[0][1];
      expect(params).toContain('cat1');
      expect(params).toContain('cat2');
      expect(params).toContain('cat3');
    });

    it('groups by month correctly using app-side accumulation', async () => {
      const mockResults = [
        { month: 1, amount: '100' },
        { month: 2, amount: '200' },
        { month: 12, amount: '300' },
      ];
      queryAll.mockResolvedValue(mockResults);

      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1']);

      expect(result).toHaveLength(3);
      expect(result[0].month).toBe(1);
      expect(result[1].month).toBe(2);
      expect(result[2].month).toBe(12);
    });

    it('returns empty array when categoryIds is empty', async () => {
      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, []);

      expect(queryAll).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array when categoryIds is null', async () => {
      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, null);

      expect(queryAll).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty array when categoryIds is undefined', async () => {
      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, undefined);

      expect(queryAll).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('handles database errors gracefully', async () => {
      queryAll.mockRejectedValue(new Error('Database error'));

      await expect(
        OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1']),
      ).rejects.toThrow('Database error');
    });

    it('accumulates per-month totals using Currency.add for Decimal-safe arithmetic', async () => {
      queryAll.mockResolvedValue([
        { month: 1, amount: '100' },
        { month: 1, amount: '50.5' },
        { month: 2, amount: '200' },
      ]);

      const result = await OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1']);

      // Two rows for month 1 are accumulated; month 2 stays separate
      expect(result).toHaveLength(2);
      expect(result[0].month).toBe(1);
      expect(result[1].month).toBe(2);
      // Verify Currency.add was called for accumulation (precision comes from real Decimal.js impl)
      expect(Currency.add).toHaveBeenCalled();
    });

    it('uses correct SQL query structure', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getMonthlySpendingByCategories('USD', 2024, ['cat1']);

      const sql = queryAll.mock.calls[0][0];
      expect(sql).toContain("o.type = 'expense'");
      expect(sql).toContain('a.currency = ?');
      expect(sql).toContain('o.category_id IN');
      expect(sql).toContain('ORDER BY month ASC');
    });
  });

  describe('initializeDefaultOperations', () => {
    beforeEach(() => {
      // Reset mocks for these tests
      AccountsDB.getAllAccounts.mockReset();
      getDefaultOperations.mockReset();

      // Mock balance history update (called within transaction)
      mockDb.getFirstAsync.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT balance FROM accounts')) {
          return { balance: '1000' };
        }
        return null;
      });
    });

    it('skips initialization when no accounts exist', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      await OperationsDB.initializeDefaultOperations();

      expect(AccountsDB.getAllAccounts).toHaveBeenCalled();
      expect(getDefaultOperations).not.toHaveBeenCalled();
    });

    it('skips initialization when accounts is null', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue(null);

      await OperationsDB.initializeDefaultOperations();

      expect(getDefaultOperations).not.toHaveBeenCalled();
    });

    it('uses first visible account as primary', async () => {
      const accounts = [
        { id: 1, name: 'First', hidden: 0 },
        { id: 2, name: 'Second', hidden: 0 },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue([]);

      await OperationsDB.initializeDefaultOperations();

      expect(getDefaultOperations).toHaveBeenCalledWith(1, 2);
    });

    it('uses second visible account for transfers', async () => {
      const accounts = [
        { id: 1, name: 'First', hidden: 0 },
        { id: 2, name: 'Second', hidden: 0 },
        { id: 3, name: 'Third', hidden: 0 },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue([]);

      await OperationsDB.initializeDefaultOperations();

      expect(getDefaultOperations).toHaveBeenCalledWith(1, 2);
    });

    it('passes null as secondary when only one visible account', async () => {
      const accounts = [
        { id: 1, name: 'First', hidden: 0 },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue([]);

      await OperationsDB.initializeDefaultOperations();

      expect(getDefaultOperations).toHaveBeenCalledWith(1, null);
    });

    it('skips hidden accounts when selecting primary', async () => {
      const accounts = [
        { id: 1, name: 'Hidden', hidden: 1 },
        { id: 2, name: 'Visible', hidden: 0 },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue([]);

      await OperationsDB.initializeDefaultOperations();

      expect(getDefaultOperations).toHaveBeenCalledWith(2, null);
    });

    it('falls back to first account when all accounts are hidden', async () => {
      const accounts = [
        { id: 1, name: 'Hidden1', hidden: 1 },
        { id: 2, name: 'Hidden2', hidden: 1 },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue([]);

      await OperationsDB.initializeDefaultOperations();

      // Falls back to first account when no visible accounts
      expect(getDefaultOperations).toHaveBeenCalledWith(1, null);
    });

    it('creates operations for each default operation', async () => {
      const accounts = [
        { id: 1, name: 'Main', hidden: 0 },
        { id: 2, name: 'Savings', hidden: 0 },
      ];
      const defaultOps = [
        { type: 'income', amount: '2500', accountId: 1, categoryId: 'income-salary', date: '2025-01-15' },
        { type: 'expense', amount: '25.50', accountId: 1, categoryId: 'expense-food', date: '2025-01-15' },
        { type: 'transfer', amount: '100', accountId: 1, toAccountId: 2, categoryId: null, date: '2025-01-15' },
      ];

      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue(defaultOps);

      await OperationsDB.initializeDefaultOperations();

      // Each operation should trigger a transaction
      // createOperation is called 3 times, each with executeTransaction
      expect(executeTransaction).toHaveBeenCalledTimes(3);
    });

    it('throws error on database failure', async () => {
      AccountsDB.getAllAccounts.mockRejectedValue(new Error('Database error'));

      await expect(OperationsDB.initializeDefaultOperations()).rejects.toThrow('Database error');
    });

    it('handles operation creation failure', async () => {
      const accounts = [{ id: 1, name: 'Main', hidden: 0 }];
      const defaultOps = [{ type: 'expense', amount: '25', accountId: 1, categoryId: 'cat1', date: '2025-01-15' }];

      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue(defaultOps);
      executeTransaction.mockRejectedValue(new Error('Insert failed'));

      await expect(OperationsDB.initializeDefaultOperations()).rejects.toThrow('Insert failed');
    });

    it('updates account balances via createOperation', async () => {
      const accounts = [{ id: 1, name: 'Main', hidden: 0, balance: '1000' }];
      const defaultOps = [
        { type: 'income', amount: '500', accountId: 1, categoryId: 'income-salary', date: '2025-01-15' },
      ];

      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue(defaultOps);

      // Mock for balance lookup and update within transaction
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.initializeDefaultOperations();

      // Verify transaction was called (balance updates happen inside createOperation)
      expect(executeTransaction).toHaveBeenCalled();
      // Verify balance update was called within transaction
      expect(mockDb.runAsync).toHaveBeenCalled();
    });

    it('updates balance history via createOperation', async () => {
      const accounts = [{ id: 1, name: 'Main', hidden: 0 }];
      const defaultOps = [
        { type: 'expense', amount: '50', accountId: 1, categoryId: 'expense-food', date: '2025-01-15' },
      ];

      AccountsDB.getAllAccounts.mockResolvedValue(accounts);
      getDefaultOperations.mockReturnValue(defaultOps);
      mockDb.getFirstAsync.mockResolvedValue({ balance: '1000' });

      await OperationsDB.initializeDefaultOperations();

      // The createOperation function updates balance history via updateTodayBalance
      // which is called within the transaction
      expect(mockDb.runAsync).toHaveBeenCalled();
      // Check that INSERT OR REPLACE for balance history was called
      const calls = mockDb.runAsync.mock.calls;
      const balanceHistoryCall = calls.find(call =>
        call[0].includes('accounts_balance_history'),
      );
      expect(balanceHistoryCall).toBeDefined();
    });
  });

  describe('getTopTransferTargetAccounts', () => {
    it('returns top transfer target accounts ordered by frequency', async () => {
      queryAll.mockResolvedValue([
        { to_account_id: 'acc-2', count: 5 },
        { to_account_id: 'acc-3', count: 3 },
      ]);

      const result = await OperationsDB.getTopTransferTargetAccounts(3);

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining("type = 'transfer'"),
        expect.arrayContaining([3]),
      );
      expect(result).toEqual([
        { accountId: 'acc-2', count: 5 },
        { accountId: 'acc-3', count: 3 },
      ]);
    });

    it('returns empty array when no transfer history', async () => {
      queryAll.mockResolvedValue([]);

      const result = await OperationsDB.getTopTransferTargetAccounts(3);

      expect(result).toEqual([]);
    });

    it('returns empty array when queryAll returns null', async () => {
      queryAll.mockResolvedValue(null);

      const result = await OperationsDB.getTopTransferTargetAccounts(3);

      expect(result).toEqual([]);
    });

    it('uses default limit of 3', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getTopTransferTargetAccounts();

      expect(queryAll).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([3]),
      );
    });

    it('queries last 90 days', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getTopTransferTargetAccounts(3);

      const callArgs = queryAll.mock.calls[0];
      const sql = callArgs[0];
      expect(sql).toContain('date >= ?');
      expect(sql).toContain('date <= ?');
      expect(sql).toContain('to_account_id IS NOT NULL');
    });

    it('throws on database error', async () => {
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(OperationsDB.getTopTransferTargetAccounts(3)).rejects.toThrow('DB error');
    });
  });

  describe('getDistinctDescriptions', () => {
    it('returns descriptions ordered by frequency', async () => {
      queryAll.mockResolvedValue([
        { description: 'Coffee' },
        { description: 'Groceries' },
        { description: 'Rent' },
      ]);

      const result = await OperationsDB.getDistinctDescriptions();

      expect(result).toEqual(['Coffee', 'Groceries', 'Rent']);
    });

    it('returns empty array when no descriptions exist', async () => {
      queryAll.mockResolvedValue([]);

      const result = await OperationsDB.getDistinctDescriptions();

      expect(result).toEqual([]);
    });

    it('queries with GROUP BY, ORDER BY COUNT and applies limit', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getDistinctDescriptions(50);

      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('GROUP BY description');
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('LIMIT ?');
      expect(sql).toContain("description IS NOT NULL AND description != ''");
      expect(sql).toContain("description NOT LIKE '[MoneyOK]%'");
      expect(params).toEqual([50]);
    });

    it('uses default limit of 100', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getDistinctDescriptions();

      const [, params] = queryAll.mock.calls[0];
      expect(params).toEqual([100]);
    });

    it('throws on database error', async () => {
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(OperationsDB.getDistinctDescriptions()).rejects.toThrow('DB error');
    });

    it('prioritises same-category descriptions when categoryId is provided', async () => {
      queryAll.mockResolvedValue([
        { description: 'Coffee' },
        { description: 'Groceries' },
      ]);

      const result = await OperationsDB.getDistinctDescriptions(100, 'cat-1');

      expect(result).toEqual(['Coffee', 'Groceries']);
      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('CASE WHEN category_id = ?');
      expect(params).toEqual(['cat-1', 100]);
    });

    it('sorts same-category descriptions by closest amount when both categoryId and amount are provided', async () => {
      queryAll.mockResolvedValue([
        { description: 'Coffee' },
        { description: 'Groceries' },
      ]);

      const result = await OperationsDB.getDistinctDescriptions(100, 'cat-1', 25.5);

      expect(result).toEqual(['Coffee', 'Groceries']);
      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('ABS(CAST(amount AS REAL) - ?)');
      expect(params).toEqual(['cat-1', 'cat-1', 25.5, 100]);
    });

    it('skips amount sort when amount is null even if categoryId is set', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getDistinctDescriptions(100, 'cat-1', null);

      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).not.toContain('ABS(CAST(amount AS REAL)');
      expect(params).toEqual(['cat-1', 100]);
    });

    it('uses frequency-only ordering when no categoryId is provided', async () => {
      queryAll.mockResolvedValue([]);

      await OperationsDB.getDistinctDescriptions(100, null);

      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).not.toContain('CASE WHEN');
      expect(params).toEqual([100]);
    });
  });

  describe('Enum validation in mapOperationFields', () => {
    const validRow = (overrides = {}) => ({
      id: 1,
      type: 'expense',
      amount: '50',
      account_id: 10,
      category_id: 'cat-1',
      to_account_id: null,
      date: '2026-01-01',
      created_at: '2026-01-01T00:00:00Z',
      description: null,
      exchange_rate: null,
      destination_amount: null,
      source_currency: null,
      destination_currency: null,
      ...overrides,
    });

    it('returns mapped operation for each valid type', async () => {
      for (const type of ['expense', 'income', 'transfer']) {
        queryAll.mockResolvedValue([validRow({ type })]);
        const result = await OperationsDB.getAllOperations();
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(type);
      }
    });

    it('filters out operations with an invalid type from array results', async () => {
      queryAll.mockResolvedValue([
        validRow({ id: 1, type: 'expense' }),
        validRow({ id: 2, type: 'invalid_type' }),
        validRow({ id: 3, type: 'income' }),
      ]);

      const result = await OperationsDB.getAllOperations();

      expect(result).toHaveLength(2);
      expect(result.map(op => op.id)).toEqual([1, 3]);
    });

    it('returns null for a single operation with an invalid type', async () => {
      queryFirst.mockResolvedValue(validRow({ type: 'bad_type' }));

      const result = await OperationsDB.getOperationById(99);

      expect(result).toBeNull();
    });

    it('filters out all operations when all have invalid types', async () => {
      queryAll.mockResolvedValue([
        validRow({ id: 1, type: '' }),
        validRow({ id: 2, type: 'EXPENSE' }),
        validRow({ id: 3, type: null }),
      ]);

      const result = await OperationsDB.getAllOperations();

      expect(result).toHaveLength(0);
    });

    it('preserves all operations when all have valid types', async () => {
      queryAll.mockResolvedValue([
        validRow({ id: 1, type: 'expense' }),
        validRow({ id: 2, type: 'income' }),
        validRow({ id: 3, type: 'transfer' }),
      ]);

      const result = await OperationsDB.getAllOperations();

      expect(result).toHaveLength(3);
    });
  });
});
