/**
 * Tests for BudgetPlansContext (Budgets v2) — state management for monthly
 * income-allocation plans. Mirrors the BudgetsContext test patterns.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { BudgetPlansProvider, useBudgetPlans } from '../../app/contexts/BudgetPlansContext';
import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import { appEvents, EVENTS } from '../../app/services/eventEmitter';

jest.mock('../../app/services/BudgetPlansDB');
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: { on: jest.fn(), emit: jest.fn() },
  EVENTS: { RELOAD_ALL: 'RELOAD_ALL', DATABASE_RESET: 'DATABASE_RESET' },
}));

const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => ({ showDialog: mockShowDialog, hideDialog: jest.fn() }),
}));

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `plan-uuid-${++mockUuidCounter}`),
}));

const wrapper = ({ children }) => <BudgetPlansProvider>{children}</BudgetPlansProvider>;

describe('BudgetPlansContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowDialog.mockClear();
    mockUuidCounter = 0;

    appEvents.on.mockReturnValue(jest.fn());
    BudgetPlansDB.getAllPlans.mockResolvedValue([]);
    BudgetPlansDB.validatePlan.mockReturnValue(null);
    BudgetPlansDB.createPlan.mockImplementation(async (plan) => ({ ...plan }));
    BudgetPlansDB.updatePlan.mockResolvedValue(undefined);
    BudgetPlansDB.deletePlan.mockResolvedValue(undefined);
    BudgetPlansDB.copyPlan.mockResolvedValue({ id: 'copied', month: '2026-08', currency: 'USD', expectedIncome: '100' });
  });

  describe('Initialization', () => {
    it('loads plans on mount', async () => {
      const plans = [{ id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '445000' }];
      BudgetPlansDB.getAllPlans.mockResolvedValue(plans);

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.plans).toEqual(plans);
      expect(result.current.saveError).toBeNull();
      expect(BudgetPlansDB.getAllPlans).toHaveBeenCalled();
    });

    it('handles a load error gracefully', async () => {
      BudgetPlansDB.getAllPlans.mockRejectedValue(new Error('load failed'));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.plans).toEqual([]);
      expect(result.current.saveError).toBe('load failed');
    });

    it('throws when used outside a provider', async () => {
      const originalError = console.error;
      console.error = jest.fn();
      await expect(renderHook(() => useBudgetPlans()))
        .rejects.toThrow('useBudgetPlans must be used within a BudgetPlansProvider');
      console.error = originalError;
    });
  });

  describe('addPlan', () => {
    it('creates a plan and prepends it to state', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let created;
      await act(async () => {
        created = await result.current.addPlan({ month: '2026-07', currency: 'USD', expectedIncome: '445000' });
      });

      expect(created.id).toBe('plan-uuid-1');
      expect(BudgetPlansDB.createPlan).toHaveBeenCalledWith(
        expect.objectContaining({ month: '2026-07', id: 'plan-uuid-1' }),
      );
      expect(result.current.plans).toHaveLength(1);
    });

    it('rejects an invalid plan and surfaces a dialog', async () => {
      BudgetPlansDB.validatePlan.mockReturnValue('A valid month (YYYY-MM) is required');

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(act(async () => {
        await result.current.addPlan({ currency: 'USD' });
      })).rejects.toThrow('A valid month (YYYY-MM) is required');

      expect(BudgetPlansDB.createPlan).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalledWith('Error', 'A valid month (YYYY-MM) is required', [{ text: 'OK' }]);
      expect(result.current.plans).toHaveLength(0);
    });

    it('surfaces a DB failure', async () => {
      BudgetPlansDB.createPlan.mockRejectedValue(new Error('duplicate month'));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(act(async () => {
        await result.current.addPlan({ month: '2026-07', currency: 'USD' });
      })).rejects.toThrow('duplicate month');
      expect(mockShowDialog).toHaveBeenCalledWith('Error', 'duplicate month', [{ text: 'OK' }]);
    });
  });

  describe('updatePlan / deletePlan', () => {
    beforeEach(() => {
      BudgetPlansDB.getAllPlans.mockResolvedValue([
        { id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '445000' },
      ]);
    });

    it('updates an existing plan', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.updatePlan('p1', { expectedIncome: '500000' });
      });

      expect(BudgetPlansDB.updatePlan).toHaveBeenCalledWith('p1', { expectedIncome: '500000' });
      expect(result.current.plans[0].expectedIncome).toBe('500000');
    });

    it('rejects updating a non-existent plan', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(act(async () => {
        await result.current.updatePlan('nope', { currency: 'EUR' });
      })).rejects.toThrow('Budget plan not found');
      expect(BudgetPlansDB.updatePlan).not.toHaveBeenCalled();
    });

    it('deletes a plan', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.deletePlan('p1');
      });

      expect(BudgetPlansDB.deletePlan).toHaveBeenCalledWith('p1');
      expect(result.current.plans).toHaveLength(0);
    });

    it('surfaces a delete failure', async () => {
      BudgetPlansDB.deletePlan.mockRejectedValue(new Error('boom'));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(act(async () => {
        await result.current.deletePlan('p1');
      })).rejects.toThrow('boom');
      expect(mockShowDialog).toHaveBeenCalledWith('Error', 'Failed to delete plan. Please try again.', [{ text: 'OK' }]);
    });
  });

  describe('copyPlan', () => {
    it('clones a plan and prepends it', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let created;
      await act(async () => {
        created = await result.current.copyPlan('2026-07', '2026-08');
      });

      expect(BudgetPlansDB.copyPlan).toHaveBeenCalledWith('2026-07', '2026-08');
      expect(created.id).toBe('copied');
      expect(result.current.plans[0].id).toBe('copied');
    });
  });

  describe('line delegation', () => {
    it('delegates line operations to the DB layer', async () => {
      BudgetPlansDB.addLine.mockResolvedValue({ id: 'l1' });
      BudgetPlansDB.getPlanTotals.mockResolvedValue({ expectedIncome: '100', allocated: '40', remainder: '60' });

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addLine('p1', { amount: '40', categoryId: 'c1' });
        await result.current.updateLine('l1', { amount: '50' });
        await result.current.deleteLine('l1');
        await result.current.reorderLines('p1', ['l1']);
        await result.current.getPlanTotals('p1');
        await result.current.getPlanLines('p1');
        await result.current.getBrokenLines('p1');
        await result.current.getPlanByMonth('2026-07');
      });

      expect(BudgetPlansDB.addLine).toHaveBeenCalledWith('p1', { amount: '40', categoryId: 'c1' });
      expect(BudgetPlansDB.updateLine).toHaveBeenCalledWith('l1', { amount: '50' });
      expect(BudgetPlansDB.deleteLine).toHaveBeenCalledWith('l1');
      expect(BudgetPlansDB.reorderLines).toHaveBeenCalledWith('p1', ['l1']);
      expect(BudgetPlansDB.getPlanTotals).toHaveBeenCalledWith('p1');
      expect(BudgetPlansDB.getPlanLines).toHaveBeenCalledWith('p1');
      expect(BudgetPlansDB.getBrokenLines).toHaveBeenCalledWith('p1');
      expect(BudgetPlansDB.getPlanByMonth).toHaveBeenCalledWith('2026-07');
    });
  });

  describe('Event handling', () => {
    it('reloads on RELOAD_ALL', async () => {
      let reloadCb;
      appEvents.on.mockImplementation((event, cb) => {
        if (event === EVENTS.RELOAD_ALL) reloadCb = cb;
        return jest.fn();
      });

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const next = [{ id: 'p9', month: '2026-09', currency: 'USD', expectedIncome: '0' }];
      BudgetPlansDB.getAllPlans.mockResolvedValue(next);

      await act(async () => { reloadCb(); });
      await waitFor(() => expect(result.current.plans).toEqual(next));
    });

    it('clears plans on DATABASE_RESET', async () => {
      let resetCb;
      appEvents.on.mockImplementation((event, cb) => {
        if (event === EVENTS.DATABASE_RESET) resetCb = cb;
        return jest.fn();
      });
      BudgetPlansDB.getAllPlans.mockResolvedValue([{ id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '0' }]);

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.plans).toHaveLength(1));

      await act(async () => { resetCb(); });
      expect(result.current.plans).toEqual([]);
    });

    it('unsubscribes from events on unmount', async () => {
      const reloadUnsub = jest.fn();
      const resetUnsub = jest.fn();
      appEvents.on.mockImplementation((event) => {
        if (event === EVENTS.RELOAD_ALL) return reloadUnsub;
        if (event === EVENTS.DATABASE_RESET) return resetUnsub;
        return jest.fn();
      });

      const { unmount, result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await unmount();
      expect(reloadUnsub).toHaveBeenCalled();
      expect(resetUnsub).toHaveBeenCalled();
    });
  });
});
