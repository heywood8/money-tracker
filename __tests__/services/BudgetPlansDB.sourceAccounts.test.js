/**
 * Tests for the per-line SOURCE ACCOUNT filter (migration 0024): the second,
 * independent dimension a budget line can narrow spending by — WHERE the money
 * left from — combined with the category set by logical AND.
 *
 * Covers the mapping of the junction column, validation (either filter alone is
 * enough; neither is broken; the filter is meaningless on transfer/income
 * lines), the junction writes on insert/update/copy, and what
 * calculateLineActual asks the spending engine for in each combination.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { calculateSpendingForFilters } from '../../app/services/BudgetsDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
// Keep everything in BudgetsDB real except the spending engine — what this suite
// asserts is which FILTERS reach it, not how it sums.
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

// A raw budget_plan_lines row as LINE_SELECT returns it: the two GROUP_CONCAT
// columns ride along with the row.
const rawLine = (overrides = {}) => ({
  id: 'l1',
  plan_id: 'p1',
  label: null,
  amount: '100',
  comment: null,
  category_id: null,
  category_ids: null,
  source_account_ids: null,
  to_account_id: null,
  sort_order: 0,
  is_recurring: 0,
  currency: null,
  kind: 'expense',
  account_id: null,
  last_executed_month: null,
  group_id: null,
  created_at: 't',
  updated_at: 't',
  ...overrides,
});

let mockRunAsync;

describe('BudgetPlansDB source-account filter (migration 0024)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    CategoriesDB.getAllDescendants.mockResolvedValue([]);
    calculateSpendingForFilters.mockResolvedValue('0');
    getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    getUnconvertibleCurrencies.mockResolvedValue([]);
    fetchRatesToTarget.mockResolvedValue(new Map());
    convertWithRateMap.mockImplementation((amount, f, t) => (f === t ? amount : null));
    mockRunAsync = jest.fn().mockResolvedValue(undefined);
    executeTransaction.mockImplementation(async (cb) => cb({ runAsync: mockRunAsync }));
  });

  describe('mapLineFields', () => {
    it('parses the GROUP_CONCAT column into numbers', () => {
      // Account ids are an integer autoincrement; GROUP_CONCAT hands them back as
      // a string, and a UI comparing '3' against 3 would highlight nothing.
      const line = BudgetPlansDB.mapLineFields(rawLine({ source_account_ids: '3,7' }));
      expect(line.sourceAccountIds).toEqual([3, 7]);
    });

    it('reads a line with no filter as an empty set — "any account"', () => {
      expect(BudgetPlansDB.mapLineFields(rawLine()).sourceAccountIds).toEqual([]);
      // A pre-0024 row selected without the column at all behaves identically.
      const legacy = rawLine();
      delete legacy.source_account_ids;
      expect(BudgetPlansDB.mapLineFields(legacy).sourceAccountIds).toEqual([]);
    });

    it('de-duplicates and drops unparseable entries', () => {
      const line = BudgetPlansDB.mapLineFields(rawLine({ source_account_ids: '3,3,,x,7' }));
      expect(line.sourceAccountIds).toEqual([3, 7]);
    });

    it('does not report an account-only line as broken', () => {
      const line = BudgetPlansDB.mapLineFields(rawLine({ source_account_ids: '3' }));
      expect(line.isBroken).toBe(false);
    });

    it('still reports a line with neither filter nor target as broken', () => {
      expect(BudgetPlansDB.mapLineFields(rawLine()).isBroken).toBe(true);
    });
  });

  describe('validatePlanLine', () => {
    it('accepts an expense line with only a source-account filter', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'expense', sourceAccountIds: [3],
      })).toBeNull();
    });

    it('accepts an expense line with BOTH filters — they intersect, not conflict', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'expense', categoryIds: ['cat1'], sourceAccountIds: [3],
      })).toBeNull();
    });

    it('rejects an expense line with neither filter', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'expense', sourceAccountIds: [],
      })).toBe('A line must link to a category or an account');
    });

    it('rejects a source filter on a transfer line', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'transfer', toAccountId: 2, sourceAccountIds: [3],
      })).toBe('A transfer line cannot filter by spending account');
    });

    it('rejects a source filter on an income line', () => {
      expect(BudgetPlansDB.validatePlanLine({
        amount: '100', kind: 'income', sourceAccountIds: [3],
      })).toBe('An income line cannot filter by spending account');
    });
  });

  describe('addLine', () => {
    it('writes the filter into the junction inside the same transaction', async () => {
      const created = await BudgetPlansDB.addLine('p1', {
        amount: '100', kind: 'expense', categoryIds: ['cat1'], sourceAccountIds: [3, 7],
      });

      const inserts = mockRunAsync.mock.calls
        .filter(([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_accounts'));
      expect(inserts.map(([, params]) => params)).toEqual([
        [created.id, 3], [created.id, 7],
      ]);
      expect(created.sourceAccountIds).toEqual([3, 7]);
    });

    it('leaves the junction empty when no filter is asked for', async () => {
      await BudgetPlansDB.addLine('p1', { amount: '100', kind: 'expense', categoryIds: ['cat1'] });

      expect(mockRunAsync.mock.calls.filter(
        ([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_accounts'),
      )).toHaveLength(0);
    });
  });

  describe('updateLine', () => {
    it('rewrites the filter, dropping what was there first', async () => {
      await BudgetPlansDB.updateLine('l1', { sourceAccountIds: [7] });

      const calls = mockRunAsync.mock.calls.map(([sql]) => sql);
      expect(calls.some(sql => sql.includes('DELETE FROM budget_plan_line_accounts'))).toBe(true);
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO budget_plan_line_accounts'),
        ['l1', 7],
      );
    });

    it('clears the filter when passed an empty array', async () => {
      await BudgetPlansDB.updateLine('l1', { sourceAccountIds: [] });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_accounts WHERE line_id = ?', ['l1'],
      );
      expect(mockRunAsync.mock.calls.filter(
        ([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_accounts'),
      )).toHaveLength(0);
    });

    it('leaves the filter alone when the caller does not mention it', async () => {
      await BudgetPlansDB.updateLine('l1', { label: 'Renamed' });

      // No junction touch at all — a partial update must not silently widen a
      // line back to "any account".
      expect(executeQuery).toHaveBeenCalled();
      expect(mockRunAsync).not.toHaveBeenCalled();
    });

    it('drops the filter when the line gains a transfer target', async () => {
      await BudgetPlansDB.updateLine('l1', { toAccountId: 2 });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_accounts WHERE line_id = ?', ['l1'],
      );
    });

    it('drops the filter when the line becomes an income line', async () => {
      await BudgetPlansDB.updateLine('l1', { kind: 'income' });

      expect(mockRunAsync).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_line_accounts WHERE line_id = ?', ['l1'],
      );
    });

    it('rejects asking for a filter and a transfer target in one update', async () => {
      await expect(BudgetPlansDB.updateLine('l1', { toAccountId: 2, sourceAccountIds: [3] }))
        .rejects.toThrow('A transfer line cannot filter by spending account');
      await expect(BudgetPlansDB.updateLine('l1', { kind: 'transfer', sourceAccountIds: [3] }))
        .rejects.toThrow('A transfer line cannot filter by spending account');
    });

    it('rejects asking for a filter on a line being turned into income', async () => {
      await expect(BudgetPlansDB.updateLine('l1', { kind: 'income', sourceAccountIds: [3] }))
        .rejects.toThrow('An income line cannot filter by spending account');
    });
  });

  describe('copyPlan', () => {
    it('carries the filter into the cloned month', async () => {
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
          ? [rawLine({ id: 'l1', category_ids: 'cat1', source_account_ids: '3,7' })]
          : []
      ));

      await BudgetPlansDB.copyPlan('2026-07', '2026-08');

      const accountLinks = mockRunAsync.mock.calls
        .filter(([sql]) => sql.includes('INSERT OR IGNORE INTO budget_plan_line_accounts'))
        .map(([, params]) => params[1]);
      // A "card only" budget must not silently widen to every account next month.
      expect(accountLinks).toEqual([3, 7]);
    });
  });

  describe('calculateLineActual', () => {
    const line = (overrides) => ({
      id: 'l1', planId: 'p1', amount: '100', kind: 'expense',
      categoryIds: [], sourceAccountIds: [], toAccountId: null, ...overrides,
    });

    it('asks for the intersection when both filters are set', async () => {
      calculateSpendingForFilters.mockResolvedValue('42');

      const result = await BudgetPlansDB.calculateLineActual(
        line({ categoryIds: ['cat1'], sourceAccountIds: [3] }), '2026-07', 'USD', false,
      );

      expect(result).toEqual({ broken: false, actual: '42' });
      expect(calculateSpendingForFilters).toHaveBeenCalledWith({
        categoryIds: ['cat1'],
        accountIds: [3],
        currency: 'USD',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        includeChildren: true,
        convertAll: false,
      });
    });

    it('counts every category when only accounts are filtered', async () => {
      await BudgetPlansDB.calculateLineActual(
        line({ sourceAccountIds: [3, 7] }), '2026-07', 'USD', true,
      );

      expect(calculateSpendingForFilters).toHaveBeenCalledWith(
        expect.objectContaining({ categoryIds: [], accountIds: [3, 7], convertAll: true }),
      );
    });

    it('counts every account when only categories are filtered', async () => {
      await BudgetPlansDB.calculateLineActual(
        line({ categoryIds: ['cat1'] }), '2026-07', 'USD', false,
      );

      expect(calculateSpendingForFilters).toHaveBeenCalledWith(
        expect.objectContaining({ categoryIds: ['cat1'], accountIds: [] }),
      );
    });

    it('reports a line with neither filter as broken without querying', async () => {
      const result = await BudgetPlansDB.calculateLineActual(line(), '2026-07', 'USD', false);

      expect(result).toEqual({ broken: true, actual: '0' });
      expect(calculateSpendingForFilters).not.toHaveBeenCalled();
    });
  });

  describe('getBrokenLines', () => {
    it('does not offer an account-only line up for re-linking', async () => {
      await BudgetPlansDB.getBrokenLines('p1');

      const [sql] = queryAll.mock.calls[0];
      expect(sql).toContain('budget_plan_line_accounts');
      expect(sql).toContain('NOT EXISTS');
    });
  });
});
