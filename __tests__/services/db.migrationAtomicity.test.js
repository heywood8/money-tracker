/**
 * Regression tests for issue #1697 — migrations ran statement-by-statement
 * outside any transaction and CONTINUED past a failure.
 *
 * That combination is what made the recreate-table migrations dangerous: `0002`
 * copies rows into `__new_operations` and then unconditionally runs
 * `DROP TABLE operations; DROP TABLE accounts;`. A failed copy (a UNIQUE clash
 * in the `(name, created_at)` account mapping, SQLITE_FULL, anything at all)
 * still reached the DROP, and the user's data went with it. Worse, the run then
 * carried on through every later migration and stamped the whole journal as
 * applied.
 *
 * These tests drive the real `applyPendingMigrations` against a fake raw SQLite
 * handle, so they assert the runner's contract rather than any one migration's
 * SQL: one transaction per migration, abort on the first genuine error, nothing
 * stamped afterwards.
 */

import { applyPendingMigrations } from '../../app/services/db';

const BREAK = '--> statement-breakpoint';

/**
 * A raw-db double that records every statement and can be told to fail on one.
 * `withTransactionAsync` propagates the callback's error the way expo-sqlite
 * does (the transaction is rolled back and the caller sees the throw), and
 * records whether the body committed.
 */
const makeRawDb = ({ failOn = null, failMessage = 'disk I/O error' } = {}) => {
  const executed = [];
  const transactions = [];
  const runs = [];

  const db = {
    executed,
    transactions,
    runs,
    execAsync: jest.fn(async (stmt) => {
      executed.push(stmt);
      if (failOn && stmt.includes(failOn)) {
        throw new Error(failMessage);
      }
    }),
    runAsync: jest.fn(async (sql, params) => {
      runs.push([sql, params]);
      return { changes: 1 };
    }),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    withTransactionAsync: jest.fn(async (callback) => {
      const record = { committed: false, statementsBefore: executed.length };
      transactions.push(record);
      await callback();
      record.committed = true;
    }),
  };
  return db;
};

const makeConfig = (migrations) => ({
  journal: {
    entries: migrations.map((_, i) => ({ tag: `000${i}_test`, when: 1700000000000 + i })),
  },
  migrations: Object.fromEntries(migrations.map((sql, i) => [`m000${i}`, sql])),
});

/** Statements the runner sent through __drizzle_migrations, i.e. "stamped". */
const stampedRecords = (db) =>
  db.runs.filter(([sql]) => typeof sql === 'string' && sql.includes('__drizzle_migrations'));

