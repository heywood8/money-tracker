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
    AccountsDB.adjustAccountBalance.mockResolvedValue(undefined);
    AccountsDB.deleteAccount.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => <AccountsProvider>{children}</AccountsProvider>;

  describe('Complete CRUD Workflow', () => {
    it('completes full account lifecycle: create, read, update, delete', async () => {
      // Start with one existing account to prevent default creation
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial Account', balance: '100', currency: 'USD' }
      ];
      let currentAccounts = [...initialAccounts];

      // Setup dynamic mock that tracks state
      AccountsDB.getAllAccounts.mockImplementation(() => Promise.resolve([...currentAccounts]));
      AccountsDB.createAccount.mockImplementation((account) => {
        currentAccounts.push(account);
        return Promise.resolve(undefined);
      });
      AccountsDB.updateAccount.mockImplementation((id, updates) => {
        const account = currentAccounts.find(a => a.id === id);
        if (account) Object.assign(account, updates);
        return Promise.resolve(undefined);
      });
      AccountsDB.adjustAccountBalance.mockImplementation((id, newBalance) => {
        const account = currentAccounts.find(a => a.id === id);
        if (account) account.balance = newBalance;
        return Promise.resolve(undefined);
      });
      AccountsDB.deleteAccount.mockImplementation((id) => {
        currentAccounts = currentAccounts.filter(a => a.id !== id);
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start with 1 existing account
      expect(result.current.accounts).toHaveLength(1);

      // CREATE: Add first account
      await act(async () => {
        await result.current.addAccount({
          name: 'Savings Account',
          balance: '1000.00',
          currency: 'USD',
        });
      });

      expect(result.current.accounts).toHaveLength(2);
      expect(result.current.accounts[1].name).toBe('Savings Account');

      // CREATE: Add second account
      await act(async () => {
        await result.current.addAccount({
          name: 'Checking Account',
          balance: '500.00',
          currency: 'EUR',
        });
      });

      expect(result.current.accounts).toHaveLength(3);

      // READ: Verify accounts exist (skip initial account, test our new ones)
      expect(result.current.accounts[1].name).toBe('Savings Account');
      expect(result.current.accounts[2].name).toBe('Checking Account');

      // UPDATE: Modify Savings account (index 1)
      const savingsAccountId = result.current.accounts[1].id;
      await act(async () => {
        await result.current.updateAccount(savingsAccountId, {
          name: 'Updated Savings',
          balance: '1500.00',
        });
      });

      expect(result.current.accounts[1].name).toBe('Updated Savings');
      expect(result.current.accounts[1].balance).toBe('1500.00');

      // UPDATE: Modify Checking account (index 2)
      const checkingAccountId = result.current.accounts[2].id;
      await act(async () => {
        await result.current.updateAccount(checkingAccountId, {
          balance: '750.00',
        });
      });

      expect(result.current.accounts[2].balance).toBe('750.00');
      expect(result.current.accounts[2].name).toBe('Checking Account'); // Unchanged

      // DELETE: Remove Checking account
      await act(async () => {
        await result.current.deleteAccount(checkingAccountId);
      });

      expect(result.current.accounts).toHaveLength(2);

      // DELETE: Remove Savings account
      await act(async () => {
        await result.current.deleteAccount(savingsAccountId);
      });

      expect(result.current.accounts).toHaveLength(1); // Only initial account remains
    });

    it('maintains data integrity through multiple operations', async () => {
      // Start with one existing account to prevent default creation
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial Account', balance: '100', currency: 'USD' }
      ];
      let currentAccounts = [...initialAccounts];

      // Setup dynamic mock that tracks state
      AccountsDB.getAllAccounts.mockImplementation(() => Promise.resolve([...currentAccounts]));
      AccountsDB.createAccount.mockImplementation((account) => {
        currentAccounts.push(account);
        return Promise.resolve(undefined);
      });
      AccountsDB.updateAccount.mockImplementation((id, updates) => {
        const account = currentAccounts.find(a => a.id === id);
        if (account) Object.assign(account, updates);
        return Promise.resolve(undefined);
      });
      AccountsDB.adjustAccountBalance.mockImplementation((id, newBalance) => {
        const account = currentAccounts.find(a => a.id === id);
        if (account) account.balance = newBalance;
        return Promise.resolve(undefined);
      });
      AccountsDB.deleteAccount.mockImplementation((id) => {
        currentAccounts = currentAccounts.filter(a => a.id !== id);
        return Promise.resolve(undefined);
      });

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

      expect(result.current.accounts).toHaveLength(6); // 1 initial + 5 new

      // Update accounts 2 and 4 (indices 1 and 3, skipping initial at index 0)
      await act(async () => {
        await result.current.updateAccount(result.current.accounts[2].id, {
          balance: '999.99',
        });
        await result.current.updateAccount(result.current.accounts[4].id, {
          name: 'Special Account',
        });
      });

      expect(result.current.accounts[2].balance).toBe('999.99');
      expect(result.current.accounts[4].name).toBe('Special Account');

      // Delete accounts at indices 1, 3, and 5 (skip initial at index 0)
      const idsToDelete = [
        result.current.accounts[1].id,
        result.current.accounts[3].id,
        result.current.accounts[5].id,
      ];

      for (const id of idsToDelete) {
        await act(async () => {
          await result.current.deleteAccount(id);
        });
      }

      expect(result.current.accounts).toHaveLength(3); // 1 initial + 2 remaining
      // Find the updated accounts (not by index since they shifted)
      const updatedAccount = result.current.accounts.find(a => a.balance === '999.99');
      const specialAccount = result.current.accounts.find(a => a.name === 'Special Account');
      expect(updatedAccount).toBeDefined();
      expect(specialAccount).toBeDefined();
    });
  });

  describe('Validation and Error Handling', () => {
    it('validates account before operations', async () => {
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial Account', balance: '100', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

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
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial Account', balance: '100', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.accounts).toHaveLength(1);

      // Simulate create error
      AccountsDB.createAccount.mockRejectedValueOnce(new Error('Create failed'));

      let createError;
      try {
        await act(async () => {
          await result.current.addAccount({
            name: 'Test',
            balance: '100',
            currency: 'USD',
          });
        });
      } catch (err) {
        createError = err;
      }

      expect(createError).toBeDefined();
      expect(createError.message).toBe('Create failed');

      // Still only 1 account after failed create
      expect(result.current.accounts).toHaveLength(1);

      // Add a successful account
      AccountsDB.createAccount.mockResolvedValue(undefined);
      await act(async () => {
        await result.current.addAccount({
          name: 'Test Success',
          balance: '100',
          currency: 'USD',
        });
      });

      // Now we have 2 accounts
      expect(result.current.accounts).toHaveLength(2);
      const accountId = result.current.accounts[1].id;

      // Simulate update error
      AccountsDB.updateAccount.mockRejectedValueOnce(new Error('Update failed'));

      let updateError;
      try {
        await act(async () => {
          await result.current.updateAccount(accountId, { name: 'Updated' });
        });
      } catch (err) {
        updateError = err;
      }

      expect(updateError).toBeDefined();
      expect(updateError.message).toBe('Update failed');

      // Simulate delete error
      AccountsDB.deleteAccount.mockRejectedValueOnce(new Error('Delete failed'));

      let deleteError;
      try {
        await act(async () => {
          await result.current.deleteAccount(accountId);
        });
      } catch (err) {
        deleteError = err;
      }

      expect(deleteError).toBeDefined();
      expect(deleteError.message).toBe('Delete failed');

      // Account should still exist after failed delete (1 initial + 1 test account)
      expect(result.current.accounts).toHaveLength(2);
    });
  });

  describe('Concurrent Operations', () => {
    it('handles multiple concurrent account additions', async () => {
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial Account', balance: '100', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

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

      expect(result.current.accounts).toHaveLength(4); // 1 initial + 3 new
      const newAccounts = result.current.accounts.slice(1); // Skip initial account
      expect(newAccounts.map((a) => a.name)).toEqual([
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
      let currentAccounts = [...mockAccounts];

      // Setup dynamic mock that tracks state
      AccountsDB.getAllAccounts.mockImplementation(() => Promise.resolve([...currentAccounts]));
      AccountsDB.adjustAccountBalance.mockImplementation((id, newBalance) => {
        const account = currentAccounts.find(a => a.id === id);
        if (account) account.balance = newBalance;
        return Promise.resolve(undefined);
      });

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
      const updatedAccounts = [
        { id: '1', name: 'Account 1', balance: '150', currency: 'USD' },
        { id: '2', name: 'Account 2', balance: '200', currency: 'EUR' },
      ];

      AccountsDB.getAllAccounts
        .mockResolvedValueOnce(initialAccounts)
        .mockResolvedValueOnce(updatedAccounts);

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
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial', balance: '50', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

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

      expect(result.current.accounts).toHaveLength(4); // 1 initial + 3 new

      // Delete middle account (B at index 2)
      const bAccountId = result.current.accounts[2].id;
      await act(async () => {
        await result.current.deleteAccount(bAccountId);
      });

      expect(result.current.accounts).toHaveLength(3);
      expect(result.current.accounts[0].name).toBe('Initial');
      expect(result.current.accounts[1].name).toBe('A');
      expect(result.current.accounts[2].name).toBe('C');
    });

    it('preserves account IDs across updates', async () => {
      const initialAccounts = [
        { id: 'test-account', name: 'Test', balance: '100', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
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
      const initialAccounts = [
        { id: 'initial-1', name: 'Initial', balance: '50', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

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
      const initialAccounts = [
        { id: 'test-1', name: 'Test', balance: '100', currency: 'USD' }
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(initialAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Test with number input during add
      await act(async () => {
        await result.current.addAccount({ name: 'Test2', balance: 100, currency: 'USD' });
      });

      expect(typeof result.current.accounts[1].balance).toBe('string');

      // Test with number input during update
      await act(async () => {
        await result.current.updateAccount(result.current.accounts[0].id, { balance: 200 });
      });

      expect(typeof result.current.accounts[0].balance).toBe('string');
    });
  });
});
