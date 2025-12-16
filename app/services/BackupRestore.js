/**
 * SQLite backup and restore service (Native platforms: iOS/Android)
 * Supports multiple export formats: JSON, CSV, SQLite
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { queryAll, executeQuery, executeTransaction, getDatabase } from './db';
import { appEvents } from './eventEmitter';

const BACKUP_VERSION = 1;

// Event for import progress
export const IMPORT_PROGRESS_EVENT = 'import:progress';

/**
 * Create a backup of the entire database
 * @returns {Promise<Object>} Backup data object
 */
export const createBackup = async () => {
  try {
    console.log('Creating database backup...');

    // Fetch all data from all tables
    const [accounts, categories, operations, budgets, appMetadata, balanceHistory] = await Promise.all([
      queryAll('SELECT * FROM accounts ORDER BY created_at ASC'),
      queryAll('SELECT * FROM categories ORDER BY created_at ASC'),
      queryAll('SELECT * FROM operations ORDER BY created_at ASC'),
      queryAll('SELECT * FROM budgets ORDER BY created_at ASC'),
      queryAll('SELECT * FROM app_metadata'),
      queryAll('SELECT * FROM accounts_balance_history ORDER BY account_id ASC, date ASC'),
    ]);

    // Create backup object
    const backup = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      platform: 'native',
      data: {
        accounts: accounts || [],
        categories: categories || [],
        operations: operations || [],
        budgets: budgets || [],
        app_metadata: appMetadata || [],
        balance_history: balanceHistory || [],
      },
    };

    console.log('Backup created successfully:', {
      accounts: backup.data.accounts.length,
      categories: backup.data.categories.length,
      operations: backup.data.operations.length,
      budgets: backup.data.budgets.length,
      balance_history: backup.data.balance_history.length,
    });

    return backup;
  } catch (error) {
    console.error('Failed to create backup:', error);
    throw error;
  }
};

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects
 * @returns {string} CSV string
 */
const convertToCSV = (data) => {
  if (!data || data.length === 0) {
    return '';
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');

  // Convert each row
  const csvRows = data.map(row => {
    return headers.map(header => {
      let value = row[header];
      // Escape values that contain commas or quotes
      if (value === null || value === undefined) {
        value = '';
      } else {
        value = String(value);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
      }
      return value;
    }).join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
};

/**
 * Export backup as CSV files (creates a zip-like folder structure)
 * @returns {Promise<string>} Filename
 */
export const exportBackupCSV = async () => {
  try {
    const backup = await createBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Create CSV content for each table
    const csvFiles = {
      'accounts.csv': convertToCSV(backup.data.accounts),
      'categories.csv': convertToCSV(backup.data.categories),
      'operations.csv': convertToCSV(backup.data.operations),
      'budgets.csv': convertToCSV(backup.data.budgets),
      'app_metadata.csv': convertToCSV(backup.data.app_metadata),
      'balance_history.csv': convertToCSV(backup.data.balance_history),
      'backup_info.csv': `version,timestamp,platform\n${backup.version},${backup.timestamp},${backup.platform}`,
    };

    // For simplicity, we'll combine all CSVs into one file with section markers
    // This makes import easier and doesn't require ZIP support
    let combinedCSV = `# Money Tracker Backup - ${backup.timestamp}\n`;
    combinedCSV += `# Version: ${backup.version}\n\n`;

    combinedCSV += `[ACCOUNTS]\n${csvFiles['accounts.csv']}\n\n`;
    combinedCSV += `[CATEGORIES]\n${csvFiles['categories.csv']}\n\n`;
    combinedCSV += `[OPERATIONS]\n${csvFiles['operations.csv']}\n\n`;
    combinedCSV += `[BUDGETS]\n${csvFiles['budgets.csv']}\n\n`;
    combinedCSV += `[APP_METADATA]\n${csvFiles['app_metadata.csv']}\n\n`;
    combinedCSV += `[BALANCE_HISTORY]\n${csvFiles['balance_history.csv']}\n`;

    const filename = `money_tracker_backup_${timestamp}.csv`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, combinedCSV);
    console.log('CSV backup file created:', fileUri);

    // Share the file
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export CSV Backup',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }

    return filename;
  } catch (error) {
    console.error('Failed to export CSV backup:', error);
    throw error;
  }
};

/**
 * Export backup as SQLite database file
 * @returns {Promise<string>} Filename
 */
export const exportBackupSQLite = async () => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `money_tracker_backup_${timestamp}.db`;
    const sourceUri = `${FileSystem.documentDirectory}SQLite/penny.db`;
    const destUri = `${FileSystem.documentDirectory}${filename}`;

    // Check if source database exists
    const fileInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!fileInfo.exists) {
      throw new Error('Database file not found');
    }

    // Force a checkpoint to ensure WAL is merged into main database file
    console.log('Checkpointing database before export...');
    try {
      const { executeQuery } = await import('./db');
      await executeQuery('PRAGMA wal_checkpoint(TRUNCATE)');
      console.log('Database checkpoint completed');
    } catch (checkpointError) {
      console.warn('Failed to checkpoint database:', checkpointError);
      // Continue anyway, the copy might still work
    }

    // Copy database file
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destUri,
    });

    console.log('SQLite backup file created:', destUri);

    // Share the file
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(destUri, {
        mimeType: 'application/vnd.sqlite3',
        dialogTitle: 'Export SQLite Database',
        UTI: 'public.database',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }

    return filename;
  } catch (error) {
    console.error('Failed to export SQLite backup:', error);
    throw error;
  }
};

