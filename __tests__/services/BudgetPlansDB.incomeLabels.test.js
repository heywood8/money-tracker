/**
 * Tests for the per-line LABEL filter (migration 0028): the dimension that lets
 * an INCOME line track its own actual — the one thing salary and its advance,
 * which necessarily share an income category, could not do before.
 *
 * Covers the mapping of the junction column, validation (labels are an income
 * line's alone), the junction writes on insert/update/copy, what
 * calculateIncomeForFilters actually counts (label OR, category AND, the
 * convert-all toggle), and what calculatePlanStatus reports for a tracked vs an
 * untracked income line.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/BudgetsDB', () => ({
  ...jest.requireActual('../../app/services/BudgetsDB'),
  calculateSpendingForFilters: jest.fn(),
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

// What LINE_SELECT joins the label set with — a comma would be ambiguous, since
// a label may well contain one.
const SEP = '\u001F';

// A raw budget_plan_lines row as LINE_SELECT returns it: the three set columns
// ride along with the row.
const rawLine = (overrides = {}) => ({
  id: 'l1',
  plan_id: 'p1',
  label: null,
  amount: '100',
  comment: null,
  category_id: null,
  category_ids: null,
  source_account_ids: null,
  tracked_labels: null,
  to_account_id: null,
  sort_order: 0,
  is_recurring: 0,
  currency: null,
  kind: 'income',
  group_id: null,
  created_at: 't',
  updated_at: 't',
  ...overrides,
});

// An operations row as calculateIncomeForFilters selects it.
const opRow = (amount, description, currency = 'USD') => ({ amount, description, currency });

let mockRunAsync;

describe('BudgetPlansDB income label filter (migration 0028)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    CategoriesDB.getAllDescendants.mockResolvedValue([]);
    getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    getUnconvertibleCurrencies.mockResolvedValue([]);
    fetchRatesToTarget.mockResolvedValue(new Map());
    convertWithRateMap.mockImplementation((amount, f, t) => (f === t ? amount : null));
    mockRunAsync = jest.fn().mockResolvedValue(undefined);
    executeTransaction.mockImplementation(async (cb) => cb({ runAsync: mockRunAsync }));
  });

  describe('mapLineFields', () => {
    it('parses the GROUP_CONCAT column into a list', () => {
      const line = BudgetPlansDB.mapLineFields(rawLine({ tracked_labels: `Аванс${SEP}Salary` }));
      expect(line.trackedLabels).toEqual(['Аванс', 'Salary']);
    });

    it('keeps a label containing a comma in one piece', () => {
      // The whole reason the set is not comma-joined like the other two.
      const line = BudgetPlansDB.mapLineFields(rawLine({ tracked_labels: `Bonus, Q3${SEP}Salary` }));
      expect(line.trackedLabels).toEqual(['Bonus, Q3', 'Salary']);
    });

    it('reads a line with no labels as an empty set — "not tracked by label"', () => {
      expect(BudgetPlansDB.mapLineFields(rawLine()).trackedLabels).toEqual([]);
      // A pre-0028 row selected without the column at all behaves identically.
      const legacy = rawLine();
      delete legacy.tracked_labels;
      expect(BudgetPlansDB.mapLineFields(legacy).trackedLabels).toEqual([]);
    });

    it('de-duplicates case-insensitively, keeping the first spelling', () => {
      const line = BudgetPlansDB.mapLineFields(rawLine({ tracked_labels: `Аванс${SEP}аванс${SEP}` }));
      expect(line.trackedLabels).toEqual(['Аванс']);
    });

    it('leaves a label-only income line un-broken', () => {
      const line = BudgetPlansDB.mapLineFields(rawLine({ tracked_labels: 'Salary' }));
      expect(line.isBroken).toBe(false);
    });
  });

  describe('validatePlanLine', () => {
    it('accepts an income line tracked by label alone', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'income', trackedLabels: ['Salary'],
      })).toBeNull();
    });

    it('accepts an income line with BOTH categories and labels — they intersect', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'income', categoryIds: ['cat1'], trackedLabels: ['Salary'],
      })).toBeNull();
    });

    it('rejects a label filter on an expense line', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'expense', categoryIds: ['cat1'], trackedLabels: ['Salary'],
      })).toBe('Only an income line can filter by label');
    });

    it('rejects a label filter on a transfer line', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'transfer', toAccountId: 2, trackedLabels: ['Salary'],
      })).toBe('Only an income line can filter by label');
    });
  });

  describe('addLine', () => {
    it('writes the labels into the junction inside the same transaction', async () => {
      const created = await BudgetPlansDB.addLine('p1', {
        amount: '100', kind: 'income', trackedLabels: ['Аванс', 'Advance'],
      });

      const inserts = mockRunAsync.mock.calls
        .filter(([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_labels'));
      expect(inserts.map(([, params]) => params)).toEqual([
        [created.id, 'Аванс'], [created.id, 'Advance'],
      ]);
      expect(created.trackedLabels).toEqual(['Аванс', 'Advance']);
    });

    it('normalizes labels on the way in', async () => {
      const created = await BudgetPlansDB.addLine('p1', {
        amount: '100',
        kind: 'income',
        // Padded, internally doubled whitespace, a duplicate in another case, and
        // an empty entry — none of which may reach the junction as written.
        trackedLabels: ['  Salary   bonus ', 'SALARY BONUS', '', null],
      });

      expect(created.trackedLabels).toEqual(['Salary bonus']);
      expect(mockRunAsync.mock.calls.filter(
        ([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_labels'),
      )).toHaveLength(1);
    });

    it('leaves the junction empty when no labels are asked for', async () => {
      await BudgetPlansDB.addLine('p1', { amount: '100', kind: 'income', categoryIds: ['cat1'] });

      expect(mockRunAsync.mock.calls.filter(
        ([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_labels'),
      )).toHaveLength(0);
    });
  });

  describe('updateLine', () => {
    it('rewrites the set, dropping what was there first', async () => {
      await BudgetPlansDB.updateLine('l1', { trackedLabels: ['Salary'] });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_labels WHERE line_id = ?', ['l1'],
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO budget_plan_line_labels'),
        ['l1', 'Salary'],
      );
    });

    it('clears the filter when passed an empty array', async () => {
      await BudgetPlansDB.updateLine('l1', { trackedLabels: [] });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_labels WHERE line_id = ?', ['l1'],
      );
      expect(mockRunAsync.mock.calls.filter(
        ([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_labels'),
      )).toHaveLength(0);
    });

    it('leaves the filter alone when the caller does not mention it', async () => {
      await BudgetPlansDB.updateLine('l1', { label: 'Renamed' });

      expect(executeQuery).toHaveBeenCalled();
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it('drops the filter when the line stops being an income line', async () => {
      await BudgetPlansDB.updateLine('l1', { kind: 'expense', categoryIds: ['cat1'] });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_labels WHERE line_id = ?', ['l1'],
      );
    });

    it('drops the filter when the line gains a transfer target', async () => {
      await BudgetPlansDB.updateLine('l1', { toAccountId: 2 });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_labels WHERE line_id = ?', ['l1'],
      );
    });

    it('rejects asking for labels on a line being turned into an allocation', async () => {
      await expect(BudgetPlansDB.updateLine('l1', { kind: 'expense', trackedLabels: ['Salary'] }))
        .rejects.toThrow('Only an income line can filter by label');
      await expect(BudgetPlansDB.updateLine('l1', { toAccountId: 2, trackedLabels: ['Salary'] }))
        .rejects.toThrow('Only an income line can filter by label');
    });
  });

  describe('copyPlan', () => {
    it('carries the labels into the cloned month', async () => {
      queryFirst.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM budget_plans WHERE month')) {
          return params[0] === '2026-07'
            ? { id: 'p1', month: '2026-07', currency: 'USD', expected_income: '0', created_at: 't', updated_at: 't' }
            : null;
        }
        return null;
      });
      queryAll.mockImplementation(async (sql) => (
        sql.includes('FROM budget_plan_lines')
          ? [rawLine({ id: 'l1', tracked_labels: `Аванс${SEP}Advance` })]
          : []
      ));

      await BudgetPlansDB.copyPlan('2026-07', '2026-08');

      const labelLinks = mockRunAsync.mock.calls
        .filter(([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_labels'))
        .map(([, params]) => params[1]);
      // Without this the copied "Аванс" line would count the whole salary
      // category next month — which its sibling line already counts.
      expect(labelLinks).toEqual(['Аванс', 'Advance']);
    });
  });

  describe('calculateIncomeForFilters', () => {
    const run = (overrides = {}) => BudgetPlansDB.calculateIncomeForFilters({
      currency: 'USD',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      convertAll: false,
      ...overrides,
    });

    it('counts only the operations carrying one of the labels', async () => {
      queryAll.mockResolvedValue([
        opRow('220000', 'Аванс'),
        opRow('240000', 'Зарплата'),
        opRow('1000', 'Аванс | июль'),
      ]);

      expect(parseFloat(await run({ labels: ['Аванс'] }))).toBe(221000);
    });

    it('treats several labels as alternatives (OR)', async () => {
      queryAll.mockResolvedValue([
        opRow('100', 'Аванс'),
        opRow('20', 'Advance'),
        opRow('7', 'Зарплата'),
      ]);

      expect(parseFloat(await run({ labels: ['Аванс', 'Advance'] }))).toBe(120);
    });

    it('matches labels case-insensitively but never as a substring', async () => {
      queryAll.mockResolvedValue([
        opRow('100', 'АВАНС'),
        opRow('50', 'Авансовый отчёт'),
      ]);

      expect(parseFloat(await run({ labels: ['аванс'] }))).toBe(100);
    });

    it('returns zero without querying when neither filter is set', async () => {
      expect(await run({})).toBe('0');
      expect(queryAll).not.toHaveBeenCalled();
    });

    it('filters by category in SQL, including descendants', async () => {
      CategoriesDB.getAllDescendants.mockResolvedValue([{ id: 'cat1-child' }]);
      queryAll.mockResolvedValue([opRow('500', 'Зарплата')]);

      await run({ categoryIds: ['cat1'] });

      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('o.category_id IN');
      expect(params).toEqual(expect.arrayContaining(['cat1', 'cat1-child']));
    });

    it('combines categories and labels by AND', async () => {
      queryAll.mockResolvedValue([
        opRow('100', 'Аванс'),
        opRow('900', 'Зарплата'),
      ]);

      // The category clause narrows the query; the label test then narrows the
      // rows it returned.
      expect(parseFloat(await run({ categoryIds: ['cat1'], labels: ['Аванс'] }))).toBe(100);
      expect(queryAll.mock.calls[0][0]).toContain('o.category_id IN');
    });

    it('counts only accounts in the display currency with convert-all off', async () => {
      queryAll.mockResolvedValue([opRow('100', 'Salary')]);

      await run({ labels: ['Salary'] });

      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('a.currency = ?');
      expect(params).toContain('USD');
    });

    it('converts every currency with convert-all on', async () => {
      fetchRatesToTarget.mockResolvedValue(new Map([['EUR', '2']]));
      convertWithRateMap.mockImplementation((amount, from, target, map) => (
        from === target ? amount : (map.get(from) ? String(parseFloat(amount) * parseFloat(map.get(from))) : null)
      ));
      queryAll.mockResolvedValue([
        opRow('100', 'Salary', 'USD'),
        opRow('50', 'Salary', 'EUR'),
      ]);

      const total = await run({ labels: ['Salary'], convertAll: true });

      expect(queryAll.mock.calls[0][0]).not.toContain('a.currency = ?');
      expect(parseFloat(total)).toBe(200); // 100 USD + 50 EUR × 2
    });

    it('drops a currency no rate can express, like the month total does', async () => {
      fetchRatesToTarget.mockResolvedValue(new Map());
      queryAll.mockResolvedValue([
        opRow('100', 'Salary', 'USD'),
        opRow('50', 'Salary', 'XYZ'),
      ]);

      expect(parseFloat(await run({ labels: ['Salary'], convertAll: true }))).toBe(100);
    });
  });

  describe('calculateLineActual — income lines', () => {
    const incomeLine = (overrides = {}) => ({
      id: 'l1', planId: 'p1', amount: '100', kind: 'income',
      categoryIds: [], sourceAccountIds: [], trackedLabels: [], toAccountId: null, ...overrides,
    });

    it('skips a line that tracks nothing rather than reporting a zero actual', async () => {
      const result = await BudgetPlansDB.calculateLineActual(incomeLine(), '2026-07', 'USD', false);

      expect(result).toEqual({ broken: false, actual: '0', skipped: true });
      expect(queryAll).not.toHaveBeenCalled();
    });

    it('reports the income matching its labels', async () => {
      queryAll.mockResolvedValue([opRow('220000', 'Аванс'), opRow('240000', 'Зарплата')]);

      const result = await BudgetPlansDB.calculateLineActual(
        incomeLine({ trackedLabels: ['Аванс'] }), '2026-07', 'USD', false,
      );

      expect(result.broken).toBe(false);
      expect(result.skipped).toBeUndefined();
      expect(parseFloat(result.actual)).toBe(220000);
    });

    it('reports the income in its categories when it has no labels', async () => {
      queryAll.mockResolvedValue([opRow('300', 'anything')]);

      const result = await BudgetPlansDB.calculateLineActual(
        incomeLine({ categoryIds: ['cat1'] }), '2026-07', 'USD', false,
      );

      expect(parseFloat(result.actual)).toBe(300);
    });
  });

  describe('calculatePlanStatus', () => {
    const PLAN_ROW = {
      id: 'p1', month: '2026-08', currency: 'RUB', expected_income: '0',
      created_at: 't', updated_at: 't',
    };

    const setupDb = (lines, incomeOps = []) => {
      queryFirst.mockImplementation(async (sql) => {
        if (sql.includes('FROM budget_plans WHERE id')) return PLAN_ROW;
        if (sql.includes("o.type = 'income'")) return { total: 0 };
        return null;
      });
      queryAll.mockImplementation(async (sql) => {
        if (sql.includes('is_recurring = 1') && !sql.includes('WHERE plan_id')) return [];
        if (sql.includes('FROM budget_plan_lines')) return lines;
        // The per-line income scan: rows, not a GROUP BY sum.
        if (sql.includes("o.type = 'income'") && sql.includes('o.description')) return incomeOps;
        return [];
      });
    };

    it('gives a label-tracked income line its own actual and progress', async () => {
      setupDb(
        [
          rawLine({ id: 'advance', amount: '220000', tracked_labels: 'Аванс' }),
          rawLine({ id: 'salary', amount: '240000', tracked_labels: 'Зарплата' }),
        ],
        [opRow('110000', 'Аванс', 'RUB'), opRow('240000', 'Зарплата', 'RUB')],
      );

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'RUB', false);
      const byId = new Map(status.lines.map(l => [l.lineId, l]));

      expect(byId.get('advance')).toMatchObject({
        tracked: true, percentage: 50, isExceeded: false, status: 'income',
      });
      expect(parseFloat(byId.get('advance').actual)).toBe(110000);
      expect(byId.get('salary')).toMatchObject({ tracked: true, percentage: 100 });
      // Both lines still declare the month's expected income...
      expect(parseFloat(status.totals.expectedIncome)).toBe(460000);
      // ...and their actuals stay out of the allocation figures, which count
      // spending. Adding them there would double-count against actualIncome.
      expect(parseFloat(status.totals.allocated)).toBe(0);
      expect(parseFloat(status.totals.totalActual)).toBe(0);
    });

    it('marks income above plan as exceeded so the row can celebrate it', async () => {
      setupDb(
        [rawLine({ id: 'salary', amount: '100', tracked_labels: 'Зарплата' })],
        [opRow('150', 'Зарплата', 'RUB')],
      );

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'RUB', false);

      expect(status.lines[0]).toMatchObject({ tracked: true, isExceeded: true, percentage: 150 });
      // NOT the 'exceeded' band: over plan on an income line is a win, and the
      // band names a spending problem.
      expect(status.lines[0].status).toBe('income');
    });

    it('leaves an untracked income line exactly as it was before 0028', async () => {
      setupDb([rawLine({ id: 'plain', amount: '460000' })]);

      const status = await BudgetPlansDB.calculatePlanStatus('p1', 'RUB', false);

      expect(status.lines[0]).toMatchObject({
        lineId: 'plain', tracked: false, actual: '0', percentage: 0, status: 'income',
      });
      expect(parseFloat(status.totals.expectedIncome)).toBe(460000);
    });
  });
});
