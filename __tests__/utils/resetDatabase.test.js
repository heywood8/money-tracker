import { resetDatabase, checkBudgetsTableExists, getDatabaseVersion } from '../../app/utils/resetDatabase';
import * as db from '../../app/services/db';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock the db module
jest.mock('../../app/services/db');

// Mock the eventEmitter module
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    emit: jest.fn(),
  },
  EVENTS: {
    DATABASE_RESET: 'DATABASE_RESET',
    RELOAD_ALL: 'RELOAD_ALL',
  },
}));

describe('resetDatabase', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('resetDatabase', () => {
    it('should drop all tables, reinitialize database, and emit events', async () => {
      db.dropAllTables.mockResolvedValue();
      db.getDatabase.mockResolvedValue({ raw: {} });

      await resetDatabase();

      expect(db.dropAllTables).toHaveBeenCalledTimes(1);
      expect(db.getDatabase).toHaveBeenCalledTimes(1);
      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.DATABASE_RESET);
      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
      expect(appEvents.emit).toHaveBeenCalledTimes(2);
    });

    it('should log progress messages during reset', async () => {
      db.dropAllTables.mockResolvedValue();
      db.getDatabase.mockResolvedValue({ raw: {} });

      await resetDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Starting database reset...');
      expect(consoleLogSpy).toHaveBeenCalledWith('All tables dropped');
      expect(consoleLogSpy).toHaveBeenCalledWith('Database reinitialized');
      expect(consoleLogSpy).toHaveBeenCalledWith('Database reset complete');
    });

    it('should throw error if dropAllTables fails', async () => {
      const error = new Error('Failed to drop tables');
      db.dropAllTables.mockRejectedValue(error);

      await expect(resetDatabase()).rejects.toThrow('Failed to drop tables');

      expect(db.dropAllTables).toHaveBeenCalledTimes(1);
      expect(db.getDatabase).not.toHaveBeenCalled();
      expect(appEvents.emit).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to reset database:', error);
    });

    it('should throw error if getDatabase fails', async () => {
      const error = new Error('Failed to initialize database');
      db.dropAllTables.mockResolvedValue();
      db.getDatabase.mockRejectedValue(error);

      await expect(resetDatabase()).rejects.toThrow('Failed to initialize database');

      expect(db.dropAllTables).toHaveBeenCalledTimes(1);
      expect(db.getDatabase).toHaveBeenCalledTimes(1);
      expect(appEvents.emit).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to reset database:', error);
    });

    it('should call operations in correct order', async () => {
      const callOrder = [];

      db.dropAllTables.mockImplementation(() => {
        callOrder.push('dropAllTables');
        return Promise.resolve();
      });

      db.getDatabase.mockImplementation(() => {
        callOrder.push('getDatabase');
        return Promise.resolve({ raw: {} });
      });

      appEvents.emit = jest.fn((event) => {
        callOrder.push(event);
      });

      await resetDatabase();

      expect(callOrder).toEqual([
        'dropAllTables',
        'getDatabase',
        'DATABASE_RESET',
        'RELOAD_ALL',
      ]);
    });
  });

  describe('checkBudgetsTableExists', () => {
    it('should return true when budgets table exists', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue({ name: 'budgets' }),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await checkBudgetsTableExists();

      expect(result).toBe(true);
      expect(mockRaw.getFirstAsync).toHaveBeenCalledWith(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'",
      );
    });

    it('should return false when budgets table does not exist', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await checkBudgetsTableExists();

      expect(result).toBe(false);
      expect(mockRaw.getFirstAsync).toHaveBeenCalledWith(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'",
      );
    });

    it('should return false and log error if database query fails', async () => {
      const error = new Error('Database query failed');
      const mockRaw = {
        getFirstAsync: jest.fn().mockRejectedValue(error),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await checkBudgetsTableExists();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to check budgets table:', error);
    });

    it('should return false if getDatabase fails', async () => {
      const error = new Error('Failed to get database');
      db.getDatabase.mockRejectedValue(error);

      const result = await checkBudgetsTableExists();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to check budgets table:', error);
    });
  });

  describe('getDatabaseVersion', () => {
    it('should return database version from metadata', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue({ value: '5' }),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await getDatabaseVersion();

      expect(result).toBe(5);
      expect(mockRaw.getFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM app_metadata WHERE key = ?',
        ['db_version'],
      );
    });

    it('should return 0 when metadata does not exist', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await getDatabaseVersion();

      expect(result).toBe(0);
    });

    it('should parse version as integer', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue({ value: '123' }),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await getDatabaseVersion();

      expect(result).toBe(123);
      expect(typeof result).toBe('number');
    });

    it('should return 0 and log error if database query fails', async () => {
      const error = new Error('Database query failed');
      const mockRaw = {
        getFirstAsync: jest.fn().mockRejectedValue(error),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await getDatabaseVersion();

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to get database version:', error);
    });

    it('should return 0 if getDatabase fails', async () => {
      const error = new Error('Failed to get database');
      db.getDatabase.mockRejectedValue(error);

      const result = await getDatabaseVersion();

      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to get database version:', error);
    });

    it('should handle non-numeric version values gracefully', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue({ value: 'not-a-number' }),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await getDatabaseVersion();

      // parseInt('not-a-number') returns NaN, which should be handled
      expect(isNaN(result)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent resetDatabase calls', async () => {
      db.dropAllTables.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10)));
      db.getDatabase.mockResolvedValue({ raw: {} });

      const promise1 = resetDatabase();
      const promise2 = resetDatabase();

      await Promise.all([promise1, promise2]);

      expect(db.dropAllTables).toHaveBeenCalledTimes(2);
      expect(appEvents.emit).toHaveBeenCalledTimes(4); // 2 calls × 2 events
    });

    it('should handle empty database during version check', async () => {
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue({ value: '' }),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      const result = await getDatabaseVersion();

      // parseInt('') returns NaN, which is what the function returns
      expect(isNaN(result)).toBe(true);
    });
  });

  describe('Regression Tests', () => {
    it('should emit both DATABASE_RESET and RELOAD_ALL events', async () => {
      // Regression: Ensure both events are emitted to properly refresh all contexts
      db.dropAllTables.mockResolvedValue();
      db.getDatabase.mockResolvedValue({ raw: {} });

      await resetDatabase();

      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.DATABASE_RESET);
      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });

    it('should not emit events if reset fails', async () => {
      // Regression: Ensure events are not emitted if the reset operation fails
      const error = new Error('Reset failed');
      db.dropAllTables.mockRejectedValue(error);

      try {
        await resetDatabase();
      } catch (e) {
        // Expected to throw
      }

      expect(appEvents.emit).not.toHaveBeenCalled();
    });

    it('should properly check for budgets table with exact name', async () => {
      // Regression: Ensure we're checking for the exact table name 'budgets'
      const mockRaw = {
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      db.getDatabase.mockResolvedValue({ raw: mockRaw });

      await checkBudgetsTableExists();

      expect(mockRaw.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining("name='budgets'"),
      );
    });
  });
});
