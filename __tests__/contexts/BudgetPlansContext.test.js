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
  EVENTS: { RELOAD_ALL: 'RELOAD_ALL', DATABASE_RESET: 'DATABASE_RESET', OPERATION_CHANGED: 'OPERATION_CHANGED' },
}));

const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  DialogProvider: ({ children }) => children,
  useDialog: () => ({ showDialog: mockShowDialog, hideDialog: jest.fn() }),
}));

// The plans context reads the shared convert-all toggle AND the Budgets tab's
// display currency from BudgetsDataContext. Undefined by default (rendered
// standalone, as in the app's own fallback path); individual tests install a
// host value.
let mockBudgetsData;
jest.mock('../../app/contexts/BudgetsDataContext', () => ({
  useBudgetsData: () => mockBudgetsData,
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
    mockBudgetsData = undefined;

    appEvents.on.mockReturnValue(jest.fn());
    BudgetPlansDB.getAllPlans.mockResolvedValue([]);
    BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map());
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
      expect(mockShowDialog).toHaveBeenCalledWith('error', 'A valid month (YYYY-MM) is required', [{ text: 'ok' }]);
      expect(result.current.plans).toHaveLength(0);
    });

    it('surfaces a DB failure', async () => {
      BudgetPlansDB.createPlan.mockRejectedValue(new Error('duplicate month'));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(act(async () => {
        await result.current.addPlan({ month: '2026-07', currency: 'USD' });
      })).rejects.toThrow('duplicate month');
      expect(mockShowDialog).toHaveBeenCalledWith('error', 'duplicate month', [{ text: 'ok' }]);
    });

    // Fix 4 (adversarial review round 2): BudgetPlansDB.createPlan recovers
    // from a double-tap UNIQUE(month) race by handing BOTH racing callers the
    // SAME winning plan object (instead of the loser throwing) — so without a
    // dedup guard here, both addPlan calls would each prepend that plan,
    // leaving two entries with the same id in `plans`.
    it('does not duplicate the same plan id in state when two racing calls resolve to the same winning plan', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      BudgetPlansDB.createPlan.mockResolvedValue({
        id: 'winner', month: '2026-07', currency: 'USD', expectedIncome: '0',
      });

      await act(async () => {
        await Promise.all([
          result.current.addPlan({ month: '2026-07', currency: 'USD' }),
          result.current.addPlan({ month: '2026-07', currency: 'USD' }),
        ]);
      });

      expect(result.current.plans.map(p => p.id)).toEqual(['winner']);
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
      expect(mockShowDialog).toHaveBeenCalledWith('error', 'failed_to_delete_plan', [{ text: 'ok' }]);
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

    // Fix 4 (adversarial review round 2): same dedup as addPlan — a double-tap
    // "copy from last month" race, recovered at the DB layer, must not leave a
    // duplicate id in state either.
    it('does not duplicate the same plan id in state when two racing copies resolve to the same winning plan', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      BudgetPlansDB.copyPlan.mockResolvedValue({
        id: 'winner', month: '2026-08', currency: 'USD', expectedIncome: '100',
      });

      await act(async () => {
        await Promise.all([
          result.current.copyPlan('2026-07', '2026-08'),
          result.current.copyPlan('2026-07', '2026-08'),
        ]);
      });

      expect(result.current.plans.map(p => p.id)).toEqual(['winner']);
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
        await result.current.updateLine('l1', { amount: '50' }, { fromMonth: '2026-07' });
        await result.current.deleteLine('l1', { fromMonth: '2026-07' });
        await result.current.reorderLines('p1', ['l1']);
        await result.current.getPlanTotals('p1');
        await result.current.getPlanLines('p1');
        await result.current.getBrokenLines('p1');
        await result.current.getPlanByMonth('2026-07');
      });

      expect(BudgetPlansDB.addLine).toHaveBeenCalledWith('p1', { amount: '40', categoryId: 'c1' });
      // The edit's month rides along (migration 0026), so a recurring line's past
      // months keep the budget they were spent against.
      expect(BudgetPlansDB.updateLine).toHaveBeenCalledWith('l1', { amount: '50' }, { fromMonth: '2026-07' });
      expect(BudgetPlansDB.deleteLine).toHaveBeenCalledWith('l1', { fromMonth: '2026-07' });
      expect(BudgetPlansDB.reorderLines).toHaveBeenCalledWith('p1', ['l1']);
      expect(BudgetPlansDB.getPlanTotals).toHaveBeenCalledWith('p1');
      expect(BudgetPlansDB.getPlanLines).toHaveBeenCalledWith('p1');
      expect(BudgetPlansDB.getBrokenLines).toHaveBeenCalledWith('p1');
      expect(BudgetPlansDB.getPlanByMonth).toHaveBeenCalledWith('2026-07');
    });

    // Budgets v3 phase 2: recurring (global template) lines and the merged
    // per-month line view.
    it('delegates recurring-line operations and getLinesForMonth to the DB layer', async () => {
      BudgetPlansDB.addRecurringLine.mockResolvedValue({ id: 'l-rec' });
      BudgetPlansDB.getLinesForMonth.mockResolvedValue([{ id: 'l-rec', isRecurring: true }]);

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.addRecurringLine({ amount: '65000', categoryId: 'c1', currency: 'USD' });
        await result.current.reorderRecurringLines(['l-rec']);
        await result.current.getRecurringLines();
        await result.current.getLinesForMonth('2026-07');
      });

      expect(BudgetPlansDB.addRecurringLine).toHaveBeenCalledWith({ amount: '65000', categoryId: 'c1', currency: 'USD' });
      expect(BudgetPlansDB.reorderRecurringLines).toHaveBeenCalledWith(['l-rec']);
      expect(BudgetPlansDB.getRecurringLines).toHaveBeenCalled();
      expect(BudgetPlansDB.getLinesForMonth).toHaveBeenCalledWith('2026-07');
    });
  });

  describe('Plan statuses (plan vs actual)', () => {
    const STATUS = { planId: 'p1', month: '2026-07', currency: 'USD', lines: [], totals: {}, unconvertible: [] };

    it('computes statuses on mount with the default convert-all mode (on)', async () => {
      BudgetPlansDB.getAllPlans.mockResolvedValue([
        { id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '0' },
      ]);
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map([['p1', STATUS]]));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });

      await waitFor(() => expect(result.current.planStatuses.get('p1')).toEqual(STATUS));
      // No display currency chosen (no BudgetsData host here): every plan keeps
      // its own stored currency, which `null` selects.
      expect(BudgetPlansDB.calculateAllPlanStatuses).toHaveBeenCalledWith(true, null);
    });

    // Regression: the Budgets tab's currency chip was decorative. It converted
    // the rows but not the statuses, which stayed in each plan's stored
    // currency — so picking AMD over a plan created in RUB left every total,
    // and the header's remainder, reading in RUB under an AMD chip.
    it('computes statuses in the display currency chosen on the Budgets tab', async () => {
      mockBudgetsData = { convertAllBudgets: true, displayCurrency: 'AMD' };
      BudgetPlansDB.getAllPlans.mockResolvedValue([
        { id: 'p1', month: '2026-07', currency: 'RUB', expectedIncome: '0' },
      ]);
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map());

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(BudgetPlansDB.calculateAllPlanStatuses).toHaveBeenCalledWith(true, 'AMD');
    });

    it('refreshes statuses when an operation changes (integration-style)', async () => {
      let operationChangedCb;
      appEvents.on.mockImplementation((event, cb) => {
        if (event === EVENTS.OPERATION_CHANGED) operationChangedCb = cb;
        return jest.fn();
      });

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(operationChangedCb).toBeDefined());

      // A new expense lands: the recompute returns an updated status map.
      const updated = { ...STATUS, totals: { totalActual: '365' } };
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map([['p1', updated]]));

      await act(async () => { operationChangedCb(); });

      await waitFor(() => expect(result.current.planStatuses.get('p1')).toEqual(updated));
    });

    it('exposes refreshPlanStatuses for explicit recomputes after line edits', async () => {
      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      BudgetPlansDB.calculateAllPlanStatuses.mockClear();
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map([['p1', STATUS]]));

      await act(async () => { await result.current.refreshPlanStatuses(); });

      expect(BudgetPlansDB.calculateAllPlanStatuses).toHaveBeenCalledTimes(1);
      expect(result.current.planStatuses.get('p1')).toEqual(STATUS);
    });

    it('keeps the previous statuses when a refresh fails', async () => {
      BudgetPlansDB.getAllPlans.mockResolvedValue([
        { id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '0' },
      ]);
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map([['p1', STATUS]]));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.planStatuses.get('p1')).toEqual(STATUS));

      BudgetPlansDB.calculateAllPlanStatuses.mockRejectedValue(new Error('rates offline'));
      await act(async () => { await result.current.refreshPlanStatuses(); });

      expect(result.current.planStatuses.get('p1')).toEqual(STATUS);
    });

    it('discards a stale refresh whose result resolves after a newer one', async () => {
      BudgetPlansDB.getAllPlans.mockResolvedValue([
        { id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '0' },
      ]);
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map([['p1', STATUS]]));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.planStatuses.get('p1')).toEqual(STATUS));

      let resolveStale;
      const staleMap = new Map([['p1', { ...STATUS, totals: { totalActual: 'STALE' } }]]);
      const freshMap = new Map([['p1', { ...STATUS, totals: { totalActual: 'FRESH' } }]]);

      // First refresh (older token) stays pending; second (newer token) resolves
      // first with the fresh map, then the stale one resolves last.
      BudgetPlansDB.calculateAllPlanStatuses
        .mockReset()
        .mockImplementationOnce(() => new Promise((r) => { resolveStale = r; }))
        .mockResolvedValueOnce(freshMap);

      await act(async () => {
        const stalePromise = result.current.refreshPlanStatuses();
        await result.current.refreshPlanStatuses();
        resolveStale(staleMap);
        await stalePromise;
      });

      // The stale result must not clobber the fresher one.
      expect(result.current.planStatuses.get('p1').totals.totalActual).toBe('FRESH');
    });

    it('clears statuses on DATABASE_RESET', async () => {
      let resetCb;
      appEvents.on.mockImplementation((event, cb) => {
        if (event === EVENTS.DATABASE_RESET) resetCb = cb;
        return jest.fn();
      });
      BudgetPlansDB.getAllPlans.mockResolvedValue([
        { id: 'p1', month: '2026-07', currency: 'USD', expectedIncome: '0' },
      ]);
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map([['p1', STATUS]]));

      const { result } = await renderHook(() => useBudgetPlans(), { wrapper });
      await waitFor(() => expect(result.current.planStatuses.size).toBe(1));

      // After the reset the tables are empty, so any follow-up recompute
      // (triggered by the plans list clearing) also returns an empty map.
      BudgetPlansDB.calculateAllPlanStatuses.mockResolvedValue(new Map());
      await act(async () => { resetCb(); });
      await waitFor(() => expect(result.current.planStatuses.size).toBe(0));
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
