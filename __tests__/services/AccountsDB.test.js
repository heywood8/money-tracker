/**
 * Tests for AccountsDB.js - Database operations for accounts using Drizzle ORM
 * These tests ensure CRUD operations work correctly and data integrity is maintained
 */

import * as AccountsDB from '../../app/services/AccountsDB';
import * as db from '../../app/services/db';
import { eq, asc, desc, sql } from 'drizzle-orm';

// Mock the database module
jest.mock('../../app/services/db');

describe('AccountsDB', () => {
  let mockDrizzle;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a chainable mock Drizzle instance
    mockDrizzle = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(() => Promise.resolve([])),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    // Mock getDrizzle to return our mock instance
    jest.spyOn(db, 'getDrizzle').mockResolvedValue(mockDrizzle);
  });

  describe('getAllAccounts', () => {
    it('retrieves all accounts ordered by display_order and created_at', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD', displayOrder: 0, createdAt: '2024-01-02' },
        { id: '2', name: 'Account 2', balance: '200', currency: 'EUR', displayOrder: 1, createdAt: '2024-01-01' },
      ];

      // Mock the full Drizzle query chain
      mockDrizzle.orderBy.mockResolvedValue(mockAccounts);

      const result = await AccountsDB.getAllAccounts();

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.orderBy).toHaveBeenCalled();
      expect(result).toEqual(mockAccounts);
    });

    it('returns empty array when no accounts exist', async () => {
      mockDrizzle.orderBy.mockResolvedValue([]);

      const result = await AccountsDB.getAllAccounts();

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.orderBy.mockRejectedValue(error);

      await expect(AccountsDB.getAllAccounts()).rejects.toThrow('Database error');
    });
  });

  describe('getAccountById', () => {
    it('retrieves account by ID', async () => {
      const mockAccount = { id: '1', name: 'Test Account', balance: '100', currency: 'USD' };
      mockDrizzle.limit.mockResolvedValue([mockAccount]);

      const result = await AccountsDB.getAccountById('1');

      expect(db.getDrizzle).toHaveBeenCalled();
      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
      expect(mockDrizzle.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockAccount);
    });

    it('returns null when account does not exist', async () => {
      mockDrizzle.limit.mockResolvedValue([]);

      const result = await AccountsDB.getAccountById('non-existent');

      expect(result).toBeNull();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDrizzle.limit.mockRejectedValue(error);

      await expect(AccountsDB.getAccountById('1')).rejects.toThrow('Database error');
    });
  });

  describe('createAccount', () => {
    it('creates a new account with all fields', async () => {
      const newAccount = {
        id: 'test-id',
        name: 'New Account',
        balance: '100.50',
        currency: 'USD',
      };

      const expectedResult = {
        ...newAccount,
        displayOrder: 6,
        hidden: 0,
        monthlyTarget: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      // Mock getDrizzle to return the same instance for both calls
      // First call is for max order query, second is for insert
      db.getDrizzle.mockResolvedValue({
        ...mockDrizzle,
        select: jest.fn(() => ({
          from: jest.fn(() => Promise.resolve([{ maxOrder: 5 }])),
        })),
        returning: jest.fn(() => Promise.resolve([expectedResult])),
      });

      const result = await AccountsDB.createAccount(newAccount);

      expect(result).toMatchObject(newAccount);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.displayOrder).toBe(6);
    });

    it('creates account with default values when optional fields are missing', async () => {
      const newAccount = {
        id: 'test-id',
        name: 'New Account',
      };

      const expectedResult = {
        ...newAccount,
        balance: '0',
        currency: 'USD',
        displayOrder: 0,
        hidden: 0,
        monthlyTarget: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      // Mock max order query - no existing accounts
      db.getDrizzle.mockResolvedValue({
        ...mockDrizzle,
        select: jest.fn(() => ({
          from: jest.fn(() => Promise.resolve([{ maxOrder: null }])),
        })),
        returning: jest.fn(() => Promise.resolve([expectedResult])),
      });

      const result = await AccountsDB.createAccount(newAccount);

      expect(result.balance).toBe('0');
      expect(result.currency).toBe('USD');
      expect(result.displayOrder).toBe(0);
      expect(result.hidden).toBe(0);
    });

    it('throws error when database insert fails', async () => {
      const error = new Error('Insert failed');

      const failingMockDrizzle = {
        select: jest.fn(() => ({
          from: jest.fn(() => Promise.resolve([{ maxOrder: 0 }])),
        })),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn(() => Promise.reject(error)),
      };

      db.getDrizzle.mockResolvedValue(failingMockDrizzle);

      await expect(AccountsDB.createAccount({ id: '1', name: 'Test' }))
        .rejects.toThrow('Insert failed');
    });
  });

  describe('updateAccount', () => {
    it('updates account name only', async () => {
      const updates = { name: 'Updated Name' };
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', updates);

      expect(mockDrizzle.update).toHaveBeenCalled();
      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Name',
          updatedAt: expect.any(String),
        }),
      );
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('updates account balance only', async () => {
      const updates = { balance: '200.00' };
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', updates);

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: '200.00',
          updatedAt: expect.any(String),
        }),
      );
    });

    it('updates multiple fields', async () => {
      const updates = { name: 'New Name', balance: '150.00', currency: 'EUR' };
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', updates);

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Name',
          balance: '150.00',
          currency: 'EUR',
          updatedAt: expect.any(String),
        }),
      );
    });

    it('does nothing when no fields to update', async () => {
      await AccountsDB.updateAccount('1', {});

      expect(mockDrizzle.update).not.toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      const error = new Error('Update failed');
      mockDrizzle.where.mockRejectedValue(error);

      await expect(AccountsDB.updateAccount('1', { name: 'Test' }))
        .rejects.toThrow('Update failed');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account when no operations are associated', async () => {
      jest.spyOn(db, 'queryFirst').mockResolvedValue({ count: 0 });
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.deleteAccount('1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM operations'),
        ['1', '1'],
      );
      expect(mockDrizzle.delete).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
    });

    it('throws error when account has associated operations', async () => {
      jest.spyOn(db, 'queryFirst').mockResolvedValue({ count: 5 });

      await expect(AccountsDB.deleteAccount('1')).rejects.toThrow(
        'Cannot delete account: 5 transaction(s) are associated with this account',
      );

      expect(mockDrizzle.delete).not.toHaveBeenCalled();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Query failed');
      jest.spyOn(db, 'queryFirst').mockRejectedValue(error);

      await expect(AccountsDB.deleteAccount('1')).rejects.toThrow('Query failed');
    });
  });

  describe('updateAccountBalance', () => {
    it('updates account balance atomically with positive delta', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '50.00');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT balance FROM accounts WHERE id = ?',
        ['1'],
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        ['150.00', expect.any(String), '1'],
      );
    });

    it('updates account balance atomically with negative delta', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '-30.00');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        ['70.00', expect.any(String), '1'],
      );
    });

    it('throws error when account not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await expect(AccountsDB.updateAccountBalance('non-existent', '50.00'))
        .rejects.toThrow('Account non-existent not found');
    });

    it('uses transaction for atomic operation', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '50.00');

      expect(db.executeTransaction).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('batchUpdateBalances', () => {
    it('updates multiple account balances atomically', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '100.00' })
          .mockResolvedValueOnce({ balance: '200.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const balanceChanges = new Map([
        ['account1', '50.00'],
        ['account2', '-30.00'],
      ]);

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(2);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(4); // 2 balance updates + 2 balance history inserts
      expect(db.executeTransaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('skips accounts with zero delta', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const balanceChanges = new Map([
        ['account1', 0],
        ['account2', '50.00'],
      ]);

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2); // 1 balance update + 1 balance history insert
    });

    it('does nothing when balanceChanges is empty', async () => {
      jest.spyOn(db, 'executeTransaction').mockImplementation(() => {});
      const balanceChanges = new Map();

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(db.executeTransaction).not.toHaveBeenCalled();
    });

    it('continues processing when account not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce(null) // First account not found
          .mockResolvedValueOnce({ balance: '200.00' }), // Second account found
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const balanceChanges = new Map([
        ['missing-account', '50.00'],
        ['account2', '30.00'],
      ]);

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(2); // 1 balance update + 1 balance history insert
    });
  });

  describe('getAccountBalance', () => {
    it('retrieves account balance', async () => {
      mockDrizzle.limit.mockResolvedValue([{ balance: '150.75' }]);

      const result = await AccountsDB.getAccountBalance('1');

      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
      expect(mockDrizzle.limit).toHaveBeenCalledWith(1);
      expect(result).toBe('150.75');
    });

    it('returns "0" when account not found', async () => {
      mockDrizzle.limit.mockResolvedValue([]);

      const result = await AccountsDB.getAccountBalance('non-existent');

      expect(result).toBe('0');
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Query failed');
      mockDrizzle.limit.mockRejectedValue(error);

      await expect(AccountsDB.getAccountBalance('1')).rejects.toThrow('Query failed');
    });
  });

  describe('accountExists', () => {
    it('returns true when account exists', async () => {
      mockDrizzle.limit.mockResolvedValue([{ id: '1' }]);

      const result = await AccountsDB.accountExists('1');

      expect(mockDrizzle.select).toHaveBeenCalled();
      expect(mockDrizzle.from).toHaveBeenCalled();
      expect(mockDrizzle.where).toHaveBeenCalled();
      expect(mockDrizzle.limit).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    it('returns false when account does not exist', async () => {
      mockDrizzle.limit.mockResolvedValue([]);

      const result = await AccountsDB.accountExists('non-existent');

      expect(result).toBe(false);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Query failed');
      mockDrizzle.limit.mockRejectedValue(error);

      await expect(AccountsDB.accountExists('1')).rejects.toThrow('Query failed');
    });
  });

  describe('transferOperations', () => {
    it('transfers operations between accounts with same currency', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ id: 'from-id', currency: 'USD' })
          .mockResolvedValueOnce({ id: 'to-id', currency: 'USD' }),
        runAsync: jest.fn()
          .mockResolvedValueOnce({ changes: 3 })
          .mockResolvedValueOnce({ changes: 2 }),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        return await callback(mockDb);
      });

      const result = await AccountsDB.transferOperations('from-id', 'to-id');

      expect(result).toBe(5);
      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(2);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    });

    it('throws error when source account not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValueOnce(null),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        return await callback(mockDb);
      });

      await expect(AccountsDB.transferOperations('missing', 'to-id'))
        .rejects.toThrow('Source account missing not found');
    });

    it('throws error when destination account not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ id: 'from-id', currency: 'USD' })
          .mockResolvedValueOnce(null),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        return await callback(mockDb);
      });

      await expect(AccountsDB.transferOperations('from-id', 'missing'))
        .rejects.toThrow('Destination account missing not found');
    });

    it('throws error when accounts have different currencies', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ id: 'from-id', currency: 'USD' })
          .mockResolvedValueOnce({ id: 'to-id', currency: 'EUR' }),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        return await callback(mockDb);
      });

      await expect(AccountsDB.transferOperations('from-id', 'to-id'))
        .rejects.toThrow('Cannot transfer operations: accounts have different currencies (USD → EUR)');
    });

    it('handles case when no operations to transfer', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ id: 'from-id', currency: 'USD' })
          .mockResolvedValueOnce({ id: 'to-id', currency: 'USD' }),
        runAsync: jest.fn()
          .mockResolvedValueOnce({ changes: 0 })
          .mockResolvedValueOnce({ changes: 0 }),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        return await callback(mockDb);
      });

      const result = await AccountsDB.transferOperations('from-id', 'to-id');

      expect(result).toBe(0);
    });

    it('rethrows transaction error', async () => {
      const error = new Error('Transaction failed');
      jest.spyOn(db, 'executeTransaction').mockRejectedValue(error);

      await expect(AccountsDB.transferOperations('from-id', 'to-id'))
        .rejects.toThrow('Transaction failed');
    });
  });

  describe('getOperationCount', () => {
    it('returns count of operations for account', async () => {
      jest.spyOn(db, 'queryFirst').mockResolvedValue({ count: 10 });

      const result = await AccountsDB.getOperationCount('acc-1');

      expect(result).toBe(10);
      expect(db.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count'),
        ['acc-1', 'acc-1'],
      );
    });

    it('returns 0 when no operations exist', async () => {
      jest.spyOn(db, 'queryFirst').mockResolvedValue({ count: 0 });

      const result = await AccountsDB.getOperationCount('acc-1');

      expect(result).toBe(0);
    });

    it('returns 0 when query returns null', async () => {
      jest.spyOn(db, 'queryFirst').mockResolvedValue(null);

      const result = await AccountsDB.getOperationCount('acc-1');

      expect(result).toBe(0);
    });

    it('throws error when query fails', async () => {
      jest.spyOn(db, 'queryFirst').mockRejectedValue(new Error('Query failed'));

      await expect(AccountsDB.getOperationCount('acc-1'))
        .rejects.toThrow('Query failed');
    });
  });

  describe('deleteAccount with transfer', () => {
    it('transfers operations before deleting account', async () => {
      // Mock getOperationCount
      jest.spyOn(db, 'queryFirst').mockResolvedValue({ count: 3 });

      // Mock transferOperations transaction
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ id: 'to-delete', currency: 'USD' })
          .mockResolvedValueOnce({ id: 'transfer-to', currency: 'USD' }),
        runAsync: jest.fn()
          .mockResolvedValueOnce({ changes: 2 })
          .mockResolvedValueOnce({ changes: 1 }),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        return await callback(mockDb);
      });

      // Mock delete operation
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.deleteAccount('to-delete', 'transfer-to');

      expect(db.executeTransaction).toHaveBeenCalled();
      expect(mockDrizzle.delete).toHaveBeenCalled();
    });
  });

  describe('reorderAccounts', () => {
    it('reorders accounts with new display orders', async () => {
      const mockDb = {
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const orderedAccounts = [
        { id: 'acc-1', display_order: 0 },
        { id: 'acc-2', display_order: 1 },
        { id: 'acc-3', display_order: 2 },
      ];

      await AccountsDB.reorderAccounts(orderedAccounts);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET display_order = ?, updated_at = ? WHERE id = ?',
        [0, expect.any(String), 'acc-1'],
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET display_order = ?, updated_at = ? WHERE id = ?',
        [1, expect.any(String), 'acc-2'],
      );
    });

    it('handles empty array', async () => {
      const mockDb = {
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.reorderAccounts([]);

      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });

    it('throws error when reorder fails', async () => {
      jest.spyOn(db, 'executeTransaction').mockRejectedValue(new Error('Reorder failed'));

      await expect(AccountsDB.reorderAccounts([{ id: '1', display_order: 0 }]))
        .rejects.toThrow('Reorder failed');
    });
  });

  describe('updateAccount additional cases', () => {
    it('updates hidden field converting true to 1', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', { hidden: true });

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          hidden: 1,
        }),
      );
    });

    it('updates hidden field converting false to 0', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', { hidden: false });

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          hidden: 0,
        }),
      );
    });

    it('updates monthly_target field', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', { monthly_target: '500' });

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyTarget: '500',
        }),
      );
    });

    it('updates monthlyTarget field (camelCase)', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', { monthlyTarget: '1000' });

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyTarget: '1000',
        }),
      );
    });
  });

  describe('batchUpdateBalances error handling', () => {
    it('throws error when transaction fails', async () => {
      jest.spyOn(db, 'executeTransaction').mockRejectedValue(new Error('Batch update failed'));

      const balanceChanges = new Map([
        ['account1', '50.00'],
      ]);

      await expect(AccountsDB.batchUpdateBalances(balanceChanges))
        .rejects.toThrow('Batch update failed');
    });
  });

  describe('adjustAccountBalance', () => {
    beforeEach(() => {
      // Reset modules to ensure fresh mocks
      jest.resetModules();
    });

    it('creates new adjustment operation when increasing balance', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '100.00' }) // Current account balance
          .mockResolvedValueOnce(null), // No existing adjustment operation
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-expense', category_type: 'expense', is_shadow: 1 },
          { id: 'shadow-income', category_type: 'income', is_shadow: 1 },
        ]),
        runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 123 }),
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.adjustAccountBalance('acc-1', '150.00', 'Test adjustment');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT balance FROM accounts WHERE id = ?',
        ['acc-1'],
      );
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE is_shadow = 1',
      );
      // Verify income operation was created (balance increased)
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operations'),
        expect.arrayContaining(['income', '50.00', 'acc-1', 'shadow-income']),
      );
    });

    it('creates new adjustment operation when decreasing balance', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '100.00' }) // Current account balance
          .mockResolvedValueOnce(null), // No existing adjustment operation
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-expense', category_type: 'expense', is_shadow: 1 },
          { id: 'shadow-income', category_type: 'income', is_shadow: 1 },
        ]),
        runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 123 }),
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.adjustAccountBalance('acc-1', '75.00');

      // Verify expense operation was created (balance decreased)
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO operations'),
        expect.arrayContaining(['expense', '25.00', 'acc-1', 'shadow-expense']),
      );
    });

    it('throws error when account not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValueOnce(null),
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await expect(AccountsDB.adjustAccountBalance('missing', '100.00'))
        .rejects.toThrow('Account missing not found');
    });

    it('throws error when shadow categories not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '100.00' })
          .mockResolvedValueOnce(null),
        getAllAsync: jest.fn().mockResolvedValue([]), // No shadow categories
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await expect(AccountsDB.adjustAccountBalance('acc-1', '150.00'))
        .rejects.toThrow('Shadow categories not found');
    });

    it('updates existing adjustment operation', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '100.00' })
          .mockResolvedValueOnce({
            id: 'existing-op',
            amount: '20.00',
            type: 'income',
            description: 'Balance adjusted from 80.00 → 100.00',
            category_type: 'income',
          }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-expense', category_type: 'expense', is_shadow: 1 },
          { id: 'shadow-income', category_type: 'income', is_shadow: 1 },
        ]),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.adjustAccountBalance('acc-1', '120.00');

      // Should update existing operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE operations SET'),
        expect.arrayContaining(['existing-op']),
      );
    });

    it('deletes adjustment operation when cumulative delta is zero', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '100.00' })
          .mockResolvedValueOnce({
            id: 'existing-op',
            amount: '20.00',
            type: 'income',
            description: 'Balance adjusted from 80.00 → 100.00',
            category_type: 'income',
          }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-expense', category_type: 'expense', is_shadow: 1 },
          { id: 'shadow-income', category_type: 'income', is_shadow: 1 },
        ]),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      // Adjust back to original balance (80.00)
      await AccountsDB.adjustAccountBalance('acc-1', '80.00');

      // Should delete the operation
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM operations WHERE id = ?',
        ['existing-op'],
      );
    });

    it('handles expense type existing operation correctly', async () => {
      const mockDb = {
        getFirstAsync: jest.fn()
          .mockResolvedValueOnce({ balance: '80.00' })
          .mockResolvedValueOnce({
            id: 'existing-op',
            amount: '20.00',
            type: 'expense',
            description: 'Balance adjusted from 100.00 → 80.00',
            category_type: 'expense',
          }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-expense', category_type: 'expense', is_shadow: 1 },
          { id: 'shadow-income', category_type: 'income', is_shadow: 1 },
        ]),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      // Further decrease balance
      await AccountsDB.adjustAccountBalance('acc-1', '60.00');

      expect(mockDb.runAsync).toHaveBeenCalled();
    });

    it('rethrows error on failure', async () => {
      jest.spyOn(db, 'executeTransaction').mockRejectedValue(new Error('Adjustment failed'));

      await expect(AccountsDB.adjustAccountBalance('acc-1', '100.00'))
        .rejects.toThrow('Adjustment failed');
    });
  });

  // Regression tests for data integrity
  describe('Regression Tests - Data Integrity', () => {
    it('prevents deletion of accounts with operations', async () => {
      jest.spyOn(db, 'queryFirst').mockResolvedValue({ count: 1 });

      await expect(AccountsDB.deleteAccount('1')).rejects.toThrow(
        'Cannot delete account',
      );
    });

    it('maintains balance precision through updates', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '999999.99' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '0.01');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ['1000000.00', expect.any(String), '1'],
      );
    });

    it('updates updated_at timestamp on every change', async () => {
      mockDrizzle.where.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', { name: 'Test' });

      expect(mockDrizzle.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        }),
      );
    });
  });
});
