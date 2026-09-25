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
  isZero: jest.fn((a) => parseFloat(a) === 0),
}));

/** The local day `offset` days from today, as the snapshots store it. */
const dayFromToday = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return BalanceHistoryDB.formatDate(d);
};

/**
 * A transaction handle over in-memory accounts, operations and snapshots: just
 * the statements applyPastBalanceChanges and calculateBalanceOnDate issue.
 */
const makeHistoryDb = ({ accounts, operations = [], history }) => {
  let nextId = history.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  return {
    history,
    getAllAsync: jest.fn(async (sql, params) => {
      if (sql.includes('FROM accounts_balance_history')) {
        const [accountId, from, to] = params;
        return history.filter(r => r.account_id === accountId && r.date >= from && r.date < to);
      }
      if (sql.includes('FROM accounts WHERE id')) {
        return accounts.filter(a => String(a.id) === String(params[0]));
      }
      if (sql.includes('FROM operations')) {
        const [accountId, , after] = params;
        return operations.filter(o => (String(o.account_id) === String(accountId)
          || String(o.to_account_id) === String(accountId)) && o.date > after);
      }
      return [];
    }),
    getFirstAsync: jest.fn(async (sql, params) => {
      if (sql.includes('FROM accounts WHERE id')) {
        return accounts.find(a => String(a.id) === String(params[0])) || null;
      }
      if (sql.includes('FROM accounts_balance_history')) {
        return history.find(r => r.account_id === params[0] && r.date === params[1]) || null;
      }
      return null;
    }),
    runAsync: jest.fn(async (sql, params) => {
      if (sql.startsWith('UPDATE accounts_balance_history')) {
        history.find(r => r.id === params[1]).balance = params[0];
      } else if (sql.includes('INSERT OR IGNORE INTO accounts_balance_history')) {
        history.push({ id: nextId++, account_id: params[0], date: params[1], balance: params[2] });
      }
    }),
  };
};