describe('applyPendingMigrations atomicity (issue #1697)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs a migration inside a single transaction', async () => {
    const db = makeRawDb();
    await applyPendingMigrations(db, makeConfig([
      `CREATE TABLE a (id integer)${BREAK}INSERT INTO a VALUES (1)`,
    ]));

    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0].committed).toBe(true);
    expect(db.executed).toEqual(['CREATE TABLE a (id integer)', 'INSERT INTO a VALUES (1)']);
  });

  it('rolls the whole migration back on the first failed statement, leaving the schema untouched', async () => {
    // The shape of migration 0002: copy, then drop the original.
    const db = makeRawDb({ failOn: 'INSERT INTO __new_operations' });
    await expect(applyPendingMigrations(db, makeConfig([
      [
        'CREATE TABLE __new_operations (id integer)',
        'INSERT INTO __new_operations SELECT id FROM operations',
        'DROP TABLE operations',
      ].join(BREAK),
    ]))).rejects.toThrow(/disk I\/O error/);

    // The copy threw, so the transaction never committed...
    expect(db.transactions[0].committed).toBe(false);
    // ...and, crucially, the DROP never even ran.
    expect(db.executed).not.toContain('DROP TABLE operations');
  });

  it('does not mark anything as applied when a migration fails', async () => {
    const db = makeRawDb({ failOn: 'ALTER TABLE accounts' });
    await expect(applyPendingMigrations(db, makeConfig(['ALTER TABLE accounts ADD COLUMN x text'])))
      .rejects.toThrow();

    expect(stampedRecords(db)).toHaveLength(0);
  });

  it('stops before every later migration once one fails', async () => {
    const db = makeRawDb({ failOn: 'ALTER TABLE first' });
    await expect(applyPendingMigrations(db, makeConfig([
      'ALTER TABLE first ADD COLUMN x text',
      'ALTER TABLE second ADD COLUMN y text',
    ]))).rejects.toThrow();

    expect(db.executed).not.toContain('ALTER TABLE second ADD COLUMN y text');
    expect(db.transactions).toHaveLength(1);
  });

  it('marks migrations applied when they all succeed', async () => {
    const db = makeRawDb();
    await applyPendingMigrations(db, makeConfig([
      'CREATE TABLE a (id integer)',
      'CREATE TABLE b (id integer)',
    ]));

    expect(db.transactions.every(t => t.committed)).toBe(true);
    expect(stampedRecords(db).length).toBeGreaterThan(0);
  });

  it('skips an ADD COLUMN whose column is already there, so a half-migrated install can catch up', async () => {
    // Databases left partly migrated by the previous, non-transactional runner.
    const db = makeRawDb({
      failOn: 'ADD COLUMN already_there',
      failMessage: 'duplicate column name: already_there',
    });
    await applyPendingMigrations(db, makeConfig([
      `ALTER TABLE accounts ADD COLUMN already_there text${BREAK}ALTER TABLE accounts ADD COLUMN fresh text`,
    ]));

    expect(db.executed).toContain('ALTER TABLE accounts ADD COLUMN fresh text');
    expect(db.transactions[0].committed).toBe(true);
    expect(stampedRecords(db).length).toBeGreaterThan(0);
  });

  it('does NOT skip a CREATE TABLE that already exists — that path duplicates rows', async () => {
    // A leftover __new_operations plus a skipped CREATE means the copy below
    // appends a second full set of rows into a table that is then renamed over
    // the original. The rebuild scratch table is cleared first instead.
    const db = makeRawDb({
      failOn: 'CREATE TABLE `__new_operations`',
      failMessage: 'table __new_operations already exists',
    });
    await expect(applyPendingMigrations(db, makeConfig([
      [
        'CREATE TABLE `__new_operations` (id integer)',
        'INSERT INTO `__new_operations` SELECT id FROM operations',
      ].join(BREAK),
    ]))).rejects.toThrow(/already exists/);

    expect(db.executed).not.toContain('INSERT INTO `__new_operations` SELECT id FROM operations');
  });

  it('clears a rebuild scratch table left by an interrupted run before recreating it', async () => {
    const db = makeRawDb();
    db.getAllAsync = jest.fn(async (sql, params) => (
      params && params[0] === '__new_operations' ? [{ name: '__new_operations' }] : []
    ));

    await applyPendingMigrations(db, makeConfig([
      `CREATE TABLE \`__new_operations\` (id integer)${BREAK}INSERT INTO \`__new_operations\` SELECT id FROM operations`,
    ]));

    const dropIndex = db.executed.findIndex(s => /DROP TABLE IF EXISTS `__new_operations`/.test(s));
    const createIndex = db.executed.findIndex(s => /CREATE TABLE `__new_operations`/.test(s));
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(dropIndex).toBeLessThan(createIndex);
    // The drop happens before the transaction opens, not inside it.
    expect(dropIndex).toBeLessThan(db.transactions[0].statementsBefore);
  });

  it('issues PRAGMA foreign_keys outside the transaction, where it is not a no-op', async () => {
    const db = makeRawDb();
    await applyPendingMigrations(db, makeConfig([
      `PRAGMA foreign_keys=OFF${BREAK}CREATE TABLE a (id integer)${BREAK}PRAGMA foreign_keys=ON`,
    ]));

    const offIndex = db.executed.findIndex(s => /foreign_keys=OFF/i.test(s));
    const onIndex = db.executed.findIndex(s => /foreign_keys=ON/i.test(s));
    const { statementsBefore } = db.transactions[0];

    expect(offIndex).toBeGreaterThanOrEqual(0);
    expect(offIndex).toBeLessThan(statementsBefore);
    expect(onIndex).toBeGreaterThan(statementsBefore);
    // The PRAGMAs are not part of the transaction body.
    expect(db.executed.slice(statementsBefore, onIndex)).toEqual(['CREATE TABLE a (id integer)']);
  });

  it('restores foreign-key enforcement even when the migration aborts', async () => {
    const db = makeRawDb({ failOn: 'CREATE TABLE a' });
    await expect(applyPendingMigrations(db, makeConfig([
      `PRAGMA foreign_keys=OFF${BREAK}CREATE TABLE a (id integer)${BREAK}PRAGMA foreign_keys=ON`,
    ]))).rejects.toThrow();

    expect(db.executed.some(s => /foreign_keys=ON/i.test(s))).toBe(true);
  });
});
