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

export class CancelledImportError extends Error {
  constructor() {
    super('Import cancelled by user');
    this.name = 'CancelledImportError';
  }
}

/**
 * Create a backup of the entire database
 * @returns {Promise<Object>} Backup data object
 */
export const createBackup = async () => {
  try {
    console.log('Creating database backup...');

    // Fetch all data from all tables
    const [accounts, categories, operations, budgets, appMetadata, balanceHistory, plannedOperations, merchantRules, budgetPlans, budgetPlanLines] = await Promise.all([
      queryAll('SELECT * FROM accounts ORDER BY created_at ASC'),
      queryAll('SELECT * FROM categories ORDER BY created_at ASC'),
      queryAll('SELECT * FROM operations ORDER BY created_at ASC'),
      queryAll('SELECT * FROM budgets ORDER BY created_at ASC'),
      queryAll('SELECT * FROM app_metadata'),
      queryAll('SELECT * FROM accounts_balance_history ORDER BY account_id ASC, date ASC'),
      queryAll('SELECT * FROM planned_operations ORDER BY created_at ASC').catch(() => []),
      // Newer table — guard so backups of pre-0010 databases don't fail.
      queryAll('SELECT * FROM notification_merchant_rules ORDER BY created_at ASC').catch(() => []),
      // Budgets v2 (migration 0018). Guarded so backups of pre-0018 databases
      // don't fail. Plans before lines so the FK order is preserved on restore.
      queryAll('SELECT * FROM budget_plans ORDER BY created_at ASC').catch(() => []),
      queryAll('SELECT * FROM budget_plan_lines ORDER BY sort_order ASC, created_at ASC').catch(() => []),
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
        planned_operations: plannedOperations || [],
        // Learned merchant -> category rules (the pending_notifications queue is
        // transient state and intentionally not backed up).
        notification_merchant_rules: merchantRules || [],
        // Budgets v2 monthly plans and their allocation lines.
        budget_plans: budgetPlans || [],
        budget_plan_lines: budgetPlanLines || [],
      },
    };

    console.log('Backup created successfully:', {
      accounts: backup.data.accounts.length,
      categories: backup.data.categories.length,
      operations: backup.data.operations.length,
      budgets: backup.data.budgets.length,
      balance_history: backup.data.balance_history.length,
      planned_operations: backup.data.planned_operations.length,
      budget_plans: backup.data.budget_plans.length,
      budget_plan_lines: backup.data.budget_plan_lines.length,
    });

    return backup;
  } catch (error) {
    console.error('Failed to create backup:', error);
    throw error;
  }
};

