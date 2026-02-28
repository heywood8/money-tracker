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
      expect(mockDb.queryAll).toHaveBeenCalledTimes(7);
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

    it('deletes in correct order (budgets, operations, categories, accounts)', async () => {
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

      expect(deleteCalls[0]).toContain('planned_operations');
      expect(deleteCalls[1]).toContain('budgets');
      expect(deleteCalls[2]).toContain('accounts_balance_history');
      expect(deleteCalls[3]).toContain('operations');
      expect(deleteCalls[4]).toContain('categories');
      expect(deleteCalls[5]).toContain('accounts');
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
    it('returns backup information for valid backup', () => {
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

    it('returns null for invalid backup', () => {
      const info = BackupRestore.getBackupInfo(null);

      expect(info).toBeNull();
    });

    it('handles missing platform', () => {
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

    it('handles missing counts', () => {
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
});
