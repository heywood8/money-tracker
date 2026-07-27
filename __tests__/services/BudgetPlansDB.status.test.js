/**
 * Tests for the plan-vs-actual layer of BudgetPlansDB (Budgets v2 part 5):
 * month date ranges with local dates, per-line actuals (category spending via
 * the shared convert-all engine, incoming transfers incl. cross-currency,
 * broken lines), actual income in both toggle states, and the full plan status
 * with the shared safe/warning/danger/exceeded bands and unconvertible-currency
 * collection.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { calculateSpendingForCategories } from '../../app/services/BudgetsDB';
import { queryAll, queryFirst } from '../../app/services/db';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
// Keep the real deriveSpendingStatus (threshold bands under test) but stub the
// spending engine — its own behavior is covered by BudgetsDB.convertAll.test.js.
jest.mock('../../app/services/BudgetsDB', () => ({
  ...jest.requireActual('../../app/services/BudgetsDB'),
  calculateSpendingForCategories: jest.fn(),
}));
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
  getTransferTotals: jest.fn(),
  getUnconvertibleCurrencies: jest.fn(),
}));

// Deterministic stand-ins for the rate helpers: a fixed rate map and a plain
// multiply. Currencies absent from the map convert to null (dropped), mirroring
// the real convertWithRateMap contract.
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

const categoryLine = (overrides = {}) => ({
  id: 'line-cat',
  planId: 'p1',
  amount: '100',
  categoryId: 'cat1',
  toAccountId: null,
  isBroken: false,
  ...overrides,
});

const accountLine = (overrides = {}) => ({
  id: 'line-acc',
  planId: 'p1',
  amount: '100',
  categoryId: null,
  toAccountId: 'acc1',
  isBroken: false,
  ...overrides,
});

describe('BudgetPlansDB plan-vs-actual', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    CategoriesDB.getAllDescendants.mockResolvedValue([]);
    calculateSpendingForCategories.mockResolvedValue('0');
    getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    getUnconvertibleCurrencies.mockResolvedValue([]);
    stubRates({});
  });

  describe('getMonthDateRange', () => {
    it('returns the first and last local day of the month', () => {
      expect(BudgetPlansDB.getMonthDateRange('2026-07'))
        .toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
    });

    it('handles short months and leap years', () => {
      expect(BudgetPlansDB.getMonthDateRange('2026-02').endDate).toBe('2026-02-28');
      expect(BudgetPlansDB.getMonthDateRange('2024-02').endDate).toBe('2024-02-29');
      expect(BudgetPlansDB.getMonthDateRange('2026-04').endDate).toBe('2026-04-30');
    });

    it('handles the year boundary month', () => {
      expect(BudgetPlansDB.getMonthDateRange('2026-12'))
        .toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
    });

    it('rejects an invalid month key', () => {
      expect(() => BudgetPlansDB.getMonthDateRange('2026-13')).toThrow('A valid month');
      expect(() => BudgetPlansDB.getMonthDateRange('garbage')).toThrow('A valid month');
    });
  });

  describe('calculateLineActual — category lines', () => {
    it('delegates to the shared spending engine including descendants', async () => {
      calculateSpendingForCategories.mockResolvedValue('123.45');

      const result = await BudgetPlansDB.calculateLineActual(categoryLine(), '2026-07', 'USD', true);

      expect(result).toEqual({ broken: false, actual: '123.45' });
      expect(calculateSpendingForCategories).toHaveBeenCalledWith(
        ['cat1'], 'USD', '2026-07-01', '2026-07-31', true, true,
      );
    });

    it('passes convertAll=false through so only plan-currency operations count', async () => {
      await BudgetPlansDB.calculateLineActual(categoryLine(), '2026-07', 'USD', false);

      expect(calculateSpendingForCategories).toHaveBeenCalledWith(
        ['cat1'], 'USD', '2026-07-01', '2026-07-31', true, false,
      );
    });

    // Migration 0021.
    it('sums every category a multi-category line tracks', async () => {
      calculateSpendingForCategories.mockResolvedValue('700');

      const result = await BudgetPlansDB.calculateLineActual(
        categoryLine({ categoryId: 'cat1', categoryIds: ['cat1', 'cat2'] }), '2026-07', 'USD', false,
      );

      expect(result).toEqual({ broken: false, actual: '700' });
      expect(calculateSpendingForCategories).toHaveBeenCalledWith(
        ['cat1', 'cat2'], 'USD', '2026-07-01', '2026-07-31', true, false,
      );
    });

    it('always rolls descendants up, even for a line stored with the old flag off', async () => {
      await BudgetPlansDB.calculateLineActual(
        categoryLine({ categoryIds: ['cat1'], includeChildren: false }), '2026-07', 'USD', false,
      );

      expect(calculateSpendingForCategories).toHaveBeenCalledWith(
        ['cat1'], 'USD', '2026-07-01', '2026-07-31', true, false,
      );
    });

    it('reports a line whose category set is empty as broken', async () => {
      const result = await BudgetPlansDB.calculateLineActual(
        categoryLine({ categoryId: null, categoryIds: [] }), '2026-07', 'USD', false,
      );

      expect(result).toEqual({ broken: true, actual: '0' });
      expect(calculateSpendingForCategories).not.toHaveBeenCalled();
    });
  });

  describe('calculateLineActual — transfer-target lines', () => {
    it('counts incoming transfers in the destination currency without conversion', async () => {
      queryFirst.mockResolvedValue({ currency: 'USD' });
      getTransferTotals.mockResolvedValue({ incoming: '250.50', outgoing: '999' });

      const result = await BudgetPlansDB.calculateLineActual(accountLine(), '2026-07', 'USD', false);

      expect(result).toEqual({ broken: false, actual: '250.50', sourceCurrency: 'USD' });
      expect(getTransferTotals).toHaveBeenCalledWith('acc1', '2026-07-01', '2026-07-31');
      expect(fetchRatesToTarget).not.toHaveBeenCalled();
    });

    it('converts cross-currency incoming transfers into the display currency (destination_amount path)', async () => {
      queryFirst.mockResolvedValue({ currency: 'AMD' });
      // getTransferTotals already credits COALESCE(destination_amount, amount)
      // in the destination account's currency.
      getTransferTotals.mockResolvedValue({ incoming: '40000', outgoing: '0' });
      stubRates({ AMD: '0.0025' });

      const result = await BudgetPlansDB.calculateLineActual(accountLine(), '2026-07', 'USD', false);

      expect(result).toEqual({ broken: false, actual: '100', sourceCurrency: 'AMD' });
      expect(fetchRatesToTarget).toHaveBeenCalledWith(['AMD'], 'USD');
    });

    it('drops the amount when the destination currency has no rate', async () => {
      queryFirst.mockResolvedValue({ currency: 'XYZ' });
      getTransferTotals.mockResolvedValue({ incoming: '500', outgoing: '0' });
      stubRates({}); // no rate for XYZ

      const result = await BudgetPlansDB.calculateLineActual(accountLine(), '2026-07', 'USD', true);

      expect(result).toEqual({ broken: false, actual: '0', sourceCurrency: 'XYZ' });
    });

    it('treats a missing destination account as broken', async () => {
      queryFirst.mockResolvedValue(null);

      const result = await BudgetPlansDB.calculateLineActual(accountLine(), '2026-07', 'USD', false);

      expect(result).toEqual({ broken: true, actual: '0' });
      expect(getTransferTotals).not.toHaveBeenCalled();
    });
  });

  describe('calculateLineActual — broken lines', () => {
    it('returns the distinct broken state for a line with no target', async () => {
      const broken = categoryLine({ categoryId: null, toAccountId: null, isBroken: true });

      const result = await BudgetPlansDB.calculateLineActual(broken, '2026-07', 'USD', true);

      expect(result).toEqual({ broken: true, actual: '0' });
      expect(calculateSpendingForCategories).not.toHaveBeenCalled();
      expect(getTransferTotals).not.toHaveBeenCalled();
    });
  });

  describe('calculateActualIncome', () => {
    it('sums income across currencies converted into the display currency (convertAll on)', async () => {
      queryAll.mockResolvedValue([
        { currency: 'USD', total: 100 },
        { currency: 'RUB', total: 500 },
      ]);
      stubRates({ RUB: '0.01' });

      const total = await BudgetPlansDB.calculateActualIncome('2026-07', 'USD', true);

      // 100 USD + 500 RUB * 0.01 = 105 USD
      expect(parseFloat(total)).toBe(105);
      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain("o.type = 'income'");
      expect(sql).toContain('GROUP BY a.currency');
      expect(params).toEqual(['2026-07-01', '2026-07-31']);
    });

    it('drops income in currencies with no available rate (convertAll on)', async () => {
      queryAll.mockResolvedValue([
        { currency: 'USD', total: 100 },
        { currency: 'XYZ', total: 99999 },
      ]);
      stubRates({});

      const total = await BudgetPlansDB.calculateActualIncome('2026-07', 'USD', true);

      expect(parseFloat(total)).toBe(100);
    });

    it('counts only display-currency accounts with convertAll off', async () => {
      queryFirst.mockResolvedValue({ total: 300 });

      const total = await BudgetPlansDB.calculateActualIncome('2026-07', 'USD', false);

      expect(total).toBe('300');
      const [sql, params] = queryFirst.mock.calls[0];
      expect(sql).toContain("o.type = 'income'");
      expect(sql).toContain('a.currency = ?');
      expect(params).toEqual(['USD', '2026-07-01', '2026-07-31']);
    });

    it('returns 0 when there is no income', async () => {
      queryFirst.mockResolvedValue({ total: null });
      expect(await BudgetPlansDB.calculateActualIncome('2026-07', 'USD', false)).toBe('0');
    });
  });

  describe('calculatePlanStatus', () => {
    const PLAN_ROW = {
      id: 'p1', month: '2026-07', currency: 'USD', expected_income: '1000',
      created_at: 't', updated_at: 't',
    };

    const lineRow = (id, amount, categoryId = null, toAccountId = null, sortOrder = 0) => ({
      id, plan_id: 'p1', label: null, amount, comment: null,
      category_id: categoryId, to_account_id: toAccountId, sort_order: sortOrder,
      is_recurring: 0, currency: null,
      created_at: 't', updated_at: 't',
    });

    // A recurring (global template) line: no plan_id, carries its own currency.
    const recurringLineRow = (id, amount, currency, categoryId = null, toAccountId = null, sortOrder = 0) => ({
      id, plan_id: null, label: null, amount, comment: null,
      category_id: categoryId, to_account_id: toAccountId, sort_order: sortOrder,
      is_recurring: 1, currency,
      created_at: 't', updated_at: 't',
    });

    // Dispatch the db mocks by SQL shape: plan row, plan lines, income sums,
    // distinct-currency collection, account currency lookup.
    const setupDb = ({
      lines = [], recurringLines = [], incomeTotal = 0, incomeRows = [], expenseCurrencies = [], accountCurrency = 'USD',
    }) => {
      queryFirst.mockImplementation(async (sql) => {
        if (sql.includes('FROM budget_plans WHERE id')) return PLAN_ROW;
        if (sql.includes('SELECT currency FROM accounts')) return { currency: accountCurrency };
        if (sql.includes("o.type = 'income'")) return { total: incomeTotal };
        return null;
      });
      queryAll.mockImplementation(async (sql) => {
        // Recurring (global template) lines are a separate query from this
        // plan's one-off lines.
        if (sql.includes('is_recurring = 1') && !sql.includes('WHERE plan_id')) return recurringLines;
        if (sql.includes('FROM budget_plan_lines')) return lines;
        if (sql.includes('SELECT DISTINCT a.currency') && sql.includes("o.type = 'expense'")) {
          return expenseCurrencies.map(currency => ({ currency }));
        }
        if (sql.includes('SELECT DISTINCT a.currency') && sql.includes("o.type = 'income'")) {
          return incomeRows.map(r => ({ currency: r.currency }));
        }
        if (sql.includes("o.type = 'income'") && sql.includes('GROUP BY a.currency')) return incomeRows;
        return [];
      });
    };

    it('applies the shared status bands per line (<70 safe, >=70 warning, >=90 danger, >100 exceeded)', async () => {
      setupDb({
        lines: [
          lineRow('l-safe', '100', 'cat-safe', null, 0),
          lineRow('l-warn', '100', 'cat-warn', null, 1),
          lineRow('l-danger', '100', 'cat-danger', null, 2),
          lineRow('l-over', '100', 'cat-over', null, 3),
        ],
        incomeTotal: 900,
      });
      const spendingByCategory = {
        'cat-safe': '50', 'cat-warn': '70', 'cat-danger': '95', 'cat-over': '150',
      };
      calculateSpendingForCategories.mockImplementation(async (categoryIds) => spendingByCategory[categoryIds[0]]);

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      const byId = new Map(status.lines.map(l => [l.lineId, l]));
      expect(byId.get('l-safe')).toMatchObject({ status: 'safe', percentage: 50, isExceeded: false });
      expect(parseFloat(byId.get('l-safe').remaining)).toBe(50);
      expect(byId.get('l-warn')).toMatchObject({ status: 'warning', percentage: 70 });
      expect(byId.get('l-danger')).toMatchObject({ status: 'danger', percentage: 95 });
      expect(byId.get('l-over')).toMatchObject({ status: 'exceeded', percentage: 150, isExceeded: true });
      expect(parseFloat(byId.get('l-over').remaining)).toBe(-50);

      expect(parseFloat(status.totals.expectedIncome)).toBe(1000);
      expect(parseFloat(status.totals.actualIncome)).toBe(900);
      expect(parseFloat(status.totals.allocated)).toBe(400);
      expect(parseFloat(status.totals.totalActual)).toBe(365);
      expect(parseFloat(status.totals.plannedRemainder)).toBe(600);
      expect(parseFloat(status.totals.actualRemainder)).toBe(535);
      expect(status.month).toBe('2026-07');
      expect(status.currency).toBe('USD');
    });

    it('marks broken lines and excludes them from the actual totals', async () => {
      setupDb({
        lines: [
          lineRow('l-ok', '100', 'cat1', null, 0),
          lineRow('l-broken', '40', null, null, 1),
        ],
        incomeTotal: 0,
      });
      calculateSpendingForCategories.mockResolvedValue('30');

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      const broken = status.lines.find(l => l.lineId === 'l-broken');
      expect(broken).toMatchObject({ broken: true, status: 'broken', actual: '0', remaining: '40' });
      // Broken line still counts toward allocation but not toward actuals.
      expect(parseFloat(status.totals.allocated)).toBe(140);
      expect(parseFloat(status.totals.totalActual)).toBe(30);
    });

    it('collects unconvertible currencies from expense, income, and transfer sources (convertAll on)', async () => {
      setupDb({
        lines: [
          lineRow('l-cat', '100', 'cat1', null, 0),
          lineRow('l-acc', '100', null, 'acc1', 1),
        ],
        incomeRows: [{ currency: 'ZAR', total: 10 }],
        expenseCurrencies: ['XYZ', 'USD'],
        accountCurrency: 'AMD',
      });
      calculateSpendingForCategories.mockResolvedValue('0');
      getTransferTotals.mockResolvedValue({ incoming: '10', outgoing: '0' });
      stubRates({ AMD: '0.0025' });
      getUnconvertibleCurrencies.mockResolvedValue(['XYZ']);

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', true);

      expect(status.unconvertible).toEqual(['XYZ']);
      const [currencies, target] = getUnconvertibleCurrencies.mock.calls[0];
      expect([...currencies].sort()).toEqual(['AMD', 'USD', 'XYZ', 'ZAR']);
      expect(target).toBe('USD');
    });

    it('with convertAll off only transfer destination currencies feed the warning', async () => {
      setupDb({
        lines: [
          lineRow('l-cat', '100', 'cat1', null, 0),
          lineRow('l-acc', '100', null, 'acc1', 1),
        ],
        accountCurrency: 'AMD',
      });
      stubRates({ AMD: '0.0025' });
      getTransferTotals.mockResolvedValue({ incoming: '10', outgoing: '0' });

      await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

      // No DISTINCT-currency queries with convertAll off.
      const distinctCalls = queryAll.mock.calls.filter(([sql]) => sql.includes('SELECT DISTINCT a.currency'));
      expect(distinctCalls).toHaveLength(0);
      const [currencies] = getUnconvertibleCurrencies.mock.calls[0];
      expect([...currencies]).toEqual(['AMD']);
    });

    it('defaults the display currency to the plan currency', async () => {
      setupDb({ lines: [lineRow('l1', '100', 'cat1', null, 0)] });
      calculateSpendingForCategories.mockResolvedValue('10');

      const status = await BudgetPlansDB.calculatePlanStatus('p1');

      expect(status.currency).toBe('USD');
      expect(calculateSpendingForCategories).toHaveBeenCalledWith(
        ['cat1'], 'USD', '2026-07-01', '2026-07-31', true, false,
      );
    });

    it('throws for a missing plan', async () => {
      queryFirst.mockResolvedValue(null);
      await expect(BudgetPlansDB.calculatePlanStatus('nope', 'USD', false))
        .rejects.toThrow('Budget plan nope not found');
    });

    describe('recurring lines (Budgets v3 phase 2)', () => {
      it('merges a same-currency recurring line into totals alongside one-off lines', async () => {
        setupDb({
          lines: [lineRow('l-oneoff', '100', 'cat1', null, 0)],
          recurringLines: [recurringLineRow('l-rec', '50', 'USD', 'cat2', null, 0)],
          incomeTotal: 0,
        });
        calculateSpendingForCategories.mockResolvedValue('10');

        const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

        expect(status.lines.map(l => l.lineId).sort()).toEqual(['l-oneoff', 'l-rec']);
        expect(parseFloat(status.totals.allocated)).toBe(150);
      });

      it('converts a recurring line carrying a different currency into the display currency', async () => {
        setupDb({
          lines: [],
          recurringLines: [recurringLineRow('l-rec', '100', 'AMD', 'cat2', null, 0)],
        });
        calculateSpendingForCategories.mockResolvedValue('0');
        stubRates({ AMD: '0.0025' });

        const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

        const recStatus = status.lines.find(l => l.lineId === 'l-rec');
        expect(fetchRatesToTarget).toHaveBeenCalledWith(['AMD'], 'USD');
        expect(parseFloat(recStatus.amount)).toBe(0.25); // 100 AMD * 0.0025
        expect(parseFloat(status.totals.allocated)).toBe(0.25);
      });

      it('batches the rate lookup for multiple foreign-currency recurring lines into a single fetchRatesToTarget call (perf regression)', async () => {
        // Before the fix, calculatePlanStatus called fetchRatesToTarget once PER
        // LINE inside the loop — N recurring lines in foreign currencies meant N
        // sequential rate lookups instead of one batched call.
        setupDb({
          lines: [],
          recurringLines: [
            recurringLineRow('l-rec-1', '100', 'AMD', 'cat2', null, 0),
            recurringLineRow('l-rec-2', '50', 'EUR', 'cat3', null, 1),
            recurringLineRow('l-rec-3', '25', 'AMD', 'cat4', null, 2), // duplicate currency
          ],
        });
        calculateSpendingForCategories.mockResolvedValue('0');
        stubRates({ AMD: '0.0025', EUR: '1.1' });

        await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

        expect(fetchRatesToTarget).toHaveBeenCalledTimes(1);
        const [currencies, target] = fetchRatesToTarget.mock.calls[0];
        expect([...currencies].sort()).toEqual(['AMD', 'EUR']);
        expect(target).toBe('USD');
      });

      it('flags a recurring line as unconvertible when no rate is available, without crashing', async () => {
        setupDb({
          lines: [],
          recurringLines: [recurringLineRow('l-rec', '100', 'XYZ', 'cat2', null, 0)],
        });
        stubRates({}); // no rate for XYZ

        const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

        const recStatus = status.lines.find(l => l.lineId === 'l-rec');
        expect(recStatus.status).toBe('unconvertible');
        // Not counted toward allocated — its amount couldn't be expressed in USD.
        expect(parseFloat(status.totals.allocated)).toBe(0);
      });

      it('a one-off line (no currency of its own) is never converted, matching pre-recurring behavior', async () => {
        setupDb({ lines: [lineRow('l1', '100', 'cat1', null, 0)] });
        calculateSpendingForCategories.mockResolvedValue('10');

        await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

        expect(fetchRatesToTarget).not.toHaveBeenCalled();
      });
    });
  });

  describe('calculateAllPlanStatuses', () => {
    it('computes a status per plan, each in its own currency', async () => {
      const planRows = [
        { id: 'p1', month: '2026-07', currency: 'USD', expected_income: '100', created_at: 't', updated_at: 't' },
        { id: 'p2', month: '2026-06', currency: 'EUR', expected_income: '200', created_at: 't', updated_at: 't' },
      ];
      queryAll.mockImplementation(async (sql) => {
        if (sql.includes('FROM budget_plans ORDER BY')) return planRows;
        return [];
      });
      queryFirst.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM budget_plans WHERE id')) {
          return planRows.find(p => p.id === params[0]) || null;
        }
        if (sql.includes("o.type = 'income'")) return { total: 0 };
        return null;
      });

      const map = await BudgetPlansDB.calculateAllPlanStatuses(false);

      expect([...map.keys()].sort()).toEqual(['p1', 'p2']);
      expect(map.get('p1').currency).toBe('USD');
      expect(map.get('p2').currency).toBe('EUR');
    });

    // Regression: the Budgets tab's currency chip converted the rows but not the
    // statuses, so the totals under them stayed in each plan's stored currency.
    it('computes every status in the display currency when one is given', async () => {
      const planRows = [
        { id: 'p1', month: '2026-07', currency: 'USD', expected_income: '100', created_at: 't', updated_at: 't' },
        { id: 'p2', month: '2026-06', currency: 'EUR', expected_income: '200', created_at: 't', updated_at: 't' },
      ];
      queryAll.mockImplementation(async (sql) => {
        if (sql.includes('FROM budget_plans ORDER BY')) return planRows;
        return [];
      });
      queryFirst.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM budget_plans WHERE id')) {
          return planRows.find(p => p.id === params[0]) || null;
        }
        if (sql.includes("o.type = 'income'")) return { total: 0 };
        return null;
      });

      const map = await BudgetPlansDB.calculateAllPlanStatuses(false, 'AMD');

      expect(map.get('p1').currency).toBe('AMD');
      expect(map.get('p2').currency).toBe('AMD');
    });
  });
});