// Explicit column orderings per table — guards against sparse rows where
// Object.keys(data[0]) would silently omit columns present only on later rows.
const TABLE_FIELDS = {
  accounts:           ['id', 'name', 'balance', 'currency', 'display_order', 'hidden', 'monthly_target', 'card_mask', 'auto_txn_rounding', 'auto_txn_rounding_mode', 'deleted_at', 'created_at', 'updated_at'],
  categories:         ['id', 'name', 'type', 'category_type', 'parent_id', 'icon', 'color', 'is_shadow', 'created_at', 'updated_at'],
  operations:         ['id', 'type', 'amount', 'account_id', 'category_id', 'to_account_id', 'date', 'created_at', 'description', 'exchange_rate', 'destination_amount', 'source_currency', 'destination_currency', 'original_balance', 'exclude_from_avg', 'latitude', 'longitude'],
  budgets:            ['id', 'category_id', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled', 'created_at', 'updated_at'],
  app_metadata:       ['key', 'value', 'updated_at'],
  balance_history:    ['id', 'account_id', 'date', 'balance', 'created_at'],
  planned_operations: ['id', 'name', 'type', 'amount', 'account_id', 'category_id', 'to_account_id', 'description', 'is_recurring', 'last_executed_month', 'display_order', 'created_at', 'updated_at'],
  notification_merchant_rules: ['id', 'merchant', 'package_name', 'category_id', 'label_override', 'created_at', 'updated_at'],
  budget_plans: ['id', 'month', 'currency', 'expected_income', 'created_at', 'updated_at'],
  budget_plan_lines: ['id', 'plan_id', 'label', 'amount', 'comment', 'category_id', 'to_account_id', 'sort_order', 'created_at', 'updated_at'],
};

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects
 * @param {string[]} [explicitFields] - Ordered field list; falls back to Object.keys(data[0])
 * @returns {string} CSV string
 */
const convertToCSV = (data, explicitFields) => {
  if (!data || data.length === 0) {
    return '';
  }

  // Use the explicit field list when provided so every column is always present,
  // even when optional fields are absent from some rows.
  const headers = explicitFields || Object.keys(data[0]);
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

    // Create CSV content for each table using explicit field lists (issue #748)
    const csvFiles = {
      'accounts.csv': convertToCSV(backup.data.accounts, TABLE_FIELDS.accounts),
      'categories.csv': convertToCSV(backup.data.categories, TABLE_FIELDS.categories),
      'operations.csv': convertToCSV(backup.data.operations, TABLE_FIELDS.operations),
      'budgets.csv': convertToCSV(backup.data.budgets, TABLE_FIELDS.budgets),
      'app_metadata.csv': convertToCSV(backup.data.app_metadata, TABLE_FIELDS.app_metadata),
      'balance_history.csv': convertToCSV(backup.data.balance_history, TABLE_FIELDS.balance_history),
      'planned_operations.csv': convertToCSV(backup.data.planned_operations, TABLE_FIELDS.planned_operations),
      'budget_plans.csv': convertToCSV(backup.data.budget_plans, TABLE_FIELDS.budget_plans),
      'budget_plan_lines.csv': convertToCSV(backup.data.budget_plan_lines, TABLE_FIELDS.budget_plan_lines),
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
    combinedCSV += `[BALANCE_HISTORY]\n${csvFiles['balance_history.csv']}\n\n`;
    combinedCSV += `[PLANNED_OPERATIONS]\n${csvFiles['planned_operations.csv']}\n\n`;
    combinedCSV += `[BUDGET_PLANS]\n${csvFiles['budget_plans.csv']}\n\n`;
    combinedCSV += `[BUDGET_PLAN_LINES]\n${csvFiles['budget_plan_lines.csv']}\n`;

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

const VALID_OPERATION_TYPES = ['expense', 'income', 'transfer'];
const VALID_CATEGORY_TYPES = ['folder', 'entry'];
const VALID_CATEGORY_KINDS = ['expense', 'income'];
const VALID_BUDGET_PERIODS = ['weekly', 'monthly', 'yearly'];

/**
 * Validate backup data structure and enum fields.
 * Throws on structural errors; rows with invalid enum values are flagged so
 * the caller can skip them rather than poisoning the database.
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

  // Validate enum fields across all rows — collect all violations before throwing
  const errors = [];

  for (let i = 0; i < backup.data.operations.length; i++) {
    const op = backup.data.operations[i];
    const t = op.type || 'expense';
    if (!VALID_OPERATION_TYPES.includes(t)) {
      errors.push(`operations[${i}] has invalid type "${t}"`);
    }
  }

  for (let i = 0; i < backup.data.categories.length; i++) {
    const cat = backup.data.categories[i];
    const t = cat.type || 'folder';
    const k = cat.category_type || 'expense';
    if (!VALID_CATEGORY_TYPES.includes(t)) {
      errors.push(`categories[${i}] has invalid type "${t}"`);
    }
    if (!VALID_CATEGORY_KINDS.includes(k)) {
      errors.push(`categories[${i}] has invalid category_type "${k}"`);
    }
  }

  if (Array.isArray(backup.data.budgets)) {
    for (let i = 0; i < backup.data.budgets.length; i++) {
      const b = backup.data.budgets[i];
      const p = b.period_type || 'monthly';
      if (!VALID_BUDGET_PERIODS.includes(p)) {
        errors.push(`budgets[${i}] has invalid period_type "${p}"`);
      }
    }
  }

  if (Array.isArray(backup.data.planned_operations)) {
    for (let i = 0; i < backup.data.planned_operations.length; i++) {
      const po = backup.data.planned_operations[i];
      const t = po.type || 'expense';
      if (!VALID_OPERATION_TYPES.includes(t)) {
        errors.push(`planned_operations[${i}] has invalid type "${t}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Backup contains invalid enum values:\n${errors.join('\n')}`,
    );
  }

  return true;
};

/**
 * Restore database from backup data
 * @param {Object} backup - Backup object
 * @param {{ cancelled: boolean }} [cancelToken] - Optional token; set cancelled=true to abort
 * @returns {Promise<void>}
 */
export const restoreBackup = async (backup, cancelToken) => {
  try {
    console.log('Restoring database from backup...');
    appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'restore', status: 'in_progress' });

    // Validate backup structure and enum fields
    validateBackup(backup);

    // Pre-validate account ID references before touching live data.
    // Build the set of account IDs that will actually be inserted (skipped accounts excluded).
    const accountIdsInBackup = new Set();
    for (const account of backup.data.accounts) {
      if (!account.name) continue;
      if (account.id != null) accountIdsInBackup.add(account.id);
    }

    const unmappedAccountIds = [];
    for (const operation of backup.data.operations) {
      if (operation.account_id != null && !accountIdsInBackup.has(operation.account_id)) {
        unmappedAccountIds.push(operation.account_id);
      }
      // Transfers reference a second account — validate it too, or the restore
      // dies mid-transaction with a raw FK error instead of this friendly abort.
      if (operation.to_account_id != null && !accountIdsInBackup.has(operation.to_account_id)) {
        unmappedAccountIds.push(operation.to_account_id);
      }
    }
    for (const planned of backup.data.planned_operations || []) {
      if (planned.account_id != null && !accountIdsInBackup.has(planned.account_id)) {
        unmappedAccountIds.push(planned.account_id);
      }
      if (planned.to_account_id != null && !accountIdsInBackup.has(planned.to_account_id)) {
        unmappedAccountIds.push(planned.to_account_id);
      }
    }
    // Budget plan lines may target an account (transfer allocation). Validate that
    // reference too, so a dangling to_account_id aborts cleanly instead of dying
    // on a raw FK error mid-transaction. A category-linked or broken line has a
    // null to_account_id and is skipped here.
    for (const line of backup.data.budget_plan_lines || []) {
      if (line.to_account_id != null && !accountIdsInBackup.has(line.to_account_id)) {
        unmappedAccountIds.push(line.to_account_id);
      }
    }

    if (unmappedAccountIds.length > 0) {
      const uniqueIds = [...new Set(unmappedAccountIds.map(String))];
      const sample = uniqueIds.slice(0, 3).join(', ');
      const extra = uniqueIds.length > 3 ? ` (and ${uniqueIds.length - 3} more)` : '';
      throw new Error(
        `Backup references account IDs not found in the backup's accounts list: ${sample}${extra}. Restore aborted — your data has not been changed.`,
      );
    }

    if (cancelToken?.cancelled) throw new CancelledImportError();

    // Create a pre-restore snapshot so the user can recover if something goes wrong.
    let snapshotUri = null;
    appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'backup', status: 'in_progress' });
    try {
      const snapshot = await createBackup();
      const snapshotTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      snapshotUri = `${FileSystem.documentDirectory}pre_restore_${snapshotTimestamp}.json`;
      await FileSystem.writeAsStringAsync(snapshotUri, JSON.stringify(snapshot, null, 2));
      console.log('Pre-restore snapshot saved:', snapshotUri);

      // Keep only the 3 most recent pre-restore snapshots.
      try {
        const allFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
        const snapshots = allFiles
          .filter(name => name.startsWith('pre_restore_') && name.endsWith('.json'))
          .sort(); // ISO timestamps sort lexicographically = chronologically
        const excess = snapshots.slice(0, Math.max(0, snapshots.length - 3));
        for (const name of excess) {
          await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${name}`, { idempotent: true });
          console.log('Deleted old pre-restore snapshot:', name);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up old pre-restore snapshots:', cleanupError);
      }
    } catch (snapshotError) {
      if (snapshotError instanceof CancelledImportError) throw snapshotError;
      console.warn('Failed to create pre-restore snapshot:', snapshotError);
    }
    appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'backup', status: 'completed' });

    if (cancelToken?.cancelled) throw new CancelledImportError();

    let skippedOperations = 0;

    await executeTransaction(async (db) => {
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'restore', status: 'completed' });
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'clear', status: 'in_progress' });

      // Clear existing data (in reverse order due to foreign keys)
      await db.runAsync('DELETE FROM notification_merchant_rules').catch(() => {});
      await db.runAsync('DELETE FROM planned_operations').catch(() => {});
      await db.runAsync('DELETE FROM budgets');
      // Budgets v2: lines reference plans (cascade), categories and accounts (set
      // null), so clear lines before plans, and both before categories/accounts.
      // Guarded so a restore into a pre-0018 database doesn't fail.
      await db.runAsync('DELETE FROM budget_plan_lines').catch(() => {});
      await db.runAsync('DELETE FROM budget_plans').catch(() => {});
      await db.runAsync('DELETE FROM accounts_balance_history');
      await db.runAsync('DELETE FROM operations');
      await db.runAsync('DELETE FROM categories');
      await db.runAsync('DELETE FROM accounts');
      await db.runAsync('DELETE FROM app_metadata WHERE key != ?', ['db_version']);

      // Reset auto-increment counters to allow ID preservation
      await db.runAsync('DELETE FROM sqlite_sequence WHERE name IN (?, ?, ?)', ['accounts', 'operations', 'accounts_balance_history']);

      console.log('Existing data cleared and auto-increment counters reset');
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'clear', status: 'completed' });

      if (cancelToken?.cancelled) throw new CancelledImportError();

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
          console.warn('Skipping account with missing name:', account);
          continue;
        }

        // Check if ID is a number (integer) or a string (UUID)
        const isIntegerId = account.id != null && !isNaN(account.id);

        let result;
        if (isIntegerId) {
          // Preserve the original integer ID
          result = await db.runAsync(
            'INSERT INTO accounts (id, name, balance, currency, display_order, hidden, monthly_target, card_mask, auto_txn_rounding, auto_txn_rounding_mode, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              Number(account.id),
              account.name,
              account.balance || '0',
              account.currency || 'USD',
              account.display_order ?? null,
              account.hidden ?? 0,
              account.monthly_target ?? null,
              account.card_mask ?? null,
              account.auto_txn_rounding ?? null,
              account.auto_txn_rounding_mode ?? null,
              // Preserve soft-delete state — omitting it resurrects deleted accounts on restore
              account.deleted_at ?? null,
              account.created_at || new Date().toISOString(),
              account.updated_at || new Date().toISOString(),
            ],
          );
          // For integer IDs, no remapping needed - map to itself
          // Normalize key to string for consistent Map lookups across JSON/SQLite type differences
          accountIdMapping.set(String(account.id), Number(account.id));
          console.log(`Preserved account ID: ${account.id}`);
        } else {
          // UUID or no ID - let SQLite auto-generate integer ID
          result = await db.runAsync(
            'INSERT INTO accounts (name, balance, currency, display_order, hidden, monthly_target, card_mask, auto_txn_rounding, auto_txn_rounding_mode, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              account.name,
              account.balance || '0',
              account.currency || 'USD',
              account.display_order ?? null,
              account.hidden ?? 0,
              account.monthly_target ?? null,
              account.card_mask ?? null,
              account.auto_txn_rounding ?? null,
              account.auto_txn_rounding_mode ?? null,
              account.deleted_at ?? null,
              account.created_at || new Date().toISOString(),
              account.updated_at || new Date().toISOString(),
            ],
          );

          // Map UUID to new integer ID
          if (account.id != null) {
            accountIdMapping.set(String(account.id), result.lastInsertRowId);
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

      if (cancelToken?.cancelled) throw new CancelledImportError();

      // Restore categories
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'categories',
        status: 'in_progress',
        data: backup.data.categories.length,
      });
      for (const category of backup.data.categories) {
        // Validate required fields
        if (!category.id || !category.name) {
          console.warn('Skipping category with missing id or name:', category);
          continue;
        }

        const catType = VALID_CATEGORY_TYPES.includes(category.type) ? category.type : 'folder';
        const catKind = VALID_CATEGORY_KINDS.includes(category.category_type) ? category.category_type : 'expense';
        await db.runAsync(
          'INSERT INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            category.id,
            category.name,
            catType,
            catKind,
            category.parent_id || null,
            category.icon || null,
            category.color || null,
            category.is_shadow || 0,
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

      if (cancelToken?.cancelled) throw new CancelledImportError();

      // Restore operations - map account IDs from UUID to integer
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'operations',
        status: 'in_progress',
        data: backup.data.operations.length,
      });
      for (const operation of backup.data.operations) {
        // Map account IDs from old ID to new integer ID
        // First check if we have a mapping, otherwise use the original value
        let mappedAccountId = accountIdMapping.get(String(operation.account_id));
        if (mappedAccountId === undefined) {
          mappedAccountId = operation.account_id;
        }
        
        // Validate that account_id is not null/undefined
        if (mappedAccountId == null) {
          console.warn('Skipping operation with null account_id:', operation);
          skippedOperations++;
          continue;
        }

        let mappedToAccountId = null;
        if (operation.to_account_id != null) {
          mappedToAccountId = accountIdMapping.get(String(operation.to_account_id));
          if (mappedToAccountId === undefined) {
            mappedToAccountId = operation.to_account_id;
          }
        }

        // Note: id is omitted as it's now auto-increment integer.
        // latitude/longitude are optional — older backups lack them, so a missing
        // value falls through to null (?? null) rather than failing the insert.
        const opType = VALID_OPERATION_TYPES.includes(operation.type) ? operation.type : 'expense';
        await db.runAsync(
          'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, exchange_rate, destination_amount, source_currency, destination_currency, original_balance, exclude_from_avg, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            opType,
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
            operation.original_balance ?? null,
            // Older backups lack this column → default to 0 (counted).
            operation.exclude_from_avg ? 1 : 0,
            operation.latitude ?? null,
            operation.longitude ?? null,
          ],
        );
      }
      console.log(`Restored ${backup.data.operations.length} operations with mapped account IDs`);
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'operations',
        status: 'completed',
        data: backup.data.operations.length,
      });

      if (cancelToken?.cancelled) throw new CancelledImportError();

      // Restore balance history
      if (backup.data.balance_history) {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'balance_history',
          status: 'in_progress',
          data: backup.data.balance_history.length,
        });

        let restoredHistoryCount = 0;
        let skippedHistoryCount = 0;
        for (const history of backup.data.balance_history) {
          const mappedAccountId = accountIdMapping.get(String(history.account_id)) ?? history.account_id;

          // Validate that the mapped account ID exists before inserting to avoid silent FK drops
          const accountExists = await db.getFirstAsync(
            'SELECT 1 FROM accounts WHERE id = ?',
            [mappedAccountId],
          );
          if (!accountExists) {
            console.warn(`Skipping balance history entry: account_id ${history.account_id} -> ${mappedAccountId} not found in restored accounts`);
            skippedHistoryCount++;
            continue;
          }

          await db.runAsync(
            'INSERT OR REPLACE INTO accounts_balance_history (account_id, date, balance, created_at) VALUES (?, ?, ?, ?)',
            [mappedAccountId, history.date, history.balance, history.created_at],
          );
          restoredHistoryCount++;
        }

        if (skippedHistoryCount > 0) {
          console.warn(`Balance history restore: ${restoredHistoryCount} inserted, ${skippedHistoryCount} skipped due to missing account references`);
        }
        console.log(`Restored ${restoredHistoryCount} of ${backup.data.balance_history.length} balance history entries`);
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
            console.warn('Skipping budget with missing required fields:', budget);
            continue;
          }

          const budgetPeriod = VALID_BUDGET_PERIODS.includes(budget.period_type) ? budget.period_type : 'monthly';
          await db.runAsync(
            'INSERT INTO budgets (id, category_id, amount, currency, period_type, start_date, end_date, is_recurring, rollover_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              budget.id,
              budget.category_id,
              budget.amount,
              budget.currency,
              budgetPeriod,
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

      // Restore budget plans (Budgets v2) and their allocation lines. Plans are
      // inserted before lines to satisfy the plan_id FK. Line category_id keeps
      // its string ID as-is (categories are not remapped); to_account_id is
      // remapped through accountIdMapping like operations/planned operations.
      // A single 'budget_plans' progress step covers both tables.
      {
        const plans = backup.data.budget_plans || [];
        const lines = backup.data.budget_plan_lines || [];
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budget_plans',
          status: 'in_progress',
          data: plans.length,
        });

        // Track the plans actually inserted (not merely present in the backup):
        // a plan skipped for missing fields must NOT let its lines through, or
        // their plan_id FK would fail and abort the whole restore.
        const restoredPlanIds = new Set();
        let restoredPlans = 0;
        for (const plan of plans) {
          if (!plan.id || !plan.month || !plan.currency) {
            console.warn('Skipping budget plan with missing required fields:', plan);
            continue;
          }
          await db.runAsync(
            'INSERT INTO budget_plans (id, month, currency, expected_income, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              plan.id,
              plan.month,
              plan.currency,
              plan.expected_income ?? '0',
              plan.created_at || new Date().toISOString(),
              plan.updated_at || new Date().toISOString(),
            ],
          );
          restoredPlanIds.add(plan.id);
          restoredPlans++;
        }

        // Only insert lines whose parent plan was actually restored, so an
        // orphaned line (dangling plan_id) is skipped rather than aborting the
        // whole import on an FK violation.
        let restoredLines = 0;
        for (const line of lines) {
          // amount is a NOT NULL text column; treat null/empty as invalid and
          // skip (mirrors how budgets skip rows with missing required fields).
          if (!line.id || !line.plan_id || line.amount == null || line.amount === '') {
            console.warn('Skipping budget plan line with missing required fields:', line);
            continue;
          }
          if (!restoredPlanIds.has(line.plan_id)) {
            console.warn('Skipping budget plan line with unknown plan_id:', line.plan_id);
            continue;
          }
          let mappedToAccountId = null;
          if (line.to_account_id != null) {
            mappedToAccountId = accountIdMapping.get(String(line.to_account_id)) ?? line.to_account_id;
          }
          await db.runAsync(
            'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              line.id,
              line.plan_id,
              line.label ?? null,
              line.amount,
              line.comment ?? null,
              line.category_id ?? null,
              mappedToAccountId,
              Number.isInteger(line.sort_order) ? line.sort_order : Number(line.sort_order) || 0,
              line.created_at || new Date().toISOString(),
              line.updated_at || new Date().toISOString(),
            ],
          );
          restoredLines++;
        }
        console.log(`Restored ${restoredPlans} budget plans and ${restoredLines} plan lines`);
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budget_plans',
          status: 'completed',
          data: plans.length,
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

      // Restore planned operations
      if (backup.data.planned_operations && backup.data.planned_operations.length > 0) {
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'planned_operations',
          status: 'in_progress',
          data: backup.data.planned_operations.length,
        });
        for (const planned of backup.data.planned_operations) {
          if (!planned.id || !planned.name) {
            console.warn('Skipping planned operation with missing id or name:', planned);
            continue;
          }

          const mappedAccountId = accountIdMapping.get(String(planned.account_id)) ?? planned.account_id;
          let mappedToAccountId = null;
          if (planned.to_account_id != null) {
            mappedToAccountId = accountIdMapping.get(String(planned.to_account_id)) ?? planned.to_account_id;
          }

          const plannedType = VALID_OPERATION_TYPES.includes(planned.type) ? planned.type : 'expense';
          await db.runAsync(
            'INSERT INTO planned_operations (id, name, type, amount, account_id, category_id, to_account_id, description, is_recurring, last_executed_month, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              planned.id,
              planned.name,
              plannedType,
              planned.amount || '0',
              mappedAccountId,
              planned.category_id || null,
              mappedToAccountId,
              planned.description || null,
              planned.is_recurring ?? 1,
              planned.last_executed_month || null,
              planned.display_order ?? null,
              planned.created_at || new Date().toISOString(),
              planned.updated_at || new Date().toISOString(),
            ],
          );
        }
        console.log(`Restored ${backup.data.planned_operations.length} planned operations`);
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'planned_operations',
          status: 'completed',
          data: backup.data.planned_operations.length,
        });
      }

      // Restore learned merchant -> category rules
      if (backup.data.notification_merchant_rules && backup.data.notification_merchant_rules.length > 0) {
        let restoredRules = 0;
        for (const rule of backup.data.notification_merchant_rules) {
          if (!rule.id || !rule.merchant) {
            console.warn('Skipping merchant rule with missing id or merchant:', rule);
            continue;
          }
          // INSERT OR IGNORE: a rule whose category was not restored is skipped
          // rather than aborting the whole import.
          await db.runAsync(
            'INSERT OR IGNORE INTO notification_merchant_rules (id, merchant, package_name, category_id, label_override, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              rule.id,
              rule.merchant,
              rule.package_name || null,
              rule.category_id || null,
              rule.label_override || null,
              rule.created_at || new Date().toISOString(),
              rule.updated_at || new Date().toISOString(),
            ],
          ).catch((e) => { console.warn('Skipping merchant rule:', e.message); });
          restoredRules += 1;
        }
        console.log(`Restored ${restoredRules} merchant rules`);
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
    appEvents.emit(IMPORT_PROGRESS_EVENT, {
      stepId: 'complete',
      status: 'completed',
      data: { skippedOperations, snapshotUri },
    });
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
  const content = csvContent.trim();
  if (!content) return [];

  // Parse the entire content character-by-character so that quoted fields
  // containing newlines are treated as a single value rather than split into
  // separate rows (the pre-split-by-newline approach broke multiline values).
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let insideQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    if (insideQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          currentValue += '"';
          i += 2;
        } else {
          insideQuotes = false;
          i++;
        }
      } else {
        currentValue += char;
        i++;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
      } else if (char === ',') {
        currentRow.push(currentValue);
        currentValue = '';
        i++;
      } else if (char === '\r' || char === '\n') {
        currentRow.push(currentValue);
        currentValue = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        // Consume the \n of a \r\n pair
        if (char === '\r' && content[i] === '\n') i++;
      } else {
        currentValue += char;
        i++;
      }
    }
  }

  // Flush the final field and row
  currentRow.push(currentValue);
  if (currentRow.some(v => v.trim() !== '')) {
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const data = [];

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    if (values.every(v => v.trim() === '')) continue;

    // Warn when a row has fewer columns than the header — this is the sparse-row
    // bug described in issue #764.  Values for missing columns default to null
    // (same as an explicit empty cell) but we surface it so callers can detect
    // data loss rather than silently swallowing it.
    if (values.length < headers.length) {
      console.warn(
        `[BackupRestore] parseCSV: row ${r} has ${values.length} column(s) but header has ${headers.length}. ` +
        `Missing fields will default to null: ${headers.slice(values.length).join(', ')}`,
      );
    }

    const obj = {};
    headers.forEach((header, index) => {
      const raw = values[index];
      const value = raw !== undefined ? raw.trim() : '';
      obj[header] = value === '' ? null : value;
    });
    data.push(obj);
  }

  return data;
};

/**
 * Import backup from CSV file
 * @param {string} fileUri - File URI
 * @param {{ cancelled: boolean }} [cancelToken]
 * @returns {Promise<Object>} Imported backup object
 */
const importBackupCSV = async (fileUri, cancelToken) => {
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
    planned_operations: [],
    budget_plans: [],
    budget_plan_lines: [],
  };

  // Split by section markers. [BUDGET_PLANS] and [BUDGET_PLAN_LINES] don't
  // collide: the marker + newline (`[BUDGET_PLANS]\n`) is not a substring of
  // `[BUDGET_PLAN_LINES]`.
  const accountsMatch = fileContent.match(/\[ACCOUNTS\]\n([\s\S]*?)(?=\n\[|$)/);
  const categoriesMatch = fileContent.match(/\[CATEGORIES\]\n([\s\S]*?)(?=\n\[|$)/);
  const operationsMatch = fileContent.match(/\[OPERATIONS\]\n([\s\S]*?)(?=\n\[|$)/);
  const budgetsMatch = fileContent.match(/\[BUDGETS\]\n([\s\S]*?)(?=\n\[|$)/);
  const metadataMatch = fileContent.match(/\[APP_METADATA\]\n([\s\S]*?)(?=\n\[|$)/);
  const balanceHistoryMatch = fileContent.match(/\[BALANCE_HISTORY\]\n([\s\S]*?)(?=\n\[|$)/);
  const plannedOpsMatch = fileContent.match(/\[PLANNED_OPERATIONS\]\n([\s\S]*?)(?=\n\[|$)/);
  const budgetPlansMatch = fileContent.match(/\[BUDGET_PLANS\]\n([\s\S]*?)(?=\n\[|$)/);
  const budgetPlanLinesMatch = fileContent.match(/\[BUDGET_PLAN_LINES\]\n([\s\S]*?)(?=\n\[|$)/);

  if (accountsMatch) sections.accounts = parseCSV(accountsMatch[1]);
  if (categoriesMatch) sections.categories = parseCSV(categoriesMatch[1]);
  if (operationsMatch) sections.operations = parseCSV(operationsMatch[1]);
  if (budgetsMatch) sections.budgets = parseCSV(budgetsMatch[1]);
  if (metadataMatch) sections.app_metadata = parseCSV(metadataMatch[1]);
  if (balanceHistoryMatch) sections.balance_history = parseCSV(balanceHistoryMatch[1]);
  if (plannedOpsMatch) sections.planned_operations = parseCSV(plannedOpsMatch[1]);
  if (budgetPlansMatch) sections.budget_plans = parseCSV(budgetPlansMatch[1]);
  if (budgetPlanLinesMatch) sections.budget_plan_lines = parseCSV(budgetPlanLinesMatch[1]);

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
  await restoreBackup(backup, cancelToken);
  return backup;
};



/**
 * Import backup from SQLite database file
 * @param {string} fileUri - File URI
 * @param {{ cancelled: boolean }} [cancelToken]
 * @returns {Promise<Object>} Imported backup info
 */
const importBackupSQLite = async (fileUri, cancelToken) => {
  console.log('Importing SQLite backup...');
  appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'in_progress' });

  const SQLite = await import('expo-sqlite');
  const { applyPendingMigrations } = await import('./db');
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

  try {
    // Open the imported database
    console.log('Opening imported database...');
    tempDb = await SQLite.openDatabaseAsync('penny_import_temp.db');

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

    await applyPendingMigrations(tempDb, migrationsData);

    // Log which migrations were applied
    const finalMigrations = await tempDb.getAllAsync('SELECT * FROM __drizzle_migrations ORDER BY created_at ASC');
    console.log('Migrations after running applyPendingMigrations:', (finalMigrations || []).map(m => `${m.hash?.substring(0, 40)}...`).join(', '));
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

    // Planned operations table may not exist in older backups
    let plannedOperations = [];
    try {
      plannedOperations = await tempDb.getAllAsync('SELECT * FROM planned_operations ORDER BY created_at ASC');
    } catch (e) {
      console.warn('No planned_operations table in imported database (older format)');
    }

    // Merchant rules table may not exist in older backups. Without this extraction
    // restoreBackup clears the live table and re-inserts nothing, wiping learned rules.
    let merchantRules = [];
    try {
      merchantRules = await tempDb.getAllAsync('SELECT * FROM notification_merchant_rules ORDER BY created_at ASC');
    } catch (e) {
      console.warn('No notification_merchant_rules table in imported database (older format)');
    }

    // Budgets v2 tables may not exist in pre-0018 backups.
    let budgetPlans = [];
    let budgetPlanLines = [];
    try {
      budgetPlans = await tempDb.getAllAsync('SELECT * FROM budget_plans ORDER BY created_at ASC');
      budgetPlanLines = await tempDb.getAllAsync('SELECT * FROM budget_plan_lines ORDER BY sort_order ASC, created_at ASC');
    } catch (e) {
      console.warn('No budget_plans/budget_plan_lines tables in imported database (older format)');
    }

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
        planned_operations: plannedOperations || [],
        notification_merchant_rules: merchantRules || [],
        budget_plans: budgetPlans || [],
        budget_plan_lines: budgetPlanLines || [],
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
    await restoreBackup(backup, cancelToken);

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
export const pickImportFile = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    throw new Error('Import cancelled');
  }

  return {
    fileUri: result.assets[0].uri,
    filename: result.assets[0].name || '',
  };
};

export const importBackupFromFile = async ({ fileUri, filename }, cancelToken) => {
  try {
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
      backup = await importBackupCSV(fileUri, cancelToken);
      break;
    case 'sqlite':
      backup = await importBackupSQLite(fileUri, cancelToken);
      break;
    case 'json':
    default: {
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'in_progress' });
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      try {
        backup = JSON.parse(fileContent);
      } catch (error) {
        throw new Error('Invalid backup file: not valid JSON');
      }
      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'import', status: 'completed' });
      await restoreBackup(backup, cancelToken);
      break;
    }
    }

    return backup;
  } catch (error) {
    console.error('Failed to import backup:', error);
    throw error;
  }
};

export const importBackup = async () => {
  const fileInfo = await pickImportFile();
  return importBackupFromFile(fileInfo);
};

/**
 * List all pre-restore snapshot files stored in documentDirectory.
 * Returns URIs sorted newest-first (filenames sort lexicographically by timestamp).
 * @returns {Promise<string[]>} Array of file URIs
 */
export const getPreRestoreSnapshots = async () => {
  try {
    const allFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
    return allFiles
      .filter(name => name.startsWith('pre_restore_') && name.endsWith('.json'))
      .sort()
      .reverse()
      .map(name => `${FileSystem.documentDirectory}${name}`);
  } catch (error) {
    console.warn('Failed to list pre-restore snapshots:', error);
    return [];
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
