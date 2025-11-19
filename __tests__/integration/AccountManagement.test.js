/**
 * Integration tests for Account Management flow
 * These tests ensure the complete account management workflow works correctly
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AccountsProvider, useAccounts } from '../../app/AccountsContext';
import * as AccountsDB from '../../app/services/AccountsDB';
import { performMigration, isMigrationComplete } from '../../app/services/migration';

// Mock dependencies
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/services/migration');

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

describe('Account Management Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUuidCounter = 0;
    isMigrationComplete.mockResolvedValue(true);
    AccountsDB.getAllAccounts.mockResolvedValue([]);
    AccountsDB.createAccount.mockResolvedValue(undefined);
    AccountsDB.updateAccount.mockResolvedValue(undefined);
    AccountsDB.deleteAccount.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => <AccountsProvider>{children}</AccountsProvider>;

  describe('Complete CRUD Workflow', () => {
    it('completes full account lifecycle: create, read, update, delete', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // CREATE: Add first account
      await act(async () => {
        await result.current.addAccount({
          name: 'Savings Account',
          balance: '1000.00',
          currency: 'USD',
        });
      });

      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].name).toBe('Savings Account');

      // CREATE: Add second account
      await act(async () => {
        await result.current.addAccount({
          name: 'Checking Account',
          balance: '500.00',
          currency: 'EUR',
        });
      });

      expect(result.current.accounts).toHaveLength(2);

      // READ: Verify accounts exist
      expect(result.current.accounts[0].name).toBe('Savings Account');
      expect(result.current.accounts[1].name).toBe('Checking Account');

      // UPDATE: Modify first account
      const firstAccountId = result.current.accounts[0].id;
      await act(async () => {
        await result.current.updateAccount(firstAccountId, {
          name: 'Updated Savings',
          balance: '1500.00',
        });
      });

      expect(result.current.accounts[0].name).toBe('Updated Savings');
      expect(result.current.accounts[0].balance).toBe('1500.00');

      // UPDATE: Modify second account
      const secondAccountId = result.current.accounts[1].id;
      await act(async () => {
        await result.current.updateAccount(secondAccountId, {
          balance: '750.00',
        });
      });

      expect(result.current.accounts[1].balance).toBe('750.00');
      expect(result.current.accounts[1].name).toBe('Checking Account'); // Unchanged

      // DELETE: Remove second account
      await act(async () => {
        await result.current.deleteAccount(secondAccountId);
      });

      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].id).toBe(firstAccountId);

      // DELETE: Remove first account
      await act(async () => {
        await result.current.deleteAccount(firstAccountId);
      });

      expect(result.current.accounts).toHaveLength(0);
    });

    it('maintains data integrity through multiple operations', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add 5 accounts
      for (let i = 1; i <= 5; i++) {
        await act(async () => {
          await result.current.addAccount({
            name: `Account ${i}`,
            balance: `${i * 100}.00`,
            currency: 'USD',
          });
        });
      }

      expect(result.current.accounts).toHaveLength(5);

      // Update accounts 2 and 4
      await act(async () => {
        await result.current.updateAccount(result.current.accounts[1].id, {
          balance: '999.99',
        });
        await result.current.updateAccount(result.current.accounts[3].id, {
          name: 'Special Account',
        });
      });

      expect(result.current.accounts[1].balance).toBe('999.99');
      expect(result.current.accounts[3].name).toBe('Special Account');

      // Delete accounts 1, 3, and 5
      await act(async () => {
        await result.current.deleteAccount(result.current.accounts[0].id);
      });
      await act(async () => {
        await result.current.deleteAccount(result.current.accounts[1].id);
      });
      await act(async () => {
        await result.current.deleteAccount(result.current.accounts[2].id);
      });

      expect(result.current.accounts).toHaveLength(2);
      expect(result.current.accounts[0].balance).toBe('999.99');
      expect(result.current.accounts[1].name).toBe('Special Account');
    });
  });

  describe('Validation and Error Handling', () => {
    it('validates account before operations', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Test validation function
      const validAccount = {
        name: 'Test Account',
        balance: '100',
        currency: 'USD',
      };
      expect(result.current.validateAccount(validAccount)).toEqual({});

      const invalidAccount = {
        name: '',
        balance: 'invalid',
        currency: '',
      };
      const errors = result.current.validateAccount(invalidAccount);
      expect(errors).toHaveProperty('name');
      expect(errors).toHaveProperty('balance');
      expect(errors).toHaveProperty('currency');
    });

    it('handles database errors gracefully during CRUD operations', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Simulate create error
      AccountsDB.createAccount.mockRejectedValueOnce(new Error('Create failed'));
      await expect(
        act(async () => {
          await result.current.addAccount({
            name: 'Test',
            balance: '100',
            currency: 'USD',
          });
        })
      ).rejects.toThrow('Create failed');

      // Add a successful account
      AccountsDB.createAccount.mockResolvedValue(undefined);
      await act(async () => {
        await result.current.addAccount({
          name: 'Test',
          balance: '100',
          currency: 'USD',
        });
      });

      const accountId = result.current.accounts[0].id;

      // Simulate update error
      AccountsDB.updateAccount.mockRejectedValueOnce(new Error('Update failed'));
      await expect(
        act(async () => {
          await result.current.updateAccount(accountId, { name: 'Updated' });
        })
      ).rejects.toThrow('Update failed');

      // Simulate delete error
      AccountsDB.deleteAccount.mockRejectedValueOnce(new Error('Delete failed'));
      await expect(
        act(async () => {
          await result.current.deleteAccount(accountId);
        })
      ).rejects.toThrow('Delete failed');

      // Account should still exist after failed delete
      expect(result.current.accounts).toHaveLength(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('handles multiple concurrent account additions', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add multiple accounts concurrently
      await act(async () => {
        await Promise.all([
          result.current.addAccount({ name: 'Account 1', balance: '100', currency: 'USD' }),
          result.current.addAccount({ name: 'Account 2', balance: '200', currency: 'EUR' }),
          result.current.addAccount({ name: 'Account 3', balance: '300', currency: 'GBP' }),
        ]);
      });

      expect(result.current.accounts).toHaveLength(3);
      expect(result.current.accounts.map((a) => a.name)).toEqual([
        'Account 1',
        'Account 2',
        'Account 3',
      ]);
    });

    it('handles concurrent updates to different accounts', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
        { id: '2', name: 'Account 2', balance: '200', currency: 'EUR' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Update both accounts concurrently
      await act(async () => {
        await Promise.all([
          result.current.updateAccount('1', { balance: '150' }),
          result.current.updateAccount('2', { balance: '250' }),
        ]);
      });

      expect(result.current.accounts[0].balance).toBe('150');
      expect(result.current.accounts[1].balance).toBe('250');
    });
  });

  describe('Reload Functionality', () => {
    it('reloads accounts from database', async () => {
      const initialAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
      ];
      AccountsDB.getAllAccounts
        .mockResolvedValueOnce(initialAccounts)
        .mockResolvedValueOnce([
          { id: '1', name: 'Account 1', balance: '150', currency: 'USD' },
          { id: '2', name: 'Account 2', balance: '200', currency: 'EUR' },
        ]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.accounts).toHaveLength(1);

      await act(async () => {
        await result.current.reloadAccounts();
      });

      expect(result.current.accounts).toHaveLength(2);
      expect(result.current.accounts[0].balance).toBe('150');
    });
  });

  describe('State Consistency', () => {
    it('maintains correct account order after operations', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add accounts
      await act(async () => {
        await result.current.addAccount({ name: 'A', balance: '100', currency: 'USD' });
        await result.current.addAccount({ name: 'B', balance: '200', currency: 'EUR' });
        await result.current.addAccount({ name: 'C', balance: '300', currency: 'GBP' });
      });

      const accountIds = result.current.accounts.map((a) => a.id);

      // Delete middle account
      await act(async () => {
        await result.current.deleteAccount(accountIds[1]);
      });

      expect(result.current.accounts).toHaveLength(2);
      expect(result.current.accounts[0].name).toBe('A');
      expect(result.current.accounts[1].name).toBe('C');
    });

    it('preserves account IDs across updates', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addAccount({ name: 'Test', balance: '100', currency: 'USD' });
      });

      const originalId = result.current.accounts[0].id;

      await act(async () => {
        await result.current.updateAccount(originalId, {
          name: 'Updated',
          balance: '200',
        });
      });

      expect(result.current.accounts[0].id).toBe(originalId);
    });
  });

  // Regression tests
  describe('Regression Tests', () => {
    it('prevents duplicate account IDs', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addAccount({ name: 'Account 1', balance: '100', currency: 'USD' });
        await result.current.addAccount({ name: 'Account 2', balance: '200', currency: 'EUR' });
        await result.current.addAccount({ name: 'Account 3', balance: '300', currency: 'GBP' });
      });

      const ids = result.current.accounts.map((a) => a.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length); // All IDs should be unique
    });

    it('ensures balance remains as string type', async () => {
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addAccount({ name: 'Test', balance: 100, currency: 'USD' });
      });

      expect(typeof result.current.accounts[0].balance).toBe('string');

      await act(async () => {
        await result.current.updateAccount(result.current.accounts[0].id, { balance: 200 });
      });

      expect(typeof result.current.accounts[0].balance).toBe('string');
    });
  });
});
