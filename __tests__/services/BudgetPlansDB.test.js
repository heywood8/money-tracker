/**
 * Tests for BudgetPlansDB — Budgets v2 (monthly income-allocation plans).
 * Covers validation (incl. the exactly-one-target invariant), CRUD for plans and
 * lines, totals (incl. negative remainder), copyPlan, reorder, and the broken-line
 * state produced by ON DELETE SET NULL.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import { fetchRatesToTarget, convertWithRateMap } from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
// Only the two rate helpers updateLine's currency-conversion invariant needs
// (Fix 1, adversarial review round 2) — the rest of OperationsDB is exercised
// via BudgetPlansDB.status.test.js, not here.
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
  getTransferTotals: jest.fn(),
  getUnconvertibleCurrencies: jest.fn(),
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

    // Bug 10 (adversarial review): addLine/addRecurringLine share one insertPlanLine
    // implementation now (planId === null ⇒ recurring). These lock in that the
    // merge preserved each function's distinct behavior.
    describe('addRecurringLine (shares insertPlanLine with addLine)', () => {
      it('inserts a recurring line with plan_id NULL and is_recurring=1', async () => {
        const line = await BudgetPlansDB.addRecurringLine({ amount: '65000', categoryId: 'cat1', currency: 'EUR', label: 'Rent' });
        expect(executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO budget_plan_lines'),
          expect.arrayContaining([null, 'Rent', '65000', 'cat1', 1, 'EUR']),
        );
        expect(line).toMatchObject({ planId: null, isRecurring: true, currency: 'EUR', amount: '65000' });
      });

      it('requires a currency', async () => {
        await expect(BudgetPlansDB.addRecurringLine({ amount: '100', categoryId: 'c1' }))
          .rejects.toThrow('Currency is required for a recurring allocation');
        expect(executeQuery).not.toHaveBeenCalled();
      });

      it('still enforces the exactly-one-target invariant', async () => {
        await expect(BudgetPlansDB.addRecurringLine({ amount: '100', categoryId: 'c1', toAccountId: 2, currency: 'USD' }))
          .rejects.toThrow('not both');
        expect(executeQuery).not.toHaveBeenCalled();
      });
    });

    // addLine must NOT pick up a stray `currency` field — a one-off line always
    // has currency NULL in the DB (inherits the plan's), regardless of what's on
    // the input object. Guards insertPlanLine's `isRecurring ? line.currency :
    // null` branch from a future regression.
    it('addLine writes currency NULL even if the input object carries one', async () => {
      const line = await BudgetPlansDB.addLine('p1', { amount: '10', categoryId: 'c1', currency: 'EUR' });
      const [, params] = executeQuery.mock.calls[0];
      expect(params).not.toContain('EUR');
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
});