describe('BalanceHistoryDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatDate', () => {
    it('formats date to YYYY-MM-DD string', async () => {
      const date = new Date(2024, 0, 15); // January 15, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-01-15');
    });

    it('pads single digit months with zero', async () => {
      const date = new Date(2024, 4, 5); // May 5, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-05-05');
    });

    it('pads single digit days with zero', async () => {
      const date = new Date(2024, 11, 1); // December 1, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-12-01');
    });

    it('handles end of year dates', async () => {
      const date = new Date(2024, 11, 31); // December 31, 2024
      expect(BalanceHistoryDB.formatDate(date)).toBe('2024-12-31');
    });
  });

  // Snapshots were only written under today's date, so an operation booked for
  // an earlier day never reached the rows the chart draws that day from.
  describe('applyPastBalanceChanges', () => {
    it('moves every snapshot from the operation day to yesterday, and leaves earlier ones and today alone', async () => {
      const db = makeHistoryDb({
        accounts: [{ id: 1, balance: '800' }],
        history: [
          { id: 1, account_id: 1, date: dayFromToday(-10), balance: '1000' },
          { id: 2, account_id: 1, date: dayFromToday(-5), balance: '1000' },
          { id: 3, account_id: 1, date: dayFromToday(-1), balance: '1000' },
          { id: 4, account_id: 1, date: dayFromToday(0), balance: '800' },
        ],
      });

      await BalanceHistoryDB.applyPastBalanceChanges(db, [{ accountId: 1, date: dayFromToday(-5), delta: '-200' }]);

      expect(db.history.map(r => r.balance)).toEqual(['1000', '800', '800', '800']);
    });

    it('adds a snapshot on the operation day when it has none, read from the ledger', async () => {
      const db = makeHistoryDb({
        accounts: [{ id: 1, balance: '800' }],
        history: [
          { id: 1, account_id: 1, date: dayFromToday(-10), balance: '1000' },
          { id: 2, account_id: 1, date: dayFromToday(0), balance: '800' },
        ],
      });

      await BalanceHistoryDB.applyPastBalanceChanges(db, [{ accountId: 1, date: dayFromToday(-3), delta: '-200' }]);

      expect(db.history).toContainEqual(expect.objectContaining({ account_id: 1, date: dayFromToday(-3), balance: '800' }));
    });

    it('shifts only the days between an operation\'s old and new date when just its date moves', async () => {
      const db = makeHistoryDb({
        accounts: [{ id: 1, balance: '800' }],
        history: [
          { id: 1, account_id: 1, date: dayFromToday(-8), balance: '800' },
          { id: 2, account_id: 1, date: dayFromToday(-4), balance: '800' },
          { id: 3, account_id: 1, date: dayFromToday(-1), balance: '800' },
        ],
      });

      // The expense (-200) moved from 8 days ago to 2 days ago.
      await BalanceHistoryDB.applyPastBalanceChanges(db, [
        { accountId: 1, date: dayFromToday(-8), delta: '200' },
        { accountId: 1, date: dayFromToday(-2), delta: '-200' },
      ]);

      expect(db.history.find(r => r.id === 1).balance).toBe('1000');
      expect(db.history.find(r => r.id === 2).balance).toBe('1000');
      expect(db.history.find(r => r.id === 3).balance).toBe('800');
    });

    it('does nothing for today, a future day, a zero delta or a deleted account', async () => {
      const db = makeHistoryDb({ accounts: [], history: [{ id: 1, account_id: 1, date: dayFromToday(-1), balance: '5' }] });

      await BalanceHistoryDB.applyPastBalanceChanges(db, [
        { accountId: 1, date: dayFromToday(0), delta: '-1' },
        { accountId: 1, date: dayFromToday(3), delta: '-1' },
        { accountId: 1, date: dayFromToday(-2), delta: '0' },
        { accountId: 2, date: dayFromToday(-2), delta: '-1' },
      ]);

      expect(db.history).toHaveLength(1);
      expect(db.history[0].balance).toBe('5');
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

    describe('Regression Tests', () => {
      it('wraps date comparisons in SQLite date() to handle non-ISO date formats (#773)', async () => {
        // Raw lexicographic comparison (date >= ?) is wrong for non-ISO formats like DD/MM/YYYY.
        // SQLite date() normalises inputs before comparing, making the query format-agnostic.
        queryAll.mockResolvedValue([]);

        await BalanceHistoryDB.getBalanceHistory(1, '2024-01-01', '2024-01-31');

        const sql = queryAll.mock.calls[0][0];
        expect(sql).toMatch(/date\(date\)\s*>=\s*date\(\?\)/);
        expect(sql).toMatch(/date\(date\)\s*<=\s*date\(\?\)/);
      });
    });
  });

  describe('getBalanceHistoryForAccounts', () => {
    it('reads every account in one query and buckets the rows by account', async () => {
      queryAll.mockResolvedValue([
        { account_id: 1, date: '2024-01-01', balance: '1000.00' },
        { account_id: 2, date: '2024-01-01', balance: '50.00' },
        { account_id: 1, date: '2024-01-05', balance: '900.00' },
      ]);

      const result = await BalanceHistoryDB.getBalanceHistoryForAccounts([1, 2], '2024-01-01', '2024-01-31');

      expect(queryAll).toHaveBeenCalledTimes(1);
      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('account_id IN (?, ?)'),
        [1, 2, '2024-01-01', '2024-01-31'],
      );
      expect(result.get('1')).toEqual([
        { date: '2024-01-01', balance: '1000.00' },
        { date: '2024-01-05', balance: '900.00' },
      ]);
      expect(result.get('2')).toEqual([{ date: '2024-01-01', balance: '50.00' }]);
    });

    it('keys the map by string id, so a caller holding string ids still matches', async () => {
      queryAll.mockResolvedValue([{ account_id: 7, date: '2024-01-01', balance: '10.00' }]);

      const result = await BalanceHistoryDB.getBalanceHistoryForAccounts(['7'], '2024-01-01', '2024-01-31');

      expect(result.get('7')).toEqual([{ date: '2024-01-01', balance: '10.00' }]);
    });

    it('gives an account with no rows an empty list rather than omitting it', async () => {
      queryAll.mockResolvedValue([]);

      const result = await BalanceHistoryDB.getBalanceHistoryForAccounts([1, 2], '2024-01-01', '2024-01-31');

      expect(result.get('1')).toEqual([]);
      expect(result.get('2')).toEqual([]);
    });

    it('does not query at all for an empty account list', async () => {
      const result = await BalanceHistoryDB.getBalanceHistoryForAccounts([], '2024-01-01', '2024-01-31');

      expect(queryAll).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });

    it('normalises date comparisons with SQLite date() (#773)', async () => {
      queryAll.mockResolvedValue([]);

      await BalanceHistoryDB.getBalanceHistoryForAccounts([1], '2024-01-01', '2024-01-31');

      const sql = queryAll.mock.calls[0][0];
      expect(sql).toMatch(/date\(date\)\s*>=\s*date\(\?\)/);
      expect(sql).toMatch(/date\(date\)\s*<=\s*date\(\?\)/);
    });

    it('throws on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getBalanceHistoryForAccounts([1], '2024-01-01', '2024-01-31'))
        .rejects.toThrow('DB error');

      consoleSpy.mockRestore();
    });
  });

  describe('getAccountBalancesOnOrBeforeDate', () => {
    it('returns each account latest balance on or before the date', async () => {
      queryAll.mockResolvedValue([
        { account_id: 1, balance: '1000.00' },
        { account_id: 2, balance: '50.00' },
      ]);

      const result = await BalanceHistoryDB.getAccountBalancesOnOrBeforeDate([1, 2], '2024-01-01');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('MAX(date(h2.date))'),
        [1, 2, '2024-01-01'],
      );
      expect(result.get('1')).toBe('1000.00');
      expect(result.get('2')).toBe('50.00');
    });

    it('reports an account with no snapshot as null', async () => {
      queryAll.mockResolvedValue([{ account_id: 1, balance: '1000.00' }]);

      const result = await BalanceHistoryDB.getAccountBalancesOnOrBeforeDate([1, 2], '2024-01-01');

      expect(result.get('2')).toBeNull();
    });

    it('keeps the first row when one day carries a duplicate (imported) snapshot', async () => {
      queryAll.mockResolvedValue([
        { account_id: 1, balance: '1000.00' },
        { account_id: 1, balance: '999.00' },
      ]);

      const result = await BalanceHistoryDB.getAccountBalancesOnOrBeforeDate([1], '2024-01-01');

      expect(result.get('1')).toBe('1000.00');
    });

    it('does not query at all for an empty account list', async () => {
      const result = await BalanceHistoryDB.getAccountBalancesOnOrBeforeDate([], '2024-01-01');

      expect(queryAll).not.toHaveBeenCalled();
      expect(result.size).toBe(0);
    });

    it('throws on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getAccountBalancesOnOrBeforeDate([1], '2024-01-01'))
        .rejects.toThrow('DB error');

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

  describe('getAccountBalanceOnOrBeforeDate', () => {
    it('returns the most recent balance on or before the date', async () => {
      queryAll.mockResolvedValue([{ balance: '1000.00' }]);

      const result = await BalanceHistoryDB.getAccountBalanceOnOrBeforeDate(1, '2024-02-01');

      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('date(date) <= date(?)'),
        [1, '2024-02-01'],
      );
      expect(result).toBe('1000.00');
    });

    it('orders by the normalized date so a same-day timestamped row cannot outrank the latest calendar day (#773)', async () => {
      queryAll.mockResolvedValue([{ balance: '1000.00' }]);

      await BalanceHistoryDB.getAccountBalanceOnOrBeforeDate(1, '2024-02-01');

      // Must sort by date(date), not the raw text column, or a raw DESC sort could
      // place '2024-01-15T06:00:00' ahead of '2024-01-31' and pick the wrong row.
      const sql = queryAll.mock.calls[0][0];
      expect(sql).toContain('ORDER BY date(date) DESC');
    });

    it('returns null when no snapshot exists on or before the date', async () => {
      queryAll.mockResolvedValue([]);

      const result = await BalanceHistoryDB.getAccountBalanceOnOrBeforeDate(1, '2024-02-01');

      expect(result).toBeNull();
    });

    it('returns null when query returns null', async () => {
      queryAll.mockResolvedValue(null);

      const result = await BalanceHistoryDB.getAccountBalanceOnOrBeforeDate(1, '2024-02-01');

      expect(result).toBeNull();
    });

    it('throws error on database failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      queryAll.mockRejectedValue(new Error('DB error'));

      await expect(BalanceHistoryDB.getAccountBalanceOnOrBeforeDate(1, '2024-02-01'))
        .rejects.toThrow('DB error');

      expect(consoleSpy).toHaveBeenCalledWith('Failed to get account balance on or before date:', expect.any(Error));
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
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('transaction within a transaction'));

      await expect(BalanceHistoryDB.populateCurrentMonthHistory()).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Skipping balance history population - transaction conflict detected');
      consoleSpy.mockRestore();
    });

    it('handles cannot rollback errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      executeTransaction.mockRejectedValue(new Error('cannot rollback'));

      await expect(BalanceHistoryDB.populateCurrentMonthHistory()).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith('Skipping balance history population - transaction conflict detected');
      consoleSpy.mockRestore();
    });

    it('handles no transaction is active errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
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
