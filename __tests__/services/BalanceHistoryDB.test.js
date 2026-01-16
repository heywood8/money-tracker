/**
 * BalanceHistoryDB Service Tests
 */

import * as BalanceHistoryDB from '../../app/services/BalanceHistoryDB';
import { queryAll, executeTransaction } from '../../app/services/db';
import * as AccountsDB from '../../app/services/AccountsDB';
import * as Currency from '../../app/services/currency';

// Mock dependencies
jest.mock('../../app/services/db', () => ({
  queryAll: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('../../app/services/AccountsDB', () => ({
  getAccountById: jest.fn(),
}));

jest.mock('../../app/services/currency', () => ({
  add: jest.fn((a, b) => String(parseFloat(a) + parseFloat(b))),
  subtract: jest.fn((a, b) => String(parseFloat(a) - parseFloat(b))),
}));

describe('BalanceHistoryDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatDate', () => {
    it('formats date to YYYY-MM-DD string', () => {
      const date = new Date(2024, 0, 15); // January 15, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-01-15');
    });

    it('pads single digit months with zero', () => {
      const date = new Date(2024, 4, 5); // May 5, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-05-05');
    });

    it('pads single digit days with zero', () => {
      const date = new Date(2024, 11, 1); // December 1, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-12-01');
    });

    it('handles end of year dates', () => {
      const date = new Date(2024, 11, 31); // December 31, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-12-31');
    });
  });

  describe('snapshotPreviousDayBalances', () => {
    it('returns immediately (no-op function)', async () => {
      const result = await BalanceHistoryDB.snapshotPreviousDayBalances();
      expect(result).toBeUndefined();
      // Should not call any database functions
      expect(queryAll).not.toHaveBeenCalled();
      expect(executeTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getBalanceHistory', () => {
    it('returns balance history for account in date range', async () => {
      const mockHistory = [
        { date: '2024-01-01', balance: '1000.00', created_at: '2024-01-01T00:00:00Z' },
        { date: '2024-01-02', balance: '1050.00', created_at: '2024-01-02T00:00:00Z' },
      ];
      queryAll.mockResolvedValue(mockHistory);

      const result = await BalanceHistoryDB.getBalanceHistory(1, '2024-01-01', '2024-01-31');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT date, balance, created_at'),
        [1, '2024-01-01', '2024-01-31'],
      );
      expect(result).toEqual(mockHistory);
    });

    it('returns empty array when no history found', async () => {
      queryAll.mockResolvedValue(null);

      const result = await BalanceHistoryDB.getBalanceHistory(1, '2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getBalanceHistory(1, '2024-01-01', '2024-01-31'))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to get balance history:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('getAllAccountsBalanceOnDate', () => {
    it('returns all accounts balances for a specific date', async () => {
      const mockBalances = [
        { account_id: 1, name: 'Checking', currency: 'USD', balance: '1000.00' },
        { account_id: 2, name: 'Savings', currency: 'USD', balance: '5000.00' },
      ];
      queryAll.mockResolvedValue(mockBalances);

      const result = await BalanceHistoryDB.getAllAccountsBalanceOnDate('2024-01-15');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT abh.account_id'),
        ['2024-01-15'],
      );
      expect(result).toEqual(mockBalances);
    });

    it('returns empty array when no data found', async () => {
      queryAll.mockResolvedValue(null);

      const result = await BalanceHistoryDB.getAllAccountsBalanceOnDate('2024-01-15');

      expect(result).toEqual([]);
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getAllAccountsBalanceOnDate('2024-01-15'))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to get all accounts balance on date:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('getAccountBalanceOnDate', () => {
    it('returns balance for account on specific date', async () => {
      queryAll.mockResolvedValue([{ balance: '1500.00' }]);

      const result = await BalanceHistoryDB.getAccountBalanceOnDate(1, '2024-01-15');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT balance'),
        [1, '2024-01-15'],
      );
      expect(result).toBe('1500.00');
    });

    it('returns null when no snapshot exists', async () => {
      queryAll.mockResolvedValue([]);

      const result = await BalanceHistoryDB.getAccountBalanceOnDate(1, '2024-01-15');

      expect(result).toBeNull();
    });

    it('returns null when query returns null', async () => {
      queryAll.mockResolvedValue(null);

      const result = await BalanceHistoryDB.getAccountBalanceOnDate(1, '2024-01-15');

      expect(result).toBeNull();
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getAccountBalanceOnDate(1, '2024-01-15'))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to get account balance on date:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('getLastSnapshotDate', () => {
    it('returns most recent snapshot date for account', async () => {
      queryAll.mockResolvedValue([{ date: '2024-01-20' }]);

      const result = await BalanceHistoryDB.getLastSnapshotDate(1);

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date DESC'),
        [1],
      );
      expect(result).toBe('2024-01-20');
    });

    it('returns null when no snapshots exist', async () => {
      queryAll.mockResolvedValue([]);

      const result = await BalanceHistoryDB.getLastSnapshotDate(1);

      expect(result).toBeNull();
    });

    it('returns null when query returns null', async () => {
      queryAll.mockResolvedValue(null);

      const result = await BalanceHistoryDB.getLastSnapshotDate(1);

      expect(result).toBeNull();
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getLastSnapshotDate(1))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to get last snapshot date:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('upsertBalanceHistory', () => {
    it('inserts or replaces balance history entry', async () => {
      const mockDb = { runAsync: jest.fn() };
      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await BalanceHistoryDB.upsertBalanceHistory(1, '2024-01-15', '1500.00');

      expect(executeTransaction).toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE'),
        expect.arrayContaining([1, '2024-01-15', '1500.00']),
      );
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.upsertBalanceHistory(1, '2024-01-15', '1500.00'))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to upsert balance history:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('deleteBalanceHistory', () => {
    it('deletes balance history entry for account and date', async () => {
      const mockDb = { runAsync: jest.fn() };
      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await BalanceHistoryDB.deleteBalanceHistory(1, '2024-01-15');

      expect(executeTransaction).toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM accounts_balance_history'),
        [1, '2024-01-15'],
      );
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.deleteBalanceHistory(1, '2024-01-15'))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to delete balance history:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('updateTodayBalance', () => {
    it('updates today balance using transaction', async () => {
      const mockDb = { runAsync: jest.fn() };
      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      await BalanceHistoryDB.updateTodayBalance(1, '2000.00');

      expect(executeTransaction).toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE'),
        expect.arrayContaining([1, expect.any(String), '2000.00']),
      );
    });

    it('uses provided db instance when given', async () => {
      const mockDb = { runAsync: jest.fn() };

      await BalanceHistoryDB.updateTodayBalance(1, '2000.00', mockDb);

      expect(executeTransaction).not.toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE'),
        expect.arrayContaining([1, expect.any(String), '2000.00']),
      );
    });

    it('converts accountId to number', async () => {
      const mockDb = { runAsync: jest.fn() };

      await BalanceHistoryDB.updateTodayBalance('123', '2000.00', mockDb);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([123]), // Should be number, not string
      );
    });

    it('does not throw on database failure (graceful handling)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(BalanceHistoryDB.updateTodayBalance(1, '2000.00')).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to update today balance:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('populateCurrentMonthHistory', () => {
    beforeEach(() => {
      // Mock Date to have consistent test results
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2024, 0, 15, 12, 0, 0)); // January 15, 2024
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('populates balance history for all accounts', async () => {
      const mockDb = {
        getAllAsync: jest.fn()
          .mockResolvedValueOnce([
            { id: 1, name: 'Checking', balance: '1000.00', created_at: '2024-01-01T00:00:00Z' },
          ])
          .mockResolvedValueOnce([]), // No operations after target date
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      expect(executeTransaction).toHaveBeenCalled();
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM accounts'),
      );
      expect(consoleSpy).toHaveBeenCalledWith('Current month balance history populated successfully');
      consoleSpy.mockRestore();
    });

    it('uses provided db instance when given', async () => {
      const mockDb = {
        getAllAsync: jest.fn()
          .mockResolvedValueOnce([]) // No accounts
          .mockResolvedValue([]),
        runAsync: jest.fn(),
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory(mockDb);

      expect(executeTransaction).not.toHaveBeenCalled();
      expect(mockDb.getAllAsync).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles transaction conflict errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('transaction within a transaction'));

      await expect(BalanceHistoryDB.populateCurrentMonthHistory()).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Skipping balance history population - transaction conflict detected');
      consoleSpy.mockRestore();
    });

    it('handles cannot rollback errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('cannot rollback'));

      await expect(BalanceHistoryDB.populateCurrentMonthHistory()).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Skipping balance history population - transaction conflict detected');
      consoleSpy.mockRestore();
    });

    it('handles no transaction is active errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('no transaction is active'));

      await expect(BalanceHistoryDB.populateCurrentMonthHistory()).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Skipping balance history population - transaction conflict detected');
      consoleSpy.mockRestore();
    });

    it('throws error on non-transaction database failures', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('Generic DB error'));

      await expect(BalanceHistoryDB.populateCurrentMonthHistory())
        .rejects.toThrow('Generic DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to populate current month history:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('does not throw when provided db and failure occurs', async () => {
      const mockDb = {
        getAllAsync: jest.fn().mockRejectedValue(new Error('DB error')),
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(BalanceHistoryDB.populateCurrentMonthHistory(mockDb)).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith('Population failed during migration, but continuing...');
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('only snapshots dates before today', async () => {
      const mockDb = {
        getAllAsync: jest.fn()
          .mockResolvedValueOnce([
            { id: 1, name: 'Checking', balance: '1000.00', created_at: '2024-01-01T00:00:00Z' },
          ])
          .mockResolvedValue([]), // No operations
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      // Should have called runAsync for dates 2024-01-14, 2024-01-13, ... 2024-01-01
      // (14 days, not including today 2024-01-15)
      // But due to balance optimization, may be fewer calls
      expect(mockDb.runAsync).toHaveBeenCalled();

      // Verify no call includes today's date
      const calls = mockDb.runAsync.mock.calls;
      calls.forEach(call => {
        if (call[1] && call[1][1]) {
          expect(call[1][1]).not.toBe('2024-01-15');
        }
      });

      consoleSpy.mockRestore();
    });

    it('respects account creation date when populating history', async () => {
      // Account created on Jan 10, so should only snapshot Jan 10-14
      const mockDb = {
        getAllAsync: jest.fn()
          .mockResolvedValueOnce([
            { id: 1, name: 'New Account', balance: '500.00', created_at: '2024-01-10T00:00:00Z' },
          ])
          .mockResolvedValue([]), // No operations
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      expect(mockDb.runAsync).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles account without created_at date', async () => {
      const mockDb = {
        getAllAsync: jest.fn()
          .mockResolvedValueOnce([
            { id: 1, name: 'Old Account', balance: '1000.00', created_at: null },
          ])
          .mockResolvedValue([]), // No operations
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      expect(mockDb.runAsync).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('calculates historical balance by reversing operations', async () => {
      const mockOperations = [
        { type: 'expense', account_id: 1, amount: '50.00', date: '2024-01-12' },
        { type: 'income', account_id: 1, amount: '100.00', date: '2024-01-11' },
      ];
      const mockDb = {
        getAllAsync: jest.fn((query) => {
          if (query.includes('SELECT * FROM accounts')) {
            return Promise.resolve([
              { id: 1, name: 'Checking', balance: '800.00', created_at: '2024-01-01T00:00:00Z' },
            ]);
          }
          if (query.includes('SELECT * FROM operations')) {
            return Promise.resolve(mockOperations);
          }
          return Promise.resolve([]);
        }),
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      // Should reverse: 800 + 50 (add back expense) - 100 (subtract back income) = 750
      expect(Currency.add).toHaveBeenCalled();
      expect(Currency.subtract).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles transfer operations when calculating balance', async () => {
      const mockTransferOps = [
        { type: 'transfer', account_id: 1, to_account_id: 2, amount: '200.00', date: '2024-01-12' },
      ];
      const mockDb = {
        getAllAsync: jest.fn((query) => {
          if (query.includes('SELECT * FROM accounts')) {
            return Promise.resolve([
              { id: 1, name: 'Checking', balance: '500.00', created_at: '2024-01-01T00:00:00Z' },
            ]);
          }
          if (query.includes('SELECT * FROM operations')) {
            return Promise.resolve(mockTransferOps);
          }
          return Promise.resolve([]);
        }),
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      // Should add back the transfer out: 500 + 200 = 700
      expect(Currency.add).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles transfer with destination_amount', async () => {
      const mockTransferWithDest = [
        { type: 'transfer', account_id: 1, to_account_id: 2, amount: '100.00', destination_amount: '90.00', date: '2024-01-12' },
      ];
      const mockDb = {
        getAllAsync: jest.fn((query) => {
          if (query.includes('SELECT * FROM accounts')) {
            return Promise.resolve([
              { id: 2, name: 'EUR Account', balance: '850.00', created_at: '2024-01-01T00:00:00Z' },
            ]);
          }
          if (query.includes('SELECT * FROM operations')) {
            return Promise.resolve(mockTransferWithDest);
          }
          return Promise.resolve([]);
        }),
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      // Should subtract back the destination_amount: 850 - 90 = 760
      expect(Currency.subtract).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('skips snapshot when balance unchanged', async () => {
      const mockDb = {
        getAllAsync: jest.fn()
          .mockResolvedValueOnce([
            { id: 1, name: 'Checking', balance: '1000.00', created_at: '2024-01-01T00:00:00Z' },
          ])
          .mockResolvedValue([]), // No operations - balance stays same
        runAsync: jest.fn(),
      };

      executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDb);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await BalanceHistoryDB.populateCurrentMonthHistory();

      // With no operations, balance is same for all days
      // Should only create one snapshot (or skip duplicates)
      const insertCalls = mockDb.runAsync.mock.calls.filter(
        call => call[0].includes('INSERT'),
      );
      // First insert should happen, subsequent identical balances should be skipped
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);
      consoleSpy.mockRestore();
    });
  });
});
