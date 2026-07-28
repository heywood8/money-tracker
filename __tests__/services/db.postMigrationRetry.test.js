/**
 * Regression tests for a critical data-loss bug (adversarial review of PR #1413):
 *
 * A stamped schema fingerprint (`PRAGMA user_version === SCHEMA_VERSION`) only
 * proves the DDL/columns are complete — it says nothing about whether a
 * post-migration data-bridge handler (e.g. migration 0019's
 * `migrateLegacyBudgetsToRecurringLines`) actually finished. Before this fix,
 * `initializeDatabase`'s fingerprint fast path (and its "schema already
 * complete" branch) skipped the handler-retry logic entirely, so a handler
 * that failed on the run which completed the schema (transient SQLite busy,
 * etc.) was NEVER retried on any subsequent launch — the user's legacy
 * per-category budgets would silently never become recurring plan lines, and
 * since the old budgets UI is gone, they would appear to have vanished.
 *
 * These tests use the REAL journal + postMigrationTags from
 * `drizzle/migrations` (so migration-index alignment with
 * `detectAppliedMigrations`'s hardcoded schema markers for m0019 — the
 * `budget_plan_lines.is_recurring`/`currency` columns — is exactly what
 * production sees), but substitute a fake `m0019` handler in place of the
 * real one. The real handler's own dynamic `import('../app/services/BudgetPlansDB')`
 * cannot execute under this project's Jest config (no --experimental-vm-modules),
 * which is an unrelated pre-existing testability gap, not part of this bug —
 * the real bridge logic itself already has direct unit coverage elsewhere
 * (BudgetPlansDB.test.js: migrateLegacyBudgetsToRecurringLines /
 * convertBudgetAmountToMonthly). This suite's job is narrower: prove
 * `initializeDatabase` retries an incomplete post-migration handler on every
 * launch path, regardless of which one already ran.
 */

jest.mock('../../drizzle/migrations', () => {
  const actual = jest.requireActual('../../drizzle/migrations').default;
  return {
    __esModule: true,
    default: {
      journal: actual.journal,
      migrations: actual.migrations,
      postMigrationTags: actual.postMigrationTags,
      postMigrationHandlers: {
        // m0003's bridge is unrelated to this bug — its completion flag is always
        // pre-seeded as "done" in the mocks below, so this handler is never invoked.
        m0003: jest.fn(() => Promise.resolve()),
        // Stand-in for migrateLegacyBudgetsToRecurringLines: performs the same
        // observable shape (an INSERT into budget_plan_lines per legacy budget,
        // then flips the completion flag) without touching the real module graph.
        m0019: jest.fn(async (db) => {
          const rows = await db.getAllAsync('SELECT * FROM budgets');
          const now = new Date().toISOString();
          for (const row of rows || []) {
            await db.runAsync(
              'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, created_at, updated_at) VALUES (?, NULL, NULL, ?, NULL, ?, NULL, 0, 1, ?, ?, ?)',
              ['fake-uuid', row.amount, row.category_id, row.currency, now, now],
            );
          }
          await db.runAsync(
            "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, 'true', ?)",
            ['post_migration_m0019_completed', now],
          );
        }),
      },
    },
  };
});

import { getDatabase, closeDatabase } from '../../app/services/db';
import * as SQLite from 'expo-sqlite';
import realMigrations from '../../drizzle/migrations';

const SCHEMA_VERSION = realMigrations.journal.entries.length;

