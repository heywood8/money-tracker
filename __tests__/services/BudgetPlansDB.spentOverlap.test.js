/**
 * "Spent" (totals.totalActual) and a group's actual count every operation once,
 * however many of the month's lines match it.
 *
 * Lines overlap routinely — a parent category next to one of its children, a
 * card-only line next to a category line, two lines receiving into one account —
 * and both figures used to be plain sums of the line actuals: Food (parent) and
 * Restaurants (child) with a single 100 restaurant bill reported 200 spent.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';
import * as CategoriesDB from '../../app/services/CategoriesDB';
import { calculateSpendingForFilters } from '../../app/services/BudgetsDB';
import { queryAll, queryFirst } from '../../app/services/db';
import {
  fetchRatesToTarget,
  convertWithRateMap,
  getTransferTotals,
  getUnconvertibleCurrencies,
} from '../../app/services/OperationsDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/CategoriesDB');
// The real union engine (calculateSpendingForAnyFilters) runs against the mocked
// db below; only the per-line engine is stubbed, as in the other suites.
jest.mock('../../app/services/BudgetsDB', () => ({
  ...jest.requireActual('../../app/services/BudgetsDB'),
  calculateSpendingForFilters: jest.fn(),
}));
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
  getTransferTotals: jest.fn(),
  getUnconvertibleCurrencies: jest.fn(),
}));

const PLAN_ROW = {
  id: 'p1', month: '2026-07', currency: 'USD', expected_income: '1000',
  created_at: 't', updated_at: 't',
};

const lineRow = (id, amount, { categoryId = null, toAccountId = null, groupId = null, sortOrder = 0 } = {}) => ({
  id, plan_id: 'p1', label: null, amount, comment: null,
  category_id: categoryId, category_ids: categoryId, to_account_id: toAccountId,
  sort_order: sortOrder, is_recurring: 0, currency: null, group_id: groupId,
  created_at: 't', updated_at: 't',
});

const groupRow = (id, label) => ({
  id, label, amount: null, currency: null, sort_order: 0, created_at: 't', updated_at: 't',
});

// Food is the parent of Restaurants.
const CHILDREN = { 'cat-food': ['cat-rest'] };

// One month of USD expenses. The fake db answers the union query from these,
// counting an operation when its category is in any of the queried sets — what
// SQLite does with the OR-ed WHERE.
const OPERATIONS = [
  { id: 1, categoryId: 'cat-rest', amount: 100 },
  { id: 2, categoryId: 'cat-transport', amount: 50 },
];

const setupDb = ({ lines, groups = [] }) => {
  queryFirst.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM budget_plans WHERE id')) return PLAN_ROW;
    if (sql.includes('SELECT currency FROM accounts')) return { currency: 'USD' };
    if (sql.includes("o.type = 'income'")) return { total: 0 };
    if (sql.includes("o.type = 'expense'")) {
      // Filter params come first; currency and the two dates close the list.
      const categories = new Set(params.slice(0, -3));
      const total = OPERATIONS
        .filter(op => categories.has(op.categoryId))
        .reduce((sum, op) => sum + op.amount, 0);
      return { total };
    }
    return null;
  });
  queryAll.mockImplementation(async (sql, params) => {
    if (sql.includes("o.type = 'expense'") && sql.includes('GROUP BY a.currency')) {
      // Convert-all form of the same sum: no currency param, one row per currency.
      const categories = new Set(params.slice(0, -2));
      const total = OPERATIONS
        .filter(op => categories.has(op.categoryId))
        .reduce((sum, op) => sum + op.amount, 0);
      return [{ currency: 'USD', total }];
    }
    if (sql.includes('FROM budget_plan_line_groups')) return groups;
    if (sql.includes('is_recurring = 1') && !sql.includes('WHERE l.plan_id')) return [];
    if (sql.includes('FROM budget_plan_lines')) return lines;
    return [];
  });
};

// Each line's own actual, as the per-line engine reports it: a category and
// its descendants.
const stubLineSpending = () => {
  calculateSpendingForFilters.mockImplementation(async ({ categoryIds }) => {
    const tracked = new Set(categoryIds.flatMap(id => [id, ...(CHILDREN[id] || [])]));
    return String(OPERATIONS.filter(op => tracked.has(op.categoryId)).reduce((sum, op) => sum + op.amount, 0));
  });
};

// The per-line engine is stubbed, so any expense sum the db sees is the union.
const unionQueries = () => queryFirst.mock.calls.filter(([sql]) => sql.includes("o.type = 'expense'"));

describe('BudgetPlansDB — "Spent" with overlapping lines', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    CategoriesDB.getAllDescendants.mockImplementation(async (id) =>
      (CHILDREN[id] || []).map(childId => ({ id: childId })));
    getTransferTotals.mockResolvedValue({ incoming: '0', outgoing: '0' });
    getUnconvertibleCurrencies.mockResolvedValue([]);
    fetchRatesToTarget.mockResolvedValue(new Map());
    convertWithRateMap.mockImplementation((amount, from, target) => (from === target ? amount : null));
    stubLineSpending();
  });

  it('counts an expense matched by a parent line and a child line once', async () => {
    setupDb({
      lines: [
        lineRow('l-food', '500', { categoryId: 'cat-food', groupId: 'g1' }),
        lineRow('l-rest', '200', { categoryId: 'cat-rest', groupId: 'g1', sortOrder: 1 }),
      ],
      groups: [groupRow('g1', 'Eating')],
    });

    const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

    // Each line still reports the bill it matches.
    const byId = new Map(status.lines.map(l => [l.lineId, l]));
    expect(parseFloat(byId.get('l-food').actual)).toBe(100);
    expect(parseFloat(byId.get('l-rest').actual)).toBe(100);
    // But it was one bill.
    expect(parseFloat(status.totals.totalActual)).toBe(100);
    expect(parseFloat(status.groups[0].actual)).toBe(100);
    expect(parseFloat(status.totals.actualRemainder)).toBe(-100);

    // Asked as the union of both lines' categories — for the month, and for
    // the group — descendants included and each bound once.
    expect(unionQueries()).toHaveLength(2);
    for (const [sql, params] of unionQueries()) {
      expect(sql).toContain('o.category_id IN (?,?)');
      expect(params.slice(0, -3)).toEqual(['cat-food', 'cat-rest']);
    }
  });

  it('asks for the month\'s spending in one query, however many lines it has', async () => {
    setupDb({
      lines: [
        lineRow('l-food', '500', { categoryId: 'cat-food' }),
        lineRow('l-transport', '80', { categoryId: 'cat-transport', sortOrder: 1 }),
        lineRow('l-other', '40', { categoryId: 'cat-other', sortOrder: 2 }),
      ],
    });

    const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

    expect(parseFloat(status.totals.totalActual)).toBe(150);
    const [[sql, params], ...more] = unionQueries();
    expect(more).toHaveLength(0);
    expect(sql).toContain('o.category_id IN (?,?,?,?)');
    expect(params.slice(0, -3)).toEqual(['cat-food', 'cat-rest', 'cat-transport', 'cat-other']);
  });

  it('counts it once with convert-all on as well', async () => {
    setupDb({
      lines: [
        lineRow('l-food', '500', { categoryId: 'cat-food' }),
        lineRow('l-rest', '200', { categoryId: 'cat-rest', sortOrder: 1 }),
      ],
    });

    const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', true);

    expect(parseFloat(status.totals.totalActual)).toBe(100);
  });

  it('counts the overlap once when the two lines sit in different groups', async () => {
    setupDb({
      lines: [
        lineRow('l-food', '500', { categoryId: 'cat-food', groupId: 'g1' }),
        lineRow('l-rest', '200', { categoryId: 'cat-rest', groupId: 'g2', sortOrder: 1 }),
      ],
      groups: [groupRow('g1', 'Groceries'), groupRow('g2', 'Going out')],
    });

    const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

    expect(parseFloat(status.totals.totalActual)).toBe(100);
    // Within its own group each line stands alone, so each keeps its actual.
    const byGroup = new Map(status.groups.map(g => [g.groupId, g]));
    expect(parseFloat(byGroup.get('g1').actual)).toBe(100);
    expect(parseFloat(byGroup.get('g2').actual)).toBe(100);
  });

  it('still adds up lines that cannot share an operation', async () => {
    setupDb({
      lines: [
        lineRow('l-rest', '200', { categoryId: 'cat-rest', groupId: 'g1' }),
        lineRow('l-transport', '80', { categoryId: 'cat-transport', groupId: 'g1', sortOrder: 1 }),
      ],
      groups: [groupRow('g1', 'Everyday')],
    });

    const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

    expect(parseFloat(status.totals.totalActual)).toBe(150);
    expect(parseFloat(status.groups[0].actual)).toBe(150);
  });

  it('counts transfers into one account once when two lines track it', async () => {
    getTransferTotals.mockResolvedValue({ incoming: '300', outgoing: '0' });
    setupDb({
      lines: [
        lineRow('l-savings', '500', { toAccountId: 7 }),
        lineRow('l-savings-again', '100', { toAccountId: 7, sortOrder: 1 }),
        lineRow('l-rest', '200', { categoryId: 'cat-rest', sortOrder: 2 }),
      ],
    });

    const status = await BudgetPlansDB.calculatePlanStatus('p1', 'USD', false);

    expect(parseFloat(status.totals.totalActual)).toBe(400);
  });
});
