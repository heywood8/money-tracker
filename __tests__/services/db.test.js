/**
 * Tests for Database Service - SQLite connection and migration management using Drizzle ORM
 */

import { getDatabase, getDrizzle, closeDatabase, resetDatabase, executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import * as SQLite from 'expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

// Mock expo-sqlite is already set up in jest.setup.js
// Mock drizzle-orm/expo-sqlite/migrator is already set up in jest.setup.js

describe('Database Service', () => {
  let mockDb;

  beforeEach(async () => {
    // Close any existing database connection
    await closeDatabase();

    jest.clearAllMocks();

    // Reset the module to clear cached instances
    jest.resetModules();

    // Set up mock database instance
    mockDb = {
      execAsync: jest.fn(() => Promise.resolve()),
      runAsync: jest.fn(() => Promise.resolve({ changes: 1, lastInsertRowId: 1 })),
      getFirstAsync: jest.fn(() => Promise.resolve(null)),
      getAllAsync: jest.fn(() => Promise.resolve([])),
      closeAsync: jest.fn(() => Promise.resolve()),
      withTransactionAsync: jest.fn((callback) => callback()),
    };

    SQLite.openDatabaseAsync.mockResolvedValue(mockDb);
  });

  afterEach(async () => {
    // Clean up database connection after each test
    try {
      await closeDatabase();
    } catch (error) {
      // Ignore errors
    }
  });

  describe('getDatabase', () => {
    it('opens database and returns instances', async () => {
      const result = await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('penny.db');
      expect(result).toHaveProperty('raw');
      expect(result).toHaveProperty('drizzle');
      expect(result.raw).toBe(mockDb);
    });

    it('initializes database with foreign keys and WAL mode', async () => {
      await getDatabase();

      expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('runs Drizzle migrations', async () => {
      await getDatabase();

      expect(migrate).toHaveBeenCalled();
    });

    it('returns cached instance on subsequent calls', async () => {
      const result1 = await getDatabase();
      const result2 = await getDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
      // Check that the raw and drizzle instances are the same (deep equality)
      expect(result1.raw).toBe(result2.raw);
      expect(result1.drizzle).toBe(result2.drizzle);
    });

    it('handles database opening errors', async () => {
      const error = new Error('Failed to open database');
      SQLite.openDatabaseAsync.mockRejectedValue(error);

      await expect(getDatabase()).rejects.toThrow('Failed to open database');
    });
  });

  describe('getDrizzle', () => {
    it('returns Drizzle instance', async () => {
      const db = await getDrizzle();

      expect(db).toBeDefined();
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('penny.db');
    });

    it('returns same instance on multiple calls', async () => {
      const db1 = await getDrizzle();
      const db2 = await getDrizzle();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
      expect(db1).toBe(db2);
    });
  });

  describe('closeDatabase', () => {
    it('closes database connection', async () => {
      await getDatabase();
      await closeDatabase();

      expect(mockDb.closeAsync).toHaveBeenCalled();
    });

    it('handles close errors gracefully', async () => {
      await getDatabase();
      mockDb.closeAsync.mockRejectedValue(new Error('Close failed'));

      await expect(closeDatabase()).resolves.not.toThrow();
    });

    it('can reopen database after closing', async () => {
      await getDatabase();
      await closeDatabase();

      const result = await getDatabase();
      expect(result).toBeDefined();
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeQuery (legacy compatibility)', () => {
    it('executes SQL query with parameters', async () => {
      await executeQuery('INSERT INTO accounts VALUES (?, ?)', ['1', 'Test']);

      expect(mockDb.runAsync).toHaveBeenCalledWith('INSERT INTO accounts VALUES (?, ?)', ['1', 'Test']);
    });

    it('handles query errors', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Query failed'));

      await expect(executeQuery('INVALID SQL')).rejects.toThrow('Query failed');
    });
  });

  describe('queryAll (legacy compatibility)', () => {
    it('returns all query results', async () => {
      const mockResults = [{ id: 1, name: 'Test' }];
      mockDb.getAllAsync.mockResolvedValue(mockResults);

      const results = await queryAll('SELECT * FROM accounts');

      expect(results).toEqual(mockResults);
      expect(mockDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM accounts', []);
    });

    it('returns empty array when no results', async () => {
      mockDb.getAllAsync.mockResolvedValue(null);

      const results = await queryAll('SELECT * FROM accounts');

      expect(results).toEqual([]);
    });

    it('supports query parameters', async () => {
      await queryAll('SELECT * FROM accounts WHERE id = ?', ['123']);

      expect(mockDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM accounts WHERE id = ?', ['123']);
    });
  });

  describe('queryFirst (legacy compatibility)', () => {
    it('returns first query result', async () => {
      const mockResult = { id: 1, name: 'Test' };
      mockDb.getFirstAsync.mockResolvedValue(mockResult);

      const result = await queryFirst('SELECT * FROM accounts LIMIT 1');

      expect(result).toEqual(mockResult);
    });

    it('returns null when no results', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await queryFirst('SELECT * FROM accounts WHERE id = ?', ['999']);

      expect(result).toBeNull();
    });
  });

  describe('executeTransaction (legacy compatibility)', () => {
    it('executes callback within transaction', async () => {
      const callback = jest.fn(async (db) => {
        await db.runAsync('INSERT INTO accounts VALUES (?, ?)', ['1', 'Test']);
        return 'success';
      });

      const result = await executeTransaction(callback);

      expect(mockDb.withTransactionAsync).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(mockDb);
      expect(result).toBe('success');
    });

    it('rolls back transaction on error', async () => {
      const callback = jest.fn(async () => {
        throw new Error('Transaction error');
      });

      await expect(executeTransaction(callback)).rejects.toThrow('Transaction error');
    });
  });

  describe('resetDatabase', () => {
    it('closes database and deletes file', async () => {
      await getDatabase();

      // Mock expo-file-system/legacy
      const FileSystem = require('expo-file-system/legacy');
      jest.mock('expo-file-system/legacy', () => ({
        deleteAsync: jest.fn(() => Promise.resolve()),
      }));

      await resetDatabase();

      expect(mockDb.closeAsync).toHaveBeenCalled();
    });
  });
});
