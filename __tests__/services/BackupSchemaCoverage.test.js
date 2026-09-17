/**
 * Schema-coverage guards for BackupRestore.
 *
 * Every other test in this suite asserts that a table the backup already knows
 * about survives a round trip. None of them notice a table or column the backup
 * never learned about in the first place: a migration adds one, nothing in
 * BackupRestore references it, and the export quietly ships without it. The
 * data is gone at the next restore and no test goes red.
 *
 * These tests close that gap by deriving the expectation from `app/db/schema.js`
 * itself rather than from a hand-written list, so a new table or column fails
 * here until it is either carried through the backup or explicitly excluded
 * below with a reason.
 *
 * Three stages have to agree, and each is guarded separately — a column can be
 * read and still never be written back:
 *   1. createBackup     — the table becomes a section of `backup.data`
 *   2. buildCombinedCSV — the column reaches the CSV, and parses back
 *   3. restoreBackup    — the column is named in the INSERT that rebuilds it
 */

import fs from 'fs';
import path from 'path';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../../app/db/schema';
import * as BackupRestore from '../../app/services/BackupRestore';
import * as db from '../../app/services/db';

jest.mock('../../app/services/db');

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/document/',
  getInfoAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

const mockFileSystem = require('expo-file-system/legacy');

/**
 * Every table declared in the Drizzle schema, as `{ sqlTableName: [columns] }`.
 * Read from the schema objects through the ORM rather than parsed out of the
 * source, so it tracks whatever Drizzle actually sees.
 */
const schemaTables = {};
for (const exported of Object.values(schema)) {
  let config;
  try {
    config = getTableConfig(exported);
  } catch {
    continue; // not a table (enum helper, type, etc.)
  }
  schemaTables[config.name] = config.columns.map((column) => column.name);
}

/**
 * Tables deliberately left out of a backup.
 *
 * Both are transient notification-processing queues: `pending_notifications`
 * holds what has arrived but has not been turned into an operation yet, and
 * `dismissed_notifications` the fingerprints used to not re-offer one. Neither
 * is user-authored data, both refill themselves from the device's notification
 * stream, and carrying them across a restore would resurrect prompts the user
 * already answered.
 *
 * Adding a table here is a decision that its data is reproducible. If it is
 * not, back it up instead.
 */
const TABLES_NOT_BACKED_UP = new Set([
  'pending_notifications',
  'dismissed_notifications',
]);

/**
 * Columns present in the schema but deliberately absent from the CSV column
 * lists (`TABLE_FIELDS` in BackupRestore).
 *
 * `accounts.show_in_main_menu` shipped in 0.190.0 as a per-account "show on the
 * Accounts tab" flag and was replaced by a single global preference. That
 * preference lives in `app_metadata`, which is backed up, and
 * `DisplaySettingsContext` persists it the first time it runs — so for any
 * backup taken since that bridge shipped the column is dead weight. The restore
 * does not re-insert it either (see RESTORE_INSERT_OMISSIONS), so a backup
 * predating the bridge restores with the Accounts tab defaulted off until the
 * user toggles it back on.
 *
 * Note this exclusion is CSV-only: the JSON export is a `SELECT *` and has no
 * column list to fall out of sync with.
 */
const COLUMNS_NOT_IN_CSV = {
  accounts: ['show_in_main_menu'],
};

/**
 * Columns the restore deliberately does not name in its INSERT statements.
 *
 * `operations.id` and `accounts_balance_history.id` are autoincrement surrogate
 * keys: the restore lets SQLite mint fresh ones and remaps the references,
 * which is what lets a backup carrying UUID account ids import at all.
 * `accounts.show_in_main_menu` is the legacy column described above.
 */
const RESTORE_INSERT_OMISSIONS = {
  operations: ['id'],
  accounts_balance_history: ['id'],
  accounts: ['show_in_main_menu'],
};

/**
 * Backup section key -> SQL table it mirrors.
 *
 * Only `balance_history` differs from its table name; the rest match. The tests
 * below pin this map from both ends: it must cover every schema table that is
 * not excluded, and it must be exactly the set of sections `createBackup`
 * emits — so neither a new table nor a new section can land without it.
 */
const SECTION_TABLES = {
  accounts: 'accounts',
  categories: 'categories',
  operations: 'operations',
  budgets: 'budgets',
  app_metadata: 'app_metadata',
  balance_history: 'accounts_balance_history',
  planned_operations: 'planned_operations',
  notification_merchant_rules: 'notification_merchant_rules',
  notification_templates: 'notification_templates',
  budget_plans: 'budget_plans',
  budget_plan_lines: 'budget_plan_lines',
  budget_plan_line_categories: 'budget_plan_line_categories',
  budget_plan_line_groups: 'budget_plan_line_groups',
  budget_plan_line_accounts: 'budget_plan_line_accounts',
  budget_plan_line_labels: 'budget_plan_line_labels',
};

