/**
 * Tests for the effective month range of a recurring budget line (migration
 * 0026) — the mechanism that stops editing a recurring budget from rewriting the
 * months already spent against the old one.
 *
 * Covers what a per-month read asks for, the version split an edit performs (and
 * the three cases where it deliberately doesn't), where a newly recurring line
 * starts, and deletion closing a line instead of erasing its history.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { executeQuery, queryAll, queryFirst, executeTransaction } from '../../app/services/db';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
jest.mock('../../app/services/BudgetsDB', () => ({
  ...jest.requireActual('../../app/services/BudgetsDB'),
  calculateSpendingForFilters: jest.fn().mockResolvedValue('0'),
}));
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn().mockResolvedValue(new Map()),
  convertWithRateMap: jest.fn((amount, from, to) => (from === to ? amount : null)),
  getTransferTotals: jest.fn().mockResolvedValue({ incoming: '0', outgoing: '0' }),
  getUnconvertibleCurrencies: jest.fn().mockResolvedValue([]),
  createOperationInTx: jest.fn(),
}));

let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

const rawLine = (overrides = {}) => ({
  id: 'l1',
  plan_id: null,
  label: 'Groceries',
  amount: '40000',
  comment: null,
  category_id: 'cat1',
  category_ids: 'cat1',
  source_account_ids: null,
  to_account_id: null,
  sort_order: 0,
  is_recurring: 1,
  currency: 'RUB',
  kind: 'expense',
  account_id: null,
  last_executed_month: null,
  group_id: null,
  effective_from: null,
  effective_to: null,
  created_at: 't',
  updated_at: 't',
  ...overrides,
});

let mockRunAsync;

/** Every runAsync call whose SQL contains `fragment`. */
const runCalls = (fragment) =>
  mockRunAsync.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes(fragment));

/** One value out of an UPDATE/INSERT call, by the column it is bound to. */
const boundValue = (call, column) => {
  const columns = call[0].includes('INSERT')
    ? call[0].slice(call[0].indexOf('(') + 1, call[0].indexOf(')')).split(',').map(c => c.trim())
    : call[0].slice(call[0].indexOf('SET ') + 4, call[0].indexOf(' WHERE')).split(',').map(c => c.trim().replace(' = ?', ''));
  return call[1][columns.indexOf(column)];
};

