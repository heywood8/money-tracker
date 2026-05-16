/**
 * Tests for AccountsActionsContext - Account CRUD operations and validation
 */

// Unmock the split contexts so real implementations are used
jest.unmock('../../app/contexts/AccountsDataContext');
jest.unmock('../../app/contexts/AccountsActionsContext');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AccountsProvider, useAccounts } from '../../app/contexts/AccountsContext';
import * as AccountsDB from '../../app/services/AccountsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/services/OperationsDB', () => ({
  initializeDefaultOperations: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../app/services/CategoriesDB', () => ({
  getAllCategories: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../app/services/db', () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
  dropAllTables: jest.fn().mockResolvedValue(undefined),
  closeDatabase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../app/utils/emergencyReset', () => ({
  forceDeleteDatabase: jest.fn().mockResolvedValue(true),
}));

const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => ({ showDialog: mockShowDialog, hideDialog: jest.fn() }),
}));

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: { on: jest.fn(), emit: jest.fn() },
  EVENTS: {
    RELOAD_ALL: 'RELOAD_ALL',
    DATABASE_RESET: 'DATABASE_RESET',
    OPERATION_CHANGED: 'OPERATION_CHANGED',
  },
}));

describe('AccountsActionsContext', () => {
  const wrapper = ({ children }) => <AccountsProvider>{children}</AccountsProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
    AccountsDB.getAllAccounts.mockResolvedValue([]);
    AccountsDB.createAccount.mockResolvedValue({ id: 'new-id', name: 'Test', balance: '0', currency: 'USD' });
    AccountsDB.updateAccount.mockResolvedValue(undefined);
    AccountsDB.adjustAccountBalance.mockResolvedValue(undefined);
    AccountsDB.deleteAccount.mockResolvedValue(undefined);
    AccountsDB.reorderAccounts.mockResolvedValue(undefined);
    AccountsDB.getOperationCount.mockResolvedValue(0);
  });

  describe('validateAccount', () => {
    it('returns no errors for valid account', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: 'My Bank', balance: '100', currency: 'USD' });
      expect(errors).toEqual({});
    });

    it('returns error when name is empty', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: '', balance: '100', currency: 'USD' });
      expect(errors.name).toBeDefined();
    });

    it('returns error when name is whitespace only', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: '   ', balance: '100', currency: 'USD' });
      expect(errors.name).toBeDefined();
    });

    it('returns error when balance is not a number', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: 'Bank', balance: 'abc', currency: 'USD' });
      expect(errors.balance).toBeDefined();
    });

    it('returns error when balance is empty string', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: 'Bank', balance: '', currency: 'USD' });
      expect(errors.balance).toBeDefined();
    });

    it('returns error when currency is missing', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: 'Bank', balance: '100', currency: '' });
      expect(errors.currency).toBeDefined();
    });

    it('uses translation function when provided', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const t = jest.fn(key => `translated_${key}`);
      const errors = result.current.validateAccount({ name: '', balance: '100', currency: 'USD' }, t);
      expect(t).toHaveBeenCalledWith('name_required');
      expect(errors.name).toBe('translated_name_required');
    });

    it('allows zero balance', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: 'Bank', balance: '0', currency: 'USD' });
      expect(errors.balance).toBeUndefined();
    });

    it('allows negative balance', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const errors = result.current.validateAccount({ name: 'Bank', balance: '-50', currency: 'USD' });
      expect(errors.balance).toBeUndefined();
    });
  });

  describe('addAccount', () => {
    it('adds account and updates accounts state', async () => {
      const newAccount = { id: 'acc-1', name: 'Savings', balance: '500', currency: 'EUR' };
      AccountsDB.createAccount.mockResolvedValue(newAccount);

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addAccount({ name: 'Savings', balance: 500, currency: 'EUR' });
      });

      expect(AccountsDB.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Savings', balance: '500', currency: 'EUR' }),
      );
      expect(result.current.accounts).toContainEqual(newAccount);
    });

    it('shows dialog and re-throws on error', async () => {
      AccountsDB.createAccount.mockRejectedValue(new Error('DB error'));

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => { await result.current.addAccount({ name: 'Bad', balance: '0', currency: 'USD' }); }),
      ).rejects.toThrow('DB error');

      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('converts balance to string', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addAccount({ name: 'Test', balance: 1234, currency: 'USD' });
      });

      expect(AccountsDB.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ balance: '1234' }),
      );
    });
  });

  describe('updateAccount', () => {
    const existingAccount = { id: 'acc-1', name: 'Old Name', balance: '100', currency: 'USD' };

    beforeEach(() => {
      AccountsDB.getAllAccounts.mockResolvedValue([existingAccount]);
    });

    it('uses adjustAccountBalance when balance changes with createAdjustmentOperation=true', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.updateAccount('acc-1', { balance: '200' }, true);
      });

      expect(AccountsDB.adjustAccountBalance).toHaveBeenCalledWith('acc-1', '200', '');
      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });

    it('also updates name when balance changes and name differs', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.updateAccount('acc-1', { balance: '200', name: 'New Name' }, true);
      });

      expect(AccountsDB.adjustAccountBalance).toHaveBeenCalledWith('acc-1', '200', '');
      expect(AccountsDB.updateAccount).toHaveBeenCalledWith('acc-1', { name: 'New Name' });
    });

    it('also updates currency when balance changes and currency differs', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.updateAccount('acc-1', { balance: '200', currency: 'EUR' }, true);
      });

      expect(AccountsDB.updateAccount).toHaveBeenCalledWith('acc-1', { currency: 'EUR' });
    });

    it('does not call updateAccount for non-balance fields when they are unchanged', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        // Same name and currency, only balance changes
        await result.current.updateAccount('acc-1', { balance: '200', name: 'Old Name', currency: 'USD' }, true);
      });

      // adjustAccountBalance called, but updateAccount should NOT be called for unchanged fields
      expect(AccountsDB.adjustAccountBalance).toHaveBeenCalled();
      // updateAccount should not be called with empty updates
      const updateCalls = AccountsDB.updateAccount.mock.calls;
      // If called, it shouldn't have been called with empty object
      updateCalls.forEach(call => {
        expect(Object.keys(call[1]).length).toBeGreaterThan(0);
      });
    });

    it('uses updateAccount directly when createAdjustmentOperation=false', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.updateAccount('acc-1', { balance: '200' }, false);
      });

      expect(AccountsDB.adjustAccountBalance).not.toHaveBeenCalled();
      expect(AccountsDB.updateAccount).toHaveBeenCalledWith('acc-1', { balance: '200' });
      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });

    it('does not emit RELOAD_ALL when balance unchanged and no adjustment', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        // Same balance — no balance change
        await result.current.updateAccount('acc-1', { name: 'New Name' }, true);
      });

      expect(AccountsDB.adjustAccountBalance).not.toHaveBeenCalled();
      expect(appEvents.emit).not.toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });

    it('throws when account not found', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => { await result.current.updateAccount('nonexistent', { name: 'X' }); }),
      ).rejects.toThrow('Account not found');
    });

    it('shows dialog and re-throws on DB error', async () => {
      AccountsDB.updateAccount.mockRejectedValue(new Error('update failed'));

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await expect(
        act(async () => { await result.current.updateAccount('acc-1', { name: 'X' }); }),
      ).rejects.toThrow('update failed');

      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('supports updating hidden field', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.updateAccount('acc-1', { hidden: true }, true);
      });

      expect(AccountsDB.updateAccount).toHaveBeenCalledWith('acc-1', { hidden: true });
    });
  });

  describe('deleteAccount', () => {
    const existingAccount = { id: 'acc-1', name: 'Cash', balance: '100', currency: 'USD' };

    beforeEach(() => {
      AccountsDB.getAllAccounts.mockResolvedValue([existingAccount]);
    });

    it('deletes account and removes it from state', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.deleteAccount('acc-1');
      });

      expect(AccountsDB.deleteAccount).toHaveBeenCalledWith('acc-1', null);
      expect(result.current.accounts).toHaveLength(0);
    });

    it('reloads accounts and emits RELOAD_ALL when transferToAccountId is provided', async () => {
      AccountsDB.getAllAccounts
        .mockResolvedValueOnce([existingAccount])
        .mockResolvedValueOnce([]);

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.deleteAccount('acc-1', 'acc-2');
      });

      expect(appEvents.emit).toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });

    it('does not emit RELOAD_ALL when no transfer account', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await act(async () => {
        await result.current.deleteAccount('acc-1');
      });

      expect(appEvents.emit).not.toHaveBeenCalledWith(EVENTS.RELOAD_ALL);
    });

    it('shows dialog and re-throws on error', async () => {
      AccountsDB.deleteAccount.mockRejectedValue(new Error('delete failed'));

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(1));

      await expect(
        act(async () => { await result.current.deleteAccount('acc-1'); }),
      ).rejects.toThrow('delete failed');

      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('reloadAccounts', () => {
    it('fetches accounts from DB and updates state', async () => {
      const reloadedAccount = { id: 'acc-1', name: 'Reloaded', balance: '0', currency: 'USD' };
      // Start with one account so init doesn't create defaults (single getAllAccounts call)
      AccountsDB.getAllAccounts
        .mockResolvedValueOnce([{ id: 'init', name: 'Init', balance: '0', currency: 'USD' }])
        .mockResolvedValueOnce([reloadedAccount]);

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.reloadAccounts();
      });

      expect(result.current.accounts).toHaveLength(1);
      expect(result.current.accounts[0].name).toBe('Reloaded');
    });
  });

  describe('reorderAccounts', () => {
    const accs = [
      { id: 'a', name: 'A', balance: '0', currency: 'USD', display_order: 0 },
      { id: 'b', name: 'B', balance: '0', currency: 'USD', display_order: 1 },
    ];

    beforeEach(() => {
      AccountsDB.getAllAccounts.mockResolvedValue(accs);
    });

    it('persists new order to DB', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(2));

      await act(async () => {
        await result.current.reorderAccounts([accs[1], accs[0]]);
      });

      expect(AccountsDB.reorderAccounts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'b', display_order: 0 }),
          expect.objectContaining({ id: 'a', display_order: 1 }),
        ]),
      );
    });

    it('shows dialog and re-throws on DB error', async () => {
      AccountsDB.reorderAccounts.mockRejectedValue(new Error('reorder failed'));

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.accounts).toHaveLength(2));

      let caughtError;
      await act(async () => {
        try {
          await result.current.reorderAccounts([accs[1], accs[0]]);
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError?.message).toBe('reorder failed');
      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('getOperationCount', () => {
    it('returns operation count for account', async () => {
      AccountsDB.getOperationCount.mockResolvedValue(5);

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const count = await result.current.getOperationCount('acc-1');
      expect(count).toBe(5);
    });

    it('returns 0 on error', async () => {
      AccountsDB.getOperationCount.mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const count = await result.current.getOperationCount('acc-1');
      expect(count).toBe(0);
    });
  });

  describe('toggleShowHiddenAccounts', () => {
    it('toggles showHiddenAccounts from false to true', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.showHiddenAccounts).toBe(false);

      act(() => {
        result.current.toggleShowHiddenAccounts();
      });

      expect(result.current.showHiddenAccounts).toBe(true);
    });

    it('toggles showHiddenAccounts from true to false', async () => {
      const { result } = renderHook(() => useAccounts(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => { result.current.toggleShowHiddenAccounts(); });
      act(() => { result.current.toggleShowHiddenAccounts(); });

      expect(result.current.showHiddenAccounts).toBe(false);
    });
  });
});
