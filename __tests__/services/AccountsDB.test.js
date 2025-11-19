/**
 * Tests for AccountsDB.js - Database operations for accounts
 * These tests ensure CRUD operations work correctly and data integrity is maintained
 */

import * as AccountsDB from '../../app/services/AccountsDB';
import * as db from '../../app/services/db';

// Mock the database module
jest.mock('../../app/services/db');

describe('AccountsDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllAccounts', () => {
    it('retrieves all accounts ordered by created_at DESC', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD', created_at: '2024-01-02' },
        { id: '2', name: 'Account 2', balance: '200', currency: 'EUR', created_at: '2024-01-01' },
      ];
      db.queryAll.mockResolvedValue(mockAccounts);

      const result = await AccountsDB.getAllAccounts();

      expect(db.queryAll).toHaveBeenCalledWith(
        'SELECT * FROM accounts ORDER BY created_at DESC'
      );
      expect(result).toEqual(mockAccounts);
    });

    it('returns empty array when no accounts exist', async () => {
      db.queryAll.mockResolvedValue(null);

      const result = await AccountsDB.getAllAccounts();

      expect(result).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      db.queryAll.mockRejectedValue(error);

      await expect(AccountsDB.getAllAccounts()).rejects.toThrow('Database error');
    });
  });

  describe('getAccountById', () => {
    it('retrieves account by ID', async () => {
      const mockAccount = { id: '1', name: 'Test Account', balance: '100', currency: 'USD' };
      db.queryFirst.mockResolvedValue(mockAccount);

      const result = await AccountsDB.getAccountById('1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT * FROM accounts WHERE id = ?',
        ['1']
      );
      expect(result).toEqual(mockAccount);
    });

    it('returns null when account does not exist', async () => {
      db.queryFirst.mockResolvedValue(null);

      const result = await AccountsDB.getAccountById('non-existent');

      expect(result).toBeNull();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      db.queryFirst.mockRejectedValue(error);

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

      db.executeQuery.mockResolvedValue(undefined);

      const result = await AccountsDB.createAccount(newAccount);

      expect(db.executeQuery).toHaveBeenCalledWith(
        'INSERT INTO accounts (id, name, balance, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        expect.arrayContaining([
          'test-id',
          'New Account',
          '100.50',
          'USD',
          expect.any(String), // created_at
          expect.any(String), // updated_at
        ])
      );
      expect(result).toMatchObject(newAccount);
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
    });

    it('creates account with default values when optional fields are missing', async () => {
      const newAccount = {
        id: 'test-id',
        name: 'New Account',
      };

      db.executeQuery.mockResolvedValue(undefined);

      const result = await AccountsDB.createAccount(newAccount);

      expect(result.balance).toBe('0');
      expect(result.currency).toBe('USD');
    });

    it('throws error when database insert fails', async () => {
      const error = new Error('Insert failed');
      db.executeQuery.mockRejectedValue(error);

      await expect(AccountsDB.createAccount({ id: '1', name: 'Test' }))
        .rejects.toThrow('Insert failed');
    });
  });

  describe('updateAccount', () => {
    it('updates account name only', async () => {
      const updates = { name: 'Updated Name' };
      db.executeQuery.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', updates);

      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?'),
        expect.arrayContaining(['Updated Name', expect.any(String), '1'])
      );
    });

    it('updates account balance only', async () => {
      const updates = { balance: '200.00' };
      db.executeQuery.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', updates);

      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?'),
        expect.arrayContaining(['200.00', expect.any(String), '1'])
      );
    });

    it('updates multiple fields', async () => {
      const updates = { name: 'New Name', balance: '150.00', currency: 'EUR' };
      db.executeQuery.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', updates);

      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['New Name', '150.00', 'EUR', expect.any(String), '1'])
      );
    });

    it('does nothing when no fields to update', async () => {
      await AccountsDB.updateAccount('1', {});

      expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('throws error when database update fails', async () => {
      const error = new Error('Update failed');
      db.executeQuery.mockRejectedValue(error);

      await expect(AccountsDB.updateAccount('1', { name: 'Test' }))
        .rejects.toThrow('Update failed');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account when no operations are associated', async () => {
      db.queryFirst.mockResolvedValue({ count: 0 });
      db.executeQuery.mockResolvedValue(undefined);

      await AccountsDB.deleteAccount('1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM operations'),
        ['1', '1']
      );
      expect(db.executeQuery).toHaveBeenCalledWith(
        'DELETE FROM accounts WHERE id = ?',
        ['1']
      );
    });

    it('throws error when account has associated operations', async () => {
      db.queryFirst.mockResolvedValue({ count: 5 });

      await expect(AccountsDB.deleteAccount('1')).rejects.toThrow(
        'Cannot delete account: 5 transaction(s) are associated with this account'
      );

      expect(db.executeQuery).not.toHaveBeenCalled();
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Query failed');
      db.queryFirst.mockRejectedValue(error);

      await expect(AccountsDB.deleteAccount('1')).rejects.toThrow('Query failed');
    });
  });

  describe('updateAccountBalance', () => {
    it('updates account balance atomically with positive delta', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      db.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '50.00');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT balance FROM accounts WHERE id = ?',
        ['1']
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        ['150.00', expect.any(String), '1']
      );
    });

    it('updates account balance atomically with negative delta', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      db.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '-30.00');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
        ['70.00', expect.any(String), '1']
      );
    });

    it('throws error when account not found', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      db.executeTransaction.mockImplementation(async (callback) => {
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
      db.executeTransaction.mockImplementation(async (callback) => {
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
      db.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const balanceChanges = new Map([
        ['account1', '50.00'],
        ['account2', '-30.00'],
      ]);

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(2);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
      expect(db.executeTransaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('skips accounts with zero delta', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '100.00' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      db.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const balanceChanges = new Map([
        ['account1', 0],
        ['account2', '50.00'],
      ]);

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(mockDb.getFirstAsync).toHaveBeenCalledTimes(1);
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });

    it('does nothing when balanceChanges is empty', async () => {
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
      db.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const balanceChanges = new Map([
        ['missing-account', '50.00'],
        ['account2', '30.00'],
      ]);

      await AccountsDB.batchUpdateBalances(balanceChanges);

      expect(mockDb.runAsync).toHaveBeenCalledTimes(1); // Only one update
    });
  });

  describe('getAccountBalance', () => {
    it('retrieves account balance', async () => {
      db.queryFirst.mockResolvedValue({ balance: '150.75' });

      const result = await AccountsDB.getAccountBalance('1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT balance FROM accounts WHERE id = ?',
        ['1']
      );
      expect(result).toBe('150.75');
    });

    it('returns "0" when account not found', async () => {
      db.queryFirst.mockResolvedValue(null);

      const result = await AccountsDB.getAccountBalance('non-existent');

      expect(result).toBe('0');
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Query failed');
      db.queryFirst.mockRejectedValue(error);

      await expect(AccountsDB.getAccountBalance('1')).rejects.toThrow('Query failed');
    });
  });

  describe('accountExists', () => {
    it('returns true when account exists', async () => {
      db.queryFirst.mockResolvedValue({ 1: 1 });

      const result = await AccountsDB.accountExists('1');

      expect(db.queryFirst).toHaveBeenCalledWith(
        'SELECT 1 FROM accounts WHERE id = ? LIMIT 1',
        ['1']
      );
      expect(result).toBe(true);
    });

    it('returns false when account does not exist', async () => {
      db.queryFirst.mockResolvedValue(null);

      const result = await AccountsDB.accountExists('non-existent');

      expect(result).toBe(false);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Query failed');
      db.queryFirst.mockRejectedValue(error);

      await expect(AccountsDB.accountExists('1')).rejects.toThrow('Query failed');
    });
  });

  // Regression tests for data integrity
  describe('Regression Tests - Data Integrity', () => {
    it('prevents deletion of accounts with operations', async () => {
      db.queryFirst.mockResolvedValue({ count: 1 });

      await expect(AccountsDB.deleteAccount('1')).rejects.toThrow(
        'Cannot delete account'
      );
    });

    it('maintains balance precision through updates', async () => {
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ balance: '999999.99' }),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      db.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await AccountsDB.updateAccountBalance('1', '0.01');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        ['1000000.00', expect.any(String), '1']
      );
    });

    it('updates updated_at timestamp on every change', async () => {
      db.executeQuery.mockResolvedValue(undefined);

      await AccountsDB.updateAccount('1', { name: 'Test' });

      const callArgs = db.executeQuery.mock.calls[0][1];
      expect(callArgs[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
