/**
 * Tests for PlannedOperationsContext - State management for planned operations
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { PlannedOperationsProvider, usePlannedOperations } from '../../app/contexts/PlannedOperationsContext';
import * as PlannedOperationsDB from '../../app/services/PlannedOperationsDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

// Mock dependencies
jest.mock('../../app/services/PlannedOperationsDB');
jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => date.toISOString().split('T')[0]),
}));
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(() => jest.fn()),
    emit: jest.fn(),
  },
  EVENTS: {
    RELOAD_ALL: 'RELOAD_ALL',
    DATABASE_RESET: 'DATABASE_RESET',
  },
}));

const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => ({
    showDialog: mockShowDialog,
    hideDialog: jest.fn(),
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  LocalizationProvider: ({ children }) => children,
  useLocalization: () => ({
    t: (key) => key,
    language: 'en',
  }),
}));

const mockAddOperation = jest.fn();
jest.mock('../../app/contexts/OperationsActionsContext', () => ({
  useOperationsActions: () => ({
    addOperation: mockAddOperation,
  }),
}));

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++mockUuidCounter}`),
}));

describe('PlannedOperationsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowDialog.mockClear();
    mockAddOperation.mockClear();
    mockUuidCounter = 0;

    PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([]);
    PlannedOperationsDB.createPlannedOperation.mockImplementation(async (op) => op);
    PlannedOperationsDB.updatePlannedOperation.mockResolvedValue(undefined);
    PlannedOperationsDB.deletePlannedOperation.mockResolvedValue(undefined);
    PlannedOperationsDB.markExecuted.mockResolvedValue(undefined);
    PlannedOperationsDB.validatePlannedOperation.mockReturnValue(null);
  });

  const wrapper = ({ children }) => <PlannedOperationsProvider>{children}</PlannedOperationsProvider>;

  describe('Initialization', () => {
    it('loads planned operations on mount', async () => {
      const mockOps = [
        { id: '1', name: 'Rent', type: 'expense', amount: '500', accountId: 1, categoryId: 'cat1', isRecurring: true },
      ];
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue(mockOps);

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plannedOperations).toEqual(mockOps);
      expect(PlannedOperationsDB.getAllPlannedOperations).toHaveBeenCalledTimes(1);
    });

    it('sets loading state correctly', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([]);

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('handles load error', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockRejectedValue(new Error('DB error'));

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plannedOperations).toEqual([]);
      expect(result.current.saveError).toBe('DB error');
    });
  });

  describe('CRUD Operations', () => {
    it('adds a planned operation', async () => {
      const { result } = renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const newOp = {
        name: 'Rent',
        type: 'expense',
        amount: '500',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: true,
      };

      await act(async () => {
        await result.current.addPlannedOperation(newOp);
      });

      expect(PlannedOperationsDB.createPlannedOperation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Rent', id: 'test-uuid-1' }),
      );
      expect(result.current.plannedOperations).toHaveLength(1);
    });

    it('updates a planned operation', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([
        { id: '1', name: 'Rent', type: 'expense', amount: '500', accountId: 1, categoryId: 'cat1', isRecurring: true },
      ]);

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.updatePlannedOperation('1', { amount: '600' });
      });

      expect(PlannedOperationsDB.updatePlannedOperation).toHaveBeenCalledWith('1', { amount: '600' });
      expect(result.current.plannedOperations[0].amount).toBe('600');
    });

    it('deletes a planned operation', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([
        { id: '1', name: 'Rent', type: 'expense', amount: '500', accountId: 1, categoryId: 'cat1', isRecurring: true },
      ]);

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.deletePlannedOperation('1');
      });

      expect(PlannedOperationsDB.deletePlannedOperation).toHaveBeenCalledWith('1');
      expect(result.current.plannedOperations).toHaveLength(0);
    });
  });

  describe('Execute Planned Operation', () => {
    it('creates a real operation and marks as executed for recurring', async () => {
      const plannedOp = {
        id: '1',
        name: 'Rent',
        type: 'expense',
        amount: '500',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: true,
        lastExecutedMonth: null,
      };
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([plannedOp]);
      mockAddOperation.mockResolvedValue({ id: 100 });

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.executePlannedOperation(plannedOp);
      });

      // Should have created a real operation
      expect(mockAddOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          amount: '500',
          accountId: 1,
          categoryId: 'cat1',
        }),
      );

      // Should have marked as executed
      expect(PlannedOperationsDB.markExecuted).toHaveBeenCalledWith('1', expect.stringMatching(/^\d{4}-\d{2}$/));

      // Recurring should stay in list
      expect(result.current.plannedOperations).toHaveLength(1);
    });

    it('removes one-time planned operation after execution', async () => {
      const plannedOp = {
        id: '2',
        name: 'One-time',
        type: 'expense',
        amount: '100',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: false,
        lastExecutedMonth: null,
      };
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([plannedOp]);
      mockAddOperation.mockResolvedValue({ id: 101 });

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.executePlannedOperation(plannedOp);
      });

      // One-time should be removed from list
      expect(PlannedOperationsDB.deletePlannedOperation).toHaveBeenCalledWith('2');
      expect(result.current.plannedOperations).toHaveLength(0);
    });

    it('shows dialog when already executed this month', async () => {
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const plannedOp = {
        id: '1',
        name: 'Rent',
        type: 'expense',
        amount: '500',
        accountId: 1,
        categoryId: 'cat1',
        isRecurring: true,
        lastExecutedMonth: currentMonth,
      };
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([plannedOp]);

      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        const returned = await result.current.executePlannedOperation(plannedOp);
        expect(returned).toBeNull();
      });

      expect(mockShowDialog).toHaveBeenCalled();
      expect(mockAddOperation).not.toHaveBeenCalled();
    });
  });

  describe('isExecutedThisMonth', () => {
    it('returns true when executed this month', async () => {
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isExecutedThisMonth({ lastExecutedMonth: currentMonth })).toBe(true);
    });

    it('returns false when not executed this month', async () => {
      const { result } = renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isExecutedThisMonth({ lastExecutedMonth: '2025-01' })).toBe(false);
      expect(result.current.isExecutedThisMonth({ lastExecutedMonth: null })).toBe(false);
    });
  });

  describe('Event Listeners', () => {
    it('subscribes to RELOAD_ALL and DATABASE_RESET events', async () => {
      renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(appEvents.on).toHaveBeenCalledWith(EVENTS.RELOAD_ALL, expect.any(Function));
        expect(appEvents.on).toHaveBeenCalledWith(EVENTS.DATABASE_RESET, expect.any(Function));
      });
    });
  });
});
