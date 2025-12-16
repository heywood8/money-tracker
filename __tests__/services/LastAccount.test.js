/**
 * Tests for LastAccount Service - Utility for tracking last accessed account
 * Tests PreferencesDB read/write operations for last accessed account ID
 */

import * as PreferencesDB from '../../app/services/PreferencesDB';
import { setLastAccessedAccount, getLastAccessedAccount } from '../../app/services/LastAccount';

// Mock PreferencesDB
jest.mock('../../app/services/PreferencesDB');

describe('LastAccount Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setLastAccessedAccount', () => {
    it('saves account ID to PreferencesDB as string', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(123);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '123',
      );
    });

    it('updates account ID when called multiple times', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(1);
      await setLastAccessedAccount(2);

      expect(PreferencesDB.setPreference).toHaveBeenLastCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '2',
      );
    });

    it('handles zero account ID', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(0);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '0',
      );
    });

    it('handles large account ID numbers', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);
      const largeId = 999999999;

      await setLastAccessedAccount(largeId);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '999999999',
      );
    });

    it('silently handles PreferencesDB errors', async () => {
      PreferencesDB.setPreference.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(setLastAccessedAccount(123)).resolves.toBeUndefined();
    });

    it('handles null account ID by converting to string', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(null);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        'null',
      );
    });

    it('handles undefined account ID by converting to string', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(undefined);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        'undefined',
      );
    });
  });

  describe('getLastAccessedAccount', () => {
    it('retrieves account ID from PreferencesDB as number', async () => {
      PreferencesDB.getNumberPreference.mockResolvedValue(123);

      const result = await getLastAccessedAccount();

      expect(PreferencesDB.getNumberPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        null,
      );
      expect(result).toBe(123);
    });

    it('returns null when no account has been accessed', async () => {
      PreferencesDB.getNumberPreference.mockResolvedValue(null);

      const result = await getLastAccessedAccount();

      expect(result).toBeNull();
    });

    it('returns correct ID after setLastAccessedAccount', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);
      PreferencesDB.getNumberPreference.mockResolvedValue(456);

      await setLastAccessedAccount(456);
      const result = await getLastAccessedAccount();

      expect(result).toBe(456);
    });

    it('returns latest ID when set multiple times', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);
      PreferencesDB.getNumberPreference.mockResolvedValue(3);

      await setLastAccessedAccount(1);
      await setLastAccessedAccount(2);
      await setLastAccessedAccount(3);

      const result = await getLastAccessedAccount();

      expect(result).toBe(3);
    });

    it('returns null on PreferencesDB error', async () => {
      PreferencesDB.getNumberPreference.mockRejectedValue(new Error('Storage error'));

      const result = await getLastAccessedAccount();

      expect(result).toBeNull();
    });

    it('handles zero value', async () => {
      PreferencesDB.getNumberPreference.mockResolvedValue(0);

      const result = await getLastAccessedAccount();

      expect(result).toBe(0);
    });
  });

  describe('Integration Workflow', () => {
    it('stores and retrieves account ID correctly', async () => {
      const accountId = 123;

      PreferencesDB.setPreference.mockResolvedValue(undefined);
      PreferencesDB.getNumberPreference.mockResolvedValue(accountId);

      // Store
      await setLastAccessedAccount(accountId);

      // Retrieve
      const retrieved = await getLastAccessedAccount();

      expect(retrieved).toBe(accountId);
    });

    it('handles set-get-set-get sequence', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      // First set
      await setLastAccessedAccount(1);
      PreferencesDB.getNumberPreference.mockResolvedValue(1);
      let result = await getLastAccessedAccount();
      expect(result).toBe(1);

      // Second set
      await setLastAccessedAccount(2);
      PreferencesDB.getNumberPreference.mockResolvedValue(2);
      result = await getLastAccessedAccount();
      expect(result).toBe(2);
    });

    it('persists across multiple get calls', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);
      PreferencesDB.getNumberPreference.mockResolvedValue(999);

      await setLastAccessedAccount(999);

      const result1 = await getLastAccessedAccount();
      const result2 = await getLastAccessedAccount();
      const result3 = await getLastAccessedAccount();

      expect(result1).toBe(999);
      expect(result2).toBe(999);
      expect(result3).toBe(999);
    });

    it('handles rapid successive sets', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(1);
      await setLastAccessedAccount(2);
      await setLastAccessedAccount(3);
      await setLastAccessedAccount(4);
      await setLastAccessedAccount(5);

      expect(PreferencesDB.setPreference).toHaveBeenCalledTimes(5);
      expect(PreferencesDB.setPreference).toHaveBeenLastCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '5',
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles concurrent set operations', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      // Simulate concurrent calls
      await Promise.all([
        setLastAccessedAccount(1),
        setLastAccessedAccount(2),
        setLastAccessedAccount(3),
      ]);

      expect(PreferencesDB.setPreference).toHaveBeenCalledTimes(3);
    });

    it('handles concurrent get operations', async () => {
      PreferencesDB.getNumberPreference.mockResolvedValue(123);

      // Simulate concurrent calls
      const results = await Promise.all([
        getLastAccessedAccount(),
        getLastAccessedAccount(),
        getLastAccessedAccount(),
      ]);

      expect(results).toEqual([123, 123, 123]);
    });

    it('handles very large account ID numbers', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);
      const largeId = 2147483647; // Max 32-bit integer

      await setLastAccessedAccount(largeId);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '2147483647',
      );
    });

    it('handles negative account ID numbers', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(-1);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '-1',
      );
    });
  });

  describe('Error Recovery', () => {
    it('continues working after storage error on set', async () => {
      // First call fails
      PreferencesDB.setPreference.mockRejectedValueOnce(new Error('Storage full'));
      await setLastAccessedAccount(1);

      // Second call succeeds
      PreferencesDB.setPreference.mockResolvedValueOnce(undefined);
      await setLastAccessedAccount(2);

      expect(PreferencesDB.setPreference).toHaveBeenCalledTimes(2);
    });

    it('continues working after storage error on get', async () => {
      // First call fails
      PreferencesDB.getNumberPreference.mockRejectedValueOnce(new Error('Read error'));
      let result = await getLastAccessedAccount();
      expect(result).toBeNull();

      // Second call succeeds
      PreferencesDB.getNumberPreference.mockResolvedValueOnce(123);
      result = await getLastAccessedAccount();
      expect(result).toBe(123);
    });

    it('handles intermittent storage failures', async () => {
      PreferencesDB.setPreference
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce(undefined);

      await setLastAccessedAccount(1);
      await setLastAccessedAccount(2); // Fails silently
      await setLastAccessedAccount(3);

      expect(PreferencesDB.setPreference).toHaveBeenCalledTimes(3);
    });
  });

  describe('Storage Key', () => {
    it('uses correct storage key constant', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);

      await setLastAccessedAccount(1);

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '1',
      );
    });

    it('uses same key for get and set', async () => {
      PreferencesDB.setPreference.mockResolvedValue(undefined);
      PreferencesDB.getNumberPreference.mockResolvedValue(123);

      await setLastAccessedAccount(123);
      await getLastAccessedAccount();

      expect(PreferencesDB.setPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        '123',
      );
      expect(PreferencesDB.getNumberPreference).toHaveBeenCalledWith(
        PreferencesDB.PREF_KEYS.LAST_ACCOUNT,
        null,
      );
    });
  });
});
