/**
 * Tests for the startup schema-version fast path (issue #1341).
 *
 * The fast path stores the schema fingerprint in `PRAGMA user_version` after a
 * successful init, then on subsequent cold starts reads that one value and skips
 * the expensive schema-inspection + migration-detection sweep when it matches.
 *
 * These tests lock the safety invariants:
 *   - up-to-date DB (fingerprint matches)  -> fast path, no inspection queries
 *   - fresh install (no fingerprint)        -> full path, fingerprint written after
 *   - stale DB (older fingerprint)           -> full path, migrations applied
 *   - corrupted DB                           -> recovery still triggered
 *   - per-connection PRAGMAs run on EVERY open (both paths)
 *
 * This file overrides the global (empty) migrations mock from jest.setup.js with a
 * synthetic journal of 3 entries, so SCHEMA_VERSION resolves to 3 and the fast
 * path is actually reachable (it is inert when SCHEMA_VERSION === 0).
 */

// Override the empty migrations mock from jest.setup.js. Three journal entries →
// SCHEMA_VERSION (migrations.journal.entries.length) === 3.
jest.mock('../../drizzle/migrations', () => ({
  __esModule: true,
  default: {
    journal: {
      version: '7',
      dialect: 'sqlite',
      entries: [
        { idx: 0, version: '6', when: 1, tag: '0000_a', breakpoints: true },
        { idx: 1, version: '6', when: 2, tag: '0001_b', breakpoints: true },
        { idx: 2, version: '6', when: 3, tag: '0002_c', breakpoints: true },
      ],
    },
    migrations: {
      m0000: 'CREATE TABLE t0 (id integer);',
      m0001: 'CREATE TABLE t1 (id integer);',
      m0002: 'CREATE TABLE t2 (id integer);',
    },
  },
}));

const SCHEMA_VERSION = 3; // must equal the journal entry count above

import { getDatabase, closeDatabase, dropAllTables } from '../../app/services/db';
import * as SQLite from 'expo-sqlite';

// The nine tables isSchemaComplete() expects, plus per-table columns that satisfy
// every column check in it. Used to simulate a genuinely complete post-migration
// schema so the fast-path fingerprint is stamped (the stamp is now gated on
// isSchemaComplete — a half-applied migration must NOT be stamped).
const COMPLETE_TABLES = [
  'accounts', 'categories', 'operations', 'budgets', 'app_metadata',
  'accounts_balance_history', 'planned_operations',
  'notification_merchant_rules', 'pending_notifications',
];
const mockSchemaComplete = (db, storedUserVersion) => {
  db.getFirstAsync.mockImplementation((q) => {
    if (typeof q === 'string' && q.includes('user_version')) {
      return Promise.resolve({ user_version: storedUserVersion });
    }
    if (typeof q === 'string' && q.includes('trg_operations_type_insert')) {
      return Promise.resolve({ name: 'trg_operations_type_insert' });
    }
    return Promise.resolve(null);
  });
  db.getAllAsync.mockImplementation((q) => {
    if (typeof q !== 'string') return Promise.resolve([]);
    if (q.includes("type='table'") && !q.includes('name=') && !q.includes('__drizzle')) {
      return Promise.resolve(COMPLETE_TABLES.map((name) => ({ name })));
    }
    if (q.includes('table_info(accounts)')) {
      return Promise.resolve([
        { name: 'id', type: 'INTEGER' }, { name: 'deleted_at', type: 'TEXT' },
        { name: 'card_mask', type: 'TEXT' }, { name: 'auto_txn_rounding', type: 'INTEGER' },
        { name: 'auto_txn_rounding_mode', type: 'TEXT' }, { name: 'show_in_main_menu', type: 'INTEGER' },
      ]);
    }
    if (q.includes('table_info(operations)')) {
      return Promise.resolve([
        { name: 'original_balance', type: 'TEXT' }, { name: 'latitude', type: 'REAL' },
        { name: 'longitude', type: 'REAL' }, { name: 'account_id', type: 'INTEGER' },
        { name: 'exclude_from_avg', type: 'INTEGER' },
      ]);
    }
    if (q.includes('table_info(categories)')) return Promise.resolve([{ name: 'id', type: 'INTEGER' }]);
    if (q.includes('table_info(notification_merchant_rules)')) {
      return Promise.resolve([{ name: 'label_override', type: 'TEXT' }, { name: 'last_matched_at', type: 'TEXT' }]);
    }
    if (q.includes('table_info(pending_notifications)')) {
      return Promise.resolve([{ name: 'latitude', type: 'REAL' }, { name: 'longitude', type: 'REAL' }]);
    }
    return Promise.resolve([]);
  });
};

