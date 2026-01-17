/**
 * PreferencesDB Service Tests
 *
 * Tests for preference management including get/set operations,
 * type conversions, AsyncStorage fallback/migration, and error handling.
 */

import {
  PREF_KEYS,
  getPreference,
  setPreference,
  getNumberPreference,
  getJsonPreference,
  setJsonPreference,
  deletePreference,
  getAllPreferences,
} from '../../app/services/PreferencesDB';
import { queryFirst, executeQuery } from '../../app/services/db';

// Mock the database module
jest.mock('../../app/services/db', () => ({
  queryFirst: jest.fn(),
  executeQuery: jest.fn(),
}));

// Mock AsyncStorage explicitly for dynamic require in PreferencesDB
const mockAsyncStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: mockAsyncStorage,
}));

describe('PreferencesDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore?.();
    console.warn.mockRestore?.();
    console.error.mockRestore?.();
  });

  describe('PREF_KEYS', () => {
    it('exports THEME key', () => {
      expect(PREF_KEYS.THEME).toBe('theme_preference');
    });

    it('exports LANGUAGE key', () => {
      expect(PREF_KEYS.LANGUAGE).toBe('app_language');
    });

    it('exports LAST_ACCOUNT key', () => {
      expect(PREF_KEYS.LAST_ACCOUNT).toBe('last_accessed_account_id');
    });

    it('exports OPERATIONS_FILTERS key', () => {
      expect(PREF_KEYS.OPERATIONS_FILTERS).toBe('operations_active_filters');
    });

    it('has all expected keys', () => {
      expect(Object.keys(PREF_KEYS)).toEqual([
        'THEME',
        'LANGUAGE',
        'LAST_ACCOUNT',
        'OPERATIONS_FILTERS',
      ]);
    });
  });

  describe('getPreference', () => {
    it('returns value from SQLite when found', async () => {
      queryFirst.mockResolvedValue({ value: 'dark' });

      const result = await getPreference('theme_preference');

      expect(result).toBe('dark');
      expect(queryFirst).toHaveBeenCalledWith(
        'SELECT value FROM app_metadata WHERE key = ?',
        ['theme_preference'],
      );
    });

    it('returns defaultValue when SQLite returns null', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getPreference('missing_key', 'default');

      expect(result).toBe('default');
    });

    it('returns defaultValue when SQLite returns row with null value', async () => {
      queryFirst.mockResolvedValue({ value: null });
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getPreference('null_value_key', 'fallback');

      expect(result).toBe('fallback');
    });

    it('falls back to AsyncStorage when SQLite returns null', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue('en');

      const result = await getPreference('app_language');

      expect(result).toBe('en');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('app_language');
    });

    it('migrates value from AsyncStorage to SQLite', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue('light');
      executeQuery.mockResolvedValue({ changes: 1 });

      const result = await getPreference('theme_preference');

      expect(result).toBe('light');
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_metadata'),
        expect.arrayContaining(['theme_preference', 'light']),
      );
    });

    it('returns defaultValue when AsyncStorage also returns null', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getPreference('nonexistent', 'myDefault');

      expect(result).toBe('myDefault');
    });

    it('returns null when no defaultValue provided and key not found', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getPreference('nonexistent');

      expect(result).toBeNull();
    });

    it('returns defaultValue when SQLite throws error', async () => {
      queryFirst.mockRejectedValue(new Error('Database error'));

      const result = await getPreference('error_key', 'fallbackValue');

      expect(result).toBe('fallbackValue');
    });

    it('returns defaultValue when AsyncStorage throws error', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockRejectedValue(new Error('AsyncStorage error'));

      const result = await getPreference('async_error', 'defaultVal');

      expect(result).toBe('defaultVal');
    });

    it('logs migration message when migrating from AsyncStorage', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue('migrated_value');
      executeQuery.mockResolvedValue({ changes: 1 });

      await getPreference('migration_key');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Migrating migration_key from AsyncStorage to SQLite'),
      );
    });
  });

  describe('setPreference', () => {
    it('inserts or replaces preference in SQLite', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });

      await setPreference('theme_preference', 'dark');

      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_metadata'),
        expect.arrayContaining(['theme_preference', 'dark']),
      );
    });

    it('includes updated_at timestamp', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });
      const before = new Date().toISOString();

      await setPreference('test_key', 'test_value');

      const after = new Date().toISOString();
      const [, params] = executeQuery.mock.calls[0];

      // Third param should be a valid ISO timestamp
      expect(params[2]).toBeDefined();
      expect(new Date(params[2]).toISOString()).toBe(params[2]);
    });

    it('throws error when database operation fails', async () => {
      executeQuery.mockRejectedValue(new Error('Database write failed'));

      await expect(setPreference('fail_key', 'value')).rejects.toThrow('Database write failed');
    });

    it('logs error when database operation fails', async () => {
      executeQuery.mockRejectedValue(new Error('DB error'));

      try {
        await setPreference('error_key', 'value');
      } catch {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        '[PreferencesDB] Error setting preference:',
        'error_key',
        expect.any(Error),
      );
    });
  });

  describe('getNumberPreference', () => {
    it('returns number when value is numeric string', async () => {
      queryFirst.mockResolvedValue({ value: '42' });

      const result = await getNumberPreference('numeric_key');

      expect(result).toBe(42);
    });

    it('returns float when value is decimal string', async () => {
      queryFirst.mockResolvedValue({ value: '3.14159' });

      const result = await getNumberPreference('float_key');

      expect(result).toBeCloseTo(3.14159);
    });

    it('returns defaultValue when value is not a number', async () => {
      queryFirst.mockResolvedValue({ value: 'not-a-number' });
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getNumberPreference('nan_key', 100);

      expect(result).toBe(100);
    });

    it('returns defaultValue when key not found', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getNumberPreference('missing', 50);

      expect(result).toBe(50);
    });

    it('returns null by default when key not found', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getNumberPreference('missing');

      expect(result).toBeNull();
    });

    it('returns zero when value is "0"', async () => {
      queryFirst.mockResolvedValue({ value: '0' });

      const result = await getNumberPreference('zero_key');

      expect(result).toBe(0);
    });

    it('handles negative numbers', async () => {
      queryFirst.mockResolvedValue({ value: '-25' });

      const result = await getNumberPreference('negative_key');

      expect(result).toBe(-25);
    });
  });

  describe('getJsonPreference', () => {
    it('parses JSON object correctly', async () => {
      const obj = { foo: 'bar', count: 42 };
      queryFirst.mockResolvedValue({ value: JSON.stringify(obj) });

      const result = await getJsonPreference('json_obj');

      expect(result).toEqual(obj);
    });

    it('parses JSON array correctly', async () => {
      const arr = [1, 2, 3, 'four'];
      queryFirst.mockResolvedValue({ value: JSON.stringify(arr) });

      const result = await getJsonPreference('json_arr');

      expect(result).toEqual(arr);
    });

    it('parses nested JSON correctly', async () => {
      const nested = { a: { b: { c: [1, 2, 3] } } };
      queryFirst.mockResolvedValue({ value: JSON.stringify(nested) });

      const result = await getJsonPreference('nested');

      expect(result).toEqual(nested);
    });

    it('returns defaultValue when key not found', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getJsonPreference('missing', { default: true });

      expect(result).toEqual({ default: true });
    });

    it('returns null by default when key not found', async () => {
      queryFirst.mockResolvedValue(null);
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getJsonPreference('missing');

      expect(result).toBeNull();
    });

    it('returns defaultValue when JSON parsing fails', async () => {
      queryFirst.mockResolvedValue({ value: 'not-valid-json{' });
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getJsonPreference('invalid_json', { fallback: true });

      expect(result).toEqual({ fallback: true });
    });

    it('logs warning when JSON parsing fails', async () => {
      queryFirst.mockResolvedValue({ value: 'invalid json' });
      mockAsyncStorage.getItem.mockResolvedValue(null);

      await getJsonPreference('bad_json');

      expect(console.warn).toHaveBeenCalledWith(
        '[PreferencesDB] Error parsing JSON preference:',
        'bad_json',
        expect.any(Error),
      );
    });

    it('handles empty string (invalid JSON)', async () => {
      queryFirst.mockResolvedValue({ value: '' });
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getJsonPreference('empty', []);

      expect(result).toEqual([]);
    });
  });

  describe('setJsonPreference', () => {
    it('stringifies object before saving', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });
      const obj = { theme: 'dark', fontSize: 14 };

      await setJsonPreference('json_pref', obj);

      expect(executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['json_pref', JSON.stringify(obj)]),
      );
    });

    it('stringifies array before saving', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });
      const arr = ['a', 'b', 'c'];

      await setJsonPreference('json_arr', arr);

      expect(executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['json_arr', JSON.stringify(arr)]),
      );
    });

    it('stringifies nested objects', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });
      const nested = { filters: { type: 'expense', accounts: ['acc-1'] } };

      await setJsonPreference('nested_json', nested);

      expect(executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['nested_json', JSON.stringify(nested)]),
      );
    });

    it('handles null value', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });

      await setJsonPreference('null_json', null);

      expect(executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['null_json', 'null']),
      );
    });
  });

  describe('deletePreference', () => {
    it('deletes preference from database', async () => {
      executeQuery.mockResolvedValue({ changes: 1 });

      await deletePreference('delete_me');

      expect(executeQuery).toHaveBeenCalledWith(
        'DELETE FROM app_metadata WHERE key = ?',
        ['delete_me'],
      );
    });

    it('throws error when delete fails', async () => {
      executeQuery.mockRejectedValue(new Error('Delete failed'));

      await expect(deletePreference('fail_key')).rejects.toThrow('Delete failed');
    });

    it('logs error when delete fails', async () => {
      executeQuery.mockRejectedValue(new Error('Delete error'));

      try {
        await deletePreference('error_key');
      } catch {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        '[PreferencesDB] Error deleting preference:',
        'error_key',
        expect.any(Error),
      );
    });

    it('succeeds even when key does not exist', async () => {
      executeQuery.mockResolvedValue({ changes: 0 });

      await expect(deletePreference('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('getAllPreferences', () => {
    it('returns all preferences as object', async () => {
      const mockRows = {
        rows: {
          length: 2,
          item: (i) => [
            { key: 'theme', value: 'dark' },
            { key: 'language', value: 'en' },
          ][i],
        },
      };
      executeQuery.mockResolvedValue(mockRows);

      const result = await getAllPreferences();

      expect(result).toEqual({
        theme: 'dark',
        language: 'en',
      });
    });

    it('returns empty object when no preferences exist', async () => {
      const mockRows = {
        rows: {
          length: 0,
          item: () => null,
        },
      };
      executeQuery.mockResolvedValue(mockRows);

      const result = await getAllPreferences();

      expect(result).toEqual({});
    });

    it('returns empty object when results is null', async () => {
      executeQuery.mockResolvedValue(null);

      const result = await getAllPreferences();

      expect(result).toEqual({});
    });

    it('returns empty object when results.rows is undefined', async () => {
      executeQuery.mockResolvedValue({});

      const result = await getAllPreferences();

      expect(result).toEqual({});
    });

    it('returns empty object when database query fails', async () => {
      executeQuery.mockRejectedValue(new Error('Query failed'));

      const result = await getAllPreferences();

      expect(result).toEqual({});
    });

    it('logs error when query fails', async () => {
      executeQuery.mockRejectedValue(new Error('Query error'));

      await getAllPreferences();

      expect(console.error).toHaveBeenCalledWith(
        '[PreferencesDB] Error getting all preferences:',
        expect.any(Error),
      );
    });

    it('handles many preferences', async () => {
      const prefs = [];
      for (let i = 0; i < 10; i++) {
        prefs.push({ key: `key_${i}`, value: `value_${i}` });
      }
      const mockRows = {
        rows: {
          length: prefs.length,
          item: (i) => prefs[i],
        },
      };
      executeQuery.mockResolvedValue(mockRows);

      const result = await getAllPreferences();

      expect(Object.keys(result).length).toBe(10);
      expect(result.key_5).toBe('value_5');
    });
  });

  describe('Integration scenarios', () => {
    it('round-trips a preference correctly', async () => {
      // First set
      executeQuery.mockResolvedValue({ changes: 1 });
      await setPreference('round_trip', 'my_value');

      // Then get
      queryFirst.mockResolvedValue({ value: 'my_value' });
      const result = await getPreference('round_trip');

      expect(result).toBe('my_value');
    });

    it('round-trips JSON preference correctly', async () => {
      const obj = { filters: { date: '2024-01', type: 'expense' } };

      executeQuery.mockResolvedValue({ changes: 1 });
      await setJsonPreference('json_round_trip', obj);

      queryFirst.mockResolvedValue({ value: JSON.stringify(obj) });
      const result = await getJsonPreference('json_round_trip');

      expect(result).toEqual(obj);
    });

    it('handles operations filter preference workflow', async () => {
      // Save filters
      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        type: 'expense',
        accountIds: ['acc-1', 'acc-2'],
      };

      executeQuery.mockResolvedValue({ changes: 1 });
      await setJsonPreference(PREF_KEYS.OPERATIONS_FILTERS, filters);

      // Retrieve filters
      queryFirst.mockResolvedValue({ value: JSON.stringify(filters) });
      const result = await getJsonPreference(PREF_KEYS.OPERATIONS_FILTERS);

      expect(result).toEqual(filters);
    });
  });
});
