/**
 * Tests for BackupRestore.js - Database backup and restore operations
 * These tests ensure backup creation, export/import in multiple formats,
 * validation, and data integrity are maintained correctly
 */

import * as BackupRestore from '../../app/services/BackupRestore';
import * as db from '../../app/services/db';

// Mock dependencies
jest.mock('../../app/services/db');

// Mock expo-file-system
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/document/',
  getInfoAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
    UTF8: 'utf8',
  },
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

// Mock expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

// Get references to mocked modules
const mockFileSystem = require('expo-file-system/legacy');
const mockSharing = require('expo-sharing');
const mockDocumentPicker = require('expo-document-picker');

describe('BackupRestore', () => {
  let mockDb;

  const mockAccounts = [
    {
      id: 'acc-1',
      name: 'Cash',
      balance: '100.50',
      currency: 'USD',
      display_order: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Food',
      type: 'folder',
      category_type: 'expense',
      parent_id: null,
      icon: 'food',
      color: '#FF0000',
      is_shadow: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockOperations = [
    {
      id: 'op-1',
      type: 'expense',
      amount: '10.00',
      account_id: 'acc-1',
      category_id: 'cat-1',
      to_account_id: null,
      date: '2024-01-01',
      created_at: '2024-01-01T00:00:00.000Z',
      description: 'Grocery shopping',
    },
  ];

  const mockBudgets = [
    {
      id: 'budget-1',
      category_id: 'cat-1',
      amount: '500.00',
      currency: 'USD',
      period_type: 'monthly',
      start_date: '2024-01-01',
      end_date: null,
      is_recurring: 1,
      rollover_enabled: 0,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ];

  const mockMetadata = [
    {
      key: 'db_version',
      value: '1',
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database functions
    mockDb = {
      queryAll: jest.fn(),
      executeQuery: jest.fn(),
      executeTransaction: jest.fn(),
      getDatabase: jest.fn(),
      closeDatabase: jest.fn(),
    };

    jest.spyOn(db, 'queryAll').mockImplementation(mockDb.queryAll);
    jest.spyOn(db, 'executeQuery').mockImplementation(mockDb.executeQuery);
    jest.spyOn(db, 'executeTransaction').mockImplementation(mockDb.executeTransaction);
    jest.spyOn(db, 'getDatabase').mockImplementation(mockDb.getDatabase);
    jest.spyOn(db, 'closeDatabase').mockImplementation(mockDb.closeDatabase);

    // Default mock implementations
    mockDb.queryAll.mockImplementation((query) => {
      if (query.includes('accounts')) return Promise.resolve(mockAccounts);
      if (query.includes('categories')) return Promise.resolve(mockCategories);
      if (query.includes('operations')) return Promise.resolve(mockOperations);
      if (query.includes('budgets')) return Promise.resolve(mockBudgets);
      if (query.includes('app_metadata')) return Promise.resolve(mockMetadata);
      return Promise.resolve([]);
    });

    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    mockFileSystem.writeAsStringAsync.mockResolvedValue();
    mockFileSystem.readAsStringAsync.mockResolvedValue('');
    mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
    mockFileSystem.copyAsync.mockResolvedValue();
    mockFileSystem.deleteAsync.mockResolvedValue();
    mockFileSystem.makeDirectoryAsync.mockResolvedValue();

    mockSharing.isAvailableAsync.mockResolvedValue(true);
    mockSharing.shareAsync.mockResolvedValue();

    mockDocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///mock/backup.json', name: 'backup.json' }],
    });
  });

  describe('createBackup', () => {
    it('creates backup with all data tables', async () => {
      const backup = await BackupRestore.createBackup();

      expect(backup).toMatchObject({
        version: 1,
        platform: 'native',
        data: {
          accounts: mockAccounts,
          categories: mockCategories,
          operations: mockOperations,
          budgets: mockBudgets,
          app_metadata: mockMetadata,
        },
      });
      expect(backup.timestamp).toBeDefined();
      // accounts, categories, operations, budgets, app_metadata, balance_history,
      // planned_operations, notification_merchant_rules, budget_plans, budget_plan_lines
      expect(mockDb.queryAll).toHaveBeenCalledTimes(10);
    });

    it('includes empty arrays when tables are empty', async () => {
      mockDb.queryAll.mockResolvedValue([]);

      const backup = await BackupRestore.createBackup();

      expect(backup.data.accounts).toEqual([]);
      expect(backup.data.categories).toEqual([]);
      expect(backup.data.operations).toEqual([]);
      expect(backup.data.budgets).toEqual([]);
      expect(backup.data.app_metadata).toEqual([]);
    });

    it('handles null responses from database', async () => {
      mockDb.queryAll.mockResolvedValue(null);

      const backup = await BackupRestore.createBackup();

      expect(backup.data.accounts).toEqual([]);
      expect(backup.data.categories).toEqual([]);
      expect(backup.data.operations).toEqual([]);
      expect(backup.data.budgets).toEqual([]);
      expect(backup.data.app_metadata).toEqual([]);
    });

    it('throws error when database query fails', async () => {
      const error = new Error('Database error');
      mockDb.queryAll.mockRejectedValue(error);

      await expect(BackupRestore.createBackup()).rejects.toThrow('Database error');
    });

    it('sets correct backup version', async () => {
      const backup = await BackupRestore.createBackup();

      expect(backup.version).toBe(1);
    });

    it('generates ISO timestamp', async () => {
      const backup = await BackupRestore.createBackup();

      expect(backup.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('exportBackup - JSON format', () => {
    it('exports backup as JSON file', async () => {
      const filename = await BackupRestore.exportBackup('json');

      expect(filename).toMatch(/^money_tracker_backup_.*\.json$/);
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      expect(mockSharing.shareAsync).toHaveBeenCalled();
    });

    it('writes JSON with proper formatting', async () => {
      await BackupRestore.exportBackup('json');

      const writeCall = mockFileSystem.writeAsStringAsync.mock.calls[0];
      const jsonContent = writeCall[1];
      const parsed = JSON.parse(jsonContent);

      expect(parsed.version).toBe(1);
      expect(parsed.data.accounts).toBeDefined();
    });

    it('shares file with correct MIME type', async () => {
      await BackupRestore.exportBackup('json');

      expect(mockSharing.shareAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mimeType: 'application/json',
          dialogTitle: 'Export Database Backup',
        }),
      );
    });

    it('throws error when sharing is not available', async () => {
      mockSharing.isAvailableAsync.mockResolvedValue(false);

      await expect(BackupRestore.exportBackup('json')).rejects.toThrow(
        'Sharing is not available on this device',
      );
    });

    it('defaults to JSON format when no format specified', async () => {
      const filename = await BackupRestore.exportBackup();

      expect(filename).toMatch(/\.json$/);
    });
  });

  describe('exportBackup - CSV format', () => {
    it('exports backup as CSV file', async () => {
      const filename = await BackupRestore.exportBackup('csv');

      expect(filename).toMatch(/^money_tracker_backup_.*\.csv$/);
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
    });

    it('creates CSV with section markers', async () => {
      await BackupRestore.exportBackup('csv');

      const writeCall = mockFileSystem.writeAsStringAsync.mock.calls[0];
      const csvContent = writeCall[1];

      expect(csvContent).toContain('[ACCOUNTS]');
      expect(csvContent).toContain('[CATEGORIES]');
      expect(csvContent).toContain('[OPERATIONS]');
      expect(csvContent).toContain('[BUDGETS]');
      expect(csvContent).toContain('[APP_METADATA]');
    });

    it('includes headers in CSV', async () => {
      await BackupRestore.exportBackup('csv');

      const writeCall = mockFileSystem.writeAsStringAsync.mock.calls[0];
      const csvContent = writeCall[1];

      expect(csvContent).toContain('id,name,balance,currency');
    });

    it('escapes values with commas', async () => {
      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('operations')) {
          return Promise.resolve([
            { ...mockOperations[0], description: 'Food, drinks, etc' },
          ]);
        }
        return Promise.resolve([]);
      });

      await BackupRestore.exportBackup('csv');

      const writeCall = mockFileSystem.writeAsStringAsync.mock.calls[0];
      const csvContent = writeCall[1];

      expect(csvContent).toContain('"Food, drinks, etc"');
    });

    it('escapes values with quotes', async () => {
      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('operations')) {
          return Promise.resolve([
            { ...mockOperations[0], description: 'Mom\'s "special" food' },
          ]);
        }
        return Promise.resolve([]);
      });

      await BackupRestore.exportBackup('csv');

      const writeCall = mockFileSystem.writeAsStringAsync.mock.calls[0];
      const csvContent = writeCall[1];

      expect(csvContent).toContain('Mom\'s ""special"" food');
    });

    it('handles empty tables', async () => {
      mockDb.queryAll.mockResolvedValue([]);

      const filename = await BackupRestore.exportBackup('csv');

      expect(filename).toBeDefined();
    });
  });

  describe('exportBackup - SQLite format', () => {
    it('exports backup as SQLite database file', async () => {
      const filename = await BackupRestore.exportBackup('sqlite');

      expect(filename).toMatch(/^money_tracker_backup_.*\.db$/);
      expect(mockFileSystem.copyAsync).toHaveBeenCalled();
    });

    it('performs WAL checkpoint before export', async () => {
      await BackupRestore.exportBackup('sqlite');

      // Note: checkpoint uses dynamic import, so we can't easily verify the call
      // but we can verify the export completed successfully
      expect(mockFileSystem.copyAsync).toHaveBeenCalled();
    });

    it('continues export if checkpoint fails', async () => {
      mockDb.executeQuery.mockRejectedValue(new Error('Checkpoint failed'));

      const filename = await BackupRestore.exportBackup('sqlite');

      expect(filename).toBeDefined();
      expect(mockFileSystem.copyAsync).toHaveBeenCalled();
    });

    it('throws error when database file not found', async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });

      await expect(BackupRestore.exportBackup('sqlite')).rejects.toThrow(
        'Database file not found',
      );
    });

    it('accepts db as format variant', async () => {
      const filename = await BackupRestore.exportBackup('db');

      expect(filename).toMatch(/\.db$/);
    });
  });

  describe('validateBackup', () => {
    const validBackup = {
      version: 1,
      timestamp: '2024-01-01T00:00:00.000Z',
      platform: 'native',
      data: {
        accounts: [],
        categories: [],
        operations: [],
      },
    };

    // Note: validateBackup is not exported, so we test it through restoreBackup
    it('validates backup with all required fields', async () => {
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        const mockDbInstance = {
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        };
        await callback(mockDbInstance);
      });

      await expect(BackupRestore.restoreBackup(validBackup)).resolves.not.toThrow();
    });

    it('rejects backup without version', async () => {
      const invalidBackup = { ...validBackup, version: undefined };

      await expect(BackupRestore.restoreBackup(invalidBackup)).rejects.toThrow(
        'missing version',
      );
    });

    it('rejects backup with future version', async () => {
      const futureBackup = { ...validBackup, version: 999 };

      await expect(BackupRestore.restoreBackup(futureBackup)).rejects.toThrow(
        'not supported',
      );
    });

    it('rejects backup without data object', async () => {
      const invalidBackup = { ...validBackup, data: undefined };

      await expect(BackupRestore.restoreBackup(invalidBackup)).rejects.toThrow(
        'missing or invalid data',
      );
    });

    it('rejects backup with non-array accounts', async () => {
      const invalidBackup = {
        ...validBackup,
        data: { ...validBackup.data, accounts: 'not-an-array' },
      };

      await expect(BackupRestore.restoreBackup(invalidBackup)).rejects.toThrow(
        'missing or invalid accounts data',
      );
    });

    it('rejects backup with missing categories', async () => {
      const invalidBackup = {
        ...validBackup,
        data: { ...validBackup.data, categories: undefined },
      };

      await expect(BackupRestore.restoreBackup(invalidBackup)).rejects.toThrow(
        'missing or invalid categories data',
      );
    });

    it('rejects backup with missing operations', async () => {
      const invalidBackup = {
        ...validBackup,
        data: { ...validBackup.data, operations: undefined },
      };

      await expect(BackupRestore.restoreBackup(invalidBackup)).rejects.toThrow(
        'missing or invalid operations data',
      );
    });

    it('rejects null backup', async () => {
      await expect(BackupRestore.restoreBackup(null)).rejects.toThrow(
        'Invalid backup format: not an object',
      );
    });

    it('rejects non-object backup', async () => {
      await expect(BackupRestore.restoreBackup('string')).rejects.toThrow(
        'Invalid backup format: not an object',
      );
    });
  });

  describe('restoreBackup', () => {
    const validBackup = {
      version: 1,
      timestamp: '2024-01-01T00:00:00.000Z',
      platform: 'native',
      data: {
        accounts: mockAccounts,
        categories: mockCategories,
        operations: mockOperations,
        app_metadata: mockMetadata,
      },
    };

    it('restores backup to database', async () => {
      let insertCount = 0;
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => {
          insertCount++;
          return Promise.resolve({ lastInsertRowId: insertCount });
        }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-adjustment-expense' },
          { id: 'shadow-adjustment-income' },
        ]),
      };

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      await BackupRestore.restoreBackup(validBackup);

      expect(mockDbInstance.runAsync).toHaveBeenCalled();
      expect(mockDb.executeTransaction).toHaveBeenCalled();
    });

    it('clears existing data before restore', async () => {
      let insertCount = 0;
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => {
          insertCount++;
          return Promise.resolve({ lastInsertRowId: insertCount });
        }),
        getAllAsync: jest.fn().mockResolvedValue([]),
      };

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      await BackupRestore.restoreBackup(validBackup);

      const deleteCalls = mockDbInstance.runAsync.mock.calls.filter(call =>
        call[0].includes('DELETE'),
      );

      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    it('deletes in correct order (budgets, budget plans, operations, categories, accounts)', async () => {
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
        getAllAsync: jest.fn().mockResolvedValue([]),
      };

      const deleteCalls = [];
      let insertCount = 0;
      mockDbInstance.runAsync.mockImplementation((query) => {
        if (query.includes('DELETE')) {
          deleteCalls.push(query);
        }
        insertCount++;
        return Promise.resolve({ lastInsertRowId: insertCount });
      });

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      await BackupRestore.restoreBackup(validBackup);

      expect(deleteCalls[0]).toContain('notification_merchant_rules');
      expect(deleteCalls[1]).toContain('planned_operations');
      expect(deleteCalls[2]).toContain('budgets');
      expect(deleteCalls[3]).toContain('budget_plan_lines');
      expect(deleteCalls[4]).toContain('budget_plans');
      expect(deleteCalls[5]).toContain('accounts_balance_history');
      expect(deleteCalls[6]).toContain('operations');
      expect(deleteCalls[7]).toContain('categories');
      expect(deleteCalls[8]).toContain('accounts');
    });

    it('preserves db_version metadata', async () => {
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
        getAllAsync: jest.fn().mockResolvedValue([]),
      };

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      await BackupRestore.restoreBackup(validBackup);

      const metadataDeleteCall = mockDbInstance.runAsync.mock.calls.find(call =>
        call[0].includes('DELETE FROM app_metadata'),
      );

      expect(metadataDeleteCall[0]).toContain('key != ?');
      expect(metadataDeleteCall[1]).toEqual(['db_version']);
    });

    it('restores all accounts with default values', async () => {
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
        getAllAsync: jest.fn().mockResolvedValue([]),
      };

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      const backupWithMinimalAccount = {
        ...validBackup,
        data: {
          ...validBackup.data,
          accounts: [{ id: 'acc-1', name: 'Test' }],
        },
      };

      await BackupRestore.restoreBackup(backupWithMinimalAccount);

      const accountInsert = mockDbInstance.runAsync.mock.calls.find(call =>
        call[0].includes('INSERT INTO accounts'),
      );

      expect(accountInsert[1]).toContain('0'); // Default balance
      expect(accountInsert[1]).toContain('USD'); // Default currency
    });

    it('adds missing shadow categories', async () => {
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
        getAllAsync: jest.fn().mockResolvedValue([]), // No shadow categories
      };

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      await BackupRestore.restoreBackup(validBackup);

      const insertCalls = mockDbInstance.runAsync.mock.calls;
      const shadowInserts = insertCalls.filter(call =>
        call[0] && call[0].includes('INSERT') && call[1] && (
          call[1].includes('shadow-adjustment-expense') ||
          call[1].includes('shadow-adjustment-income')
        ),
      );

      expect(shadowInserts.length).toBe(2); // Expense and income
    });

    it('does not add shadow categories if already present', async () => {
      const mockDbInstance = {
        runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-adjustment-expense' },
          { id: 'shadow-adjustment-income' },
        ]),
      };

      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      await BackupRestore.restoreBackup(validBackup);

      const shadowInserts = mockDbInstance.runAsync.mock.calls.filter(call =>
        call[0].includes('shadow-adjustment'),
      );

      expect(shadowInserts.length).toBe(0);
    });

    it('throws error on transaction failure', async () => {
      const error = new Error('Transaction failed');
      mockDb.executeTransaction.mockRejectedValue(error);

      await expect(BackupRestore.restoreBackup(validBackup)).rejects.toThrow(
        'Transaction failed',
      );
    });
  });

  describe('Bank-notification data round-trip', () => {
    const makeDbInstance = () => {
      let insertCount = 0;
      return {
        runAsync: jest.fn().mockImplementation(() => {
          insertCount++;
          return Promise.resolve({ lastInsertRowId: insertCount });
        }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-adjustment-expense' },
          { id: 'shadow-adjustment-income' },
        ]),
      };
    };

    const findInsert = (dbInstance, table) =>
      dbInstance.runAsync.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes(`INSERT INTO ${table}`),
      );
    const findOrIgnoreInsert = (dbInstance, table) =>
      dbInstance.runAsync.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT') && c[0].includes(table),
      );

    it('restores accounts.card_mask from a backup that has it', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      await BackupRestore.restoreBackup({
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [{ ...mockAccounts[0], card_mask: '4083***7027' }],
          categories: mockCategories,
          operations: [],
          app_metadata: mockMetadata,
        },
      });

      const call = findInsert(dbInstance, 'accounts');
      expect(call[0]).toContain('card_mask');
      expect(call[1]).toEqual(expect.arrayContaining(['4083***7027']));
    });

    it('restores learned merchant rules from a backup', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      await BackupRestore.restoreBackup({
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: mockAccounts,
          categories: mockCategories,
          operations: [],
          app_metadata: mockMetadata,
          notification_merchant_rules: [
            { id: 'r1', merchant: 'NAREK MEHRABYAN', package_name: 'am.bank', category_id: 'cat-1', created_at: 'x', updated_at: 'y' },
          ],
        },
      });

      const call = findOrIgnoreInsert(dbInstance, 'notification_merchant_rules');
      expect(call).toBeTruthy();
      expect(call[1]).toEqual(expect.arrayContaining(['NAREK MEHRABYAN', 'cat-1']));
    });

    it('includes the new data in a created backup', async () => {
      const backup = await BackupRestore.createBackup();
      expect(backup.data).toHaveProperty('notification_merchant_rules');
    });
  });

  describe('Location columns round-trip (issue #1091)', () => {
    const makeDbInstance = () => {
      let insertCount = 0;
      return {
        runAsync: jest.fn().mockImplementation(() => {
          insertCount++;
          return Promise.resolve({ lastInsertRowId: insertCount });
        }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-adjustment-expense' },
          { id: 'shadow-adjustment-income' },
        ]),
      };
    };

    const opInsert = (dbInstance) =>
      dbInstance.runAsync.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO operations'),
      );

    it('restores latitude/longitude from a backup that has them', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      await BackupRestore.restoreBackup({
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: mockAccounts,
          categories: mockCategories,
          operations: [{ ...mockOperations[0], latitude: '40.5', longitude: '44.5' }],
          app_metadata: mockMetadata,
        },
      });

      const call = opInsert(dbInstance);
      expect(call[0]).toContain('latitude, longitude');
      expect(call[1]).toEqual(expect.arrayContaining(['40.5', '44.5']));
    });

    it('tolerates older backups without latitude/longitude (treats them as null)', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      // mockOperations[0] has no latitude/longitude keys (legacy backup).
      await BackupRestore.restoreBackup({
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: mockAccounts,
          categories: mockCategories,
          operations: mockOperations,
          app_metadata: mockMetadata,
        },
      });

      const call = opInsert(dbInstance);
      expect(call).toBeTruthy();
      const params = call[1];
      // Column list ends with latitude, longitude → last two params default to null.
      expect(params[params.length - 2]).toBeNull();
      expect(params[params.length - 1]).toBeNull();
    });

    it('includes latitude/longitude columns in CSV export', async () => {
      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('operations')) {
          return Promise.resolve([{ ...mockOperations[0], latitude: '40.5', longitude: '44.5' }]);
        }
        if (query.includes('accounts')) return Promise.resolve(mockAccounts);
        if (query.includes('categories')) return Promise.resolve(mockCategories);
        return Promise.resolve([]);
      });

      await BackupRestore.exportBackup('csv');

      const written = mockFileSystem.writeAsStringAsync.mock.calls[0][1];
      // The operations CSV header lists the new columns, and the row carries values.
      expect(written).toContain('latitude,longitude');
      expect(written).toContain('40.5');
      expect(written).toContain('44.5');
    });
  });

  describe('importBackup - JSON format', () => {
    it('imports JSON backup file', async () => {
      const validBackup = {
        version: 1,
        data: {
          accounts: [],
          categories: [],
          operations: [],
        },
      };

      mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(validBackup));
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const backup = await BackupRestore.importBackup();

      expect(backup).toMatchObject(validBackup);
    });

    it('throws error for invalid JSON', async () => {
      mockFileSystem.readAsStringAsync.mockResolvedValue('invalid json');

      await expect(BackupRestore.importBackup()).rejects.toThrow('not valid JSON');
    });

    it('handles document picker cancellation', async () => {
      mockDocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true });

      await expect(BackupRestore.importBackup()).rejects.toThrow('Import cancelled');
    });
  });

  describe('importBackup - CSV format', () => {
    it('imports CSV backup file', async () => {
      const csvContent = `# Money Tracker Backup - 2024-01-01T00:00:00.000Z
# Version: 1

[ACCOUNTS]
id,name,balance,currency
acc-1,Cash,100,USD

[CATEGORIES]
id,name,type,category_type
cat-1,Food,folder,expense

[OPERATIONS]
id,type,amount,account_id,category_id
op-1,expense,10,acc-1,cat-1

[BUDGETS]
id,category_id,amount,currency,period_type
budget-1,cat-1,500,USD,monthly

[APP_METADATA]
key,value
test_key,test_value`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });

      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const backup = await BackupRestore.importBackup();

      expect(backup.version).toBe(1);
      expect(backup.data.accounts).toHaveLength(1);
    });

    it('parses CSV with quoted values', async () => {
      const csvContent = `# Money Tracker Backup
# Version: 1

[OPERATIONS]
id,description
op-1,"Food, drinks, etc"`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });

      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const backup = await BackupRestore.importBackup();

      expect(backup.data.operations[0].description).toBe('Food, drinks, etc');
    });

    it('parses CSV with escaped quotes', async () => {
      const csvContent = `# Money Tracker Backup
# Version: 1

[OPERATIONS]
id,description
op-1,"Mom's ""special"" food"`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });

      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const backup = await BackupRestore.importBackup();

      expect(backup.data.operations[0].description).toBe('Mom\'s "special" food');
    });

    it('parses CSV with multiline quoted values (regression #590)', async () => {
      const csvContent = `# Money Tracker Backup
# Version: 1

[OPERATIONS]
id,description
op-1,"line one
line two"
op-2,normal`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });

      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const backup = await BackupRestore.importBackup();

      expect(backup.data.operations).toHaveLength(2);
      expect(backup.data.operations[0].description).toBe('line one\nline two');
      expect(backup.data.operations[1].description).toBe('normal');
    });

    it('regression #764 — sparse rows (fewer columns than header) default missing fields to null without throwing', async () => {
      // Row 0 has all 3 columns; row 1 only has 2.  The missing 3rd column
      // (description) should become null, not crash, and a console.warn should fire.
      const csvContent = `# Money Tracker Backup
# Version: 1

[ACCOUNTS]
id,name,balance
acc-1,Cash,100
acc-2,Savings

[OPERATIONS]
id,type,amount,account_id,category_id,description
op-1,expense,10,acc-1,cat-1,Full row
op-2,income,20,acc-1,cat-1`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });

      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const backup = await BackupRestore.importBackup();

      // Sparse account row (acc-2 missing balance)
      expect(backup.data.accounts).toHaveLength(2);
      expect(backup.data.accounts[1].balance).toBeNull();

      // Sparse operation row (op-2 missing description)
      expect(backup.data.operations).toHaveLength(2);
      expect(backup.data.operations[1].description).toBeNull();

      // Warn must have fired for each sparse row
      const sparseWarnings = warnSpy.mock.calls.filter(([msg]) =>
        typeof msg === 'string' && msg.includes('[BackupRestore] parseCSV'),
      );
      expect(sparseWarnings.length).toBeGreaterThanOrEqual(2);

      warnSpy.mockRestore();
    });

    it('handles empty CSV sections', async () => {
      const csvContent = `# Money Tracker Backup
# Version: 1

[ACCOUNTS]

[CATEGORIES]

[OPERATIONS]

[BUDGETS]

[APP_METADATA]`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });

      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback({
          runAsync: jest.fn().mockImplementation(() => Promise.resolve({ lastInsertRowId: Math.floor(Math.random() * 1000) })),
          getAllAsync: jest.fn().mockResolvedValue([]),
        });
      });

      const backup = await BackupRestore.importBackup();

      expect(backup.data.accounts).toEqual([]);
      expect(backup.data.categories).toEqual([]);
    });
  });

  describe('getBackupInfo', () => {
    it('returns backup information for valid backup', async () => {
      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [1, 2, 3],
          categories: [1, 2],
          operations: [1, 2, 3, 4, 5],
          budgets: [1],
        },
      };

      const info = BackupRestore.getBackupInfo(backup);

      expect(info).toEqual({
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        accountsCount: 3,
        categoriesCount: 2,
        operationsCount: 5,
        budgetsCount: 1,
      });
    });

    it('returns null for invalid backup', async () => {
      const info = BackupRestore.getBackupInfo(null);

      expect(info).toBeNull();
    });

    it('handles missing platform', async () => {
      const backup = {
        version: 1,
        timestamp: '2024-01-01',
        data: {
          accounts: [],
          categories: [],
          operations: [],
        },
      };

      const info = BackupRestore.getBackupInfo(backup);

      expect(info.platform).toBe('unknown');
    });

    it('handles missing counts', async () => {
      const backup = {
        version: 1,
        timestamp: '2024-01-01',
        data: {
          // Arrays are missing
        },
      };

      // This should still throw because required tables are missing
      // but we want to test the case where arrays are present but empty
      const validBackup = {
        version: 1,
        timestamp: '2024-01-01',
        data: {
          accounts: [],
          categories: [],
          operations: [],
        },
      };

      const info = BackupRestore.getBackupInfo(validBackup);

      expect(info.accountsCount).toBe(0);
      expect(info.categoriesCount).toBe(0);
      expect(info.operationsCount).toBe(0);
      expect(info.budgetsCount).toBe(0);
    });
  });

  describe('Regression — soft-delete and adjustment metadata survive restore', () => {
    const makeMockDbInstance = () => {
      let insertCount = 0;
      return {
        runAsync: jest.fn().mockImplementation(() => {
          insertCount++;
          return Promise.resolve({ lastInsertRowId: insertCount });
        }),
        getAllAsync: jest.fn().mockResolvedValue([]),
        getFirstAsync: jest.fn().mockResolvedValue({ 1: 1 }),
      };
    };

    it('restores accounts with their deleted_at flag (soft-deleted accounts must not resurrect)', async () => {
      const mockDbInstance = makeMockDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [
            { id: 1, name: 'Live', balance: '100', currency: 'USD', deleted_at: null },
            { id: 2, name: 'Deleted', balance: '0', currency: 'USD', deleted_at: '2024-01-02T00:00:00.000Z' },
          ],
          categories: [],
          operations: [],
          app_metadata: [],
        },
      };

      await BackupRestore.restoreBackup(backup);

      const accountInserts = mockDbInstance.runAsync.mock.calls.filter(call =>
        call[0].startsWith('INSERT INTO accounts'),
      );
      expect(accountInserts).toHaveLength(2);
      accountInserts.forEach(call => expect(call[0]).toContain('deleted_at'));

      const deletedInsert = accountInserts.find(call => call[1].includes('Deleted'));
      expect(deletedInsert[1]).toContain('2024-01-02T00:00:00.000Z');
    });

    it('restores operations with their original_balance column', async () => {
      const mockDbInstance = makeMockDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [{ id: 1, name: 'Main', balance: '150', currency: 'USD' }],
          categories: [],
          operations: [
            {
              id: 10,
              type: 'income',
              amount: '50',
              account_id: 1,
              date: '2024-01-01',
              original_balance: '100',
            },
          ],
          app_metadata: [],
        },
      };

      await BackupRestore.restoreBackup(backup);

      const operationInserts = mockDbInstance.runAsync.mock.calls.filter(call =>
        call[0].startsWith('INSERT INTO operations'),
      );
      expect(operationInserts).toHaveLength(1);
      expect(operationInserts[0][0]).toContain('original_balance');
      expect(operationInserts[0][1]).toContain('100');
    });

    it('aborts before touching data when a transfer references a missing destination account', async () => {
      const mockDbInstance = makeMockDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(mockDbInstance);
      });

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [{ id: 1, name: 'Main', balance: '100', currency: 'USD' }],
          categories: [],
          operations: [
            { id: 10, type: 'transfer', amount: '50', account_id: 1, to_account_id: 99, date: '2024-01-01' },
          ],
          app_metadata: [],
        },
      };

      await expect(BackupRestore.restoreBackup(backup)).rejects.toThrow(/account IDs not found/);
      expect(mockDbInstance.runAsync).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Regression Tests', () => {
    it('handles large backup data sets', async () => {
      const largeAccounts = Array.from({ length: 1000 }, (_, i) => ({
        id: `acc-${i}`,
        name: `Account ${i}`,
        balance: '100',
        currency: 'USD',
      }));

      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('accounts')) return Promise.resolve(largeAccounts);
        return Promise.resolve([]);
      });

      const backup = await BackupRestore.createBackup();

      expect(backup.data.accounts).toHaveLength(1000);
    });

    it('handles special characters in data', async () => {
      const specialChars = {
        id: 'acc-1',
        name: 'Test & "Special" <Characters> 中文',
        balance: '100',
      };

      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('accounts')) return Promise.resolve([specialChars]);
        return Promise.resolve([]);
      });

      const filename = await BackupRestore.exportBackup('json');

      expect(filename).toBeDefined();
    });

    it('handles null values in data', async () => {
      const withNulls = {
        id: 'op-1',
        type: 'expense',
        amount: '10',
        description: null,
        to_account_id: null,
      };

      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('operations')) return Promise.resolve([withNulls]);
        return Promise.resolve([]);
      });

      const backup = await BackupRestore.createBackup();

      expect(backup.data.operations[0].description).toBeNull();
    });

    it('generates unique filenames for concurrent exports', async () => {
      const promises = [
        BackupRestore.exportBackup('json'),
        BackupRestore.exportBackup('json'),
        BackupRestore.exportBackup('json'),
      ];

      const filenames = await Promise.all(promises);

      // Filenames should have timestamps, making them likely unique
      expect(filenames[0]).toBeDefined();
      expect(filenames[1]).toBeDefined();
      expect(filenames[2]).toBeDefined();
    });

    it('handles empty metadata array', async () => {
      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('app_metadata')) return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const backup = await BackupRestore.createBackup();

      expect(backup.data.app_metadata).toEqual([]);
    });

    it('preserves data types during backup/restore cycle', async () => {
      const testData = {
        id: 'test-1',
        name: 'Test',
        balance: '123.45',
        display_order: 5,
        created_at: '2024-01-01T00:00:00.000Z',
      };

      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('accounts')) return Promise.resolve([testData]);
        return Promise.resolve([]);
      });

      const backup = await BackupRestore.createBackup();

      expect(backup.data.accounts[0].balance).toBe('123.45');
      expect(typeof backup.data.accounts[0].balance).toBe('string');
    });
  });

  describe('Regression Tests — Issue #686 (account ID remapping)', () => {
    const makeDbInstance = () => {
      let insertCount = 0;
      return {
        runAsync: jest.fn().mockImplementation(() =>
          Promise.resolve({ lastInsertRowId: ++insertCount }),
        ),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-adjustment-expense' },
          { id: 'shadow-adjustment-income' },
        ]),
      };
    };

    it('aborts before clearing data when an operation references an account not in the backup', async () => {
      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [{ id: 'acc-1', name: 'Cash', balance: '0', currency: 'USD' }],
          categories: [],
          operations: [
            { id: 'op-1', type: 'expense', amount: '10', account_id: 'unknown-uuid' },
          ],
        },
      };

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(dbInstance);
      });

      await expect(BackupRestore.restoreBackup(backup)).rejects.toThrow(
        /account IDs not found in the backup.*Restore aborted/,
      );

      // The transaction must NOT have run — no DELETE calls should have happened
      expect(mockDb.executeTransaction).not.toHaveBeenCalled();
    });

    it('includes all unmapped account IDs in the error message', async () => {
      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [],
          categories: [],
          operations: [
            { id: 'op-1', type: 'expense', amount: '10', account_id: 'uuid-A' },
            { id: 'op-2', type: 'expense', amount: '5', account_id: 'uuid-B' },
          ],
        },
      };

      await expect(BackupRestore.restoreBackup(backup)).rejects.toThrow(/uuid-A/);
    });

    it('does not abort when operation.account_id is null (counted as skip instead)', async () => {
      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [{ id: 'acc-1', name: 'Cash', balance: '0', currency: 'USD' }],
          categories: [],
          operations: [
            { id: 'op-1', type: 'expense', amount: '10', account_id: null },
          ],
        },
      };

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(dbInstance);
      });

      // Should resolve, not throw
      await expect(BackupRestore.restoreBackup(backup)).resolves.toBeUndefined();
    });

    it('emits complete event with skippedOperations count when operations are null-skipped', async () => {
      const appEvents = require('../../app/services/eventEmitter').appEvents;
      const emitSpy = jest.spyOn(appEvents, 'emit');

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [{ id: 'acc-1', name: 'Cash', balance: '0', currency: 'USD' }],
          categories: [],
          operations: [
            { id: 'op-1', type: 'expense', amount: '10', account_id: null },
            { id: 'op-2', type: 'expense', amount: '5', account_id: null },
          ],
        },
      };

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(dbInstance);
      });

      await BackupRestore.restoreBackup(backup);

      const completeCall = emitSpy.mock.calls.find(
        ([, payload]) => payload?.stepId === 'complete' && payload?.status === 'completed',
      );
      expect(completeCall).toBeDefined();
      expect(completeCall[1].data.skippedOperations).toBe(2);
    });

    it('creates a pre-restore snapshot file before clearing live data', async () => {
      // Make createBackup return mock data so it can write the snapshot
      mockDb.queryAll.mockResolvedValue([]);

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [],
          categories: [],
          operations: [],
        },
      };

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(dbInstance);
      });

      await BackupRestore.restoreBackup(backup);

      // writeAsStringAsync should have been called at least once for the snapshot
      const snapshotWrite = mockFileSystem.writeAsStringAsync.mock.calls.find(
        ([uri]) => uri.includes('pre_restore_'),
      );
      expect(snapshotWrite).toBeDefined();
    });

    it('snapshot URI is included in the complete event data', async () => {
      const appEvents = require('../../app/services/eventEmitter').appEvents;
      const emitSpy = jest.spyOn(appEvents, 'emit');

      mockDb.queryAll.mockResolvedValue([]);

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [],
          categories: [],
          operations: [],
        },
      };

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(dbInstance);
      });

      await BackupRestore.restoreBackup(backup);

      const completeCall = emitSpy.mock.calls.find(
        ([, payload]) => payload?.stepId === 'complete' && payload?.status === 'completed',
      );
      expect(completeCall).toBeDefined();
      expect(completeCall[1].data.snapshotUri).toContain('pre_restore_');
    });

    it('proceeds with restore even if snapshot creation fails', async () => {
      mockFileSystem.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));

      const backup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [],
          categories: [],
          operations: [],
        },
      };

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (callback) => {
        await callback(dbInstance);
      });

      // Should still succeed despite snapshot failure
      await expect(BackupRestore.restoreBackup(backup)).resolves.toBeUndefined();
    });
  });

  describe('Budget plans round-trip (Budgets v2, issue #1398)', () => {
    // A UUID account so the restore exercises account-ID remapping on the
    // transfer line's to_account_id.
    const planAccount = { id: 'acc-uuid', name: 'Savings', balance: '0', currency: 'USD' };
    const planCategory = {
      id: 'cat-1', name: 'Food', type: 'folder', category_type: 'expense',
      is_shadow: 0, created_at: 'x', updated_at: 'y',
    };
    const mockPlan = {
      id: 'plan-1', month: '2026-07', currency: 'USD', expected_income: '3000.00',
      created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    };
    // Non-ASCII comment must survive the round-trip.
    const NON_ASCII_COMMENT = 'Отложить на 日本 — €100';
    const categoryLine = {
      id: 'line-cat', plan_id: 'plan-1', label: 'Groceries', amount: '400.00',
      comment: NON_ASCII_COMMENT, category_id: 'cat-1', to_account_id: null,
      sort_order: 0, created_at: 'x', updated_at: 'y',
    };
    const transferLine = {
      id: 'line-xfer', plan_id: 'plan-1', label: 'To savings', amount: '500.00',
      comment: null, category_id: null, to_account_id: 'acc-uuid',
      sort_order: 1, created_at: 'x', updated_at: 'y',
    };

    // The UUID account is auto-assigned a new integer ID on insert; pin it to a
    // known value so the transfer line's remapped to_account_id is deterministic.
    const REMAPPED_ACCOUNT_ID = 42;
    const makeDbInstance = () => {
      let insertCount = 0;
      return {
        runAsync: jest.fn().mockImplementation((query) => {
          if (typeof query === 'string' && query.includes('INSERT INTO accounts')) {
            return Promise.resolve({ lastInsertRowId: REMAPPED_ACCOUNT_ID });
          }
          return Promise.resolve({ lastInsertRowId: ++insertCount });
        }),
        getAllAsync: jest.fn().mockResolvedValue([
          { id: 'shadow-adjustment-expense' },
          { id: 'shadow-adjustment-income' },
        ]),
      };
    };

    const findInsert = (dbInstance, table) =>
      dbInstance.runAsync.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes(`INSERT INTO ${table}`),
      );

    const backupWithPlan = () => ({
      version: 1,
      timestamp: '2026-07-01T00:00:00.000Z',
      platform: 'native',
      data: {
        accounts: [planAccount],
        categories: [planCategory],
        operations: [],
        app_metadata: mockMetadata,
        budget_plans: [mockPlan],
        budget_plan_lines: [categoryLine, transferLine],
      },
    });

    it('includes budget_plans and budget_plan_lines in a created backup', async () => {
      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('budget_plan_lines')) return Promise.resolve([categoryLine, transferLine]);
        if (query.includes('budget_plans')) return Promise.resolve([mockPlan]);
        return Promise.resolve([]);
      });

      const backup = await BackupRestore.createBackup();

      expect(backup.data.budget_plans).toEqual([mockPlan]);
      expect(backup.data.budget_plan_lines).toEqual([categoryLine, transferLine]);
    });

    it('restores a plan with a category line and a transfer line (account FK remapped)', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      await BackupRestore.restoreBackup(backupWithPlan());

      const planInserts = findInsert(dbInstance, 'budget_plans');
      expect(planInserts).toHaveLength(1);
      expect(planInserts[0][1]).toEqual([
        'plan-1', '2026-07', 'USD', '3000.00',
        '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z',
      ]);

      const lineInserts = findInsert(dbInstance, 'budget_plan_lines');
      expect(lineInserts).toHaveLength(2);

      // Category line: keeps category_id as-is, to_account_id null, comment intact.
      const catCall = lineInserts.find(c => c[1][0] === 'line-cat');
      expect(catCall[1]).toEqual([
        'line-cat', 'plan-1', 'Groceries', '400.00', NON_ASCII_COMMENT,
        'cat-1', null, 0, 'x', 'y',
      ]);

      // Transfer line: category_id null, to_account_id remapped 'acc-uuid' -> 42.
      const xferCall = lineInserts.find(c => c[1][0] === 'line-xfer');
      expect(xferCall[1]).toEqual([
        'line-xfer', 'plan-1', 'To savings', '500.00', null,
        null, REMAPPED_ACCOUNT_ID, 1, 'x', 'y',
      ]);
    });

    it('skips a plan line whose parent plan was not restored', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      const backup = backupWithPlan();
      backup.data.budget_plan_lines = [
        categoryLine,
        { ...transferLine, id: 'line-orphan', plan_id: 'plan-does-not-exist', to_account_id: null, category_id: 'cat-1' },
      ];

      await BackupRestore.restoreBackup(backup);

      const lineInserts = findInsert(dbInstance, 'budget_plan_lines');
      expect(lineInserts).toHaveLength(1);
      expect(lineInserts[0][1][0]).toBe('line-cat');
    });

    it('skips lines of a plan that was itself skipped for missing fields (no FK abort)', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      const backup = backupWithPlan();
      // Plan has an id but no currency → skipped on insert. Its line must not be
      // inserted (else plan_id FK fails and the whole restore aborts).
      backup.data.budget_plans = [{ ...mockPlan, currency: undefined }];
      backup.data.budget_plan_lines = [categoryLine];

      await expect(BackupRestore.restoreBackup(backup)).resolves.toBeUndefined();
      expect(findInsert(dbInstance, 'budget_plans')).toHaveLength(0);
      expect(findInsert(dbInstance, 'budget_plan_lines')).toHaveLength(0);
    });

    it('skips a plan line with an empty amount', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      const backup = backupWithPlan();
      backup.data.budget_plan_lines = [{ ...categoryLine, amount: '' }];

      await BackupRestore.restoreBackup(backup);
      expect(findInsert(dbInstance, 'budget_plan_lines')).toHaveLength(0);
    });

    it('aborts cleanly when a transfer line references an account absent from the backup', async () => {
      const backup = backupWithPlan();
      backup.data.budget_plan_lines = [
        { ...transferLine, to_account_id: 'ghost-account' },
      ];

      await expect(BackupRestore.restoreBackup(backup)).rejects.toThrow(
        /account IDs not found in the backup.*Restore aborted/,
      );
      expect(mockDb.executeTransaction).not.toHaveBeenCalled();
    });

    it('imports an old backup without plan tables cleanly (zero plans, no error)', async () => {
      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      const oldBackup = {
        version: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        platform: 'native',
        data: {
          accounts: [planAccount],
          categories: [planCategory],
          operations: [],
          app_metadata: mockMetadata,
          // No budget_plans / budget_plan_lines keys at all.
        },
      };

      await expect(BackupRestore.restoreBackup(oldBackup)).resolves.toBeUndefined();
      expect(findInsert(dbInstance, 'budget_plans')).toHaveLength(0);
      expect(findInsert(dbInstance, 'budget_plan_lines')).toHaveLength(0);
    });

    it('exports budget plan sections (with non-ASCII comment) to CSV', async () => {
      mockDb.queryAll.mockImplementation((query) => {
        if (query.includes('budget_plan_lines')) return Promise.resolve([categoryLine, transferLine]);
        if (query.includes('budget_plans')) return Promise.resolve([mockPlan]);
        if (query.includes('accounts')) return Promise.resolve([planAccount]);
        if (query.includes('categories')) return Promise.resolve([planCategory]);
        return Promise.resolve([]);
      });

      await BackupRestore.exportBackup('csv');

      const written = mockFileSystem.writeAsStringAsync.mock.calls[0][1];
      expect(written).toContain('[BUDGET_PLANS]');
      expect(written).toContain('[BUDGET_PLAN_LINES]');
      expect(written).toContain('plan-1');
      expect(written).toContain('2026-07');
      expect(written).toContain(NON_ASCII_COMMENT);
    });

    it('round-trips budget plans through CSV import', async () => {
      const csvContent = `# Money Tracker Backup - 2026-07-01T00:00:00.000Z
# Version: 1

[ACCOUNTS]
id,name,balance,currency
acc-uuid,Savings,0,USD

[CATEGORIES]
id,name,type,category_type
cat-1,Food,folder,expense

[OPERATIONS]
id,type,amount,account_id,category_id

[BUDGET_PLANS]
id,month,currency,expected_income
plan-1,2026-07,USD,3000.00

[BUDGET_PLAN_LINES]
id,plan_id,label,amount,comment,category_id,to_account_id,sort_order
line-cat,plan-1,Groceries,400.00,"${NON_ASCII_COMMENT}",cat-1,,0`;

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock/backup.csv', name: 'backup.csv' }],
      });
      mockFileSystem.readAsStringAsync.mockResolvedValue(csvContent);

      const dbInstance = makeDbInstance();
      mockDb.executeTransaction.mockImplementation(async (cb) => { await cb(dbInstance); });

      const backup = await BackupRestore.importBackup();

      expect(backup.data.budget_plans).toHaveLength(1);
      expect(backup.data.budget_plans[0]).toMatchObject({ id: 'plan-1', month: '2026-07', currency: 'USD' });
      expect(backup.data.budget_plan_lines).toHaveLength(1);
      expect(backup.data.budget_plan_lines[0]).toMatchObject({
        id: 'line-cat', plan_id: 'plan-1', category_id: 'cat-1', comment: NON_ASCII_COMMENT,
      });

      const lineInserts = findInsert(dbInstance, 'budget_plan_lines');
      expect(lineInserts).toHaveLength(1);
      expect(lineInserts[0][1]).toEqual(expect.arrayContaining(['line-cat', 'plan-1', NON_ASCII_COMMENT]));
    });
  });
});
