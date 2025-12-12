/**
 * Tests for LastAccount Service - Utility for tracking last accessed account
 * Tests AsyncStorage read/write operations for last accessed account ID
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLastAccessedAccount, getLastAccessedAccount } from '../../app/services/LastAccount';

describe('LastAccount Service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('setLastAccessedAccount', () => {
    it('saves account ID to AsyncStorage', async () => {
      await setLastAccessedAccount('account123');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        'account123'
      );
    });

    it('updates account ID when called multiple times', async () => {
      await setLastAccessedAccount('account1');
      await setLastAccessedAccount('account2');

      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        'last_accessed_account_id',
        'account2'
      );
    });

    it('handles empty string account ID', async () => {
      await setLastAccessedAccount('');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        ''
      );
    });

    it('handles integer account ID', async () => {
      await setLastAccessedAccount(42);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        42
      );
    });

    it('handles legacy UUID format account ID (for migration)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      await setLastAccessedAccount(uuid);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        uuid
      );
    });

    it('silently handles AsyncStorage errors', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(setLastAccessedAccount('account123')).resolves.toBeUndefined();
    });

    it('handles null account ID gracefully', async () => {
      await setLastAccessedAccount(null);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        null
      );
    });

    it('handles undefined account ID gracefully', async () => {
      await setLastAccessedAccount(undefined);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        undefined
      );
    });
  });

  describe('getLastAccessedAccount', () => {
    it('retrieves account ID from AsyncStorage', async () => {
      AsyncStorage.getItem.mockResolvedValue('account123');

      const result = await getLastAccessedAccount();

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('last_accessed_account_id');
      expect(result).toBe('account123');
    });

    it('returns null when no account has been accessed', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);

      const result = await getLastAccessedAccount();

      expect(result).toBeNull();
    });

    it('returns correct ID after setLastAccessedAccount', async () => {
      await setLastAccessedAccount('account456');
      AsyncStorage.getItem.mockResolvedValue('account456');

      const result = await getLastAccessedAccount();

      expect(result).toBe('account456');
    });

    it('returns latest ID when set multiple times', async () => {
      await setLastAccessedAccount('account1');
      await setLastAccessedAccount('account2');
      await setLastAccessedAccount('account3');
      AsyncStorage.getItem.mockResolvedValue('account3');

      const result = await getLastAccessedAccount();

      expect(result).toBe('account3');
    });

    it('returns null on AsyncStorage error', async () => {
      AsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await getLastAccessedAccount();

      expect(result).toBeNull();
    });

    it('handles empty string value', async () => {
      AsyncStorage.getItem.mockResolvedValue('');

      const result = await getLastAccessedAccount();

      expect(result).toBe('');
    });
  });

  describe('Integration Workflow', () => {
    it('stores and retrieves account ID correctly', async () => {
      const accountId = 'test-account-123';

      // Store
      await setLastAccessedAccount(accountId);

      // Simulate retrieval
      AsyncStorage.getItem.mockResolvedValue(accountId);
      const retrieved = await getLastAccessedAccount();

      expect(retrieved).toBe(accountId);
    });

    it('handles set-get-set-get sequence', async () => {
      // First set
      await setLastAccessedAccount('account1');
      AsyncStorage.getItem.mockResolvedValue('account1');
      let result = await getLastAccessedAccount();
      expect(result).toBe('account1');

      // Second set
      await setLastAccessedAccount('account2');
      AsyncStorage.getItem.mockResolvedValue('account2');
      result = await getLastAccessedAccount();
      expect(result).toBe('account2');
    });

    it('persists across multiple get calls', async () => {
      await setLastAccessedAccount('persistent-account');
      AsyncStorage.getItem.mockResolvedValue('persistent-account');

      const result1 = await getLastAccessedAccount();
      const result2 = await getLastAccessedAccount();
      const result3 = await getLastAccessedAccount();

      expect(result1).toBe('persistent-account');
      expect(result2).toBe('persistent-account');
      expect(result3).toBe('persistent-account');
    });

    it('handles rapid successive sets', async () => {
      await setLastAccessedAccount('account1');
      await setLastAccessedAccount('account2');
      await setLastAccessedAccount('account3');
      await setLastAccessedAccount('account4');
      await setLastAccessedAccount('account5');

      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(5);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        'last_accessed_account_id',
        'account5'
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles concurrent set operations', async () => {
      // Simulate concurrent calls
      await Promise.all([
        setLastAccessedAccount('account1'),
        setLastAccessedAccount('account2'),
        setLastAccessedAccount('account3'),
      ]);

      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(3);
    });

    it('handles concurrent get operations', async () => {
      AsyncStorage.getItem.mockResolvedValue('account123');

      // Simulate concurrent calls
      const results = await Promise.all([
        getLastAccessedAccount(),
        getLastAccessedAccount(),
        getLastAccessedAccount(),
      ]);

      expect(results).toEqual(['account123', 'account123', 'account123']);
    });

    it('handles very long account ID string', async () => {
      const longId = 'a'.repeat(10000);
      await setLastAccessedAccount(longId);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        longId
      );
    });

    it('handles special characters in account ID', async () => {
      const specialId = 'acc@#$%^&*()_+-={}[]|:";\'<>?,./';
      await setLastAccessedAccount(specialId);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        specialId
      );
    });

    it('handles unicode characters in account ID', async () => {
      const unicodeId = '账户123\u4E2D\u6587';
      await setLastAccessedAccount(unicodeId);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        unicodeId
      );
    });
  });

  describe('Error Recovery', () => {
    it('continues working after storage error on set', async () => {
      // First call fails
      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage full'));
      await setLastAccessedAccount('account1');

      // Second call succeeds
      AsyncStorage.setItem.mockResolvedValueOnce(undefined);
      await setLastAccessedAccount('account2');

      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
    });

    it('continues working after storage error on get', async () => {
      // First call fails
      AsyncStorage.getItem.mockRejectedValueOnce(new Error('Read error'));
      let result = await getLastAccessedAccount();
      expect(result).toBeNull();

      // Second call succeeds
      AsyncStorage.getItem.mockResolvedValueOnce('account123');
      result = await getLastAccessedAccount();
      expect(result).toBe('account123');
    });

    it('handles intermittent storage failures', async () => {
      AsyncStorage.setItem
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValueOnce(undefined);

      await setLastAccessedAccount('account1');
      await setLastAccessedAccount('account2'); // Fails silently
      await setLastAccessedAccount('account3');

      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(3);
    });
  });

  describe('Storage Key', () => {
    it('uses correct storage key constant', async () => {
      await setLastAccessedAccount('test');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'last_accessed_account_id',
        'test'
      );
    });

    it('uses same key for get and set', async () => {
      await setLastAccessedAccount('account123');
      await getLastAccessedAccount();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('last_accessed_account_id', 'account123');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('last_accessed_account_id');
    });
  });
});
