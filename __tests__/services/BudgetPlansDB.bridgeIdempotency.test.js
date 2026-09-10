/**
 * Regression tests for the second half of issue #1697 — the Budgets v3 data
 * bridges were neither atomic nor idempotent per row.
 *
 * Both bridges walk their source table, insert one `budget_plan_lines` row per
 * source row, and only then write their completion flag. A process kill after
 * k of N inserts left the flag unset, so `retryIncompletePostMigrationHandlers`
 * ran the bridge again on the next launch — and because each line got a fresh
 * `uuid.v4()`, the re-run inserted k duplicates. The user's allocated total
 * silently doubled.
 *
 * The fake database below actually enforces the primary key and honours
 * `INSERT OR IGNORE`, so these tests assert what the user cares about (no
 * duplicate lines) rather than the shape of a SQL string.
 */

import * as BudgetPlansDB from '../../app/services/BudgetPlansDB';

jest.mock('../../app/services/db');
jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(),
  convertWithRateMap: jest.fn(),
  getTransferTotals: jest.fn(),
  getUnconvertibleCurrencies: jest.fn(),
  createOperationInTx: jest.fn(),
}));

// A fresh id per call — exactly what production does, and what made the re-run
// duplicate rows before the bridges derived their ids from the source row.
let mockUuidCounter = 0;
jest.mock('react-native-uuid', () => ({
  v4: jest.fn(() => `uuid-${++mockUuidCounter}`),
}));

/**
 * Minimal SQLite stand-in that keeps `budget_plan_lines` in a Map keyed by id,
 * so a second INSERT of the same id is a real primary-key conflict: rejected
 * under `INSERT OR IGNORE`, fatal otherwise. `crashAfter` stops the run partway
 * through, the way a process kill would, leaving the completion flag unwritten.
 */
const makeDb = ({ budgets = [], planned = [], plans = [], accounts = [], crashAfter = Infinity } = {}) => {
  const lines = new Map();
  const flags = new Set();
  let inserts = 0;

  const db = {
    lines,
    flags,
    getFirstAsync: jest.fn(async (sql, params) => {
      if (sql.includes('app_metadata')) return flags.has(params[0]) ? { value: 'true' } : null;
      if (sql.includes('budget_plans')) return plans.find(p => p.month === params[0]) || null;
      return null;
    }),
    getAllAsync: jest.fn(async (sql) => {
      if (sql.includes('FROM budgets')) return budgets;
      if (sql.includes('FROM planned_operations')) return planned;
      if (sql.includes('FROM budget_plans')) return plans;
      if (sql.includes('FROM accounts')) return accounts;
      // hasLineCategoriesTable and friends inspect sqlite_master.
      return [];
    }),
    runAsync: jest.fn(async (sql, params) => {
      if (sql.includes('INTO budget_plan_lines')) {
        if (++inserts > crashAfter) throw new Error('simulated process kill');
        const id = params[0];
        if (lines.has(id)) {
          if (!sql.startsWith('INSERT OR IGNORE')) {
            throw new Error(`UNIQUE constraint failed: budget_plan_lines.id (${id})`);
          }
          return { changes: 0 };
        }
        lines.set(id, params);
        return { changes: 1 };
      }
      if (sql.includes('app_metadata')) flags.add(params[0]);
      return { changes: 1 };
    }),
  };
  return db;
};

describe('post-migration bridge idempotency (issue #1697)', () => {
  beforeEach(() => {
    mockUuidCounter = 0;
    jest.clearAllMocks();
  });

  describe('migrateLegacyBudgetsToRecurringLines', () => {
    const budgets = [
      { id: 'b1', category_id: 'c1', amount: '100', currency: 'USD', period_type: 'monthly' },
      { id: 'b2', category_id: 'c2', amount: '200', currency: 'USD', period_type: 'monthly' },
      { id: 'b3', category_id: 'c3', amount: '300', currency: 'USD', period_type: 'monthly' },
    ];

    it('creates no duplicate lines when re-run after a crash mid-bridge', async () => {
      const crashed = makeDb({ budgets, crashAfter: 2 });
      await expect(BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(crashed))
        .rejects.toThrow('simulated process kill');

      // Two lines landed and the completion flag was never written, so the next
      // launch retries the whole bridge.
      expect(crashed.lines.size).toBe(2);
      expect(crashed.flags.size).toBe(0);

      const retry = makeDb({ budgets });
      retry.lines.set(...[...crashed.lines.entries()][0]);
      retry.lines.set(...[...crashed.lines.entries()][1]);

      const result = await BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(retry);

      expect(result.skipped).toBe(false);
      // One line per legacy budget — not five.
      expect(retry.lines.size).toBe(budgets.length);
      expect([...retry.lines.keys()].sort()).toEqual(['legacy-budget-b1', 'legacy-budget-b2', 'legacy-budget-b3']);
    });

    it('derives each line id from the budget it mirrors, so ids are stable across runs', async () => {
      const first = makeDb({ budgets });
      await BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(first);

      const second = makeDb({ budgets });
      await BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(second);

      expect([...second.lines.keys()]).toEqual([...first.lines.keys()]);
    });
  });

  describe('migratePlannedOperationsToLines', () => {
    const accounts = [{ id: 1, currency: 'USD' }];
    const planned = [
      { id: 'po1', type: 'expense', amount: '10', account_id: 1, is_recurring: 1, display_order: 0 },
      { id: 'po2', type: 'expense', amount: '20', account_id: 1, is_recurring: 1, display_order: 1 },
      { id: 'po3', type: 'expense', amount: '30', account_id: 1, is_recurring: 1, display_order: 2 },
    ];

    it('creates no duplicate lines when re-run after a crash mid-bridge', async () => {
      const crashed = makeDb({ planned, accounts, crashAfter: 2 });
      await expect(BudgetPlansDB.migratePlannedOperationsToLines(crashed))
        .rejects.toThrow('simulated process kill');
      expect(crashed.lines.size).toBe(2);
      expect(crashed.flags.size).toBe(0);

      const retry = makeDb({ planned, accounts });
      for (const [id, params] of crashed.lines) retry.lines.set(id, params);

      await BudgetPlansDB.migratePlannedOperationsToLines(retry);

      expect(retry.lines.size).toBe(planned.length);
      expect([...retry.lines.keys()].sort()).toEqual(['legacy-planned-po1', 'legacy-planned-po2', 'legacy-planned-po3']);
    });

    it('bridges a plan expected_income at most once', async () => {
      const plans = [{ id: 'p1', month: '2026-01', currency: 'USD', expected_income: '450' }];
      const first = makeDb({ plans, accounts });
      await BudgetPlansDB.migratePlannedOperationsToLines(first);
      expect([...first.lines.keys()]).toEqual(['legacy-income-p1']);

      const retry = makeDb({ plans, accounts });
      for (const [id, params] of first.lines) retry.lines.set(id, params);
      await BudgetPlansDB.migratePlannedOperationsToLines(retry);

      expect(retry.lines.size).toBe(1);
    });
  });
});
