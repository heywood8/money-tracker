/**
 * Tests for budget line GROUPS (migration 0022): the envelope several plan lines
 * can share. Covers group validation and CRUD, the derived-vs-override budget
 * rule, group membership on lines, and what calculatePlanStatus does with both —
 * in particular that an override REPLACES its children's sum in the month's
 * allocated total while a derived group leaves it untouched.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import { calculateSpendingForCategories } from '../../app/services/BudgetsDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
// Keep the real deriveSpendingStatus (the group's bands go through it) and stub
// only the spending engine, exactly as BudgetPlansDB.status.test.js does.
jest.mock('../../app/services/BudgetsDB', () => ({
  ...jest.requireActual('../../app/services/BudgetsDB'),
  calculateSpendingForCategories: jest.fn(),
}));
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
  getTransferTotals: jest.fn(),
  getUnconvertibleCurrencies: jest.fn(),
  createOperationInTx: jest.fn(),
}));

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

// Same deterministic rate stand-in the other BudgetPlansDB suites use: a fixed
// map and a plain multiply; an unmapped currency converts to null (no rate).
const stubRates = (rates) => {
  const rateMap = new Map(Object.entries(rates));
  fetchRatesToTarget.mockResolvedValue(rateMap);
  convertWithRateMap.mockImplementation((amount, from, target, map) => {
    if (from === target) return amount;
    const rate = map.get(from);
    if (!rate) return null;
    return String(parseFloat(amount) * parseFloat(rate));
  });
};

const PLAN_ROW = {
  id: 'p1', month: '2026-07', currency: 'USD', expected_income: '1000',
  created_at: 't', updated_at: 't',
};

const lineRow = (id, amount, { groupId = null, categoryId = 'cat1', sortOrder = 0 } = {}) => ({
  id, plan_id: 'p1', label: null, amount, comment: null,
  category_id: categoryId, category_ids: categoryId, to_account_id: null,
  sort_order: sortOrder, is_recurring: 0, currency: null, group_id: groupId,
  created_at: 't', updated_at: 't',
});

const groupRow = (id, label, { amount = null, currency = null, sortOrder = 0 } = {}) => ({
  id, label, amount, currency, sort_order: sortOrder, created_at: 't', updated_at: 't',
});

// Dispatch the db mocks by SQL shape, like the status suite. Note the group
// table's name is NOT a substring of the line table's, so the two never collide.
const setupDb = ({ lines = [], groups = [], spending = '0' }) => {
  queryFirst.mockImplementation(async (sql) => {
    if (sql.includes('FROM budget_plans WHERE id')) return PLAN_ROW;
    if (sql.includes("o.type = 'income'")) return { total: 0 };
    return null;
  });
  queryAll.mockImplementation(async (sql) => {
    if (sql.includes('FROM budget_plan_line_groups')) return groups;
    if (sql.includes('is_recurring = 1') && !sql.includes('WHERE l.plan_id')) return [];
    if (sql.includes('FROM budget_plan_lines')) return lines;
    return [];
  });
  calculateSpendingForCategories.mockResolvedValue(spending);
};

describe('BudgetPlansDB line groups', () => {
  let mockRunAsync;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    calculateSpendingForCategories.mockResolvedValue('0');
    getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    getUnconvertibleCurrencies.mockResolvedValue([]);
    stubRates({});
    mockRunAsync = jest.fn().mockResolvedValue(undefined);
    executeTransaction.mockImplementation(async (cb) => cb({ runAsync: mockRunAsync }));
  });

  describe('validateLineGroup', () => {
    it('accepts a group with just a name (its budget is derived)', () => {
      expect(BudgetPlansDB.validateLineGroup({ label: 'Car' })).toBeNull();
    });

    it('rejects a missing or blank name', () => {
      expect(BudgetPlansDB.validateLineGroup({})).toBe('A group name is required');
      expect(BudgetPlansDB.validateLineGroup({ label: '   ' })).toBe('A group name is required');
    });

    it('rejects a non-positive or unparseable override amount', () => {
      expect(BudgetPlansDB.validateLineGroup({ label: 'Car', amount: '0', currency: 'USD' }))
        .toBe('Amount must be greater than zero');
      expect(BudgetPlansDB.validateLineGroup({ label: 'Car', amount: 'x', currency: 'USD' }))
        .toBe('Amount must be greater than zero');
    });

    it('requires a currency alongside an override amount', () => {
      expect(BudgetPlansDB.validateLineGroup({ label: 'Car', amount: '500' }))
        .toBe('Currency is required for a custom group budget');
    });
  });

  describe('createLineGroup', () => {
    it('stores a derived group with null amount AND null currency', async () => {
      const created = await BudgetPlansDB.createLineGroup({ label: '  Car  ', currency: 'USD' });

      expect(created).toMatchObject({ label: 'Car', amount: null, currency: null, isDerived: true });
      const [, params] = executeQuery.mock.calls[0];
      expect(params.slice(0, 4)).toEqual(['uuid-1', 'Car', null, null]);
    });

    it('stores an override amount with its currency', async () => {
      const created = await BudgetPlansDB.createLineGroup({ label: 'Car', amount: '500', currency: 'EUR' });

      expect(created).toMatchObject({ amount: '500', currency: 'EUR', isDerived: false });
    });

    it('rejects an invalid group before touching the database', async () => {
      await expect(BudgetPlansDB.createLineGroup({ label: '' })).rejects.toThrow('A group name is required');
      expect(executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('updateLineGroup', () => {
    it('clears the stored currency when the override is removed', async () => {
      await BudgetPlansDB.updateLineGroup('g1', { amount: null });

      const [sql, params] = executeQuery.mock.calls[0];
      expect(sql).toContain('amount = ?');
      expect(sql).toContain('currency = ?');
      expect(params.slice(0, 2)).toEqual([null, null]);
    });

    it('falls back to the stored currency when an amount is set without one', async () => {
      queryFirst.mockResolvedValue({ currency: 'EUR' });

      await BudgetPlansDB.updateLineGroup('g1', { amount: '500' });

      const [, params] = executeQuery.mock.calls[0];
      expect(params.slice(0, 2)).toEqual(['500', 'EUR']);
    });

    it('rejects an override with no currency anywhere to express it in', async () => {
      queryFirst.mockResolvedValue({ currency: null });

      await expect(BudgetPlansDB.updateLineGroup('g1', { amount: '500' }))
        .rejects.toThrow('Currency is required for a custom group budget');
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('rejects a blank name', async () => {
      await expect(BudgetPlansDB.updateLineGroup('g1', { label: '  ' }))
        .rejects.toThrow('A group name is required');
    });

    it('ignores a currency edit on a group that has no override to describe', async () => {
      queryFirst.mockResolvedValue({ amount: null });

      await BudgetPlansDB.updateLineGroup('g1', { currency: 'EUR' });

      expect(executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('deleteLineGroup', () => {
    it('deletes only the group row — its lines are ungrouped by the FK, not deleted', async () => {
      await BudgetPlansDB.deleteLineGroup('g1');

      expect(executeQuery).toHaveBeenCalledTimes(1);
      expect(executeQuery.mock.calls[0][0]).toContain('DELETE FROM budget_plan_line_groups');
      expect(executeQuery.mock.calls[0][0]).not.toContain('budget_plan_lines');
    });
  });

  describe('reorderLineGroups', () => {
    it('writes each group\'s index as its sort order', async () => {
      await BudgetPlansDB.reorderLineGroups(['g2', 'g1']);

      expect(mockRunAsync).toHaveBeenNthCalledWith(1, expect.stringContaining('sort_order = ?'), [0, expect.any(String), 'g2']);
      expect(mockRunAsync).toHaveBeenNthCalledWith(2, expect.any(String), [1, expect.any(String), 'g1']);
    });

    it('rejects a duplicate id rather than half-applying an order', async () => {
      await expect(BudgetPlansDB.reorderLineGroups(['g1', 'g1'])).rejects.toThrow('Duplicate group ID');
    });
  });

  describe('membership on a line', () => {
    it('maps group_id onto the line', () => {
      expect(BudgetPlansDB.mapLineFields(lineRow('l1', '100', { groupId: 'g1' })).groupId).toBe('g1');
    });

    it('never reports an income line as grouped', () => {
      const row = { ...lineRow('i1', '100'), kind: 'income', group_id: 'g1' };
      expect(BudgetPlansDB.mapLineFields(row).groupId).toBeNull();
    });

    it('persists the group on insert', async () => {
      await BudgetPlansDB.addLine('p1', { amount: '100', categoryIds: ['cat1'], groupId: 'g1' });

      const [sql, params] = mockRunAsync.mock.calls[0];
      expect(sql).toContain('group_id');
      expect(params).toContain('g1');
    });

    it('drops the group when a line is turned into an income line', async () => {
      await BudgetPlansDB.updateLine('l1', { kind: 'income' });

      const [sql, params] = executeQuery.mock.calls[0];
      expect(sql).toContain('group_id = ?');
      // kind, group_id, updated_at, id — the group is nulled without being asked.
      expect(params[1]).toBeNull();
    });
  });

  describe('calculatePlanStatus', () => {
    it('totals a derived group from its children and leaves `allocated` alone', async () => {
      setupDb({
        lines: [
          lineRow('l-fuel', '300', { groupId: 'g1' }),
          lineRow('l-parking', '120', { groupId: 'g1', sortOrder: 1 }),
          lineRow('l-loose', '50', { sortOrder: 2 }),
        ],
        groups: [groupRow('g1', 'Car')],
        spending: '60',
      });

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      expect(status.groups).toHaveLength(1);
      expect(status.groups[0]).toMatchObject({
        groupId: 'g1', overrideApplied: false, lineCount: 2,
      });
      expect(parseFloat(status.groups[0].amount)).toBe(420);
      // Each of the three lines "spent" 60 — the group counts only its own two.
      expect(parseFloat(status.groups[0].actual)).toBe(120);
      expect(parseFloat(status.totals.allocated)).toBe(470);
    });

    it('swaps an override into `allocated` in place of its children', async () => {
      setupDb({
        lines: [
          lineRow('l-fuel', '300', { groupId: 'g1' }),
          lineRow('l-parking', '120', { groupId: 'g1', sortOrder: 1 }),
          lineRow('l-loose', '50', { sortOrder: 2 }),
        ],
        groups: [groupRow('g1', 'Car', { amount: '500', currency: 'USD' })],
      });

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      expect(status.groups[0]).toMatchObject({ overrideApplied: true });
      expect(parseFloat(status.groups[0].amount)).toBe(500);
      expect(parseFloat(status.groups[0].childAmount)).toBe(420);
      // 500 (override) + 50 (ungrouped) — the children's 420 is replaced, not added.
      expect(parseFloat(status.totals.allocated)).toBe(550);
    });

    it('converts an override priced in another currency', async () => {
      stubRates({ EUR: '2' });
      setupDb({
        lines: [lineRow('l-fuel', '300', { groupId: 'g1' })],
        groups: [groupRow('g1', 'Car', { amount: '250', currency: 'EUR' })],
      });

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      expect(parseFloat(status.groups[0].amount)).toBe(500);
      expect(parseFloat(status.totals.allocated)).toBe(500);
    });

    it('falls back to the children\'s sum when the override has no rate', async () => {
      stubRates({}); // no EUR rate at all
      setupDb({
        lines: [lineRow('l-fuel', '300', { groupId: 'g1' })],
        groups: [groupRow('g1', 'Car', { amount: '250', currency: 'EUR' })],
      });

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      expect(status.groups[0]).toMatchObject({ status: 'unconvertible', overrideApplied: false });
      expect(parseFloat(status.groups[0].amount)).toBe(300);
      // The month's total keeps counting the children, which ARE in the display
      // currency — an unconvertible override must not silently drop them.
      expect(parseFloat(status.totals.allocated)).toBe(300);
      expect(getUnconvertibleCurrencies).toHaveBeenCalledWith(
        expect.objectContaining({ has: expect.any(Function) }),
        'USD',
      );
    });

    it('omits a group with no line in the month', async () => {
      setupDb({
        lines: [lineRow('l-loose', '50')],
        groups: [groupRow('g1', 'Car'), groupRow('g2', 'Holiday')],
      });

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      expect(status.groups).toEqual([]);
    });

    it('bands a group the same way a line is banded', async () => {
      setupDb({
        lines: [lineRow('l-fuel', '100', { groupId: 'g1' })],
        groups: [groupRow('g1', 'Car')],
        spending: '150',
      });

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      expect(status.groups[0]).toMatchObject({ status: 'exceeded', percentage: 150, isExceeded: true });
      expect(parseFloat(status.groups[0].remaining)).toBe(-50);
    });
  });
});