/**
 * Export backup to a JSON file
 * @param {string} format - Export format: 'json', 'csv', or 'sqlite'
 * @returns {Promise<string>} Filename
 */
export const exportBackup = async (format = 'json') => {
  switch (format.toLowerCase()) {
  case 'csv':
    return await exportBackupCSV();
  case 'sqlite':
  case 'db':
    return await exportBackupSQLite();
  case 'json':
  default:
    // Original JSON export
    try {
      const backup = await createBackup();

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `money_tracker_backup_${timestamp}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Write backup to file
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

      console.log('Backup file created:', fileUri);

      // Share the file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Database Backup',
          UTI: 'public.json',
        });
      } else {
        throw new Error('Sharing is not available on this device');
      }

      return filename;
    } catch (error) {
      console.error('Failed to export backup:', error);
      throw error;
    }
  }
};

/**
 * Validate backup data structure
 * @param {Object} backup - Backup object to validate
 * @returns {boolean} True if valid, throws error if invalid
 */
const validateBackup = (backup) => {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup format: not an object');
  }

  if (!backup.version) {
    throw new Error('Invalid backup format: missing version');
  }

  if (backup.version > BACKUP_VERSION) {
    throw new Error(
      `Backup version ${backup.version} is not supported by this app version (max: ${BACKUP_VERSION})`,
    );
  }

  if (!backup.data || typeof backup.data !== 'object') {
    throw new Error('Invalid backup format: missing or invalid data');
  }

  // Check required tables
  const requiredTables = ['accounts', 'categories', 'operations'];
  for (const table of requiredTables) {
    if (!Array.isArray(backup.data[table])) {
      throw new Error(`Invalid backup format: missing or invalid ${table} data`);
    }
  }

  return true;
};

/**
 * Restore database from backup data
 * @param {Object} backup - Backup object
 * @returns {Promise<void>}
 */
export const restoreBackup = async (backup) => {
  try {
    console.log('Restoring database from backup...');
    appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'restore', status: 'in_progress' });

    // Validate backup
    validateBackup(backup);

    await executeTransaction(async (db) => {
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'restore', status: 'completed' });
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'clear', status: 'in_progress' });

      // Clear existing data (in reverse order due to foreign keys)
      await db.runAsync('DELETE FROM budgets');
      await db.runAsync('DELETE FROM accounts_balance_history');
      await db.runAsync('DELETE FROM operations');
      await db.runAsync('DELETE FROM categories');
      await db.runAsync('DELETE FROM accounts');
      await db.runAsync('DELETE FROM app_metadata WHERE key != ?', ['db_version']);

      // Reset auto-increment counters to allow ID preservation
      await db.runAsync('DELETE FROM sqlite_sequence WHERE name IN (?, ?)', ['accounts', 'operations']);

      console.log('Existing data cleared and auto-increment counters reset');
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'clear', status: 'completed' });

      // Restore accounts - preserve integer IDs, map UUID IDs to new integers
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'accounts',
        status: 'in_progress',
        data: backup.data.accounts.length,
      });

      const accountIdMapping = new Map(); // old ID (UUID or integer) -> final integer ID

      for (const account of backup.data.accounts) {
        // Validate required fields
        if (!account.name) {
          console.error('Skipping account with missing name:', account);
          continue;
        }

        // Check if ID is a number (integer) or a string (UUID)
        const isIntegerId = account.id != null && !isNaN(account.id);

        let result;
        if (isIntegerId) {
          // Preserve the original integer ID
          result = await db.runAsync(
            'INSERT INTO accounts (id, name, balance, currency, display_order, hidden, monthly_target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              Number(account.id),
              account.name,
              account.balance || '0',
              account.currency || 'USD',
              account.display_order ?? null,
              account.hidden ?? 0,
              account.monthly_target ?? null,
              account.created_at || new Date().toISOString(),
              account.updated_at || new Date().toISOString(),
            ],
          );
          // For integer IDs, no remapping needed - map to itself
          accountIdMapping.set(account.id, Number(account.id));
          console.log(`Preserved account ID: ${account.id}`);
        } else {
          // UUID or no ID - let SQLite auto-generate integer ID
          result = await db.runAsync(
            'INSERT INTO accounts (name, balance, currency, display_order, hidden, monthly_target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              account.name,
              account.balance || '0',
              account.currency || 'USD',
              account.display_order ?? null,
              account.hidden ?? 0,
              account.monthly_target ?? null,
              account.created_at || new Date().toISOString(),
              account.updated_at || new Date().toISOString(),
            ],
          );

          // Map UUID to new integer ID
          if (account.id != null) {
            accountIdMapping.set(account.id, result.lastInsertRowId);
            console.log(`Mapped account ID: ${account.id} -> ${result.lastInsertRowId}`);
          }
        }
      }
      console.log(`Restored ${backup.data.accounts.length} accounts with ID mapping`);
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'accounts',
        status: 'completed',
        data: backup.data.accounts.length,
      });

      // Restore categories
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'categories',
        status: 'in_progress',
        data: backup.data.categories.length,
      });
      for (const category of backup.data.categories) {
        // Validate required fields
        if (!category.id || !category.name) {
          console.error('Skipping category with missing id or name:', category);
          continue;
        }

        await db.runAsync(
          'INSERT INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, exclude_from_forecast, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            category.id,
            category.name,
            category.type || 'folder',
            category.category_type || 'expense',
            category.parent_id || null,
            category.icon || null,
            category.color || null,
            category.is_shadow || 0,
            category.exclude_from_forecast || 0,
            category.created_at || new Date().toISOString(),
            category.updated_at || new Date().toISOString(),
          ],
        );
      }
      console.log(`Restored ${backup.data.categories.length} categories`);
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'categories',
        status: 'completed',
        data: backup.data.categories.length,
      });

      // Restore operations - map account IDs from UUID to integer
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'operations',
        status: 'in_progress',
        data: backup.data.operations.length,
      });
      for (const operation of backup.data.operations) {
        // Map account IDs from old ID to new integer ID
        // First check if we have a mapping, otherwise use the original value
        let mappedAccountId = accountIdMapping.get(operation.account_id);
        if (mappedAccountId === undefined) {
          mappedAccountId = operation.account_id;
        }
        
        // Validate that account_id is not null/undefined
        if (mappedAccountId == null) {
          console.error('Skipping operation with null account_id:', operation);
          continue;
        }

        let mappedToAccountId = null;
        if (operation.to_account_id != null) {
          mappedToAccountId = accountIdMapping.get(operation.to_account_id);
          if (mappedToAccountId === undefined) {
            mappedToAccountId = operation.to_account_id;
          }
        }

        // Note: id is omitted as it's now auto-increment integer
        await db.runAsync(
          'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, exchange_rate, destination_amount, source_currency, destination_currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            operation.type || 'expense',
            operation.amount || '0',
            mappedAccountId,
            operation.category_id || null,
            mappedToAccountId,
            operation.date || new Date().toISOString(),
            operation.created_at || new Date().toISOString(),
            operation.description || null,
            operation.exchange_rate || null,
            operation.destination_amount || null,
            operation.source_currency || null,
            operation.destination_currency || null,
          ],
        );
      }
      console.log(`Restored ${backup.data.operations.length} operations with mapped account IDs`);
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'operations',
        status: 'completed',
        data: backup.data.operations.length,
      });

      // Restore balance history
      if (backup.data.balance_history) {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'balance_history',
          status: 'in_progress',
          data: backup.data.balance_history.length,
        });

        for (const history of backup.data.balance_history) {
          const mappedAccountId = accountIdMapping.get(history.account_id) ?? history.account_id;

          await db.runAsync(
            'INSERT OR IGNORE INTO accounts_balance_history (account_id, date, balance, created_at) VALUES (?, ?, ?, ?)',
            [mappedAccountId, history.date, history.balance, history.created_at],
          );
        }

        console.log(`Restored ${backup.data.balance_history.length} balance history entries`);
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'balance_history',
          status: 'completed',
          data: backup.data.balance_history.length,
        });
      } else {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'balance_history',
          status: 'in_progress',
          data: 0,
        });
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'balance_history',
          status: 'completed',
          data: 0,
        });
      }

      // Restore budgets
      if (backup.data.budgets) {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budgets',
          status: 'in_progress',
          data: backup.data.budgets.length,
        });
        for (const budget of backup.data.budgets) {
          // Validate required fields
          if (!budget.id || !budget.category_id || !budget.amount || !budget.currency) {
            console.error('Skipping budget with missing required fields:', budget);
            continue;
          }

          await db.runAsync(
            'INSERT INTO budgets (id, category_id, amount, currency, period_type, start_date, end_date, is_recurring, rollover_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              budget.id,
              budget.category_id,
              budget.amount,
              budget.currency,
              budget.period_type || 'monthly',
              budget.start_date || new Date().toISOString(),
              budget.end_date || null,
              budget.is_recurring ?? 1,
              budget.rollover_enabled ?? 0,
              budget.created_at || new Date().toISOString(),
              budget.updated_at || new Date().toISOString(),
            ],
          );
        }
        console.log(`Restored ${backup.data.budgets.length} budgets`);
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budgets',
          status: 'completed',
          data: backup.data.budgets.length,
        });
      } else {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budgets',
          status: 'in_progress',
          data: 0,
        });
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budgets',
          status: 'completed',
          data: 0,
        });
      }

      // Restore app metadata (except db_version)
      if (backup.data.app_metadata) {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'metadata',
          status: 'in_progress',
          data: backup.data.app_metadata.length,
        });
        for (const meta of backup.data.app_metadata) {
          if (meta.key !== 'db_version') {
            await db.runAsync(
              'INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
              [meta.key, meta.value, meta.updated_at],
            );
          }
        }
        console.log(`Restored ${backup.data.app_metadata.length} metadata entries`);
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'metadata',
          status: 'completed',
          data: backup.data.app_metadata.length,
        });
      } else {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'metadata',
          status: 'in_progress',
          data: 0,
        });
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'metadata',
          status: 'completed',
          data: 0,
        });
      }

      // Post-restore upgrades: Ensure shadow categories exist
      console.log('Performing post-restore database upgrades...');
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'upgrades', status: 'in_progress' });
      const shadowCategories = await db.getAllAsync(
        'SELECT id FROM categories WHERE id IN (?, ?)',
        ['shadow-adjustment-expense', 'shadow-adjustment-income'],
      );

      if (shadowCategories.length < 2) {
        console.log('Adding missing shadow categories...');
        const now = new Date().toISOString();

        const hasShadowExpense = shadowCategories.some(cat => cat.id === 'shadow-adjustment-expense');
        const hasShadowIncome = shadowCategories.some(cat => cat.id === 'shadow-adjustment-income');

        // Add shadow adjustment expense category if missing
        if (!hasShadowExpense) {
          await db.runAsync(
            'INSERT OR IGNORE INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              'shadow-adjustment-expense',
              'Balance Adjustment (Expense)',
              'entry',
              'expense',
              null,
              'cash-minus',
              null,
              1,
              now,
              now,
            ],
          );
          console.log('Shadow expense category added');
        }

        // Add shadow adjustment income category if missing
        if (!hasShadowIncome) {
          await db.runAsync(
            'INSERT OR IGNORE INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              'shadow-adjustment-income',
              'Balance Adjustment (Income)',
              'entry',
              'income',
              null,
              'cash-plus',
              null,
              1,
              now,
              now,
            ],
          );
          console.log('Shadow income category added');
        }

        console.log('Shadow categories added successfully');
      } else {
        console.log('Shadow categories already exist in backup');
      }

      console.log('Post-restore upgrades completed');
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'upgrades', status: 'completed' });
    });

    console.log('Database restored successfully');
    appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'complete', status: 'completed' });
  } catch (error) {
    console.error('Failed to restore backup:', error);
    throw error;
  }
};

/**
 * Parse CSV section to array of objects
 * @param {string} csvContent - CSV content
 * @returns {Array} Array of objects
 */
const parseCSV = (csvContent) => {
  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
    let currentValue = '';
    let insideQuotes = false;

    // Parse CSV considering quoted values
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentValue += '"';
          j++; // Skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue); // Add last value

    // Create object from headers and values
    const obj = {};
    headers.forEach((header, index) => {
      const value = values[index]?.trim() || '';
      obj[header] = value === '' ? null : value;
    });
    data.push(obj);
  }

  return data;
};

/**
 * Import backup from CSV file
 * @param {string} fileUri - File URI
 * @returns {Promise<Object>} Imported backup object
 */
const importBackupCSV = async (fileUri) => {
  console.log('Importing CSV backup...');
  appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'in_progress' });
  const fileContent = await FileSystem.readAsStringAsync(fileUri);

  // Parse sections
  const sections = {
    accounts: [],
    categories: [],
    operations: [],
    budgets: [],
    app_metadata: [],
    balance_history: [],
  };

  // Split by section markers
  const accountsMatch = fileContent.match(/\[ACCOUNTS\]\n([\s\S]*?)(?=\n\[|$)/);
  const categoriesMatch = fileContent.match(/\[CATEGORIES\]\n([\s\S]*?)(?=\n\[|$)/);
  const operationsMatch = fileContent.match(/\[OPERATIONS\]\n([\s\S]*?)(?=\n\[|$)/);
  const budgetsMatch = fileContent.match(/\[BUDGETS\]\n([\s\S]*?)(?=\n\[|$)/);
  const metadataMatch = fileContent.match(/\[APP_METADATA\]\n([\s\S]*?)(?=\n\[|$)/);
  const balanceHistoryMatch = fileContent.match(/\[BALANCE_HISTORY\]\n([\s\S]*?)(?=\n\[|$)/);

  if (accountsMatch) sections.accounts = parseCSV(accountsMatch[1]);
  if (categoriesMatch) sections.categories = parseCSV(categoriesMatch[1]);
  if (operationsMatch) sections.operations = parseCSV(operationsMatch[1]);
  if (budgetsMatch) sections.budgets = parseCSV(budgetsMatch[1]);
  if (metadataMatch) sections.app_metadata = parseCSV(metadataMatch[1]);
  if (balanceHistoryMatch) sections.balance_history = parseCSV(balanceHistoryMatch[1]);

  // Extract version from header
  const versionMatch = fileContent.match(/# Version: (\d+)/);
  const version = versionMatch ? parseInt(versionMatch[1]) : BACKUP_VERSION;

  // Create backup object
  const backup = {
    version,
    timestamp: new Date().toISOString(),
    platform: 'csv',
    data: sections,
  };

  appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'completed' });
  await restoreBackup(backup);
  return backup;
};



/**
 * Import backup from SQLite database file
 * @param {string} fileUri - File URI
 * @returns {Promise<Object>} Imported backup info
 */
const importBackupSQLite = async (fileUri) => {
  console.log('Importing SQLite backup...');
  appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'in_progress' });

  const SQLite = await import('expo-sqlite');
  const { drizzle } = await import('drizzle-orm/expo-sqlite');
  const { migrate } = await import('drizzle-orm/expo-sqlite/migrator');
  const schema = await import('../db/schema');
  const migrations = await import('../../drizzle/migrations');

  const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
  const tempDbUri = `${sqliteDir}/penny_import_temp.db`;

  // Ensure SQLite directory exists
  const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
  if (!dirInfo.exists) {
    console.log('Creating SQLite directory...');
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  }

  // Copy imported file to temp location
  console.log('Copying imported file to temp location...');
  await FileSystem.copyAsync({
    from: fileUri,
    to: tempDbUri,
  });

  let tempDb = null;
  let tempDrizzle = null;

  try {
    // Open the imported database
    console.log('Opening imported database...');
    tempDb = await SQLite.openDatabaseAsync('penny_import_temp.db');
    tempDrizzle = drizzle(tempDb, { schema: schema.default || schema });

    // Run migrations on the imported database to bring it up to current schema
    console.log('Running migrations on imported database...');
    const migrationsData = migrations.default || migrations;
    console.log('Available migrations:', migrationsData.journal.entries.map(e => e.tag).join(', '));

    // Check current migration state before running
    const drizzleMigrations = await tempDb.getAllAsync(
      'SELECT name FROM sqlite_master WHERE type="table" AND name="__drizzle_migrations"',
    );

    if (drizzleMigrations && drizzleMigrations.length > 0) {
      const appliedMigrations = await tempDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC');
      console.log('Previously applied migrations:', (appliedMigrations || []).map(m => `${m.hash}`).join(', ') || 'none');
    } else {
      console.log('No migrations table found - database will be migrated from scratch');
    }

    await migrate(tempDrizzle, migrationsData);

    // Log which migrations were applied
    const finalMigrations = await tempDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC');
    console.log('Migrations after running migrate:', (finalMigrations || []).map(m => `${m.hash}`).join(', '));
    console.log(`Total migrations applied: ${(finalMigrations || []).length}/${migrationsData.journal.entries.length}`);

    // Enable foreign keys and WAL mode after migrations
    await tempDb.runAsync('PRAGMA foreign_keys = ON');
    await tempDb.runAsync('PRAGMA journal_mode = WAL');

    // Extract all data from the migrated database
    console.log('Extracting data from imported database...');
    const [accounts, categories, operations, budgets, appMetadata, balanceHistory] = await Promise.all([
      tempDb.getAllAsync('SELECT * FROM accounts ORDER BY created_at ASC'),
      tempDb.getAllAsync('SELECT * FROM categories ORDER BY created_at ASC'),
      tempDb.getAllAsync('SELECT * FROM operations ORDER BY created_at ASC'),
      tempDb.getAllAsync('SELECT * FROM budgets ORDER BY created_at ASC'),
      tempDb.getAllAsync('SELECT * FROM app_metadata'),
      tempDb.getAllAsync('SELECT * FROM accounts_balance_history ORDER BY account_id ASC, date ASC'),
    ]);

    // Create backup object
    const backup = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      platform: 'sqlite',
      data: {
        accounts: accounts || [],
        categories: categories || [],
        operations: operations || [],
        budgets: budgets || [],
        app_metadata: appMetadata || [],
        balance_history: balanceHistory || [],
      },
    };

    console.log('Data extracted from imported database:', {
      accounts: backup.data.accounts.length,
      categories: backup.data.categories.length,
      operations: backup.data.operations.length,
      budgets: backup.data.budgets.length,
    });

    // Close the temp database
    console.log('Closing temp database...');
    await tempDb.closeAsync();
    tempDb = null;

    // Delete temp database file and WAL files
    await FileSystem.deleteAsync(tempDbUri, { idempotent: true });
    await FileSystem.deleteAsync(`${tempDbUri}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${tempDbUri}-shm`, { idempotent: true });

    appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'completed' });

    // Use the standard restore process
    await restoreBackup(backup);

    return backup;
  } catch (error) {
    console.error('Failed to import SQLite database:', error);

    // Clean up temp database
    if (tempDb) {
      try {
        await tempDb.closeAsync();
      } catch (closeError) {
        console.error('Error closing temp database:', closeError);
      }
    }

    await FileSystem.deleteAsync(tempDbUri, { idempotent: true });
    await FileSystem.deleteAsync(`${tempDbUri}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${tempDbUri}-shm`, { idempotent: true });

    throw error;
  }
};

/**
 * Detect file format from extension
 * @param {string} filename - Filename
 * @returns {string} Format: 'json', 'csv', or 'sqlite'
 */
const detectFileFormat = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
  case 'csv':
    return 'csv';
  case 'db':
  case 'sqlite':
  case 'sqlite3':
    return 'sqlite';
  case 'json':
  default:
    return 'json';
  }
};

/**
 * Import backup from a file (auto-detects format)
 * @returns {Promise<Object>} Imported backup info
 */
export const importBackup = async () => {
  try {
    // Pick a document (allow all types)
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      throw new Error('Import cancelled');
    }

    const fileUri = result.assets[0].uri;
    const filename = result.assets[0].name || '';
    console.log('Reading backup file:', fileUri, 'Name:', filename);

    // Detect format from filename
    const format = detectFileFormat(filename);
    console.log('Detected format:', format);
    appEvents.emit(IMPORT_PROGRESS_EVENT, {
      stepId: 'format',
      status: 'completed',
      data: format,
    });

    // Import based on format
    let backup;
    switch (format) {
    case 'csv':
      backup = await importBackupCSV(fileUri);
      break;
    case 'sqlite':
      backup = await importBackupSQLite(fileUri);
      break;
    case 'json':
    default: {
      // Original JSON import
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'in_progress' });
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      try {
        backup = JSON.parse(fileContent);
      } catch (error) {
        throw new Error('Invalid backup file: not valid JSON');
      }
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'completed' });
      await restoreBackup(backup);
      break;
    }
    }

    return backup;
  } catch (error) {
    console.error('Failed to import backup:', error);
    throw error;
  }
};

/**
 * Get backup info from a backup object
 * @param {Object} backup - Backup object
 * @returns {Object} Backup information
 */
export const getBackupInfo = (backup) => {
  try {
    validateBackup(backup);

    return {
      version: backup.version,
      timestamp: backup.timestamp,
      platform: backup.platform || 'unknown',
      accountsCount: backup.data.accounts?.length || 0,
      categoriesCount: backup.data.categories?.length || 0,
      operationsCount: backup.data.operations?.length || 0,
      budgetsCount: backup.data.budgets?.length || 0,
    };
  } catch (error) {
    return null;
  }
};
