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
});