describe('DB post-migration handler retry (data-loss regression, adversarial review)', () => {
  let mockDb;
  let budgetPlanLineInserts;

  const makeMockDb = ({ storedUserVersion, m0019Completed, legacyBudgetRows }) => {
    budgetPlanLineInserts = [];
    return {
      execAsync: jest.fn(() => Promise.resolve()),
      runAsync: jest.fn((sql, params) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO budget_plan_lines')) {
          budgetPlanLineInserts.push(params);
        }
        return Promise.resolve({ changes: 1, lastInsertRowId: 1 });
      }),
      getFirstAsync: jest.fn((sql, params) => {
        if (typeof sql === 'string' && sql.includes('user_version')) {
          return Promise.resolve({ user_version: storedUserVersion });
        }
        if (typeof sql === 'string' && sql.includes('trg_operations_type_insert')) {
          // migration 0007's type-enforcement trigger — report it as present so
          // isSchemaComplete() doesn't fall through to the CHECK-constraint probe.
          return Promise.resolve({ name: 'trg_operations_type_insert' });
        }
        if (typeof sql === 'string' && sql.includes('FROM app_metadata WHERE key')) {
          const key = params?.[0];
          if (key === 'post_migration_m0003_completed') {
            // m0003's bridge is irrelevant to this bug — treat as already done
            // so the test only exercises the m0019 path.
            return Promise.resolve({ value: 'true' });
          }
          if (key === 'post_migration_m0019_completed') {
            return Promise.resolve(m0019Completed ? { value: 'true' } : null);
          }
        }
        return Promise.resolve(null);
      }),
      getAllAsync: jest.fn((sql, params) => {
        if (typeof sql !== 'string') return Promise.resolve([]);
        // Schema-completeness / detectAppliedMigrations markers: report a fully
        // migrated schema (every table/column isSchemaComplete + detectAppliedMigrations checks for).
        if (sql.includes("type='table'") && !sql.includes('name=') && !sql.includes('__drizzle')) {
          return Promise.resolve([
            'accounts', 'categories', 'operations', 'budgets', 'app_metadata',
            'accounts_balance_history', 'planned_operations',
            'notification_merchant_rules', 'pending_notifications',
            'budget_plans', 'budget_plan_lines',
          ].map((name) => ({ name })));
        }
        if (sql.includes('name=') && params?.[0]) {
          // tableExists(name) helper used by detectAppliedMigrations
          const known = [
            'accounts', 'categories', 'operations', 'budgets', 'app_metadata',
            'accounts_balance_history', 'planned_operations',
            'notification_merchant_rules', 'pending_notifications',
            'budget_plans', 'budget_plan_lines',
          ];
          return Promise.resolve(known.includes(params[0]) ? [{ name: params[0] }] : []);
        }
        if (sql.includes('table_info(accounts)')) {
          return Promise.resolve([
            { name: 'id', type: 'INTEGER' }, { name: 'deleted_at', type: 'TEXT' },
            { name: 'card_mask', type: 'TEXT' }, { name: 'auto_txn_rounding', type: 'INTEGER' },
            { name: 'auto_txn_rounding_mode', type: 'TEXT' }, { name: 'show_in_main_menu', type: 'INTEGER' },
          ]);
        }
        if (sql.includes('table_info(operations)')) {
          return Promise.resolve([
            { name: 'id', type: 'INTEGER' }, { name: 'account_id', type: 'INTEGER' },
            { name: 'original_balance', type: 'TEXT' }, { name: 'latitude', type: 'REAL' },
            { name: 'longitude', type: 'REAL' }, { name: 'exclude_from_avg', type: 'INTEGER' },
            { name: 'exclude_from_charts', type: 'INTEGER' },
          ]);
        }
        if (sql.includes('table_info(categories)')) return Promise.resolve([{ name: 'id', type: 'INTEGER' }]);
        if (sql.includes('table_info(notification_merchant_rules)')) {
          return Promise.resolve([{ name: 'label_override', type: 'TEXT' }, { name: 'last_matched_at', type: 'TEXT' }]);
        }
        if (sql.includes('table_info(pending_notifications)')) {
          return Promise.resolve([{ name: 'latitude', type: 'REAL' }, { name: 'longitude', type: 'REAL' }]);
        }
        if (sql.includes('table_info(budget_plan_lines)')) {
          return Promise.resolve([{ name: 'is_recurring', type: 'INTEGER' }, { name: 'currency', type: 'TEXT' }]);
        }
        if (sql === 'SELECT * FROM budgets') {
          return Promise.resolve(legacyBudgetRows || []);
        }
        return Promise.resolve([]);
      }),
      closeAsync: jest.fn(() => Promise.resolve()),
      withTransactionAsync: jest.fn((cb) => cb()),
      createCustomFunctionAsync: jest.fn(() => Promise.resolve()),
      createFunctionAsync: jest.fn(() => Promise.resolve()),
    };
  };

  beforeEach(async () => {
    await closeDatabase();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await closeDatabase();
    } catch (_) {
      // ignore
    }
  });

  it('bridges legacy budgets on the fingerprint fast path when the handler never completed (simulated prior-launch crash)', async () => {
    // Simulates: migration 0019's DDL succeeded and the fingerprint got stamped
    // (schema is structurally complete), but migrateLegacyBudgetsToRecurringLines
    // threw on that run (e.g. SQLite busy) before writing its completion flag.
    mockDb = makeMockDb({
      storedUserVersion: SCHEMA_VERSION, // fingerprint already matches -> fast path
      m0019Completed: false, // handler never finished
      legacyBudgetRows: [
        { id: 'legacy-1', amount: '100', period_type: 'monthly', currency: 'USD', category_id: 'cat-1' },
      ],
    });
    SQLite.openDatabaseAsync.mockResolvedValue(mockDb);

    await getDatabase();

    // The legacy budget must have been bridged into a recurring plan line -
    // proof the retry ran even though we took the fingerprint fast path.
    expect(budgetPlanLineInserts.length).toBe(1);
    expect(budgetPlanLineInserts[0]).toEqual(
      expect.arrayContaining(['cat-1', 'USD']),
    );
    // And the completion flag write must have happened too.
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO app_metadata'),
      expect.arrayContaining(['post_migration_m0019_completed']),
    );
  });

  it('does NOT re-run the bridge on the fast path once the completion flag is set (steady state)', async () => {
    mockDb = makeMockDb({
      storedUserVersion: SCHEMA_VERSION,
      m0019Completed: true,
      legacyBudgetRows: [
        { id: 'legacy-1', amount: '100', period_type: 'monthly', currency: 'USD', category_id: 'cat-1' },
      ],
    });
    SQLite.openDatabaseAsync.mockResolvedValue(mockDb);

    await getDatabase();

    expect(budgetPlanLineInserts.length).toBe(0);
  });

  it('bridges legacy budgets when the schema-already-complete slow path is taken (fingerprint not yet stamped)', async () => {
    // Fingerprint stamping itself failed/never happened (e.g. process died right
    // after the DDL), so the OUTER fast path is bypassed, but isSchemaComplete()
    // still reports true because the columns exist.
    mockDb = makeMockDb({
      storedUserVersion: 0, // not stamped -> full path
      m0019Completed: false,
      legacyBudgetRows: [
        { id: 'legacy-2', amount: '60', period_type: 'weekly', currency: 'EUR', category_id: 'cat-2' },
      ],
    });
    SQLite.openDatabaseAsync.mockResolvedValue(mockDb);

    await getDatabase();

    expect(budgetPlanLineInserts.length).toBe(1);
    expect(budgetPlanLineInserts[0]).toEqual(
      expect.arrayContaining(['cat-2', 'EUR']),
    );
  });
});
