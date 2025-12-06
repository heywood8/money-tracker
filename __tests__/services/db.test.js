/**
 * Tests for Database Service - Core database wrapper and management
 * Tests database initialization, query execution, and connection management
 */

import * as SQLite from 'expo-sqlite';
import {
  getDatabase,
  getDrizzle,
  executeQuery,
  queryAll,
  queryFirst,
  executeTransaction,
  closeDatabase,
  dropAllTables,
} from '../../app/services/db';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

// Mock drizzle-orm
jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(),
}));

// Mock schema
jest.mock('../../app/db/schema', () => ({}));

describe('Database Service', () => {
  let mockRawDb;
  let mockDrizzle;

  beforeEach(async () => {
    // Close any existing database connection
    await closeDatabase();

    jest.clearAllMocks();

    // Create mock raw database instance
    mockRawDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      withTransactionAsync: jest.fn(async (callback) => {
        await callback();
      }),
      closeAsync: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock drizzle instance
    mockDrizzle = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    // Setup openDatabaseAsync mock
    SQLite.openDatabaseAsync.mockResolvedValue(mockRawDb);

    // Setup drizzle mock
    const drizzleModule = require('drizzle-orm/expo-sqlite');
    drizzleModule.drizzle.mockReturnValue(mockDrizzle);
  });

  afterEach(async () => {
    // Ensure database is closed after each test
    try {
      await closeDatabase();
    } catch (error) {
      // Ignore errors in cleanup
    }
  });

  describe('getDatabase', () => {
    it('opens database and returns instances', async () => {
      const result = await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('penny.db');
      expect(result).toEqual({
        raw: mockRawDb,
        drizzle: mockDrizzle,
      });
    });

    it('initializes database with foreign keys and WAL mode', async () => {
      await getDatabase();

      expect(mockRawDb.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockRawDb.execAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('returns cached instance on subsequent calls', async () => {
      const result1 = await getDatabase();
      const result2 = await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
      expect(result1.raw).toBe(result2.raw);
      expect(result1.drizzle).toBe(result2.drizzle);
    });

    it('handles concurrent initialization calls', async () => {
      const [result1, result2, result3] = await Promise.all([
        getDatabase(),
        getDatabase(),
        getDatabase(),
      ]);

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
      expect(result1.raw).toBe(result2.raw);
      expect(result2.raw).toBe(result3.raw);
      expect(result1.drizzle).toBe(result2.drizzle);
      expect(result2.drizzle).toBe(result3.drizzle);
    });

    it('creates app_metadata table on fresh database', async () => {
      mockRawDb.getFirstAsync.mockResolvedValueOnce(null);

      await getDatabase();

      // Should check for app_metadata table
      expect(mockRawDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining("SELECT name FROM sqlite_master WHERE type='table' AND name='app_metadata'")
      );
    });

    it('checks database version on existing database', async () => {
      mockRawDb.getFirstAsync
        .mockResolvedValueOnce({ name: 'app_metadata' }) // Table exists
        .mockResolvedValueOnce({ value: '9' }); // Current version

      await getDatabase();

      expect(mockRawDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM app_metadata WHERE key = ?',
        ['db_version']
      );
    });

    it('throws error if database fails to open', async () => {
      SQLite.openDatabaseAsync.mockRejectedValue(new Error('Failed to open'));

      await expect(getDatabase()).rejects.toThrow('Failed to open');
    });

    it('resets instances on initialization error', async () => {
      SQLite.openDatabaseAsync.mockRejectedValueOnce(new Error('Init error'));

      await expect(getDatabase()).rejects.toThrow('Init error');

      // Should be able to retry after error
      SQLite.openDatabaseAsync.mockResolvedValueOnce(mockRawDb);
      const result = await getDatabase();
      expect(result.raw).toBe(mockRawDb);
    });
  });

  describe('getDrizzle', () => {
    it('returns drizzle instance', async () => {
      const result = await getDrizzle();

      expect(result).toEqual(expect.objectContaining({
        select: expect.any(Function),
        insert: expect.any(Function),
        update: expect.any(Function),
        delete: expect.any(Function),
      }));
    });

    it('initializes database if not already initialized', async () => {
      await getDrizzle();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalled();
    });
  });

  describe('executeQuery', () => {
    it('executes query with parameters', async () => {
      mockRawDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 5 });

      const result = await executeQuery('INSERT INTO accounts VALUES (?, ?)', ['id1', 'Test']);

      expect(mockRawDb.runAsync).toHaveBeenCalledWith(
        'INSERT INTO accounts VALUES (?, ?)',
        ['id1', 'Test']
      );
      expect(result).toEqual({ changes: 1, lastInsertRowId: 5 });
    });

    it('executes query without parameters', async () => {
      await executeQuery('DELETE FROM accounts');

      expect(mockRawDb.runAsync).toHaveBeenCalledWith('DELETE FROM accounts', []);
    });

    it('throws error on query failure', async () => {
      mockRawDb.runAsync.mockRejectedValue(new Error('Query error'));

      await expect(executeQuery('INVALID SQL')).rejects.toThrow('Query error');
    });

    it('handles empty parameters array', async () => {
      await executeQuery('SELECT * FROM accounts', []);

      expect(mockRawDb.runAsync).toHaveBeenCalledWith('SELECT * FROM accounts', []);
    });

    it('handles null parameters', async () => {
      await executeQuery('INSERT INTO accounts VALUES (?, ?)', ['id1', null]);

      expect(mockRawDb.runAsync).toHaveBeenCalledWith(
        'INSERT INTO accounts VALUES (?, ?)',
        ['id1', null]
      );
    });
  });

  describe('queryAll', () => {
    it('returns all query results', async () => {
      const mockResults = [
        { id: '1', name: 'Account 1' },
        { id: '2', name: 'Account 2' },
      ];
      mockRawDb.getAllAsync.mockResolvedValue(mockResults);

      const result = await queryAll('SELECT * FROM accounts');

      expect(mockRawDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM accounts', []);
      expect(result).toEqual(mockResults);
    });

    it('returns empty array when no results', async () => {
      mockRawDb.getAllAsync.mockResolvedValue([]);

      const result = await queryAll('SELECT * FROM accounts WHERE id = ?', ['nonexistent']);

      expect(result).toEqual([]);
    });

    it('handles null result from getAllAsync', async () => {
      mockRawDb.getAllAsync.mockResolvedValue(null);

      const result = await queryAll('SELECT * FROM accounts');

      expect(result).toEqual([]);
    });

    it('executes query with parameters', async () => {
      await queryAll('SELECT * FROM accounts WHERE currency = ?', ['USD']);

      expect(mockRawDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM accounts WHERE currency = ?',
        ['USD']
      );
    });

    it('throws error on query failure', async () => {
      mockRawDb.getAllAsync.mockRejectedValue(new Error('Query failed'));

      await expect(queryAll('INVALID SQL')).rejects.toThrow('Query failed');
    });

    it('handles multiple parameters', async () => {
      await queryAll('SELECT * FROM operations WHERE date >= ? AND date <= ?', [
        '2025-01-01',
        '2025-01-31',
      ]);

      expect(mockRawDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM operations WHERE date >= ? AND date <= ?',
        ['2025-01-01', '2025-01-31']
      );
    });
  });

  describe('queryFirst', () => {
    it('returns first query result', async () => {
      const mockResult = { id: '1', name: 'Account 1' };
      mockRawDb.getFirstAsync.mockResolvedValue(mockResult);

      const result = await queryFirst('SELECT * FROM accounts WHERE id = ?', ['1']);

      expect(mockRawDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM accounts WHERE id = ?',
        ['1']
      );
      expect(result).toEqual(mockResult);
    });

    it('returns null when no results', async () => {
      mockRawDb.getFirstAsync.mockResolvedValue(null);

      const result = await queryFirst('SELECT * FROM accounts WHERE id = ?', ['nonexistent']);

      expect(result).toBeNull();
    });

    it('executes query without parameters', async () => {
      await queryFirst('SELECT COUNT(*) as count FROM accounts');

      expect(mockRawDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM accounts',
        []
      );
    });

    it('throws error on query failure', async () => {
      mockRawDb.getFirstAsync.mockRejectedValue(new Error('Query failed'));

      await expect(queryFirst('INVALID SQL')).rejects.toThrow('Query failed');
    });

    it('handles undefined result', async () => {
      mockRawDb.getFirstAsync.mockResolvedValue(undefined);

      const result = await queryFirst('SELECT * FROM accounts LIMIT 1');

      expect(result).toBeUndefined();
    });
  });

  describe('executeTransaction', () => {
    it('executes callback in transaction', async () => {
      const callback = jest.fn().mockResolvedValue('success');

      const result = await executeTransaction(callback);

      expect(mockRawDb.withTransactionAsync).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(mockRawDb);
      expect(result).toBe('success');
    });

    it('returns callback result', async () => {
      const callback = jest.fn(async (db) => {
        const rows = await db.getAllAsync('SELECT * FROM accounts');
        return rows.length;
      });

      mockRawDb.getAllAsync.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const result = await executeTransaction(callback);

      expect(result).toBe(2);
    });

    it('rolls back on error', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Transaction error'));

      await expect(executeTransaction(callback)).rejects.toThrow('Transaction error');

      expect(mockRawDb.withTransactionAsync).toHaveBeenCalled();
    });

    it('handles multiple operations in transaction', async () => {
      const callback = jest.fn(async (db) => {
        await db.runAsync('INSERT INTO accounts VALUES (?, ?)', ['id1', 'Account 1']);
        await db.runAsync('INSERT INTO accounts VALUES (?, ?)', ['id2', 'Account 2']);
        return true;
      });

      const result = await executeTransaction(callback);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith(mockRawDb);
    });

    it('handles async callback', async () => {
      const callback = jest.fn(async (db) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });

      const result = await executeTransaction(callback);

      expect(result).toBe('done');
    });

    it('throws error if transaction fails', async () => {
      mockRawDb.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      const callback = jest.fn();

      await expect(executeTransaction(callback)).rejects.toThrow('Transaction failed');
    });
  });

  describe('closeDatabase', () => {
    it('closes database connection', async () => {
      await getDatabase(); // Initialize database
      await closeDatabase();

      expect(mockRawDb.closeAsync).toHaveBeenCalled();
    });

    it('resets database instances after closing', async () => {
      await getDatabase();
      await closeDatabase();

      // Next call should reinitialize
      SQLite.openDatabaseAsync.mockClear();
      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalled();
    });

    it('does nothing if database not initialized', async () => {
      await closeDatabase();

      expect(mockRawDb.closeAsync).not.toHaveBeenCalled();
    });

    it('handles close error gracefully', async () => {
      await getDatabase();
      mockRawDb.closeAsync.mockRejectedValue(new Error('Close error'));

      await expect(closeDatabase()).resolves.toBeUndefined();
    });

    it('resets instances even if close fails', async () => {
      await getDatabase();
      mockRawDb.closeAsync.mockRejectedValue(new Error('Close error'));

      await closeDatabase();

      // Should reinitialize on next call
      SQLite.openDatabaseAsync.mockClear();
      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalled();
    });
  });

  describe('dropAllTables', () => {
    it('drops all tables', async () => {
      await getDatabase();
      await dropAllTables();

      expect(mockRawDb.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS budgets')
      );
      expect(mockRawDb.execAsync).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS operations')
      );
    });

    it('disables and re-enables foreign keys', async () => {
      await getDatabase();
      await dropAllTables();

      const execCalls = mockRawDb.execAsync.mock.calls.map((call) => call[0]);
      const dropCall = execCalls.find((sql) => sql.includes('DROP TABLE'));

      expect(dropCall).toContain('PRAGMA foreign_keys = OFF');
      expect(dropCall).toContain('PRAGMA foreign_keys = ON');
    });

    it('closes database after dropping tables', async () => {
      await getDatabase();
      await dropAllTables();

      expect(mockRawDb.closeAsync).toHaveBeenCalled();
    });

    it('resets instances after dropping tables', async () => {
      await getDatabase();
      await dropAllTables();

      // Next call should reinitialize
      SQLite.openDatabaseAsync.mockClear();
      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles database initialization error', async () => {
      mockRawDb.execAsync.mockRejectedValueOnce(new Error('Init failed'));

      await expect(getDatabase()).rejects.toThrow('Init failed');
    });

    it('recovers after initialization error', async () => {
      mockRawDb.execAsync.mockRejectedValueOnce(new Error('Init failed'));

      await expect(getDatabase()).rejects.toThrow('Init failed');

      // Should be able to retry
      mockRawDb.execAsync.mockResolvedValue(undefined);
      const result = await getDatabase();

      expect(result.raw).toBe(mockRawDb);
    });

    it('handles query error in executeQuery', async () => {
      await getDatabase();
      mockRawDb.runAsync.mockRejectedValue(new Error('SQL error'));

      await expect(executeQuery('INVALID')).rejects.toThrow('SQL error');
    });

    it('handles query error in queryAll', async () => {
      await getDatabase();
      mockRawDb.getAllAsync.mockRejectedValue(new Error('SQL error'));

      await expect(queryAll('INVALID')).rejects.toThrow('SQL error');
    });

    it('handles query error in queryFirst', async () => {
      await getDatabase();
      mockRawDb.getFirstAsync.mockRejectedValue(new Error('SQL error'));

      await expect(queryFirst('INVALID')).rejects.toThrow('SQL error');
    });

    it('handles transaction error', async () => {
      await getDatabase();
      mockRawDb.withTransactionAsync.mockRejectedValue(new Error('Transaction error'));

      const callback = jest.fn();
      await expect(executeTransaction(callback)).rejects.toThrow('Transaction error');
    });
  });

  describe('Concurrent Access', () => {
    it('handles concurrent queries', async () => {
      await getDatabase();

      // Clear mocks after initialization
      jest.clearAllMocks();

      const queries = [
        queryAll('SELECT * FROM accounts'),
        queryAll('SELECT * FROM categories'),
        queryFirst('SELECT * FROM operations LIMIT 1'),
      ];

      await expect(Promise.all(queries)).resolves.toBeDefined();

      expect(mockRawDb.getAllAsync).toHaveBeenCalledTimes(2);
      expect(mockRawDb.getFirstAsync).toHaveBeenCalledTimes(1);
    });

    it('handles concurrent transactions', async () => {
      await getDatabase();

      const callback1 = jest.fn().mockResolvedValue('tx1');
      const callback2 = jest.fn().mockResolvedValue('tx2');

      const [result1, result2] = await Promise.all([
        executeTransaction(callback1),
        executeTransaction(callback2),
      ]);

      expect(result1).toBe('tx1');
      expect(result2).toBe('tx2');
    });

    it('handles concurrent initialization', async () => {
      const promises = Array(10)
        .fill(null)
        .map(() => getDatabase());

      const results = await Promise.all(promises);

      // Should only open database once
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);

      // All results should reference the same raw and drizzle instances
      results.forEach((result) => {
        expect(result.raw).toBe(results[0].raw);
        expect(result.drizzle).toBe(results[0].drizzle);
      });
    });
  });

  describe('Database Lifecycle', () => {
    it('initializes, uses, and closes database', async () => {
      const db = await getDatabase();
      expect(db.raw).toBe(mockRawDb);

      await executeQuery('INSERT INTO accounts VALUES (?, ?)', ['id1', 'Test']);
      expect(mockRawDb.runAsync).toHaveBeenCalled();

      await closeDatabase();
      expect(mockRawDb.closeAsync).toHaveBeenCalled();
    });

    it('reinitializes after close', async () => {
      await getDatabase();
      await closeDatabase();

      SQLite.openDatabaseAsync.mockClear();
      await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    });

    it('handles multiple close calls', async () => {
      await getDatabase();

      await closeDatabase();
      await closeDatabase();
      await closeDatabase();

      expect(mockRawDb.closeAsync).toHaveBeenCalledTimes(1);
    });
  });
});