describe('BudgetPlansDB recurring-line history (migration 0026)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidCounter = 0;
    executeQuery.mockResolvedValue(undefined);
    queryAll.mockResolvedValue([]);
    queryFirst.mockResolvedValue(null);
    CategoriesDB.getAllDescendants.mockResolvedValue([]);
    mockRunAsync = jest.fn().mockResolvedValue(undefined);
    executeTransaction.mockImplementation(async (cb) => cb({ runAsync: mockRunAsync }));
  });

  describe('reading a month', () => {
    it('asks only for the recurring lines whose range covers the month', async () => {
      await BudgetPlansDB.getRecurringLinesForMonth('2026-08');

      const [sql, params] = queryAll.mock.calls[0];
      expect(sql).toContain('l.is_recurring = 1');
      expect(sql).toContain('l.effective_from IS NULL OR l.effective_from <= ?');
      expect(sql).toContain('l.effective_to IS NULL OR l.effective_to >= ?');
      expect(params).toEqual(['2026-08', '2026-08']);
    });

    it('rejects a month that is not a month, rather than reading every line', async () => {
      await expect(BudgetPlansDB.getRecurringLinesForMonth('2026-13')).rejects.toThrow(/valid month/);
      await expect(BudgetPlansDB.getRecurringLinesForMonth(undefined)).rejects.toThrow(/valid month/);
      expect(queryAll).not.toHaveBeenCalled();
    });

    it('surfaces both bounds on a mapped line', async () => {
      const line = BudgetPlansDB.mapLineFields(
        rawLine({ effective_from: '2026-03', effective_to: '2026-07' }),
      );
      expect(line).toMatchObject({ effectiveFrom: '2026-03', effectiveTo: '2026-07' });
    });

    it('reads a pre-0026 line (no bounds) as applying to every month', () => {
      expect(BudgetPlansDB.mapLineFields(rawLine())).toMatchObject({
        effectiveFrom: null,
        effectiveTo: null,
      });
    });

    it('scopes the month view to the month, not to every recurring line ever', async () => {
      queryFirst.mockResolvedValue({ id: 'p1', month: '2026-08', currency: 'RUB' });
      await BudgetPlansDB.getLinesForMonth('2026-08');

      const monthScoped = queryAll.mock.calls.filter(([sql]) => sql.includes('l.effective_from'));
      expect(monthScoped).toHaveLength(1);
      expect(monthScoped[0][1]).toEqual(['2026-08', '2026-08']);
    });
  });

  describe('adding', () => {
    it('starts a recurring line at the month it was added in', async () => {
      await BudgetPlansDB.addRecurringLine({
        amount: '40000', currency: 'RUB', categoryId: 'cat1', effectiveFrom: '2026-08',
      });

      const insert = runCalls('INSERT INTO budget_plan_lines')[0];
      expect(boundValue(insert, 'effective_from')).toBe('2026-08');
      expect(boundValue(insert, 'effective_to')).toBeNull();
    });

    it('leaves a one-off line unbounded — its plan already names its month', async () => {
      await BudgetPlansDB.addLine('p1', { amount: '500', categoryId: 'cat1', effectiveFrom: '2026-08' });

      const insert = runCalls('INSERT INTO budget_plan_lines')[0];
      expect(boundValue(insert, 'effective_from')).toBeNull();
      expect(boundValue(insert, 'effective_to')).toBeNull();
    });

    it('keeps a recurring line unbounded when no month is given (the legacy bridge)', async () => {
      await BudgetPlansDB.addRecurringLine({ amount: '40000', currency: 'RUB', categoryId: 'cat1' });

      const insert = runCalls('INSERT INTO budget_plan_lines')[0];
      expect(boundValue(insert, 'effective_from')).toBeNull();
    });
  });

  describe('editing a recurring line splits it in two', () => {
    it('opens a new version at the edited month and closes the old one before it', async () => {
      queryFirst.mockResolvedValue(rawLine());

      const newId = await BudgetPlansDB.updateLine('l1', { amount: '50000' }, { fromMonth: '2026-08' });

      expect(newId).toBe('uuid-1');
      // The copy starts where the edit does and inherits the original's end.
      const clone = runCalls('INSERT INTO budget_plan_lines')[0];
      expect(clone[0]).toContain('SELECT ?');
      expect(clone[1][0]).toBe('uuid-1');
      expect(clone[1][1]).toBe('2026-08');
      expect(clone[1][clone[1].length - 1]).toBe('l1');

      // The new amount lands on the COPY, never on the row the past months read.
      const update = runCalls('SET amount = ?')[0];
      expect(update[1]).toEqual(expect.arrayContaining(['50000', 'uuid-1']));
      expect(update[1]).not.toContain('l1');

      // ...and the original is closed at the month before the edit.
      const close = runCalls('SET effective_to = ?')[0];
      expect(close[1][0]).toBe('2026-07');
      expect(close[1][2]).toBe('l1');
    });

    it('carries the category and account links onto the new version', async () => {
      queryFirst.mockResolvedValue(rawLine());

      await BudgetPlansDB.updateLine('l1', { amount: '50000' }, { fromMonth: '2026-08' });

      expect(runCalls('INTO budget_plan_line_categories')[0][1]).toEqual(['uuid-1', 'l1']);
      expect(runCalls('INTO budget_plan_line_accounts')[0][1]).toEqual(['uuid-1', 'l1']);
    });

    it('rewrites the links on the new version when the edit changes them', async () => {
      queryFirst.mockResolvedValue(rawLine());

      await BudgetPlansDB.updateLine('l1', { categoryIds: ['cat2'] }, { fromMonth: '2026-08' });

      const deletes = runCalls('DELETE FROM budget_plan_line_categories');
      expect(deletes).toHaveLength(1);
      expect(deletes[0][1]).toEqual(['uuid-1']);
      const links = runCalls('INTO budget_plan_line_categories (line_id, category_id) VALUES');
      expect(links[0][1]).toEqual(['uuid-1', 'cat2']);
    });

    it('closes December when the edit is made in January', async () => {
      queryFirst.mockResolvedValue(rawLine());

      await BudgetPlansDB.updateLine('l1', { amount: '50000' }, { fromMonth: '2027-01' });

      expect(runCalls('SET effective_to = ?')[0][1][0]).toBe('2026-12');
    });

    it('splits a version that was itself superseded later, keeping the later one intact', async () => {
      // The March–July version, edited from a June the user navigated back to.
      queryFirst.mockResolvedValue(rawLine({ effective_from: '2026-03', effective_to: '2026-07' }));

      await BudgetPlansDB.updateLine('l1', { amount: '45000' }, { fromMonth: '2026-06' });

      // The copy covers June–July only: the clone inherits `effective_to` from
      // the row it copies, so August's own version is untouched.
      const clone = runCalls('INSERT INTO budget_plan_lines')[0];
      expect(clone[0]).toContain('effective_to');
      expect(clone[1][1]).toBe('2026-06');
      expect(runCalls('SET effective_to = ?')[0][1][0]).toBe('2026-05');
    });

    it('moves a line out of recurring without leaving a range on the one-off successor', async () => {
      queryFirst.mockResolvedValue(rawLine());

      await BudgetPlansDB.updateLine(
        'l1',
        { isRecurring: false, planId: 'p1', currency: 'RUB' },
        { fromMonth: '2026-08' },
      );

      const update = runCalls('is_recurring = ?')[0];
      expect(boundValue(update, 'effective_from')).toBeNull();
      expect(boundValue(update, 'effective_to')).toBeNull();
      expect(boundValue(update, 'plan_id')).toBe('p1');
      // The recurring original still stands for the months before the change.
      expect(runCalls('SET effective_to = ?')[0][1][0]).toBe('2026-07');
    });
  });

  describe('editing in place, where a split would change nothing', () => {
    it('refines a version that already starts at the edited month', async () => {
      queryFirst.mockResolvedValue(rawLine({ effective_from: '2026-08' }));

      const id = await BudgetPlansDB.updateLine('l1', { amount: '50000' }, { fromMonth: '2026-08' });

      expect(id).toBe('l1');
      expect(runCalls('INSERT INTO budget_plan_lines')).toHaveLength(0);
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE budget_plan_lines SET amount = ?'),
        expect.arrayContaining(['50000', 'l1']),
      );
    });

    it('leaves a one-off line alone — it only ever spoke for its own month', async () => {
      queryFirst.mockResolvedValue(rawLine({ is_recurring: 0, plan_id: 'p1', currency: null }));

      const id = await BudgetPlansDB.updateLine('l1', { amount: '600' }, { fromMonth: '2026-08' });

      expect(id).toBe('l1');
      expect(runCalls('INSERT INTO budget_plan_lines')).toHaveLength(0);
    });

    it('edits every month at once when no month is given (backup/import paths)', async () => {
      queryFirst.mockResolvedValue(rawLine());

      const id = await BudgetPlansDB.updateLine('l1', { amount: '50000' });

      expect(id).toBe('l1');
      expect(queryFirst).not.toHaveBeenCalled();
      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE budget_plan_lines'),
        expect.arrayContaining(['50000', 'l1']),
      );
    });

    it('starts a one-off line at the current month when it becomes recurring', async () => {
      queryFirst.mockResolvedValue(rawLine({ is_recurring: 0, plan_id: 'p1', currency: null }));
      const plan = { id: 'p1', month: '2026-08', currency: 'RUB' };
      queryFirst
        .mockResolvedValueOnce(rawLine({ is_recurring: 0, plan_id: 'p1', currency: null }))
        .mockResolvedValueOnce(plan);

      await BudgetPlansDB.updateLine(
        'l1',
        { isRecurring: true, currency: 'RUB' },
        { fromMonth: '2026-08' },
      );

      // No split — the line spoke for one month until now — but it must not
      // claim every month that came before it either.
      expect(runCalls('INSERT INTO budget_plan_lines')).toHaveLength(0);
      const [sql, values] = executeQuery.mock.calls[0];
      const columns = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(' WHERE')).split(',').map(c => c.trim().replace(' = ?', ''));
      expect(values[columns.indexOf('effective_from')]).toBe('2026-08');
      expect(values[columns.indexOf('effective_to')]).toBeNull();
    });

    it('ignores a month key that is not one', async () => {
      queryFirst.mockResolvedValue(rawLine());

      const id = await BudgetPlansDB.updateLine('l1', { amount: '50000' }, { fromMonth: 'August' });

      expect(id).toBe('l1');
      expect(runCalls('INSERT INTO budget_plan_lines')).toHaveLength(0);
    });
  });

  describe('deleting', () => {
    it('closes a recurring line that has months behind it instead of erasing them', async () => {
      queryFirst.mockResolvedValue({ is_recurring: 1, effective_from: '2026-01', effective_to: null });

      await BudgetPlansDB.deleteLine('l1', { fromMonth: '2026-08' });

      expect(executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET effective_to = ?'),
        expect.arrayContaining(['2026-07', 'l1']),
      );
      expect(executeQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM budget_plan_lines'),
        expect.anything(),
      );
    });

    it('deletes a recurring line that never applied before this month', async () => {
      queryFirst.mockResolvedValue({ is_recurring: 1, effective_from: '2026-08', effective_to: null });

      await BudgetPlansDB.deleteLine('l1', { fromMonth: '2026-08' });

      expect(executeQuery).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_lines WHERE id = ?',
        ['l1'],
      );
    });

    it('deletes a one-off line outright', async () => {
      queryFirst.mockResolvedValue({ is_recurring: 0, effective_from: null, effective_to: null });

      await BudgetPlansDB.deleteLine('l1', { fromMonth: '2026-08' });

      expect(executeQuery).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_lines WHERE id = ?',
        ['l1'],
      );
    });

    it('deletes unconditionally when no month is given', async () => {
      await BudgetPlansDB.deleteLine('l1');

      expect(queryFirst).not.toHaveBeenCalled();
      expect(executeQuery).toHaveBeenCalledWith(
        'DELETE FROM budget_plan_lines WHERE id = ?',
        ['l1'],
      );
    });
  });

  describe("a month's plan-vs-actual", () => {
    it('totals the versions effective in the plan month, not every version', async () => {
      queryFirst.mockResolvedValue({
        id: 'p1', month: '2026-05', currency: 'RUB', expected_income: '0',
        created_at: 't', updated_at: 't',
      });
      queryAll.mockResolvedValue([]);

      await BudgetPlansDB.calculatePlanStatus('p1');

      const recurringRead = queryAll.mock.calls.find(([sql]) => sql.includes('l.effective_from'));
      expect(recurringRead).toBeTruthy();
      expect(recurringRead[1]).toEqual(['2026-05', '2026-05']);
    });
  });
});