describe('DB startup schema-version fast path (#1341)', () => {
  let mockDb;

  const makeMockDb = () => ({
    execAsync: jest.fn(() => Promise.resolve()),
    runAsync: jest.fn(() => Promise.resolve({ changes: 1, lastInsertRowId: 1 })),
    getFirstAsync: jest.fn(() => Promise.resolve(null)),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    closeAsync: jest.fn(() => Promise.resolve()),
    withTransactionAsync: jest.fn((cb) => cb()),
    createCustomFunctionAsync: jest.fn(() => Promise.resolve()),
    createFunctionAsync: jest.fn(() => Promise.resolve()),
  });

  beforeEach(async () => {
    await closeDatabase();
    jest.clearAllMocks();
    mockDb = makeMockDb();
    SQLite.openDatabaseAsync.mockResolvedValue(mockDb);
  });

  afterEach(async () => {
    try {
      await closeDatabase();
    } catch (_) {
      // ignore
    }
  });

  describe('up-to-date DB (fingerprint matches)', () => {
    beforeEach(() => {
      mockDb.getFirstAsync.mockImplementation((q) => {
        if (typeof q === 'string' && q.includes('user_version')) {
          return Promise.resolve({ user_version: SCHEMA_VERSION });
        }
        return Promise.resolve(null);
      });
    });

    it('reads the fingerprint via PRAGMA user_version', async () => {
      await getDatabase();
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith('PRAGMA user_version');
    });

    it('takes the fast path: NO schema-inspection queries run', async () => {
      await getDatabase();
      // The entire inspection sweep (isSchemaComplete, detectAppliedMigrations,
      // corruption re-scan, __drizzle_migrations SELECTs) goes through getAllAsync.
      // On the fast path none of it runs.
      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
      // No migrations applied either.
      expect(mockDb.execAsync).not.toHaveBeenCalled();
    });

    it('still sets per-connection PRAGMAs (foreign_keys + WAL) on the fast path', async () => {
      await getDatabase();
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('does not re-write the fingerprint on the fast path', async () => {
      await getDatabase();
      expect(mockDb.runAsync).not.toHaveBeenCalledWith(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  });

  describe('fresh install (no fingerprint)', () => {
    beforeEach(() => {
      // Fresh DB: user_version defaults to 0, no tables.
      mockDb.getFirstAsync.mockImplementation((q) => {
        if (typeof q === 'string' && q.includes('user_version')) {
          return Promise.resolve({ user_version: 0 });
        }
        return Promise.resolve(null);
      });
    });

    it('runs the full path (inspection queries execute)', async () => {
      await getDatabase();
      expect(mockDb.getAllAsync).toHaveBeenCalled();
    });

    it('writes the fingerprint after a successful full init (schema complete)', async () => {
      // The stamp is gated on isSchemaComplete(), so simulate a genuinely complete
      // post-migration schema — that is what a successful fresh install produces.
      mockSchemaComplete(mockDb, 0);
      await getDatabase();
      expect(mockDb.runAsync).toHaveBeenCalledWith(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });

    it('does NOT stamp the fingerprint when the schema is still incomplete after init', async () => {
      // Bare mock: getAllAsync returns [] so isSchemaComplete() is false — the state a
      // half-applied migration leaves behind (applyPendingMigrations swallows per-statement
      // errors). The fast-path fingerprint must NOT be written, so the next launch re-runs
      // the full inspection and self-heals instead of locking in a broken schema forever.
      await getDatabase();
      expect(mockDb.runAsync).not.toHaveBeenCalledWith(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });

    it('sets per-connection PRAGMAs on the full path too', async () => {
      await getDatabase();
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('applies migrations on a fresh (no-tables) database', async () => {
      await getDatabase();
      // No tables exist -> all 3 synthetic migrations are pending -> applied via execAsync.
      expect(mockDb.execAsync).toHaveBeenCalledWith('CREATE TABLE t0 (id integer);');
      expect(mockDb.execAsync).toHaveBeenCalledWith('CREATE TABLE t1 (id integer);');
      expect(mockDb.execAsync).toHaveBeenCalledWith('CREATE TABLE t2 (id integer);');
    });
  });

  describe('stale DB (older fingerprint than SCHEMA_VERSION)', () => {
    beforeEach(() => {
      // Stored version 2 < SCHEMA_VERSION 3 — an install from an older build.
      mockDb.getFirstAsync.mockImplementation((q) => {
        if (typeof q === 'string' && q.includes('user_version')) {
          return Promise.resolve({ user_version: SCHEMA_VERSION - 1 });
        }
        return Promise.resolve(null);
      });
    });

    it('does NOT take the fast path (inspection runs) — migration-skip invariant', async () => {
      await getDatabase();
      // Proof the fast path was bypassed: the inspection sweep touched getAllAsync.
      expect(mockDb.getAllAsync).toHaveBeenCalled();
    });

    it('runs the migrate path (pending migrations applied)', async () => {
      await getDatabase();
      expect(mockDb.execAsync).toHaveBeenCalled();
    });

    it('re-stamps the fingerprint to the current SCHEMA_VERSION afterward', async () => {
      // Older stored version + a complete schema after migrating -> stamp is renewed.
      mockSchemaComplete(mockDb, SCHEMA_VERSION - 1);
      await getDatabase();
      expect(mockDb.runAsync).toHaveBeenCalledWith(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  });

  describe('reset via dropAllTables clears the fingerprint (#1376 review regression)', () => {
    it('resets PRAGMA user_version to 0 so the next open rebuilds the schema', async () => {
      // Settings -> Reset database drops every table but keeps the same DB file.
      // user_version is a header value that survives DROP TABLE, so if it kept its
      // stamped value the next getDatabase() would take the fast path and skip
      // recreating the tables -> "no such table: accounts", bricked until reinstall.
      mockDb.getAllAsync.mockResolvedValue([{ name: 'accounts' }, { name: 'operations' }]);
      await dropAllTables();
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA user_version = 0');
    });
  });

  describe('corrupted DB (text account id — migration 0002 not applied)', () => {
    beforeEach(() => {
      // Fingerprint absent so the full path runs and can reach corruption recovery.
      mockDb.getFirstAsync.mockImplementation((q) => {
        if (typeof q === 'string' && q.includes('user_version')) {
          return Promise.resolve({ user_version: 0 });
        }
        return Promise.resolve(null);
      });
      // accounts table exists with a TEXT id -> isDatabaseCorrupted() === true.
      mockDb.getAllAsync.mockImplementation((q) => {
        if (typeof q !== 'string') return Promise.resolve([]);
        if (q.includes("name='accounts'")) {
          return Promise.resolve([{ name: 'accounts' }]);
        }
        if (q.includes('PRAGMA table_info(accounts)')) {
          return Promise.resolve([{ name: 'id', type: 'TEXT' }]);
        }
        if (q.includes("name NOT LIKE 'sqlite_%'")) {
          // tables to drop during recovery
          return Promise.resolve([{ name: 'accounts' }]);
        }
        return Promise.resolve([]);
      });
    });

    it('still triggers corruption recovery (drops tables) despite the fingerprint feature', async () => {
      await getDatabase();
      // Recovery path disables FKs, then drops the corrupted table.
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = OFF');
      expect(mockDb.runAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS "accounts"');
    });
  });

  describe('PRAGMAs run on every open regardless of path', () => {
    it('fast path sets foreign_keys ON and journal_mode WAL', async () => {
      mockDb.getFirstAsync.mockImplementation((q) => {
        if (typeof q === 'string' && q.includes('user_version')) {
          return Promise.resolve({ user_version: SCHEMA_VERSION });
        }
        return Promise.resolve(null);
      });
      await getDatabase();
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      expect(mockDb.runAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });
  });
});
