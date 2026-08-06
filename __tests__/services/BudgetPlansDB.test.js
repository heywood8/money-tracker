/**
 * Tests for BudgetPlansDB — Budgets v2 (monthly income-allocation plans).
 * Covers validation (incl. the exactly-one-target invariant), CRUD for plans and
 * lines, totals (incl. negative remainder), copyPlan, reorder, and the broken-line
 * state produced by ON DELETE SET NULL.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import { fetchRatesToTarget, convertWithRateMap, createOperationInTx } from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
// Only the two rate helpers updateLine's currency-conversion invariant needs
// (Fix 1, adversarial review round 2) — the rest of OperationsDB is exercised
// via BudgetPlansDB.status.test.js, not here.
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
  getTransferTotals: jest.fn(),
  getUnconvertibleCurrencies: jest.fn(),
  // Budgets v3 phase 3: executing a line inserts a real operation in the same
  // transaction (the old PlannedOperationsDB.executeAndMark path).
  createOperationInTx: jest.fn(async () => ({ id: 77 })),
}));

// Predictable UUIDs.
let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

let mockRunAsync;

// Deterministic stand-in for the rate helpers, same contract as
// BudgetPlansDB.status.test.js's stubRates: a fixed single-pair rate map and a
// plain multiply; an unmapped `from` currency converts to null (no rate).
const stubRates = (from, to, rate) => {
  fetchRatesToTarget.mockResolvedValue(new Map([[from, rate]]));
  convertWithRateMap.mockImplementation((amount, f, t, map) => {
    if (f === t) return amount;
    const r = map.get(f);
    if (!r) return null;
    return String(parseFloat(amount) * parseFloat(r));
  });
};

describe('BudgetPlansDB', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;

    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    fetchRatesToTarget.mockResolvedValue(new Map());
    convertWithRateMap.mockImplementation((amount, f, t) => (f === t ? amount : null));

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

    // Migration 0021: the junction column travels with every line SELECT.
    describe('category set (migration 0021)', () => {
      it('splits the GROUP_CONCAT column into categoryIds', () => {
        const line = BudgetPlansDB.mapLineFields({
          id: 'l1', amount: '100', category_id: 'cat1', category_ids: 'cat1,cat2', to_account_id: null,
        });
        expect(line.categoryIds).toEqual(['cat1', 'cat2']);
        expect(line.categoryId).toBe('cat1');
        expect(line.isBroken).toBe(false);
      });

      it('falls back to the single category_id when the row has no junction column', () => {
        const line = BudgetPlansDB.mapLineFields({ id: 'l1', amount: '100', category_id: 'cat1' });
        expect(line.categoryIds).toEqual(['cat1']);
      });

      it('re-heads the set when the stored primary category is gone', () => {
        // ON DELETE SET NULL nulls category_id, but the line still tracks cat2 —
        // reporting it as broken would silently stop counting real spending.
        const line = BudgetPlansDB.mapLineFields({
          id: 'l1', amount: '100', category_id: null, category_ids: 'cat2', to_account_id: null,
        });
        expect(line.categoryId).toBe('cat2');
        expect(line.categoryIds).toEqual(['cat2']);
        expect(line.isBroken).toBe(false);
      });

      it('is broken only when the junction is empty and no account is linked', () => {
        const line = BudgetPlansDB.mapLineFields({
          id: 'l1', amount: '100', category_id: 'stale-cat', category_ids: null, to_account_id: null,
        });
        expect(line.categoryIds).toEqual([]);
        expect(line.categoryId).toBeNull();
        expect(line.isBroken).toBe(true);
      });

      it('does not surface include_children — descendants always roll up', () => {
        expect(BudgetPlansDB.mapLineFields({ id: 'l1', amount: '1' })).not.toHaveProperty('includeChildren');
        expect(BudgetPlansDB.mapLineFields({ id: 'l1', amount: '1', include_children: 0 }))
          .not.toHaveProperty('includeChildren');
      });
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

    describe('concurrent createPlan race for the same month (adversarial review, Bug 4)', () => {
      // A double-tap Save that lazily creates a plan (MonthlyPlanSection's
      // ensurePlan) can fire createPlan twice before either commits: both calls
      // pass the getPlanByMonth pre-check above (neither sees the other yet),
      // then race at the UNIQUE(budget_plans.month) constraint on INSERT. The
      // loser must recover gracefully instead of surfacing a raw constraint error.
      it('returns the winning plan instead of throwing when the INSERT hits the UNIQUE(month) constraint', async () => {
        queryFirst
          .mockResolvedValueOnce(null) // pre-check: no plan yet (this call "wins" the check)
          .mockResolvedValueOnce({
            id: 'winner', month: '2026-07', currency: 'USD', expected_income: '0',
            created_at: 't1', updated_at: 't1',
          }); // post-race recovery lookup finds the plan the OTHER call created
        executeQuery.mockRejectedValueOnce(new Error('UNIQUE constraint failed: budget_plans.month'));

        const result = await BudgetPlansDB.createPlan({ month: '2026-07', currency: 'USD' });

        expect(result).toMatchObject({ id: 'winner', month: '2026-07', currency: 'USD' });
      });

      it('still throws a non-UNIQUE-constraint insert error', async () => {
        queryFirst.mockResolvedValueOnce(null);
        executeQuery.mockRejectedValueOnce(new Error('disk I/O error'));
        await expect(BudgetPlansDB.createPlan({ month: '2026-07', currency: 'USD' }))
          .rejects.toThrow('disk I/O error');
      });

      it('re-throws the UNIQUE-constraint error if the recovery lookup somehow finds nothing', async () => {
        queryFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null); // recovery lookup found nothing — genuinely unexplained
        executeQuery.mockRejectedValueOnce(new Error('UNIQUE constraint failed: budget_plans.month'));

        await expect(BudgetPlansDB.createPlan({ month: '2026-07', currency: 'USD' }))
          .rejects.toThrow('UNIQUE constraint failed: budget_plans.month');
      });
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
        expect.stringContaining('WHERE l.plan_id = ? ORDER BY l.sort_order ASC'),
        ['p1'],
      );
      expect(lines[0].categoryId).toBe('c1');
    });

    it('getBrokenLines asks for lines with no linked category and no account', async () => {
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '100', category_id: null, category_ids: null, to_account_id: null, sort_order: 0 },
      ]);
      const broken = await BudgetPlansDB.getBrokenLines('p1');
      const [sql, params] = queryAll.mock.calls[0];
      // "No category" is the absence of a junction row, not a null category_id:
      // a line whose primary category was deleted may still track others.
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('budget_plan_line_categories');
      expect(sql).toContain('l.to_account_id IS NULL');
      expect(params).toEqual(['p1']);
      expect(broken[0].isBroken).toBe(true);
    });

    it('addLine inserts a valid line and returns it', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '73000', categoryId: 'c1', label: 'Rent' });
      // Row + category links go in one transaction (migration 0021).
      expect(mockRunAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO budget_plan_lines'),
        expect.arrayContaining(['p1', 'Rent', '73000', 'c1']),
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO budget_plan_line_categories'),
        ['uuid-1', 'c1'],
      );
      expect(line).toMatchObject({
        planId: 'p1', amount: '73000', categoryId: 'c1', categoryIds: ['c1'], toAccountId: null, sortOrder: 0,
      });
      expect(line.id).toBe('uuid-1');
    });

    it('addLine rejects an invalid (dual-target) line', async () => {
      await expect(BudgetPlansDB.addLine('p1', { amount: '10', categoryId: 'c1', toAccountId: 2 }))
        .rejects.toThrow('not both');
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    // Migration 0021: the whole point — one line, several categories.
    it('addLine links every category of a multi-category line', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '500', categoryIds: ['groceries', 'cafes'] });
      const links = mockRunAsync.mock.calls
        .filter(([sql]) => sql.includes('budget_plan_line_categories'))
        .filter(([sql]) => sql.startsWith('INSERT'));
      expect(links.map(([, params]) => params)).toEqual([
        ['uuid-1', 'groceries'],
        ['uuid-1', 'cafes'],
      ]);
      // The row's own category_id keeps the primary (first) one.
      const [, insertParams] = mockRunAsync.mock.calls[0];
      expect(insertParams).toEqual(expect.arrayContaining(['groceries']));
      expect(line).toMatchObject({ categoryId: 'groceries', categoryIds: ['groceries', 'cafes'] });
    });

    it('addLine de-duplicates repeated category IDs', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '500', categoryIds: ['c1', 'c1', 'c2'] });
      expect(line.categoryIds).toEqual(['c1', 'c2']);
    });

    it('addLine always stores include_children on, even when a caller asks for off', async () => {
      await BudgetPlansDB.addLine('p1', { amount: '10', categoryId: 'c1', includeChildren: false });
      const [sql, params] = mockRunAsync.mock.calls.find(([s]) => s.includes('INSERT INTO budget_plan_lines'));
      expect(sql).toContain('include_children');
      // Read the position out of the statement's own column list rather than
      // counting from the end: the insert has grown a column three times now,
      // and each time this assertion silently started checking a different one.
      const columns = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map(c => c.trim());
      expect(params[columns.indexOf('include_children')]).toBe(1);
    });

    // Bug 10 (adversarial review): addLine/addRecurringLine share one insertPlanLine
    // implementation now (planId === null ⇒ recurring). These lock in that the
    // merge preserved each function's distinct behavior.
    describe('addRecurringLine (shares insertPlanLine with addLine)', () => {
      it('inserts a recurring line with plan_id NULL and is_recurring=1', async () => {
        const line = await BudgetPlansDB.addRecurringLine({ amount: '65000', categoryId: 'cat1', currency: 'EUR', label: 'Rent' });
        expect(mockRunAsync).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('INSERT INTO budget_plan_lines'),
          expect.arrayContaining([null, 'Rent', '65000', 'cat1', 1, 'EUR']),
        );
        expect(line).toMatchObject({ planId: null, isRecurring: true, currency: 'EUR', amount: '65000' });
      });

      it('requires a currency', async () => {
        await expect(BudgetPlansDB.addRecurringLine({ amount: '100', categoryId: 'c1' }))
          .rejects.toThrow('Currency is required for a recurring allocation');
        expect(mockRunAsync).not.toHaveBeenCalled();
      });

      it('still enforces the exactly-one-target invariant', async () => {
        await expect(BudgetPlansDB.addRecurringLine({ amount: '100', categoryId: 'c1', toAccountId: 2, currency: 'USD' }))
          .rejects.toThrow('not both');
        expect(mockRunAsync).not.toHaveBeenCalled();
      });
    });

    // Since migration 0020 a one-off line MAY carry its own currency (an
    // executable template is priced in its account's currency), so addLine
    // stores what it is given...
    it('addLine keeps a one-off line currency when one is given', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '10', categoryId: 'c1', currency: 'EUR' });
      const [, params] = mockRunAsync.mock.calls[0];
      expect(params).toContain('EUR');
      expect(line).toMatchObject({ isRecurring: false, currency: 'EUR' });
    });

    // ...and null when it is not, which still means "inherit the plan's currency".
    it('addLine writes currency NULL when the line carries none', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '10', categoryId: 'c1' });
      expect(line).toMatchObject({ isRecurring: false, currency: null });
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
      // A category change rewrites the junction, so the UPDATE runs inside the
      // same transaction as the link rewrite rather than as a bare executeQuery.
      const [sql, params] = mockRunAsync.mock.calls[0];
      expect(sql).toContain('category_id = ?');
      expect(sql).toContain('to_account_id = ?');
      // c9 written for category, null written for the (implicitly cleared) account.
      expect(params).toEqual(expect.arrayContaining(['c9', null, 'l1']));
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM budget_plan_line_categories'),
        ['l1'],
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO budget_plan_line_categories'),
        ['l1', 'c9'],
      );
    });

    it('updateLine replaces the whole category set when given categoryIds', async () => {
      await BudgetPlansDB.updateLine('l1', { categoryIds: ['a', 'b'] });
      const links = mockRunAsync.mock.calls.filter(([sql]) => sql.includes('budget_plan_line_categories'));
      expect(links[0][0]).toContain('DELETE');
      expect(links.slice(1).map(([, p]) => p)).toEqual([['l1', 'a'], ['l1', 'b']]);
      // The primary column follows the head of the set.
      expect(mockRunAsync.mock.calls[0][1]).toEqual(expect.arrayContaining(['a']));
    });

    it('updateLine unlinks every category when given an empty set', async () => {
      await BudgetPlansDB.updateLine('l1', { categoryIds: [] });
      const [sql, params] = mockRunAsync.mock.calls[0];
      expect(sql).toContain('category_id = ?');
      expect(params).toEqual(expect.arrayContaining([null, 'l1']));
      const inserts = mockRunAsync.mock.calls
        .filter(([s]) => s.includes('INSERT OR IGNORE INTO budget_plan_line_categories'));
      expect(inserts).toHaveLength(0);
    });

    it('updateLine leaves the links alone when categories are not mentioned', async () => {
      await BudgetPlansDB.updateLine('l1', { amount: '200' });
      expect(executeQuery).toHaveBeenCalled();
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it('updateLine ignores an includeChildren update — the flag is gone', async () => {
      await BudgetPlansDB.updateLine('l1', { amount: '200', includeChildren: false });
      const [sql] = executeQuery.mock.calls[0];
      expect(sql).not.toContain('include_children');
    });

    it('updateLine clears the category link when an account is (re)assigned', async () => {
      await BudgetPlansDB.updateLine('l1', { toAccountId: 7 });
      const [sql, params] = mockRunAsync.mock.calls[0];
      expect(sql).toContain('to_account_id = ?');
      expect(sql).toContain('category_id = ?');
      expect(params).toEqual(expect.arrayContaining([7, null, 'l1']));
      // ...and drops the whole category set, not just the primary column.
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM budget_plan_line_categories'),
        ['l1'],
      );
    });

    it('updateLine rejects a non-positive amount', async () => {
      await expect(BudgetPlansDB.updateLine('l1', { amount: '0' }))
        .rejects.toThrow('Amount must be greater than zero');
    });

    it('updateLine does nothing when no fields are provided', async () => {
      await BudgetPlansDB.updateLine('l1', {});
      expect(executeQuery).not.toHaveBeenCalled();
    });

    // Fix 1 (adversarial review round 2, main money-corrupting bug): the
    // conversion invariant used to live ONLY in MonthlyPlanSection's save
    // handler, and only fired when the recurring<->one-off scope toggle
    // changed — a user opening a recurring 250 EUR line, changing ONLY the
    // currency chip to USD (no scope change) and saving persisted a raw 250
    // USD (same digits, wrong value). It now lives here, in updateLine itself,
    // so every caller is covered — not just the one that remembers to convert.
    describe('currency-conversion invariant (Fix 1, adversarial review round 2)', () => {
      it('converts a recurring line\'s amount on a direct currency-chip edit (no scope change)', async () => {
        queryFirst.mockResolvedValueOnce({
          id: 'l1', plan_id: null, is_recurring: 1, currency: 'EUR', amount: '250',
        });
        stubRates('EUR', 'USD', '1.1');

        await BudgetPlansDB.updateLine('l1', { currency: 'USD', amount: '250' });

        expect(fetchRatesToTarget).toHaveBeenCalledWith(['EUR'], 'USD');
        const [sql, params] = executeQuery.mock.calls[0];
        expect(sql).toContain('currency = ?');
        expect(sql).toContain('amount = ?');
        expect(params).toEqual(expect.arrayContaining(['USD', '275', 'l1']));
      });

      it('converts using the row\'s stored amount when the caller does not pass amount at all', async () => {
        // The previously-missed sibling path in miniature: a currency-only
        // update with no `amount` key present in `updates` at all — still must
        // not leave the row silently mismatched (old amount, new currency).
        queryFirst.mockResolvedValueOnce({
          id: 'l1', plan_id: null, is_recurring: 1, currency: 'EUR', amount: '250',
        });
        stubRates('EUR', 'USD', '1.1');

        await BudgetPlansDB.updateLine('l1', { currency: 'USD' });

        expect(fetchRatesToTarget).toHaveBeenCalledWith(['EUR'], 'USD');
        const [, params] = executeQuery.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining(['USD', '275', 'l1']));
      });

      it('throws and does not persist a direct currency edit when no exchange rate is available', async () => {
        queryFirst.mockResolvedValueOnce({
          id: 'l1', plan_id: null, is_recurring: 1, currency: 'EUR', amount: '250',
        });
        // No rate available (default beforeEach stub: same-currency passthrough only).

        await expect(BudgetPlansDB.updateLine('l1', { currency: 'USD', amount: '250' }))
          .rejects.toThrow('exchange_rate_unavailable');
        expect(executeQuery).not.toHaveBeenCalled();
      });

      it('is a no-op conversion when the currency does not actually change', async () => {
        queryFirst.mockResolvedValueOnce({
          id: 'l1', plan_id: null, is_recurring: 1, currency: 'USD', amount: '250',
        });

        await BudgetPlansDB.updateLine('l1', { currency: 'USD', amount: '300' });

        expect(fetchRatesToTarget).not.toHaveBeenCalled();
        const [, params] = executeQuery.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining(['USD', '300', 'l1']));
      });

      it('converts the amount when scope changes from recurring to one-off', async () => {
        queryFirst
          .mockResolvedValueOnce({ id: 'l1', plan_id: null, is_recurring: 1, currency: 'EUR', amount: '250' }) // the line
          .mockResolvedValueOnce({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '0' }); // target plan
        stubRates('EUR', 'USD', '1.1');

        await BudgetPlansDB.updateLine('l1', { isRecurring: false, planId: 'p1', amount: '250' });

        expect(fetchRatesToTarget).toHaveBeenCalledWith(['EUR'], 'USD');
        const [, params] = executeQuery.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining([0, 'p1', null, '275', 'l1']));
      });

      it('converts the amount when scope changes from one-off to recurring', async () => {
        queryFirst
          .mockResolvedValueOnce({ id: 'l1', plan_id: 'p1', is_recurring: 0, currency: null, amount: '100' }) // the line
          .mockResolvedValueOnce({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '0' }); // current plan
        stubRates('USD', 'EUR', '0.9');

        await BudgetPlansDB.updateLine('l1', { isRecurring: true, currency: 'EUR', amount: '100' });

        expect(fetchRatesToTarget).toHaveBeenCalledWith(['USD'], 'EUR');
        const [, params] = executeQuery.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining([1, null, 'EUR', '90', 'l1']));
      });

      it('throws and does not persist a scope change when no exchange rate is available', async () => {
        queryFirst
          .mockResolvedValueOnce({ id: 'l1', plan_id: null, is_recurring: 1, currency: 'EUR', amount: '250' })
          .mockResolvedValueOnce({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '0' });
        // No rate available (default beforeEach stub).

        await expect(BudgetPlansDB.updateLine('l1', { isRecurring: false, planId: 'p1', amount: '250' }))
          .rejects.toThrow('exchange_rate_unavailable');
        expect(executeQuery).not.toHaveBeenCalled();
      });

      it('throws when the line being updated does not exist', async () => {
        queryFirst.mockResolvedValueOnce(null);
        await expect(BudgetPlansDB.updateLine('nope', { currency: 'USD' }))
          .rejects.toThrow('not found');
      });
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

    // Bug 10 (adversarial review): reorderLines/reorderRecurringLines share one
    // reorderPlanLines implementation now (planId === null ⇒ recurring, scoped by
    // `is_recurring = 1` instead of `plan_id = ?`).
    describe('reorderRecurringLines (shares reorderPlanLines with reorderLines)', () => {
      it('updates sort_order scoped by is_recurring, with no plan_id param', async () => {
        await BudgetPlansDB.reorderRecurringLines(['l-rec-2', 'l-rec-1']);
        expect(executeTransaction).toHaveBeenCalled();
        expect(mockRunAsync).toHaveBeenCalledTimes(2);
        expect(mockRunAsync).toHaveBeenNthCalledWith(1, expect.any(String), [0, expect.any(String), 'l-rec-2']);
        expect(mockRunAsync).toHaveBeenNthCalledWith(2, expect.any(String), [1, expect.any(String), 'l-rec-1']);
        const [sql] = mockRunAsync.mock.calls[0];
        expect(sql).toContain('is_recurring = 1');
        expect(sql).not.toContain('plan_id');
      });

      it('rejects duplicate ids', async () => {
        await expect(BudgetPlansDB.reorderRecurringLines(['l1', 'l1']))
          .rejects.toThrow('Duplicate line ID');
      });

      it('rejects a missing id', async () => {
        await expect(BudgetPlansDB.reorderRecurringLines(['l1', null]))
          .rejects.toThrow('missing id');
      });
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
        { id: 'l1', plan_id: 'src', label: 'Rent', amount: '65000', comment: null, category_id: 'c1', category_ids: 'c1,c2', to_account_id: null, sort_order: 0 },
        { id: 'l2', plan_id: 'src', label: 'Savings', amount: '50000', comment: null, category_id: null, category_ids: null, to_account_id: 4, sort_order: 1 },
      ]);

      const created = await BudgetPlansDB.copyPlan('2026-06', '2026-07');

      expect(created).toMatchObject({ month: '2026-07', currency: 'USD', expectedIncome: '445000' });
      expect(mockRunAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO budget_plans'),
        expect.arrayContaining(['2026-07', 'USD', '445000']),
      );
      // A clone tracks the same SET of categories, not just the primary one the
      // row's column carries.
      const linkInserts = mockRunAsync.mock.calls
        .filter(([sql]) => sql.startsWith('INSERT OR IGNORE INTO budget_plan_line_categories'))
        .map(([, params]) => params[1]);
      expect(linkInserts).toEqual(['c1', 'c2']);
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

    // Fix 4 (adversarial review round 2): createPlan already recovered from a
    // double-tap UNIQUE(month) race; copyPlan (handleCopyLast double-tapped)
    // had the identical race but no recovery, so the loser threw a raw
    // constraint error instead of getting the plan back. Both now share the
    // same isUniqueMonthViolation recovery helper.
    describe('UNIQUE(month) race recovery (Fix 4, adversarial review round 2)', () => {
      it('returns the winning plan instead of throwing when the transaction INSERT hits the UNIQUE(month) constraint', async () => {
        queryFirst
          .mockResolvedValueOnce({ id: 'src', month: '2026-06', currency: 'USD', expected_income: '445000' }) // fromMonth
          .mockResolvedValueOnce(null) // toMonth pre-check: free (this call "wins" the check)
          .mockResolvedValueOnce({
            id: 'winner', month: '2026-07', currency: 'USD', expected_income: '445000',
          }); // recovery lookup after the loser's transaction fails
        queryAll.mockResolvedValue([]); // no lines, keep the race scenario minimal
        mockRunAsync.mockRejectedValueOnce(new Error('UNIQUE constraint failed: budget_plans.month'));

        const plan = await BudgetPlansDB.copyPlan('2026-06', '2026-07');
        expect(plan).toMatchObject({ id: 'winner', month: '2026-07' });
      });

      it('re-throws a non-UNIQUE-constraint transaction error', async () => {
        queryFirst
          .mockResolvedValueOnce({ id: 'src', month: '2026-06', currency: 'USD', expected_income: '0' })
          .mockResolvedValueOnce(null);
        queryAll.mockResolvedValue([]);
        mockRunAsync.mockRejectedValueOnce(new Error('disk I/O error'));

        await expect(BudgetPlansDB.copyPlan('2026-06', '2026-07')).rejects.toThrow('disk I/O error');
      });

      it('re-throws the UNIQUE-constraint error if the recovery lookup somehow finds nothing', async () => {
        queryFirst
          .mockResolvedValueOnce({ id: 'src', month: '2026-06', currency: 'USD', expected_income: '0' })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null); // recovery lookup found nothing — genuinely unexplained
        queryAll.mockResolvedValue([]);
        mockRunAsync.mockRejectedValueOnce(new Error('UNIQUE constraint failed: budget_plans.month'));

        await expect(BudgetPlansDB.copyPlan('2026-06', '2026-07'))
          .rejects.toThrow('UNIQUE constraint failed: budget_plans.month');
      });
    });

    // Regression: copyPlan used to skip any line stamped `last_executed_month`,
    // left over from when a line could be executed as a one-tap operation. That
    // feature is gone (operations come from notifications now), so a stamp is
    // just stale data on a budget target and must not silently drop the target
    // out of next month's plan.
    describe('lines with a stale execution stamp are still copied', () => {
      const stampedFridge = {
        id: 'l-fridge', plan_id: 'src', label: 'Buy fridge', amount: '50000', comment: null,
        category_id: 'c9', to_account_id: null, sort_order: 1, account_id: 'a1',
        last_executed_month: '2026-06',
      };
      const rent = {
        id: 'l-rent', plan_id: 'src', label: 'Rent', amount: '65000', comment: null,
        category_id: 'c1', to_account_id: null, sort_order: 0, account_id: null,
        last_executed_month: null,
      };

      const arrangeCopy = (lines) => {
        queryFirst
          .mockResolvedValueOnce({ id: 'src', month: '2026-06', currency: 'USD', expected_income: '445000' })
          .mockResolvedValueOnce(null);
        queryAll.mockResolvedValue(lines);
      };

      it('copies every one-off line of the source month, stamped or not', async () => {
        arrangeCopy([rent, stampedFridge]);

        await BudgetPlansDB.copyPlan('2026-06', '2026-07');

        const lineInserts = mockRunAsync.mock.calls
          .filter(([sql]) => sql.includes('INSERT INTO budget_plan_lines'));
        expect(lineInserts).toHaveLength(2);
        expect(lineInserts[0][1]).toContain('Rent');
        expect(lineInserts[1][1]).toContain('Buy fridge');
      });

      // The retired columns are no longer written at all, so a clone cannot
      // inherit a stamp (or an execution account) from the row it came from.
      it('writes neither account_id nor last_executed_month on the clone', async () => {
        arrangeCopy([stampedFridge]);

        await BudgetPlansDB.copyPlan('2026-06', '2026-07');

        const [sql, params] = mockRunAsync.mock.calls
          .find(([statement]) => statement.includes('INSERT INTO budget_plan_lines'));
        expect(sql).not.toContain(', account_id');
        expect(sql).not.toContain('last_executed_month');
        expect(params).not.toContain('a1');
        expect(params).not.toContain('2026-06');
      });
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

  describe('convertBudgetAmountToMonthly (Budgets v3 phase 2 — weekly/yearly -> monthly)', () => {
    it('leaves a monthly amount unchanged (just reformatted)', () => {
      expect(BudgetPlansDB.convertBudgetAmountToMonthly('65000', 'monthly', 'USD')).toBe('65000.00');
    });

    it('converts a weekly amount to its monthly equivalent (x365/84)', () => {
      // 700 * 365 / 84 = 3041.666... -> rounds to 2 decimals
      expect(BudgetPlansDB.convertBudgetAmountToMonthly('700', 'weekly', 'USD')).toBe('3041.67');
    });

    it('converts a yearly amount to its monthly equivalent (/12)', () => {
      expect(BudgetPlansDB.convertBudgetAmountToMonthly('1200', 'yearly', 'USD')).toBe('100.00');
    });

    it('defaults to treating an unrecognized period type as monthly', () => {
      expect(BudgetPlansDB.convertBudgetAmountToMonthly('500', 'bogus', 'USD')).toBe('500.00');
    });
  });

  describe('migrateLegacyBudgetsToRecurringLines (Budgets v3 phase 2 bridge)', () => {
    const makeBridgeDb = ({ flagSet = false, budgetRows = [] } = {}) => ({
      getFirstAsync: jest.fn().mockResolvedValue(flagSet ? { value: 'true' } : null),
      getAllAsync: jest.fn().mockResolvedValue(budgetRows),
      runAsync: jest.fn().mockResolvedValue(undefined),
    });

    it('is a no-op when the completion flag is already set', async () => {
      const db = makeBridgeDb({ flagSet: true, budgetRows: [{ id: 'b1', category_id: 'c1', amount: '100', currency: 'USD', period_type: 'monthly' }] });
      const result = await BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(db);
      expect(result).toEqual({ migrated: 0, skipped: true });
      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('inserts one recurring line per legacy budget and sets the completion flag', async () => {
      const db = makeBridgeDb({
        budgetRows: [
          { id: 'b1', category_id: 'c1', amount: '100', currency: 'USD', period_type: 'monthly' },
          { id: 'b2', category_id: 'c2', amount: '700', currency: 'USD', period_type: 'weekly' },
        ],
      });
      const result = await BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(db);
      expect(result).toEqual({ migrated: 2, skipped: false });

      const lineInserts = db.runAsync.mock.calls.filter(c => c[0].includes('INSERT INTO budget_plan_lines'));
      expect(lineInserts).toHaveLength(2);
      expect(lineInserts[0][1]).toEqual(['uuid-1', '100.00', 'c1', 'USD', expect.any(String), expect.any(String)]);

      const flagInsert = db.runAsync.mock.calls.find(c => c[0].includes('app_metadata'));
      expect(flagInsert[0]).toContain("'true'"); // the flag value is inlined in the SQL, not bound
      expect(flagInsert[1][0]).toBe(BudgetPlansDB.BUDGETS_MIGRATION_FLAG_KEY);
    });
  });
  /* ────────────────────────────────────────────────────────────────────────
     Budgets v3 phase 3: line kinds + income lines
     ──────────────────────────────────────────────────────────────────────── */

  describe('Line kinds (phase 3)', () => {
    it('accepts an income line with no tracking target at all', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '1000', kind: 'income' })).toBeNull();
    });

    it('accepts an income line with an income category for context', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '1000', kind: 'income', categoryId: 'inc1' })).toBeNull();
    });

    it('rejects an income line linked to a transfer target', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '1000', kind: 'income', toAccountId: 2 }))
        .toBe('An income line cannot link to a transfer target');
    });

    it('rejects a transfer line that only carries a category', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '100', kind: 'transfer', categoryId: 'c1' }))
        .toBe('A transfer line must link to a destination account');
    });

    it('rejects an unknown kind', () => {
      expect(BudgetPlansDB.validatePlanLine({ amount: '100', kind: 'refund', categoryId: 'c1' }))
        .toBe('A line must be an income, expense or transfer');
    });

    it('infers the kind of a legacy row from its target', async () => {
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '10', category_id: 'c1', to_account_id: null, is_recurring: 0 },
        { id: 'l2', plan_id: 'p1', amount: '20', category_id: null, to_account_id: 3, is_recurring: 0 },
      ]);
      const [category, transfer] = await BudgetPlansDB.getPlanLines('p1');
      expect(category.kind).toBe('expense');
      expect(transfer.kind).toBe('transfer');
    });

    // The executable-template feature is retired: the columns survive in the
    // schema so backups round-trip, but a mapped line must not surface them —
    // anything reading `accountId` off a line would be reading a dead field.
    it('does not surface the retired execution-template columns', async () => {
      queryAll.mockResolvedValue([{
        id: 'l1', plan_id: null, amount: '65000', category_id: 'c1', to_account_id: null,
        is_recurring: 1, currency: 'AMD', kind: 'expense', account_id: 4,
        last_executed_month: '2026-07',
      }]);
      const [line] = await BudgetPlansDB.getRecurringLines();
      expect(line).toMatchObject({ kind: 'expense', currency: 'AMD' });
      expect(line).not.toHaveProperty('accountId');
      expect(line).not.toHaveProperty('lastExecutedMonth');
      expect(line).not.toHaveProperty('hasTemplate');
    });

    it('never marks a targetless income line as broken', async () => {
      queryAll.mockResolvedValue([
        { id: 'i1', plan_id: 'p1', amount: '1000', category_id: null, to_account_id: null, is_recurring: 0, kind: 'income' },
        { id: 'l1', plan_id: 'p1', amount: '10', category_id: null, to_account_id: null, is_recurring: 0, kind: 'expense' },
      ]);
      const [income, expense] = await BudgetPlansDB.getPlanLines('p1');
      expect(income.isBroken).toBe(false);
      expect(expense.isBroken).toBe(true);
    });
  });

  describe('Income lines feed the expected income (phase 3)', () => {
    it('sums income lines instead of the stored expected_income, and keeps them out of allocated', async () => {
      queryFirst.mockResolvedValue({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '9999' });
      queryAll.mockResolvedValue([
        { id: 'i1', plan_id: 'p1', amount: '220', category_id: null, to_account_id: null, is_recurring: 0, kind: 'income' },
        { id: 'i2', plan_id: 'p1', amount: '180', category_id: null, to_account_id: null, is_recurring: 0, kind: 'income' },
        { id: 'l1', plan_id: 'p1', amount: '300', category_id: 'c1', to_account_id: null, is_recurring: 0, kind: 'expense' },
      ]);
      const totals = await BudgetPlansDB.getPlanTotals('p1');
      expect(totals.expectedIncome).toBe('400.00');
      expect(totals.allocated).toBe('300.00');
      expect(totals.remainder).toBe('100.00');
    });

    it('falls back to the stored expected_income when the plan has no income line', async () => {
      queryFirst.mockResolvedValue({ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '1000' });
      queryAll.mockResolvedValue([
        { id: 'l1', plan_id: 'p1', amount: '300', category_id: 'c1', to_account_id: null, is_recurring: 0, kind: 'expense' },
      ]);
      const totals = await BudgetPlansDB.getPlanTotals('p1');
      expect(totals.expectedIncome).toBe('1000.00');
    });
  });

  describe('migratePlannedOperationsToLines (phase 3 bridge)', () => {
    const makeDb = ({ flagSet = false, plans = [], accounts = [], planned = [] } = {}) => ({
      getFirstAsync: jest.fn(async (query) => {
        if (query.includes('app_metadata')) return flagSet ? { value: 'true' } : null;
        if (query.includes('FROM budget_plans')) return plans.find(p => p.month) || null;
        return null;
      }),
      getAllAsync: jest.fn(async (query) => {
        if (query.includes('FROM budget_plans')) return plans;
        if (query.includes('FROM accounts')) return accounts;
        if (query.includes('FROM planned_operations')) return planned;
        return [];
      }),
      runAsync: jest.fn(async () => {}),
    });
    const lineInserts = (db) => db.runAsync.mock.calls.filter(c => c[0].includes('INSERT INTO budget_plan_lines'));

    it('is a no-op once the completion flag is set', async () => {
      const db = makeDb({ flagSet: true, planned: [{ id: 'po1', type: 'expense', amount: '10', account_id: 1, is_recurring: 1 }] });
      const result = await BudgetPlansDB.migratePlannedOperationsToLines(db);
      expect(result).toEqual({ migratedTemplates: 0, migratedIncome: 0, skipped: true });
      expect(db.runAsync).not.toHaveBeenCalled();
    });

    it('turns a recurring planned operation into a recurring line with a template', async () => {
      const db = makeDb({
        accounts: [{ id: 1, currency: 'AMD' }],
        planned: [{
          id: 'po1', name: 'Rent', type: 'expense', amount: '65000', account_id: 1,
          category_id: 'cat1', to_account_id: null, description: 'monthly',
          is_recurring: 1, last_executed_month: '2026-07', display_order: 3,
        }],
      });
      const result = await BudgetPlansDB.migratePlannedOperationsToLines(db);
      expect(result.migratedTemplates).toBe(1);
      const [, params] = lineInserts(db)[0];
      // id, plan_id, label, amount, comment, category_id, to_account_id,
      // sort_order, is_recurring, currency, kind, account_id, last_executed_month
      expect(params.slice(1, 13)).toEqual([
        null, 'Rent', '65000', 'monthly', 'cat1', null, 3, 1, 'AMD', 'expense', 1, '2026-07',
      ]);
      // ...and no plan had to be created for a recurring template.
      expect(db.runAsync.mock.calls.some(c => c[0].includes('INSERT INTO budget_plans'))).toBe(false);
    });

    it('scopes a one-time planned operation to the current month, creating that plan if missing', async () => {
      const db = makeDb({
        accounts: [{ id: 1, currency: 'USD' }],
        planned: [{
          id: 'po2', name: 'Insurance', type: 'expense', amount: '500', account_id: 1,
          category_id: 'cat1', to_account_id: null, is_recurring: 0,
        }],
      });
      await BudgetPlansDB.migratePlannedOperationsToLines(db);
      expect(db.runAsync.mock.calls.some(c => c[0].includes('INSERT INTO budget_plans'))).toBe(true);
      const [, params] = lineInserts(db)[0];
      expect(params[1]).not.toBeNull(); // scoped to the created plan
      expect(params[8]).toBe(0); // one-off
    });

    it('bridges a stored expected income into an income line', async () => {
      const db = makeDb({ plans: [{ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '450000' }] });
      const result = await BudgetPlansDB.migratePlannedOperationsToLines(db);
      expect(result.migratedIncome).toBe(1);
      const [, params] = lineInserts(db)[0];
      expect(params[1]).toBe('p1');
      expect(params[3]).toBe('450000');
      expect(params[10]).toBe('income');
    });

    it('does not double-count: expected income is skipped when recurring income templates exist', async () => {
      const db = makeDb({
        plans: [{ id: 'p1', month: '2026-07', currency: 'USD', expected_income: '450000' }],
        accounts: [{ id: 1, currency: 'RUB' }],
        planned: [{ id: 'po3', name: 'Salary', type: 'income', amount: '220000', account_id: 1, category_id: 'inc1', is_recurring: 1 }],
      });
      const result = await BudgetPlansDB.migratePlannedOperationsToLines(db);
      expect(result.migratedIncome).toBe(0);
      expect(result.migratedTemplates).toBe(1);
      expect(lineInserts(db)).toHaveLength(1);
    });

    it('sets the completion flag so a second run is a no-op', async () => {
      const db = makeDb({});
      await BudgetPlansDB.migratePlannedOperationsToLines(db);
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO app_metadata'),
        expect.arrayContaining([BudgetPlansDB.PLANNED_MIGRATION_FLAG_KEY]),
      );
    });
  });
});
