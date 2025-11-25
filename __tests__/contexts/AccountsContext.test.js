/**
 * Tests for AccountsContext - State management for accounts
 * These tests ensure the context provides correct state and operations
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

// Mock uuid to return predictable IDs
let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++mockUuidCounter}`),
}));

describe('AccountsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUuidCounter = 0;
    // Default mock implementations
    isMigrationComplete.mockResolvedValue(true);
    AccountsDB.getAllAccounts.mockResolvedValue([]);
    AccountsDB.createAccount.mockResolvedValue(undefined);
    AccountsDB.adjustAccountBalance.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => <AccountsProvider>{children}</AccountsProvider>;

  describe('Initialization', () => {
    it('provides accounts context with initial values', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
        { id: '2', name: 'Account 2', balance: '200', currency: 'EUR' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.accounts).toEqual(mockAccounts);
      expect(result.current.error).toBeNull();
    });

    it('performs migration on first load if needed', async () => {
      isMigrationComplete.mockResolvedValue(false);
      performMigration.mockResolvedValue(undefined);
      AccountsDB.getAllAccounts.mockResolvedValue([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(performMigration).toHaveBeenCalled();
    });

    it('creates default accounts when none exist', async () => {
      AccountsDB.getAllAccounts.mockResolvedValueOnce([]);
      AccountsDB.createAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(AccountsDB.createAccount).toHaveBeenCalledTimes(2);
      expect(result.current.accounts).toHaveLength(2);
    });

    it('shows alert on load error', async () => {
      const error = new Error('Load failed');
      AccountsDB.getAllAccounts.mockRejectedValue(error);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Load failed');
      expect(Alert.alert).toHaveBeenCalledWith(
        'Load Error',
        'Failed to load accounts from database.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('addAccount', () => {
    it('adds a new account successfully', async () => {
      const mockAccounts = [{ id: 'existing-1', name: 'Existing', balance: '50', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);
      AccountsDB.createAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialLength = result.current.accounts.length;
      const newAccount = { name: 'New Account', balance: '100', currency: 'USD' };

      await act(async () => {
        await result.current.addAccount(newAccount);
      });

      expect(AccountsDB.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Account',
          balance: '100',
          currency: 'USD',
          id: expect.any(String),
        })
      );
      expect(result.current.accounts).toHaveLength(initialLength + 1);
    });

    it('converts balance to string when adding account', async () => {
      const mockAccounts = [{ id: 'existing-1', name: 'Existing', balance: '50', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);
      AccountsDB.createAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newAccount = { name: 'Test', balance: 100, currency: 'USD' };

      await act(async () => {
        await result.current.addAccount(newAccount);
      });

      expect(AccountsDB.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ balance: '100' })
      );
    });

    it('shows alert and throws error on add failure', async () => {
      const mockAccounts = [{ id: 'existing-1', name: 'Existing', balance: '50', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);
      const error = new Error('Add failed');
      AccountsDB.createAccount.mockRejectedValue(error);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newAccount = { name: 'Test', balance: '100', currency: 'USD' };

      await expect(act(async () => {
        await result.current.addAccount(newAccount);
      })).rejects.toThrow('Add failed');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to create account. Please try again.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('updateAccount', () => {
    it('updates an existing account successfully', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
      ];
      const updatedMockAccounts = [
        { id: '1', name: 'Updated Account', balance: '200', currency: 'USD' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValueOnce(mockAccounts).mockResolvedValueOnce(updatedMockAccounts);
      AccountsDB.updateAccount.mockResolvedValue(undefined);
      AccountsDB.adjustAccountBalance.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updates = { name: 'Updated Account', balance: '200' };

      await act(async () => {
        await result.current.updateAccount('1', updates);
      });

      // Should call adjustAccountBalance for balance change
      expect(AccountsDB.adjustAccountBalance).toHaveBeenCalledWith('1', '200', '');
      // Should call updateAccount for name change only
      expect(AccountsDB.updateAccount).toHaveBeenCalledWith('1', {
        name: 'Updated Account',
      });
      expect(result.current.accounts[0]).toMatchObject(updates);
    });

    it('converts balance to string when updating account', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
      ];
      const updatedMockAccounts = [
        { id: '1', name: 'Account 1', balance: '150', currency: 'USD' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValueOnce(mockAccounts).mockResolvedValueOnce(updatedMockAccounts);
      AccountsDB.adjustAccountBalance.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.updateAccount('1', { balance: 150 });
      });

      // Should call adjustAccountBalance with converted string balance
      expect(AccountsDB.adjustAccountBalance).toHaveBeenCalledWith('1', '150', '');
      // Should NOT call updateAccount since only balance changed
      expect(AccountsDB.updateAccount).not.toHaveBeenCalled();
    });

    it('shows alert and throws error on update failure', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);
      const error = new Error('Update failed');
      AccountsDB.updateAccount.mockRejectedValue(error);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(act(async () => {
        await result.current.updateAccount('1', { name: 'New Name' });
      })).rejects.toThrow('Update failed');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to update account. Please try again.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('deleteAccount', () => {
    it('deletes an account successfully', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
        { id: '2', name: 'Account 2', balance: '200', currency: 'EUR' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);
      AccountsDB.deleteAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteAccount('1');
      });

      expect(AccountsDB.deleteAccount).toHaveBeenCalledWith('1');
      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].id).toBe('2');
    });

    it('shows alert and throws error on delete failure', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
      ];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);
      const error = new Error('Delete failed');
      AccountsDB.deleteAccount.mockRejectedValue(error);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(act(async () => {
        await result.current.deleteAccount('1');
      })).rejects.toThrow('Delete failed');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to delete account. Please try again.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('reloadAccounts', () => {
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
    });

    it('handles reload errors gracefully', async () => {
      const mockAccounts = [{ id: '1', name: 'Account 1', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts
        .mockResolvedValueOnce(mockAccounts)
        .mockRejectedValueOnce(new Error('Reload failed'));

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const accountsBeforeReload = result.current.accounts;

      await act(async () => {
        await result.current.reloadAccounts();
      });

      // Should not throw, just log error, accounts remain unchanged
      expect(result.current.accounts).toEqual(accountsBeforeReload);
    });
  });

  describe('validateAccount', () => {
    it('validates account with all required fields', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const validAccount = { name: 'Test', balance: '100', currency: 'USD' };
      const errors = result.current.validateAccount(validAccount);

      expect(errors).toEqual({});
    });

    it('returns error when name is empty', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidAccount = { name: '   ', balance: '100', currency: 'USD' };
      const errors = result.current.validateAccount(invalidAccount);

      expect(errors.name).toBe('Name required');
    });

    it('returns error when balance is not a number', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidAccount = { name: 'Test', balance: 'invalid', currency: 'USD' };
      const errors = result.current.validateAccount(invalidAccount);

      expect(errors.balance).toBe('Balance must be a number');
    });

    it('returns error when balance is empty string', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidAccount = { name: 'Test', balance: '', currency: 'USD' };
      const errors = result.current.validateAccount(invalidAccount);

      expect(errors.balance).toBe('Balance must be a number');
    });

    it('returns error when currency is missing', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidAccount = { name: 'Test', balance: '100', currency: '' };
      const errors = result.current.validateAccount(invalidAccount);

      expect(errors.currency).toBe('Currency required');
    });

    it('returns multiple errors when multiple fields are invalid', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const invalidAccount = { name: '', balance: 'invalid', currency: '' };
      const errors = result.current.validateAccount(invalidAccount);

      expect(errors).toHaveProperty('name');
      expect(errors).toHaveProperty('balance');
      expect(errors).toHaveProperty('currency');
    });
  });

  describe('currencies', () => {
    it('provides currencies object', async () => {
      const mockAccounts = [{ id: '1', name: 'Test', balance: '100', currency: 'USD' }];
      AccountsDB.getAllAccounts.mockResolvedValue(mockAccounts);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.currencies).toBeDefined();
      expect(typeof result.current.currencies).toBe('object');
      expect(result.current.currencies.USD).toBeDefined();
    });
  });

  // Regression tests
  describe('Regression Tests', () => {
    it('maintains state consistency after multiple operations', async () => {
      const mockAccounts = [{ id: 'existing-1', name: 'Existing', balance: '50', currency: 'USD' }];
      let currentMockAccounts = [...mockAccounts];

      AccountsDB.getAllAccounts.mockImplementation(() => Promise.resolve([...currentMockAccounts]));
      AccountsDB.createAccount.mockImplementation((account) => {
        currentMockAccounts.push(account);
        return Promise.resolve(undefined);
      });
      AccountsDB.updateAccount.mockResolvedValue(undefined);
      AccountsDB.adjustAccountBalance.mockImplementation((id, newBalance) => {
        const account = currentMockAccounts.find(a => a.id === id);
        if (account) account.balance = newBalance;
        return Promise.resolve(undefined);
      });
      AccountsDB.deleteAccount.mockImplementation((id) => {
        currentMockAccounts = currentMockAccounts.filter(a => a.id !== id);
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start with existing account
      expect(result.current.accounts).toHaveLength(1);

      // Add account
      await act(async () => {
        await result.current.addAccount({ name: 'Test1', balance: '100', currency: 'USD' });
      });
      expect(result.current.accounts).toHaveLength(2);

      // Add another account
      await act(async () => {
        await result.current.addAccount({ name: 'Test2', balance: '200', currency: 'EUR' });
      });
      expect(result.current.accounts).toHaveLength(3);

      // Update second account (index 1, the first one we added)
      const secondAccountId = result.current.accounts[1].id;
      await act(async () => {
        await result.current.updateAccount(secondAccountId, { balance: '150' });
      });
      expect(result.current.accounts[1].balance).toBe('150');

      // Delete third account (index 2)
      const thirdAccountId = result.current.accounts[2].id;
      await act(async () => {
        await result.current.deleteAccount(thirdAccountId);
      });
      expect(result.current.accounts).toHaveLength(2);
    });

    it('preserves immutability of accounts array', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1', balance: '100', currency: 'USD' },
      ];
      const updatedMockAccounts = [
        { id: '1', name: 'Updated', balance: '100', currency: 'USD' },
      ];
      AccountsDB.getAllAccounts
        .mockResolvedValueOnce(mockAccounts)
        .mockResolvedValueOnce(updatedMockAccounts);
      AccountsDB.updateAccount.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAccounts(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialAccounts = result.current.accounts;
      const initialFirstAccount = result.current.accounts[0];

      await act(async () => {
        await result.current.updateAccount('1', { name: 'Updated' });
      });

      // Should be a new array reference
      expect(result.current.accounts).not.toBe(initialAccounts);
      // First account should be a new object reference
      expect(result.current.accounts[0]).not.toBe(initialFirstAccount);
      // But should contain updated data
      expect(result.current.accounts[0].name).toBe('Updated');
    });
  });
});
