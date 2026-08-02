/**
 * Tests for the multi-currency (convert-all) budget spending mode.
 *
 * With convertAll=true, spending from accounts in ANY currency counts toward
 * the budget, converted into the budget's currency via the shared rate helpers
 * from OperationsDB. With convertAll=false (default), behavior is unchanged:
 * only operations from accounts in the budget's currency are counted.
 */

import * as BudgetsDB from '../../app/services/BudgetsDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { executeQuery, queryAll, queryFirst } from '../../app/services/db';
import { fetchRatesToTarget, convertWithRateMap } from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
}));

// Deterministic stand-ins for the real rate helpers: a fixed rate map and a
// plain multiply. Currencies absent from the map convert to null (dropped),
// mirroring the real convertWithRateMap contract.
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

describe('BudgetsDB convert-all spending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    CategoriesDB.getAllDescendants.mockResolvedValue([]);
  });

  describe('calculateSpendingForBudget', () => {
    it('sums spending across currencies converted into the budget currency', async () => {
      stubRates({ RUB: '5' });
      queryAll.mockResolvedValue([
        { currency: 'AMD', total: 1000 },
        { currency: 'RUB', total: 500 },
      ]);

      const total = await BudgetsDB.calculateSpendingForBudget(
        'cat1', 'AMD', '2026-07-01', '2026-07-31', true, true,
      );

      // 1000 AMD + 500 RUB * 5 = 3500 AMD
      expect(parseFloat(total)).toBe(3500);
      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('GROUP BY a.currency');
      expect(sql).not.toContain('a.currency = ?');
      expect(params).toEqual(['cat1', '2026-07-01', '2026-07-31']);
    });

    it('drops spending in currencies with no available rate', async () => {
      stubRates({ RUB: '5' }); // XYZ has no rate
      queryAll.mockResolvedValue([
        { currency: 'AMD', total: 1000 },
        { currency: 'XYZ', total: 99999 },
      ]);

      const total = await BudgetsDB.calculateSpendingForBudget(
        'cat1', 'AMD', '2026-07-01', '2026-07-31', true, true,
      );

      expect(parseFloat(total)).toBe(1000);
    });

    it('includes descendant categories in the converted query', async () => {
      stubRates({});
      CategoriesDB.getAllDescendants.mockResolvedValue([{ id: 'child1' }, { id: 'child2' }]);
      queryAll.mockResolvedValue([]);

      await BudgetsDB.calculateSpendingForBudget(
        'cat1', 'AMD', '2026-07-01', '2026-07-31', true, true,
      );

      const [, params] = queryAll.mock.calls[0];
      expect(params).toEqual(['cat1', 'child1', 'child2', '2026-07-01', '2026-07-31']);
    });

    it('keeps the single-currency path untouched when convertAll is off', async () => {
      queryFirst.mockResolvedValue({ total: 750 });

      const total = await BudgetsDB.calculateSpendingForBudget(
        'cat1', 'AMD', '2026-07-01', '2026-07-31', true, false,
      );

      expect(total).toBe('750');
      expect(queryAll).not.toHaveBeenCalled();
      expect(fetchRatesToTarget).not.toHaveBeenCalled();
      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain('a.currency = ?');
      expect(params).toEqual(['cat1', 'AMD', '2026-07-01', '2026-07-31']);
    });

    it('defaults to the single-currency path when convertAll is omitted (regression)', async () => {
      queryFirst.mockResolvedValue({ total: 200 });

      const total = await BudgetsDB.calculateSpendingForBudget(
        'cat1', 'AMD', '2026-07-01', '2026-07-31',
      );

      expect(total).toBe('200');
      expect(queryAll).not.toHaveBeenCalled();
    });
  });

  describe('calculateBudgetStatus', () => {
    const budgetRow = {
      id: 'b1',
      category_id: 'cat1',
      amount: '3000',
      currency: 'AMD',
      period_type: 'monthly',
      start_date: '2026-01-01',
      end_date: null,
      is_recurring: 1,
      rollover_enabled: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('threads convertAll into the spending calculation', async () => {
      stubRates({ RUB: '5' });
      queryFirst.mockResolvedValue(budgetRow);
      queryAll.mockResolvedValue([
        { currency: 'AMD', total: 1000 },
        { currency: 'RUB', total: 500 },
      ]);

      const status = await BudgetsDB.calculateBudgetStatus('b1', new Date(2026, 6, 15), true);

      expect(parseFloat(status.spent)).toBe(3500);
      expect(status.isExceeded).toBe(true);
      expect(status.status).toBe('exceeded');
    });

    it('excludes foreign-currency spending when convertAll is off', async () => {
      queryFirst
        .mockResolvedValueOnce(budgetRow) // getBudgetById
        .mockResolvedValueOnce({ total: 1000 }); // spending query

      const status = await BudgetsDB.calculateBudgetStatus('b1', new Date(2026, 6, 15), false);

      expect(parseFloat(status.spent)).toBe(1000);
      expect(status.isExceeded).toBe(false);
      expect(queryAll).not.toHaveBeenCalled();
    });
  });

  describe('calculateAllBudgetStatuses', () => {
    it('passes convertAll through to each budget status', async () => {
      stubRates({ RUB: '5' });
      const budgetRow = {
        id: 'b1',
        category_id: 'cat1',
        amount: '10000',
        currency: 'AMD',
        period_type: 'monthly',
        start_date: '2026-01-01',
        end_date: null,
        is_recurring: 1,
        rollover_enabled: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      // getActiveBudgets and the convert-all spending query both go through
      // queryAll — dispatch on the SQL text.
      queryAll.mockImplementation(async (sql) => {
        if (sql.includes('FROM budgets')) return [budgetRow];
        return [{ currency: 'RUB', total: 500 }];
      });
      queryFirst.mockResolvedValue(budgetRow); // getBudgetById inside status calc

      const statuses = await BudgetsDB.calculateAllBudgetStatuses(new Date(2026, 6, 15), true);

      expect(statuses.size).toBe(1);
      expect(parseFloat(statuses.get('b1').spent)).toBe(2500);
    });
  });

  // Migration 0021: a plan line can track several categories at once.
  describe('calculateSpendingForCategories (multi-category)', () => {
    it('sums over every tracked category and their descendants', async () => {
      CategoriesDB.getAllDescendants.mockImplementation(async (id) => (
        id === 'groceries' ? [{ id: 'groceries-child' }] : []
      ));
      queryFirst.mockResolvedValue({ total: 900 });

      const total = await BudgetsDB.calculateSpendingForCategories(
        ['groceries', 'cafes'], 'AMD', '2026-07-01', '2026-07-31', true, false,
      );

      expect(parseFloat(total)).toBe(900);
      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain('o.category_id IN (?,?,?)');
      expect(params.slice(0, 3)).toEqual(['groceries', 'cafes', 'groceries-child']);
    });

    it('counts a category once even when it is also a descendant of another', async () => {
      // Tracking a parent AND its own child: with the roll-up on, the child
      // would otherwise be listed twice.
      CategoriesDB.getAllDescendants.mockImplementation(async (id) => (
        id === 'food' ? [{ id: 'cafes' }] : []
      ));
      queryFirst.mockResolvedValue({ total: 100 });

      await BudgetsDB.calculateSpendingForCategories(
        ['food', 'cafes'], 'AMD', '2026-07-01', '2026-07-31', true, false,
      );

      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain('o.category_id IN (?,?)');
      expect(params.slice(0, 2)).toEqual(['food', 'cafes']);
    });

    it('leaves descendants out when the roll-up is switched off', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([{ id: 'child' }]);
      queryFirst.mockResolvedValue({ total: 50 });

      await BudgetsDB.calculateSpendingForCategories(
        ['food'], 'AMD', '2026-07-01', '2026-07-31', false, false,
      );

      expect(CategoriesDB.getAllDescendants).not.toHaveBeenCalled();
      const [, params] = queryFirst.mock.calls[0];
      expect(params.slice(0, 1)).toEqual(['food']);
    });

    it('returns 0 without querying when nothing is tracked', async () => {
      // An empty IN () is a SQL syntax error, so the empty set must short-circuit
      // — this is the state of a line whose every category was deleted.
      expect(await BudgetsDB.calculateSpendingForCategories(
        [], 'AMD', '2026-07-01', '2026-07-31', true, false,
      )).toBe('0');
      expect(await BudgetsDB.calculateSpendingForCategories(
        [null, undefined, ''], 'AMD', '2026-07-01', '2026-07-31', true, true,
      )).toBe('0');
      expect(queryFirst).not.toHaveBeenCalled();
      expect(queryAll).not.toHaveBeenCalled();
    });

    it('converts across currencies for a multi-category set too', async () => {
      stubRates({ RUB: '5' });
      queryAll.mockResolvedValue([
        { currency: 'AMD', total: 1000 },
        { currency: 'RUB', total: 200 },
      ]);

      const total = await BudgetsDB.calculateSpendingForCategories(
        ['a', 'b'], 'AMD', '2026-07-01', '2026-07-31', false, true,
      );

      expect(parseFloat(total)).toBe(2000);
    });
  });

  // Migration 0024: a plan line can also narrow spending by the SOURCE account
  // the money left from, independently of its categories.
  describe('calculateSpendingForFilters (source-account filter)', () => {
    const range = { startDate: '2026-07-01', endDate: '2026-07-31', currency: 'AMD' };

    it('filters by account alone — every category counts', async () => {
      queryFirst.mockResolvedValue({ total: 4200 });

      const total = await BudgetsDB.calculateSpendingForFilters({
        ...range, accountIds: [3, 7],
      });

      expect(parseFloat(total)).toBe(4200);
      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain('o.account_id IN (?,?)');
      // No category clause at all: an empty set means "any category", not "none".
      expect(sql).not.toContain('o.category_id IN');
      expect(params.slice(0, 2)).toEqual([3, 7]);
    });

    it('intersects the two filters with AND', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([]);
      queryFirst.mockResolvedValue({ total: 100 });

      await BudgetsDB.calculateSpendingForFilters({
        ...range, categoryIds: ['groceries'], accountIds: [3],
      });

      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain('o.category_id IN (?)');
      expect(sql).toContain('AND o.account_id IN (?)');
      expect(params.slice(0, 2)).toEqual(['groceries', 3]);
    });

    it('expands category descendants alongside an account filter', async () => {
      CategoriesDB.getAllDescendants.mockImplementation(async (id) => (
        id === 'food' ? [{ id: 'cafes' }] : []
      ));
      queryFirst.mockResolvedValue({ total: 10 });

      await BudgetsDB.calculateSpendingForFilters({
        ...range, categoryIds: ['food'], accountIds: [3],
      });

      const [, params] = queryFirst.mock.calls[0];
      expect(params.slice(0, 3)).toEqual(['food', 'cafes', 3]);
    });

    it('de-duplicates repeated account ids', async () => {
      queryFirst.mockResolvedValue({ total: 10 });

      await BudgetsDB.calculateSpendingForFilters({
        ...range, accountIds: [3, '3', 7, null, ''],
      });

      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain('o.account_id IN (?,?)');
      expect(params.slice(0, 2)).toEqual([3, 7]);
    });

    it('returns 0 without querying when neither filter is set', async () => {
      // A filterless sum would report the user's ENTIRE spend as one line's
      // actual — the empty set means the line tracks nothing, not everything.
      expect(await BudgetsDB.calculateSpendingForFilters({ ...range })).toBe('0');
      expect(queryFirst).not.toHaveBeenCalled();
      expect(queryAll).not.toHaveBeenCalled();
    });

    it('converts across currencies with an account filter applied', async () => {
      stubRates({ RUB: '5' });
      queryAll.mockResolvedValue([
        { currency: 'AMD', total: 1000 },
        { currency: 'RUB', total: 200 },
      ]);

      const total = await BudgetsDB.calculateSpendingForFilters({
        ...range, accountIds: [3], convertAll: true,
      });

      expect(parseFloat(total)).toBe(2000);
      const [sql] = queryAll.mock.calls[0];
      expect(sql).toContain('o.account_id IN (?)');
      expect(sql).toContain('GROUP BY a.currency');
    });
  });
});
