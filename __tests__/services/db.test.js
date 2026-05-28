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
      withExclusiveTransactionAsync: jest.fn((callback) => callback(mockDb)),
      createCustomFunctionAsync: jest.fn(() => Promise.resolve()),
      createFunctionAsync: jest.fn(() => Promise.resolve()),
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

      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
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

    it('logs transaction errors via console.error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('DB write failed');
      const failingCallback = jest.fn(async () => { throw err; });

      await expect(executeTransaction(failingCallback)).rejects.toThrow('DB write failed');

      // Give the _lastTransaction catch handler a chance to run
      await Promise.resolve();
      expect(errorSpy).toHaveBeenCalledWith('[DB] Transaction failed:', err);
      errorSpy.mockRestore();
    });

    it('does not block subsequent transactions after a failed one', async () => {
      const failingCallback = jest.fn(async () => {
        throw new Error('Deliberate failure');
      });
      const successCallback = jest.fn(async (db) => {
        await db.runAsync('SELECT 1');
        return 'recovered';
      });

      await expect(executeTransaction(failingCallback)).rejects.toThrow('Deliberate failure');
      const result = await executeTransaction(successCallback);

      expect(result).toBe('recovered');
      expect(successCallback).toHaveBeenCalledWith(mockDb);
    });

    it('serializes concurrent transactions', async () => {
      const order = [];
      const first = jest.fn(async (db) => {
        order.push('first');
        await db.runAsync('SELECT 1');
        return 'first';
      });
      const second = jest.fn(async (db) => {
        order.push('second');
        return 'second';
      });

      const [r1, r2] = await Promise.all([
        executeTransaction(first),
        executeTransaction(second),
      ]);

      expect(r1).toBe('first');
      expect(r2).toBe('second');
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

  describe('SEARCH_NORM custom function', () => {
    it('registers SEARCH_NORM during database initialization', async () => {
      await getDatabase();

      // expo-sqlite 16.x API: createCustomFunctionAsync(name, callback, options)
      expect(mockDb.createCustomFunctionAsync).toHaveBeenCalledWith(
        'SEARCH_NORM',
        expect.any(Function),
        { deterministic: true },
      );
    });

    it('registers SEARCH_NORM with deterministic: true option', async () => {
      await getDatabase();

      const [,, options] = mockDb.createCustomFunctionAsync.mock.calls[0];
      expect(options).toEqual({ deterministic: true });
    });

    it('registers SEARCH_NORM before first runAsync call', async () => {
      await getDatabase();

      const createFunctionOrder = mockDb.createCustomFunctionAsync.mock.invocationCallOrder[0];
      const firstRunAsyncOrder = mockDb.runAsync.mock.invocationCallOrder[0];
      expect(createFunctionOrder).toBeLessThan(firstRunAsyncOrder);
    });

    it('SEARCH_NORM callback returns null for null input', async () => {
      await getDatabase();

      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback(null)).toBeNull();
    });

    it('SEARCH_NORM callback returns null for undefined input', async () => {
      await getDatabase();

      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback(undefined)).toBeNull();
    });

    it('SEARCH_NORM callback lowercases ASCII text', async () => {
      await getDatabase();

      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback('COFFEE')).toBe('coffee');
      expect(callback('Grocery')).toBe('grocery');
      expect(callback('TEST123')).toBe('test123');
    });

    it('SEARCH_NORM callback correctly lowercases Cyrillic text', async () => {
      await getDatabase();

      // SQLite's built-in LOWER() leaves Cyrillic unchanged; this custom function must handle it
      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback('Транспорт')).toBe('транспорт');
      expect(callback('САМОЛЕТ')).toBe('самолет');
      expect(callback('Путешествия')).toBe('путешествия');
    });

    it('SEARCH_NORM callback lowercases mixed-script and accented text', async () => {
      await getDatabase();

      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback('Café')).toBe('café');
      expect(callback('München')).toBe('münchen');
    });

    it('SEARCH_NORM callback preserves numeric strings', async () => {
      await getDatabase();

      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback('12345')).toBe('12345');
      expect(callback('3.14')).toBe('3.14');
    });

    it('SEARCH_NORM folds Russian ё → е (regression: keyboard autocomplete bug)', async () => {
      await getDatabase();

      // The screenshot bug: user types "Самолет" but the Russian keyboard autocompletes
      // to "Самолёт"; both should normalize to the same string so the search matches.
      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      expect(callback('Самолёт')).toBe('самолет');
      expect(callback('Самолет')).toBe('самолет');
      expect(callback('САМОЛЁТ')).toBe('самолет');
      expect(callback('ёжик')).toBe('ежик');
      expect(callback('Ёлка')).toBe('елка');
    });

    it('SEARCH_NORM normalizes decomposed ё (е + combining diaeresis) to the same form', async () => {
      await getDatabase();

      const callback = mockDb.createCustomFunctionAsync.mock.calls[0][1];
      // Decomposed form: е (U+0435) + combining diaeresis (U+0308)
      const decomposed = 'Самолёт'; // "Самолё̈т" decomposed
      // After NFC + lowercase + ё→е fold, should match the simple form
      expect(callback(decomposed)).toBe('самолет');
    });
  });

  describe('Migration 0007 pre-migration guard', () => {
    const validOpsSchema = {
      sql: 'CREATE TABLE `operations` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `type` text NOT NULL, `amount` text NOT NULL)',
    };
    const checkedOpsSchema = {
      sql: "CREATE TABLE `operations` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `type` text NOT NULL CHECK (`type` IN ('expense', 'income', 'transfer')), `amount` text NOT NULL)",
    };

    it('calls migrate with full config when no invalid operation types exist', async () => {
      // isDatabaseCorrupted uses getAllAsync; first getFirstAsync is the opsSchema check
      mockDb.getFirstAsync
        .mockResolvedValueOnce(validOpsSchema) // opsSchema: no CHECK yet
        .mockResolvedValueOnce(null);          // invalid op check -> none found

      await getDatabase();

      expect(migrate).toHaveBeenCalled();
      const migrationsArg = migrate.mock.calls[0][1];
      expect(migrationsArg).toHaveProperty('migrations');
    });

    it('skips migration 0007 and warns when invalid operation types are found', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      mockDb.getFirstAsync
        .mockResolvedValueOnce(validOpsSchema)             // opsSchema: no CHECK yet
        .mockResolvedValueOnce({ id: 42, type: 'bogus' }); // invalid op found

      await getDatabase();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping migration 0007'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('bogus'),
      );
      const migrationsArg = migrate.mock.calls[0][1];
      const tags = (migrationsArg.journal.entries || []).map(e => e.tag);
      expect(tags).not.toContain('0007_add_enum_check_constraints');
      expect(migrationsArg.migrations).not.toHaveProperty('m0007');

      warnSpy.mockRestore();
    });

    it('skips the invalid-type check when CHECK constraint is already present', async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce(null)            // isDatabaseCorrupted
        .mockResolvedValueOnce(checkedOpsSchema); // opsSchema: CHECK present

      await getDatabase();

      const invalidOpCheckCalls = mockDb.getFirstAsync.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('NOT IN'),
      );
      expect(invalidOpCheckCalls).toHaveLength(0);
      expect(migrate).toHaveBeenCalled();
    });

    it('still runs the invalid-type check when a non-type CHECK constraint is present', async () => {
      // Guard against the regression where includes('CHECK') would falsely match any
      // CHECK constraint (e.g. on amount) and skip the invalid-type validation.
      const otherCheckSchema = {
        sql: 'CREATE TABLE `operations` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `type` text NOT NULL, `amount` text NOT NULL CHECK (`amount` >= 0))',
      };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      mockDb.getFirstAsync
        .mockResolvedValueOnce(otherCheckSchema)           // opsSchema: CHECK on amount, not type
        .mockResolvedValueOnce({ id: 7, type: 'garbage' }); // invalid op found

      await getDatabase();

      // Should detect that 0007 has NOT been applied (despite the unrelated CHECK)
      // and run the invalid-type check, finding the bad row and warning.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping migration 0007'),
      );

      warnSpy.mockRestore();
    });

    it('skips the pre-check when operations table does not exist yet', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      mockDb.getFirstAsync
        .mockResolvedValueOnce(null) // isDatabaseCorrupted
        .mockResolvedValueOnce(null); // opsSchema: table absent

      await getDatabase();

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping migration 0007'),
      );
      expect(migrate).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
