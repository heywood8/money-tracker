/**
 * Tests for BudgetPlansDB — Budgets v2 (monthly income-allocation plans).
 * Covers validation (incl. the exactly-one-target invariant), CRUD for plans and
 * lines, totals (incl. negative remainder), copyPlan, reorder, and the broken-line
 * state produced by ON DELETE SET NULL.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';

jest.mock('../../app/services/db');

// Predictable UUIDs.
let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

let mockRunAsync;

describe('BudgetPlansDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;

    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);

    mockRunAsync = jest.fn().mockResolvedValue(undefined);
    executeTransaction.mockImplementation(async (cb) => cb({ runAsync: mockRunAsync }));
  });

  describe('validatePlan', () => {
    it('accepts a valid plan', () => {
      expect(BudgetPlansDB.validatePlan({
        month: '2026-07', currency: 'USD', expectedIncome: '445000',
      })).toBeNull();
    });

    it('accepts a plan without expectedIncome (defaults later)', () => {
      expect(BudgetPlansDB.validatePlan({ month: '2026-07', currency: 'USD' })).toBeNull();
    });

    it('rejects a missing/invalid month', () => {
      expect(BudgetPlansDB.validatePlan({ currency: 'USD' })).toBe('A valid month (YYYY-MM) is required');
      expect(BudgetPlansDB.validatePlan({ month: '2026-7', currency: 'USD' })).toBe('A valid month (YYYY-MM) is required');
      expect(BudgetPlansDB.validatePlan({ month: '2026-13', currency: 'USD' })).toBe('A valid month (YYYY-MM) is required');
    });

    it('rejects a missing currency', () => {
      expect(BudgetPlansDB.validatePlan({ month: '2026-07' })).toBe('Currency is required');
    });

    it('rejects a negative expectedIncome', () => {
      expect(BudgetPlansDB.validatePlan({ month: '2026-07', currency: 'USD', expectedIncome: '-1' }))
        .toBe('Expected income must be a non-negative number');
    });
  });

  describe('validatePlanLine (exactly-one-target invariant)', () => {
    it('accepts a category-linked line', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '100', categoryId: 'cat1' })).toBeNull();
    });

    it('accepts an account-linked line', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '100', toAccountId: 5 })).toBeNull();
    });

    it('rejects a line linked to both a category and an account', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '100', categoryId: 'cat1', toAccountId: 5 }))
        .toBe('A line must link to either a category or an account, not both');
    });

    it('rejects a line linked to neither target', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '100' }))
        .toBe('A line must link to a category or an account');
    });

    it('rejects a zero, negative, or missing amount', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '0', categoryId: 'c' })).toBe('Amount must be greater than zero');
      expect(BudgetPlansDB.validatePlanLine({ amount: '-5', categoryId: 'c' })).toBe('Amount must be greater than zero');
      expect(BudgetPlansDB.validatePlanLine({ categoryId: 'c' })).toBe('Amount must be greater than zero');
    });
  });

  describe('mapLineFields', () => {
    it('returns null for null input', () => {
      expect(BudgetPlansDB.mapLineFields(null)).toBeNull();
    });

    it('maps snake_case to camelCase and flags broken lines', () => {
      const broken = BudgetPlansDB.mapLineFields({
        id: 'l1', plan_id: 'p1', label: null, amount: '100', comment: null,
        category_id: null, to_account_id: null, sort_order: 2,
        created_at: 't', updated_at: 't',
      });
      expect(broken.isBroken).toBe(true);
      expect(broken.sortOrder).toBe(2);

      const linked = BudgetPlansDB.mapLineFields({
        id: 'l2', plan_id: 'p1', amount: '100', category_id: 'cat1', to_account_id: null, sort_order: 0,
      });
      expect(linked.isBroken).toBe(false);
      expect(linked.categoryId).toBe('cat1');
    });
  });

  describe('createPlan', () => {
    it('inserts a plan and returns the mapped object', async () => {
      const result = await BudgetPlansDB.createPlan({
        id: 'plan1', month: '2026-07', currency: 'USD', expectedIncome: '445000',
      });

      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO budget_plans'),
        expect.arrayContaining(['plan1', '2026-07', 'USD', '445000']),
      );
      expect(result).toMatchObject({ id: 'plan1', month: '2026-07', currency: 'USD', expectedIncome: '445000' });
    });

    it('defaults expected_income to "0" when omitted', async () => {
      await BudgetPlansDB.createPlan({ id: 'plan1', month: '2026-07', currency: 'USD' });
      expect(executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['0']),
      );
    });

    it('generates an id when none is provided', async () => {
      const result = await BudgetPlansDB.createPlan({ month: '2026-07', currency: 'USD' });
      expect(result.id).toBe('uuid-1');
    });

    it('throws on invalid data before touching the DB', async () => {
      await expect(BudgetPlansDB.createPlan({ currency: 'USD' }))
        .rejects.toThrow('A valid month (YYYY-MM) is required');
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('throws when a plan already exists for the month', async () => {
      queryFirst.mockResolvedValue({ id: 'existing', month: '2026-07', currency: 'USD', expected_income: '0' });
      await expect(BudgetPlansDB.createPlan({ month: '2026-07', currency: 'USD' }))
        .rejects.toThrow('A plan for this month already exists');
      expect(executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('read queries', () => {
    it('getPlanByMonth maps the row', async () => {
      queryFirst.mockResolvedValue({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '10' });
      const plan = await BudgetPlansDB.getPlanByMonth('2026-07');
      expect(queryFirst).toHaveBeenCalledWith('SELECT * FROM budget_plans WHERE month = ?', ['2026-07']);
      expect(plan.expectedIncome).toBe('10');
    });

    it('getPlanById returns null when not found', async () => {
      queryFirst.mockResolvedValue(null);
      expect(await BudgetPlansDB.getPlanById('nope')).toBeNull();
    });

    it('getAllPlans maps all rows newest-month-first', async () => {
      queryAll.mockResolvedValue([
        { id: 'p2', month: '2026-08', currency: 'USD', expected_income: '0' },
        { id: 'p1', month: '2026-07', currency: 'USD', expected_income: '0' },
      ]);
      const plans = await BudgetPlansDB.getAllPlans();
      expect(queryAll).toHaveBeenCalledWith('SELECT * FROM budget_plans ORDER BY month DESC');
      expect(plans).toHaveLength(2);
      expect(plans[0].month).toBe('2026-08');
    });

    it('getAllPlans handles an empty result', async () => {
      queryAll.mockResolvedValue([]);
      expect(await BudgetPlansDB.getAllPlans()).toEqual([]);
    });
  });

  describe('updatePlan', () => {
    it('builds a dynamic UPDATE for provided fields', async () => {
      await BudgetPlansDB.updatePlan('p1', { currency: 'EUR', expectedIncome: '500' });
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE budget_plans SET'),
        expect.arrayContaining(['EUR', '500', 'p1']),
      );
    });

    it('does nothing when no fields are provided', async () => {
      await BudgetPlansDB.updatePlan('p1', {});
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('rejects an invalid month', async () => {
      await expect(BudgetPlansDB.updatePlan('p1', { month: 'bad' }))
        .rejects.toThrow('A valid month (YYYY-MM) is required');
    });

    it('rejects a negative expectedIncome', async () => {
      await expect(BudgetPlansDB.updatePlan('p1', { expectedIncome: '-5' }))
        .rejects.toThrow('Expected income must be a non-negative number');
    });
  });

  describe('deletePlan', () => {
    it('deletes the plan (lines cascade at the DB level)', async () => {
      await BudgetPlansDB.deletePlan('p1');
      expect(executeQuery).toHaveBeenCalledWith('DELETE FROM budget_plans WHERE id = ?', ['p1']);
    });
  });

  describe('lines', () => {
    it('getPlanLines maps ordered rows', async () => {
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '100', category_id: 'c1', to_account_id: null, sort_order: 0 },
      ]);
      const lines = await BudgetPlansDB.getPlanLines('p1');
      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE plan_id = ? ORDER BY sort_order ASC'),
        ['p1'],
      );
      expect(lines[0].categoryId).toBe('c1');
    });

    it('getBrokenLines queries lines with both targets null', async () => {
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '100', category_id: null, to_account_id: null, sort_order: 0 },
      ]);
      const broken = await BudgetPlansDB.getBrokenLines('p1');
      expect(queryAll).toHaveBeenCalledWith(
        expect.stringContaining('category_id IS NULL AND to_account_id IS NULL'),
        ['p1'],
      );
      expect(broken[0].isBroken).toBe(true);
    });

    it('addLine inserts a valid line and returns it', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '73000', categoryId: 'c1', label: 'Rent' });
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO budget_plan_lines'),
        expect.arrayContaining(['p1', 'Rent', '73000', 'c1']),
      );
      expect(line).toMatchObject({ planId: 'p1', amount: '73000', categoryId: 'c1', toAccountId: null, sortOrder: 0 });
      expect(line.id).toBe('uuid-1');
    });

    it('addLine rejects an invalid (dual-target) line', async () => {
      await expect(BudgetPlansDB.addLine('p1', { amount: '10', categoryId: 'c1', toAccountId: 2 }))
        .rejects.toThrow('not both');
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('updateLine builds a dynamic UPDATE', async () => {
      await BudgetPlansDB.updateLine('l1', { amount: '200', comment: 'x' });
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE budget_plan_lines SET'),
        expect.arrayContaining(['200', 'x', 'l1']),
      );
    });

    it('updateLine rejects setting both targets at once', async () => {
      await expect(BudgetPlansDB.updateLine('l1', { categoryId: 'c1', toAccountId: 2 }))
        .rejects.toThrow('not both');
    });

    it('updateLine clears the account link when a category is (re)assigned', async () => {
      await BudgetPlansDB.updateLine('l1', { categoryId: 'c9' });
      const [sql, params] = executeQuery.mock.calls[0];
      expect(sql).toContain('category_id = ?');
      expect(sql).toContain('to_account_id = ?');
      // c9 written for category, null written for the (implicitly cleared) account.
      expect(params).toEqual(expect.arrayContaining(['c9', null, 'l1']));
    });

    it('updateLine clears the category link when an account is (re)assigned', async () => {
      await BudgetPlansDB.updateLine('l1', { toAccountId: 7 });
      const [sql, params] = executeQuery.mock.calls[0];
      expect(sql).toContain('to_account_id = ?');
      expect(sql).toContain('category_id = ?');
      expect(params).toEqual(expect.arrayContaining([7, null, 'l1']));
    });

    it('updateLine rejects a non-positive amount', async () => {
      await expect(BudgetPlansDB.updateLine('l1', { amount: '0' }))
        .rejects.toThrow('Amount must be greater than zero');
    });

    it('updateLine does nothing when no fields are provided', async () => {
      await BudgetPlansDB.updateLine('l1', {});
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it('deleteLine deletes by id', async () => {
      await BudgetPlansDB.deleteLine('l1');
      expect(executeQuery).toHaveBeenCalledWith('DELETE FROM budget_plan_lines WHERE id = ?', ['l1']);
    });

    it('reorderLines updates sort_order in a transaction', async () => {
      await BudgetPlansDB.reorderLines('p1', ['l3', 'l1', 'l2']);
      expect(executeTransaction).toHaveBeenCalled();
      expect(mockRunAsync).toHaveBeenCalledTimes(3);
      expect(mockRunAsync).toHaveBeenNthCalledWith(1, expect.any(String), [0, expect.any(String), 'l3', 'p1']);
      expect(mockRunAsync).toHaveBeenNthCalledWith(2, expect.any(String), [1, expect.any(String), 'l1', 'p1']);
    });

    it('reorderLines rejects duplicate ids', async () => {
      await expect(BudgetPlansDB.reorderLines('p1', ['l1', 'l1']))
        .rejects.toThrow('Duplicate line ID');
    });

    it('reorderLines rejects a missing id', async () => {
      await expect(BudgetPlansDB.reorderLines('p1', ['l1', null]))
        .rejects.toThrow('missing id');
    });
  });

  describe('getPlanTotals', () => {
    it('computes expectedIncome, allocated, and a positive remainder', async () => {
      queryFirst.mockResolvedValue({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '445000' });
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '430000', category_id: 'c1', to_account_id: null, sort_order: 0 },
      ]);

      const totals = await BudgetPlansDB.getPlanTotals('p1');
      expect(totals).toEqual({ expectedIncome: '445000.00', allocated: '430000.00', remainder: '15000.00' });
    });

    it('returns a negative remainder when over-allocated', async () => {
      queryFirst.mockResolvedValue({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '100' });
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '60', category_id: 'c1', to_account_id: null, sort_order: 0 },
        { id: 'l2', plan_id: 'p1', amount: '90', category_id: null, to_account_id: 3, sort_order: 1 },
      ]);

      const totals = await BudgetPlansDB.getPlanTotals('p1');
      expect(totals.allocated).toBe('150.00');
      expect(totals.remainder).toBe('-50.00');
    });

    it('throws when the plan does not exist', async () => {
      queryFirst.mockResolvedValue(null);
      await expect(BudgetPlansDB.getPlanTotals('nope')).rejects.toThrow('not found');
    });
  });

  describe('copyPlan', () => {
    it('clones a plan and its lines into a new month', async () => {
      queryFirst
        .mockResolvedValueOnce({ id: 'src', month: '2026-06', currency: 'USD', expected_income: '445000' }) // fromMonth
        .mockResolvedValueOnce(null); // toMonth free
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'src', label: 'Rent', amount: '65000', comment: null, category_id: 'c1', to_account_id: null, sort_order: 0 },
        { id: 'l2', plan_id: 'src', label: 'Savings', amount: '50000', comment: null, category_id: null, to_account_id: 4, sort_order: 1 },
      ]);

      const created = await BudgetPlansDB.copyPlan('2026-06', '2026-07');

      expect(created).toMatchObject({ month: '2026-07', currency: 'USD', expectedIncome: '445000' });
      // 1 plan insert + 2 line inserts.
      expect(mockRunAsync).toHaveBeenCalledTimes(3);
      expect(mockRunAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO budget_plans'),
        expect.arrayContaining(['2026-07', 'USD', '445000']),
      );
    });

    it('throws when the source month has no plan', async () => {
      queryFirst.mockResolvedValue(null);
      await expect(BudgetPlansDB.copyPlan('2026-06', '2026-07')).rejects.toThrow('No budget plan found');
    });

    it('throws when the target month already has a plan', async () => {
      queryFirst
        .mockResolvedValueOnce({ id: 'src', month: '2026-06', currency: 'USD', expected_income: '0' })
        .mockResolvedValueOnce({ id: 'dst', month: '2026-07', currency: 'USD', expected_income: '0' });
      await expect(BudgetPlansDB.copyPlan('2026-06', '2026-07')).rejects.toThrow('already exists');
    });

    it('rejects an invalid target month', async () => {
      await expect(BudgetPlansDB.copyPlan('2026-06', 'bad')).rejects.toThrow('A valid month (YYYY-MM) is required');
    });
  });

  describe('error propagation', () => {
    it('propagates DB errors from getAllPlans', async () => {
      queryAll.mockRejectedValue(new Error('DB down'));
      await expect(BudgetPlansDB.getAllPlans()).rejects.toThrow('DB down');
    });

    it('propagates DB errors from createPlan insert', async () => {
      executeQuery.mockRejectedValue(new Error('insert failed'));
      await expect(BudgetPlansDB.createPlan({ month: '2026-07', currency: 'USD' }))
        .rejects.toThrow('insert failed');
    });
  });
});
