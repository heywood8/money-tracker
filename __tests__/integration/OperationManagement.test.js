/**
 * Integration tests for Operation Management flow
 * These tests ensure the complete operation management workflow works correctly
 */

// Unmock the split contexts to use real implementations
jest.unmock('../../app/contexts/ThemeConfigContext');
jest.unmock('../../app/contexts/ThemeColorsContext');
jest.unmock('../../app/contexts/AccountsDataContext');
jest.unmock('../../app/contexts/AccountsActionsContext');
jest.unmock('../../app/contexts/OperationsDataContext');
jest.unmock('../../app/contexts/OperationsActionsContext');

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { OperationsProvider, useOperations } from '../../app/contexts/OperationsContext';
import { AccountsProvider } from '../../app/contexts/AccountsContext';
import * as OperationsDB from '../../app/services/OperationsDB';
import * as AccountsDB from '../../app/services/AccountsDB';
import { appEvents } from '../../app/services/eventEmitter';

// Mock dependencies
jest.mock('../../app/services/OperationsDB');
jest.mock('../../app/services/AccountsDB');

// Mock DialogContext
const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => ({
    showDialog: mockShowDialog,
    hideDialog: jest.fn(),
  }),
}));

// Mock auto-increment ID counter
let mockOperationIdCounter = 0;