// Columns whose value validateBackup checks against an enum — a placeholder
// string there aborts the restore before the parse result can be inspected.
const ENUM_PLACEHOLDERS = {
  'operations.type': 'expense',
  'categories.type': 'folder',
  'categories.category_type': 'expense',
  'budgets.period_type': 'monthly',
  'planned_operations.type': 'expense',
};

// Every account reference points at the one account in the synthetic backup, so
// restoreBackup's FK pre-validation passes instead of aborting the import.
const ACCOUNT_ID = 'acc-1';

/**
 * A value for one column of the synthetic backup below. The default is the
 * column's own qualified name, which makes a failure readable in the diff.
 */
const placeholderValue = (table, column) => {
  const enumValue = ENUM_PLACEHOLDERS[`${table}.${column}`];
  if (enumValue) return enumValue;
  if (table === 'accounts' && column === 'id') return ACCOUNT_ID;
  if (column === 'account_id' || column === 'to_account_id') return ACCOUNT_ID;
  return `${table}.${column}`;
};

/** A backup carrying one row per section, every schema column populated. */
const backupWithEveryColumn = () => {
  const data = {};
  for (const [section, table] of Object.entries(SECTION_TABLES)) {
    const row = {};
    for (const column of schemaTables[table]) {
      row[column] = placeholderValue(table, column);
    }
    data[section] = [row];
  }
  return {
    version: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    platform: 'native',
    data,
  };
};

/** The header line of one `[SECTION]` block of a combined CSV document. */
const csvHeaderOf = (csv, label) => {
  const match = csv.match(new RegExp(`\\[${label}\\]\\n([^\\n]*)`));
  return match ? match[1] : null;
};

/**
 * Every column named across the `INSERT INTO <table> (...)` statements in
 * BackupRestore, unioned per table.
 *
 * Read from the module source rather than from a captured restore run on
 * purpose: several tables are only inserted when their parent row survived, so
 * a fixture-driven capture would report a table as uncovered whenever the
 * fixture tripped an unrelated skip. The statements are plain string literals,
 * so the source is the more reliable reading.
 */
const insertedColumnsByTable = () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../app/services/BackupRestore.js'),
    'utf8',
  );
  const byTable = {};
  const statements = source.matchAll(
    /INSERT(?:\s+OR\s+\w+)?\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gi,
  );
  for (const [, table, columnList] of statements) {
    byTable[table] = byTable[table] || new Set();
    for (const column of columnList.split(',')) byTable[table].add(column.trim());
  }
  return byTable;
};

