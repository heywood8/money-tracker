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
    OPERATION_CHANGED: 'OPERATION_CHANGED',
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

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++mockUuidCounter}`),
}));

describe('PlannedOperationsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowDialog.mockClear();
    mockUuidCounter = 0;

    PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([]);
    PlannedOperationsDB.createPlannedOperation.mockImplementation(async (op) => op);
    PlannedOperationsDB.updatePlannedOperation.mockResolvedValue(undefined);
    PlannedOperationsDB.deletePlannedOperation.mockResolvedValue(undefined);
    PlannedOperationsDB.markExecuted.mockResolvedValue(undefined);
    PlannedOperationsDB.markExecutedOnly.mockResolvedValue(undefined);
    PlannedOperationsDB.executeAndMark.mockResolvedValue({ id: 100, type: 'expense' });
    PlannedOperationsDB.validatePlannedOperation.mockReturnValue(null);
  });

  const wrapper = ({ children }) => <PlannedOperationsProvider>{children}</PlannedOperationsProvider>;

  describe('Initialization', () => {
    it('loads planned operations on mount', async () => {
      const mockOps = [
        { id: '1', name: 'Rent', type: 'expense', amount: '500', accountId: 1, categoryId: 'cat1', isRecurring: true },
      ];
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue(mockOps);

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plannedOperations).toEqual(mockOps);
      expect(PlannedOperationsDB.getAllPlannedOperations).toHaveBeenCalledTimes(1);
    });

    it('sets loading state correctly', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([]);

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('handles load error', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockRejectedValue(new Error('DB error'));

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.plannedOperations).toEqual([]);
      expect(result.current.saveError).toBe('DB error');
    });
  });

  describe('CRUD Operations', () => {
    it('adds a planned operation', async () => {
      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });

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

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
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

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.deletePlannedOperation('1');
      });

      expect(PlannedOperationsDB.deletePlannedOperation).toHaveBeenCalledWith('1');
      expect(result.current.plannedOperations).toHaveLength(0);
    });
  });

  describe('Execute Planned Operation', () => {
    it('calls executeAndMark atomically and updates state for recurring', async () => {
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
      PlannedOperationsDB.executeAndMark.mockResolvedValue({ id: 100, type: 'expense' });

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.executePlannedOperation(plannedOp);
      });

      // Should have used the atomic executeAndMark, not separate calls
      expect(PlannedOperationsDB.executeAndMark).toHaveBeenCalledWith(
        plannedOp,
        expect.objectContaining({
          type: 'expense',
          amount: '500',
          accountId: 1,
          categoryId: 'cat1',
        }),
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );

      // markExecuted and deletePlannedOperation should NOT be called separately
      expect(PlannedOperationsDB.markExecuted).not.toHaveBeenCalled();
      expect(PlannedOperationsDB.deletePlannedOperation).not.toHaveBeenCalled();

      // Recurring should stay in list with updated lastExecutedMonth
      expect(result.current.plannedOperations).toHaveLength(1);
      expect(result.current.plannedOperations[0].lastExecutedMonth).toMatch(/^\d{4}-\d{2}$/);
    });

    it('emits OPERATION_CHANGED and RELOAD_ALL after successful execution', async () => {
      const plannedOp = {
        id: '1', name: 'Rent', type: 'expense', amount: '500',
        accountId: 1, categoryId: 'cat1', isRecurring: true, lastExecutedMonth: null,
      };
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([plannedOp]);
      PlannedOperationsDB.executeAndMark.mockResolvedValue({ id: 100 });

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.executePlannedOperation(plannedOp);
      });

      expect(appEvents.emit).toHaveBeenCalledWith('OPERATION_CHANGED');
      expect(appEvents.emit).toHaveBeenCalledWith('RELOAD_ALL');
    });

    it('removes one-time planned operation from state after execution', async () => {
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
      PlannedOperationsDB.executeAndMark.mockResolvedValue({ id: 101 });

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.executePlannedOperation(plannedOp);
      });

      // executeAndMark handles the DB delete atomically; context removes from local state
      expect(PlannedOperationsDB.executeAndMark).toHaveBeenCalledWith(
        plannedOp, expect.any(Object), expect.any(String),
      );
      // No separate deletePlannedOperation call
      expect(PlannedOperationsDB.deletePlannedOperation).not.toHaveBeenCalled();
      expect(result.current.plannedOperations).toHaveLength(0);
    });

    it('allows re-execution when already executed this month', async () => {
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
      PlannedOperationsDB.executeAndMark.mockResolvedValue({ id: 100 });

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        const returned = await result.current.executePlannedOperation(plannedOp);
        expect(returned).not.toBeNull();
      });

      expect(PlannedOperationsDB.executeAndMark).toHaveBeenCalled();
    });
  });

  describe('Mark Planned Operation Executed', () => {
    it('calls markExecutedOnly and updates state for recurring without creating an operation', async () => {
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

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.markPlannedOperationExecuted(plannedOp);
      });

      expect(PlannedOperationsDB.markExecutedOnly).toHaveBeenCalledWith(
        plannedOp,
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );
      expect(PlannedOperationsDB.executeAndMark).not.toHaveBeenCalled();

      expect(result.current.plannedOperations).toHaveLength(1);
      expect(result.current.plannedOperations[0].lastExecutedMonth).toMatch(/^\d{4}-\d{2}$/);
    });

    it('removes one-time planned operation from state after marking executed', async () => {
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

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.markPlannedOperationExecuted(plannedOp);
      });

      expect(result.current.plannedOperations).toHaveLength(0);
    });

    it('shows dialog and re-throws when markExecutedOnly fails', async () => {
      const plannedOp = {
        id: '1', name: 'Rent', type: 'expense', amount: '500',
        accountId: 1, categoryId: 'cat1', isRecurring: true, lastExecutedMonth: null,
      };
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([plannedOp]);
      PlannedOperationsDB.markExecutedOnly.mockRejectedValue(new Error('write failed'));

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await expect(result.current.markPlannedOperationExecuted(plannedOp)).rejects.toThrow('write failed');
      });

      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('isExecutedThisMonth', () => {
    it('returns true when executed this month', async () => {
      const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isExecutedThisMonth({ lastExecutedMonth: currentMonth })).toBe(true);
    });

    it('returns false when not executed this month', async () => {
      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isExecutedThisMonth({ lastExecutedMonth: '2025-01' })).toBe(false);
      expect(result.current.isExecutedThisMonth({ lastExecutedMonth: null })).toBe(false);
    });
  });

  describe('Event Listeners', () => {
    it('subscribes to RELOAD_ALL and DATABASE_RESET events', async () => {
      await renderHook(() => usePlannedOperations(), { wrapper });

      await waitFor(() => {
        expect(appEvents.on).toHaveBeenCalledWith(EVENTS.RELOAD_ALL, expect.any(Function));
        expect(appEvents.on).toHaveBeenCalledWith(EVENTS.DATABASE_RESET, expect.any(Function));
      });
    });

    it('RELOAD_ALL callback triggers reload of planned operations', async () => {
      let reloadCallback;
      appEvents.on.mockImplementation((event, cb) => {
        if (event === EVENTS.RELOAD_ALL) reloadCallback = cb;
        return jest.fn();
      });

      const reloaded = [{ id: 'new-1', name: 'After Reload', type: 'expense', amount: '100', accountId: 1 }];
      PlannedOperationsDB.getAllPlannedOperations
        .mockResolvedValueOnce([]) // initial load
        .mockResolvedValueOnce(reloaded); // after RELOAD_ALL

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(reloadCallback).toBeDefined();

      await act(async () => {
        await reloadCallback();
      });

      await waitFor(() => {
        expect(result.current.plannedOperations).toHaveLength(1);
        expect(result.current.plannedOperations[0].name).toBe('After Reload');
      });
    });

    it('DATABASE_RESET callback clears planned operations', async () => {
      let resetCallback;
      appEvents.on.mockImplementation((event, cb) => {
        if (event === EVENTS.DATABASE_RESET) resetCallback = cb;
        return jest.fn();
      });

      const initial = [{ id: '1', name: 'Op', type: 'expense', amount: '100', accountId: 1 }];
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue(initial);

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.plannedOperations).toHaveLength(1));

      expect(resetCallback).toBeDefined();

      await act(async () => {
        resetCallback();
      });

      expect(result.current.plannedOperations).toHaveLength(0);
    });

    it('usePlannedOperations throws when used outside provider', async () => {
      await expect(renderHook(() => usePlannedOperations())).rejects.toThrow('usePlannedOperations must be used within a PlannedOperationsProvider');
    });
  });

  describe('reloadPlannedOperations error handling', () => {
    it('sets saveError and empty operations when DB fails', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockRejectedValue(new Error('DB down'));

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.plannedOperations).toEqual([]);
      expect(result.current.saveError).toBe('DB down');
    });
  });

  describe('addPlannedOperation error handling', () => {
    it('shows dialog and re-throws when DB create fails', async () => {
      PlannedOperationsDB.createPlannedOperation.mockRejectedValue(new Error('create failed'));

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let caughtError;
      await act(async () => {
        try {
          await result.current.addPlannedOperation({ name: 'Test', type: 'expense', amount: '100', accountId: 1 });
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError?.message).toBe('create failed');
      expect(result.current.saveError).toBe('create failed');
      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('shows dialog and re-throws when validation fails', async () => {
      PlannedOperationsDB.validatePlannedOperation.mockReturnValue('name_required');

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let caughtError;
      await act(async () => {
        try {
          await result.current.addPlannedOperation({ name: '', type: 'expense', amount: '100', accountId: 1 });
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError).toBeDefined();
      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('updatePlannedOperation error handling', () => {
    it('shows dialog and re-throws when DB update fails', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([
        { id: '1', name: 'Op', type: 'expense', amount: '100', accountId: 1 },
      ]);
      PlannedOperationsDB.updatePlannedOperation.mockRejectedValue(new Error('update failed'));

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let caughtError;
      await act(async () => {
        try {
          await result.current.updatePlannedOperation('1', { amount: '200' });
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError?.message).toBe('update failed');
      expect(result.current.saveError).toBe('update failed');
      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('deletePlannedOperation error handling', () => {
    it('shows dialog and re-throws when DB delete fails', async () => {
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([
        { id: '1', name: 'Op', type: 'expense', amount: '100', accountId: 1 },
      ]);
      PlannedOperationsDB.deletePlannedOperation.mockRejectedValue(new Error('delete failed'));

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let caughtError;
      await act(async () => {
        try {
          await result.current.deletePlannedOperation('1');
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError?.message).toBe('delete failed');
      expect(result.current.saveError).toBe('delete failed');
      expect(mockShowDialog).toHaveBeenCalled();
    });
  });

  describe('executePlannedOperation error handling', () => {
    it('shows dialog and re-throws when executeAndMark fails', async () => {
      PlannedOperationsDB.executeAndMark.mockRejectedValue(new Error('atomic transaction failed'));

      const plannedOp = {
        id: '1', name: 'Test', type: 'expense', amount: '100',
        accountId: 1, isRecurring: true,
      };
      PlannedOperationsDB.getAllPlannedOperations.mockResolvedValue([plannedOp]);

      const { result } = await renderHook(() => usePlannedOperations(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let caughtError;
      await act(async () => {
        try {
          await result.current.executePlannedOperation(plannedOp);
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError?.message).toBe('atomic transaction failed');
      expect(mockShowDialog).toHaveBeenCalled();
      // State must not be changed on failure
      expect(result.current.plannedOperations).toHaveLength(1);
      // No events should have been emitted
      expect(appEvents.emit).not.toHaveBeenCalled();
    });
  });
});