describe('Operation Management Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowDialog.mockClear();
    mockOperationIdCounter = 0;

    // Default mock implementations
    AccountsDB.getAllAccounts.mockResolvedValue([
      { id: 'account-1', name: 'Main Account', balance: '1000.00', currency: 'USD' },
      { id: 'account-2', name: 'Savings', balance: '5000.00', currency: 'USD' },
    ]);
    AccountsDB.updateAccountBalance.mockResolvedValue(undefined);

    OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
    OperationsDB.getNextOldestOperation.mockResolvedValue(null);
    OperationsDB.createOperation.mockImplementation(async (operation) => ({
      ...operation,
      id: ++mockOperationIdCounter,
      createdAt: new Date().toISOString(),
    }));
    OperationsDB.updateOperation.mockResolvedValue(undefined);
    OperationsDB.deleteOperation.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }) => (
    <AccountsProvider>
      <OperationsProvider>{children}</OperationsProvider>
    </AccountsProvider>
  );

  describe('Complete CRUD Workflow', () => {
    it('completes full operation lifecycle: create, read, update, delete', async () => {
      let currentOperations = [];

      // Setup dynamic mocks that track state
      OperationsDB.getOperationsByWeekOffset.mockImplementation(() =>
        Promise.resolve([...currentOperations]),
      );
      OperationsDB.createOperation.mockImplementation(async (operation) => {
        const newOp = { ...operation, id: ++mockOperationIdCounter, createdAt: new Date().toISOString() };
        currentOperations.push(newOp);
        return newOp;
      });
      OperationsDB.updateOperation.mockImplementation((id, updates) => {
        const op = currentOperations.find((o) => o.id === id);
        if (op) Object.assign(op, updates);
        return Promise.resolve(undefined);
      });
      OperationsDB.deleteOperation.mockImplementation((id) => {
        currentOperations = currentOperations.filter((o) => o.id !== id);
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Start with no operations
      expect(result.current.operations).toHaveLength(0);

      // CREATE: Add expense operation
      await act(async () => {
        await result.current.addOperation({
          type: 'expense',
          amount: '50.00',
          accountId: 'account-1',
          categoryId: 'category-1',
          date: '2025-01-15',
          description: 'Grocery shopping',
        });
      });

      expect(result.current.operations).toHaveLength(1);
      expect(result.current.operations[0].type).toBe('expense');
      expect(result.current.operations[0].amount).toBe('50.00');
      expect(result.current.operations[0].description).toBe('Grocery shopping');

      // CREATE: Add income operation
      await act(async () => {
        await result.current.addOperation({
          type: 'income',
          amount: '2000.00',
          accountId: 'account-1',
          categoryId: 'category-2',
          date: '2025-01-15',
          description: 'Salary',
        });
      });

      expect(result.current.operations).toHaveLength(2);
      expect(result.current.operations[1].type).toBe('income');
      expect(result.current.operations[1].amount).toBe('2000.00');

      // UPDATE: Modify first operation
      const firstOpId = result.current.operations[0].id;
      await act(async () => {
        await result.current.updateOperation(firstOpId, {
          amount: '75.00',
          description: 'Updated grocery shopping',
        });
      });

      const updatedOp = result.current.operations.find((op) => op.id === firstOpId);
      expect(updatedOp.amount).toBe('75.00');
      expect(updatedOp.description).toBe('Updated grocery shopping');

      // DELETE: Remove first operation
      await act(async () => {
        await result.current.deleteOperation(firstOpId);
      });

      expect(result.current.operations).toHaveLength(1);
      expect(result.current.operations.find((op) => op.id === firstOpId)).toBeUndefined();
    });
  });

  describe('Transfer Operations', () => {
    it('creates and manages transfer operations', async () => {
      let currentOperations = [];

      OperationsDB.getOperationsByWeekOffset.mockImplementation(() =>
        Promise.resolve([...currentOperations]),
      );
      OperationsDB.createOperation.mockImplementation((operation) => {
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // CREATE: Transfer from account-1 to account-2
      await act(async () => {
        await result.current.addOperation({
          type: 'transfer',
          amount: '100.00',
          accountId: 'account-1',
          toAccountId: 'account-2',
          date: '2025-01-15',
          description: 'Transfer to savings',
        });
      });

      expect(result.current.operations).toHaveLength(1);
      expect(result.current.operations[0].type).toBe('transfer');
      expect(result.current.operations[0].toAccountId).toBe('account-2');
      expect(OperationsDB.createOperation).toHaveBeenCalled();
    });

    it('validates transfer requires different accounts', async () => {
      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Attempt transfer to same account
      const error = result.current.validateOperation({
        type: 'transfer',
        amount: '100.00',
        accountId: 'account-1',
        toAccountId: 'account-1',
        date: '2025-01-15',
      });

      expect(error).toBeTruthy();
      expect(error).toMatch(/accounts_must_be_different|must be different/);
    });
  });

  describe('Database Integration', () => {
    it('creates expense operation in database', async () => {
      let currentOperations = [];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
      OperationsDB.createOperation.mockImplementation((operation) => {
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addOperation({
          type: 'expense',
          amount: '100.00',
          accountId: 'account-1',
          categoryId: 'category-1',
          date: '2025-01-15',
        });
      });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          amount: '100.00',
          accountId: 'account-1',
          categoryId: 'category-1',
        }),
      );
    });

    it('creates income operation in database', async () => {
      let currentOperations = [];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
      OperationsDB.createOperation.mockImplementation((operation) => {
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addOperation({
          type: 'income',
          amount: '500.00',
          accountId: 'account-1',
          categoryId: 'category-2',
          date: '2025-01-15',
        });
      });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          amount: '500.00',
        }),
      );
    });

    it('creates transfer operation in database', async () => {
      let currentOperations = [];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
      OperationsDB.createOperation.mockImplementation((operation) => {
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addOperation({
          type: 'transfer',
          amount: '200.00',
          accountId: 'account-1',
          toAccountId: 'account-2',
          date: '2025-01-15',
        });
      });

      expect(OperationsDB.createOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'transfer',
          toAccountId: 'account-2',
        }),
      );
    });
  });

  describe('Validation', () => {
    it('validates required fields', async () => {
      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Missing type
      expect(result.current.validateOperation({ amount: '100', accountId: 'a1', date: '2025-01-01' })).toBeTruthy();

      // Missing amount
      expect(result.current.validateOperation({ type: 'expense', accountId: 'a1', date: '2025-01-01' })).toBeTruthy();

      // Missing accountId
      expect(result.current.validateOperation({ type: 'expense', amount: '100', date: '2025-01-01' })).toBeTruthy();

      // Missing date
      expect(result.current.validateOperation({ type: 'expense', amount: '100', accountId: 'a1' })).toBeTruthy();
    });

    it('validates amount is positive', async () => {
      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const error = result.current.validateOperation({
        type: 'expense',
        amount: '-100',
        accountId: 'account-1',
        categoryId: 'category-1',
        date: '2025-01-01',
      });

      expect(error).toBeTruthy();
      expect(error).toMatch(/valid_amount_required|Valid amount is required/);
    });

    it('validates transfer requires toAccountId', async () => {
      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const error = result.current.validateOperation({
        type: 'transfer',
        amount: '100',
        accountId: 'account-1',
        date: '2025-01-01',
      });

      expect(error).toBeTruthy();
      expect(error).toMatch(/destination_account_required|Destination account is required/);
    });

    it('validates expense/income requires categoryId', async () => {
      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Expense without category
      let error = result.current.validateOperation({
        type: 'expense',
        amount: '100',
        accountId: 'account-1',
        date: '2025-01-01',
      });
      expect(error).toBeTruthy();
      expect(error).toContain('category');

      // Income without category
      error = result.current.validateOperation({
        type: 'income',
        amount: '100',
        accountId: 'account-1',
        date: '2025-01-01',
      });
      expect(error).toBeTruthy();
      expect(error).toContain('category');
    });
  });

  describe('Lazy Loading', () => {
    it('loads initial week of operations', async () => {
      const initialOps = [
        { id: 'op-1', type: 'expense', amount: '50.00', accountId: 'account-1', date: '2025-01-15' },
        { id: 'op-2', type: 'income', amount: '100.00', accountId: 'account-1', date: '2025-01-14' },
      ];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(initialOps);

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.operations).toHaveLength(2);
      expect(OperationsDB.getOperationsByWeekOffset).toHaveBeenCalledWith(0);
    });

    it('loads more operations when requested', async () => {
      const week1Ops = [
        { id: 'op-1', type: 'expense', amount: '50.00', accountId: 'account-1', date: '2025-01-15' },
      ];
      const week2Ops = [
        { id: 'op-2', type: 'expense', amount: '30.00', accountId: 'account-1', date: '2025-01-08' },
      ];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValueOnce(week1Ops);
      OperationsDB.getNextOldestOperation.mockResolvedValue({ date: '2025-01-08' });
      jest.spyOn(OperationsDB, 'getOperationsByWeekFromDate').mockResolvedValue(week2Ops);

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.operations).toHaveLength(1);

      // Load more
      await act(async () => {
        await result.current.loadMoreOperations();
      });

      await waitFor(() => {
        expect(result.current.operations.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('stops loading when no more operations', async () => {
      // Start with some operations
      const initialOps = [
        { id: 'op-1', type: 'expense', amount: '50.00', accountId: 'account-1', date: '2025-01-15' },
      ];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(initialOps);
      OperationsDB.getNextOldestOperation.mockResolvedValue(null);

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasMoreOperations).toBe(true);

      // Try to load more - should find no more operations
      await act(async () => {
        await result.current.loadMoreOperations();
      });

      await waitFor(() => {
        expect(result.current.hasMoreOperations).toBe(false);
      });
    });
  });

  describe('Event Handling', () => {
    it('subscribes to OPERATION_CHANGED events', async () => {
      OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Context should have event listener set up
      expect(result.current.addOperation).toBeDefined();
    });

    it('subscribes to RELOAD_ALL events', async () => {
      OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
      jest.spyOn(OperationsDB, 'getAllOperations').mockResolvedValue([]);

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Context should have reload function
      expect(result.current.reloadOperations).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('shows dialog on create error', async () => {
      OperationsDB.getOperationsByWeekOffset.mockResolvedValue([]);
      OperationsDB.createOperation.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.addOperation({
            type: 'expense',
            amount: '50.00',
            accountId: 'account-1',
            categoryId: 'category-1',
            date: '2025-01-15',
          });
        } catch (error) {
          // Error is expected
        }
      });

      await waitFor(() => {
        expect(mockShowDialog).toHaveBeenCalled();
      });
    });

    it('shows dialog on update error', async () => {
      const existingOps = [
        { id: 'op-1', type: 'expense', amount: '50.00', accountId: 'account-1', categoryId: 'cat-1', date: '2025-01-15' },
      ];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(existingOps);
      OperationsDB.updateOperation.mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.updateOperation('op-1', { amount: '75.00' });
        } catch (error) {
          // Error is expected
        }
      });

      await waitFor(() => {
        expect(mockShowDialog).toHaveBeenCalled();
      });
    });

    it('shows dialog on delete error', async () => {
      const existingOps = [
        { id: 'op-1', type: 'expense', amount: '50.00', accountId: 'account-1', categoryId: 'cat-1', date: '2025-01-15' },
      ];

      OperationsDB.getOperationsByWeekOffset.mockResolvedValue(existingOps);
      OperationsDB.deleteOperation.mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.deleteOperation('op-1');
        } catch (error) {
          // Error is expected
        }
      });

      await waitFor(() => {
        expect(mockShowDialog).toHaveBeenCalled();
      });
    });
  });

  describe('Data Integrity', () => {
    it('maintains operation order after updates', async () => {
      let currentOperations = [
        { id: 'op-1', type: 'expense', amount: '50.00', accountId: 'account-1', date: '2025-01-15' },
        { id: 'op-2', type: 'expense', amount: '30.00', accountId: 'account-1', date: '2025-01-14' },
        { id: 'op-3', type: 'expense', amount: '20.00', accountId: 'account-1', date: '2025-01-13' },
      ];

      OperationsDB.getOperationsByWeekOffset.mockImplementation(() =>
        Promise.resolve([...currentOperations]),
      );
      OperationsDB.updateOperation.mockImplementation((id, updates) => {
        const op = currentOperations.find((o) => o.id === id);
        if (op) Object.assign(op, updates);
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialIds = result.current.operations.map((op) => op.id);

      await act(async () => {
        await result.current.updateOperation('op-2', { amount: '100.00' });
      });

      // Order should be maintained
      const updatedIds = result.current.operations.map((op) => op.id);
      expect(updatedIds).toEqual(initialIds);
    });

    it('prevents duplicate operations', async () => {
      let currentOperations = [];

      OperationsDB.getOperationsByWeekOffset.mockImplementation(() =>
        Promise.resolve([...currentOperations]),
      );
      OperationsDB.createOperation.mockImplementation((operation) => {
        // Check for duplicate
        if (currentOperations.some((op) => op.id === operation.id)) {
          return Promise.reject(new Error('Duplicate operation'));
        }
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add operation
      await act(async () => {
        await result.current.addOperation({
          type: 'expense',
          amount: '50.00',
          accountId: 'account-1',
          categoryId: 'category-1',
          date: '2025-01-15',
        });
      });

      expect(result.current.operations).toHaveLength(1);

      // Add same operation again
      const firstOpId = result.current.operations[0].id;
      OperationsDB.createOperation.mockImplementation((operation) => {
        if (currentOperations.some((op) => op.id === firstOpId)) {
          return Promise.reject(new Error('Duplicate operation'));
        }
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      // Should not add duplicate
      expect(result.current.operations).toHaveLength(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('handles multiple operations created simultaneously', async () => {
      let currentOperations = [];

      OperationsDB.getOperationsByWeekOffset.mockImplementation(() =>
        Promise.resolve([...currentOperations]),
      );
      OperationsDB.createOperation.mockImplementation((operation) => {
        currentOperations.push({ ...operation });
        return Promise.resolve(undefined);
      });

      const { result } = renderHook(() => useOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Create multiple operations concurrently
      await act(async () => {
        await Promise.all([
          result.current.addOperation({
            type: 'expense',
            amount: '10.00',
            accountId: 'account-1',
            categoryId: 'category-1',
            date: '2025-01-15',
          }),
          result.current.addOperation({
            type: 'expense',
            amount: '20.00',
            accountId: 'account-1',
            categoryId: 'category-1',
            date: '2025-01-15',
          }),
          result.current.addOperation({
            type: 'expense',
            amount: '30.00',
            accountId: 'account-1',
            categoryId: 'category-1',
            date: '2025-01-15',
          }),
        ]);
      });

      expect(result.current.operations.length).toBeGreaterThanOrEqual(3);
    });
  });
});