describe('Backup schema coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(db, 'queryAll').mockResolvedValue([]);
    jest.spyOn(db, 'executeQuery').mockResolvedValue(undefined);
    jest.spyOn(db, 'executeTransaction').mockImplementation(async (callback) =>
      callback({
        runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1 }),
        getAllAsync: jest.fn().mockResolvedValue([]),
        // The restore checks a remapped account really landed before inserting
        // anything that references it; a truthy row keeps those rows in.
        getFirstAsync: jest.fn().mockResolvedValue({ 1: 1 }),
      }),
    );
    jest.spyOn(db, 'getDatabase').mockResolvedValue({});

    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    mockFileSystem.writeAsStringAsync.mockResolvedValue();
    mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
    mockFileSystem.deleteAsync.mockResolvedValue();
  });

  describe('table coverage', () => {
    it('gives every schema table a backup section, unless it is excluded', () => {
      const expected = Object.keys(schemaTables)
        .filter((table) => !TABLES_NOT_BACKED_UP.has(table))
        .sort();

      expect([...new Set(Object.values(SECTION_TABLES))].sort()).toEqual(expected);
    });

    it('emits exactly the mapped sections from createBackup', async () => {
      const backup = await BackupRestore.createBackup();

      // Ties the map above to what the code really produces: a section added to
      // createBackup without a mapping fails here, and a mapping with no
      // section fails here too.
      expect(Object.keys(backup.data).sort()).toEqual(Object.keys(SECTION_TABLES).sort());
    });

    it('fills each section from the table it is mapped to', async () => {
      // A section wired to the wrong table, or left as a hardcoded empty array,
      // passes the two tests above; only reading real rows back catches it.
      db.queryAll.mockImplementation((sql) => {
        const match = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(sql);
        return Promise.resolve(match ? [{ __source: match[1] }] : []);
      });

      const backup = await BackupRestore.createBackup();

      const misfiled = Object.entries(SECTION_TABLES)
        .filter(([section, table]) => backup.data[section]?.[0]?.__source !== table)
        .map(([section]) => section);

      expect(misfiled).toEqual([]);
    });

    it('excludes only tables that are still in the schema', () => {
      // A stale entry here would silently re-open the gap it was added to close.
      for (const table of TABLES_NOT_BACKED_UP) {
        expect(Object.keys(schemaTables)).toContain(table);
      }
    });
  });

  describe('CSV column coverage', () => {
    it('writes every schema column of every backed-up table', () => {
      const csv = BackupRestore.buildCombinedCSV(backupWithEveryColumn());

      for (const [section, table] of Object.entries(SECTION_TABLES)) {
        const header = csvHeaderOf(csv, section.toUpperCase());
        expect(header).not.toBeNull();

        const columns = header.split(',');
        const excluded = COLUMNS_NOT_IN_CSV[table] || [];
        const missing = schemaTables[table]
          .filter((column) => !excluded.includes(column))
          .filter((column) => !columns.includes(column));

        // Reported as a labelled object so a drifted table names every column
        // it dropped, not just the first.
        expect({ section, missing }).toEqual({ section, missing: [] });
      }
    });

    it('writes no column the schema does not have', () => {
      const csv = BackupRestore.buildCombinedCSV(backupWithEveryColumn());

      for (const [section, table] of Object.entries(SECTION_TABLES)) {
        const columns = csvHeaderOf(csv, section.toUpperCase()).split(',');
        const unknown = columns.filter((column) => !schemaTables[table].includes(column));

        expect({ section, unknown }).toEqual({ section, unknown: [] });
      }
    });

    it('excludes only columns that are still in the schema', () => {
      for (const [table, columns] of Object.entries(COLUMNS_NOT_IN_CSV)) {
        for (const column of columns) {
          expect(schemaTables[table]).toContain(column);
        }
      }
    });
  });

  describe('restore column coverage', () => {
    it('names every schema column in the INSERT that rebuilds its table', () => {
      const inserted = insertedColumnsByTable();

      for (const table of Object.values(SECTION_TABLES)) {
        const columns = inserted[table] ? [...inserted[table]] : [];
        expect({ table, hasInsert: columns.length > 0 }).toEqual({ table, hasInsert: true });

        const omitted = RESTORE_INSERT_OMISSIONS[table] || [];
        const missing = schemaTables[table]
          .filter((column) => !omitted.includes(column))
          .filter((column) => !columns.includes(column));

        // A column that reaches the backup but is never named here is read on
        // export and dropped on every restore — the quietest way to lose data.
        expect({ table, missing }).toEqual({ table, missing: [] });
      }
    });

    it('omits only columns that are still in the schema', () => {
      for (const [table, columns] of Object.entries(RESTORE_INSERT_OMISSIONS)) {
        for (const column of columns) {
          expect(schemaTables[table]).toContain(column);
        }
      }
    });
  });

  describe('CSV export/import symmetry', () => {
    it('parses back every section the CSV export writes', async () => {
      const csv = BackupRestore.buildCombinedCSV(backupWithEveryColumn());
      mockFileSystem.readAsStringAsync.mockResolvedValue(csv);

      const imported = await BackupRestore.importBackupFromFile({
        fileUri: 'file:///mock/backup.csv',
        filename: 'backup.csv',
      });

      // A section the exporter writes but the importer has no reader for comes
      // back absent or empty, and its data is lost on every CSV restore.
      const dropped = Object.keys(SECTION_TABLES).filter(
        (section) => (imported.data[section] || []).length !== 1,
      );
      expect(dropped).toEqual([]);
    });

    it('round-trips every exported column value', async () => {
      const original = backupWithEveryColumn();
      const csv = BackupRestore.buildCombinedCSV(original);
      mockFileSystem.readAsStringAsync.mockResolvedValue(csv);

      const imported = await BackupRestore.importBackupFromFile({
        fileUri: 'file:///mock/backup.csv',
        filename: 'backup.csv',
      });

      for (const [section, table] of Object.entries(SECTION_TABLES)) {
        const excluded = COLUMNS_NOT_IN_CSV[table] || [];
        const expectedRow = { ...original.data[section][0] };
        for (const column of excluded) delete expectedRow[column];

        expect({ section, row: imported.data[section][0] }).toEqual({ section, row: expectedRow });
      }
    });
  });
});
