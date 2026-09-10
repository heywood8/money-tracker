/**
 * SQLite backup and restore service (Native platforms: iOS/Android)
 * Supports multiple export formats: JSON, CSV, SQLite
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { queryAll, executeQuery, executeTransaction, getDatabase } from './db';
import { appEvents } from './eventEmitter';
import * as BudgetPlansDB from './BudgetPlansDB';

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
    const [accounts, categories, operations, budgets, appMetadata, balanceHistory, plannedOperations, merchantRules, notificationTemplates, budgetPlans, budgetPlanLines, budgetPlanLineCategories, budgetPlanLineGroups, budgetPlanLineAccounts, budgetPlanLineLabels] = await Promise.all([
      queryAll('SELECT * FROM accounts ORDER BY created_at ASC'),
      queryAll('SELECT * FROM categories ORDER BY created_at ASC'),
      queryAll('SELECT * FROM operations ORDER BY created_at ASC'),
      queryAll('SELECT * FROM budgets ORDER BY created_at ASC'),
      queryAll('SELECT * FROM app_metadata'),
      queryAll('SELECT * FROM accounts_balance_history ORDER BY account_id ASC, date ASC'),
      queryAll('SELECT * FROM planned_operations ORDER BY created_at ASC').catch(() => []),
      // Newer table — guard so backups of pre-0010 databases don't fail.
      queryAll('SELECT * FROM notification_merchant_rules ORDER BY created_at ASC').catch(() => []),
      // User-defined parse templates (migration 0025). Guarded so backups of
      // pre-0025 databases don't fail. These are hand-built by the user and
      // cannot be re-learned from the data, so unlike the pending queue they
      // must survive a backup/restore round trip.
      queryAll('SELECT * FROM notification_templates ORDER BY priority ASC, created_at ASC').catch(() => []),
      // Budgets v2 (migration 0018). Guarded so backups of pre-0018 databases
      // don't fail. Plans before lines so the FK order is preserved on restore.
      queryAll('SELECT * FROM budget_plans ORDER BY created_at ASC').catch(() => []),
      queryAll('SELECT * FROM budget_plan_lines ORDER BY sort_order ASC, created_at ASC').catch(() => []),
      // Multi-category plan lines (migration 0021). Guarded like the tables above
      // so a backup of a pre-0021 database still succeeds — restore rebuilds the
      // links from each line's category_id when this section is absent.
      queryAll('SELECT * FROM budget_plan_line_categories ORDER BY line_id ASC, category_id ASC').catch(() => []),
      // Line groups (migration 0022). Guarded the same way; a pre-0022 backup has
      // no groups and every line restores ungrouped.
      queryAll('SELECT * FROM budget_plan_line_groups ORDER BY sort_order ASC, created_at ASC').catch(() => []),
      // Per-line source account filter (migration 0024). Guarded like the tables
      // above; a pre-0024 backup has no filters and every line restores counting
      // any account, which is exactly what it did.
      queryAll('SELECT * FROM budget_plan_line_accounts ORDER BY line_id ASC, account_id ASC').catch(() => []),
      // Per-line label filter (migration 0028) — what makes an income line track
      // a salary apart from its advance. Guarded like the tables above; a
      // pre-0028 backup has no labels and every line restores untracked by label.
      queryAll('SELECT * FROM budget_plan_line_labels ORDER BY line_id ASC, label ASC').catch(() => []),
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
        // User-defined notification parse templates.
        notification_templates: notificationTemplates || [],
        // Budgets v2 monthly plans and their allocation lines.
        budget_plans: budgetPlans || [],
        budget_plan_lines: budgetPlanLines || [],
        budget_plan_line_categories: budgetPlanLineCategories || [],
        budget_plan_line_groups: budgetPlanLineGroups || [],
        budget_plan_line_accounts: budgetPlanLineAccounts || [],
        budget_plan_line_labels: budgetPlanLineLabels || [],
      },
    };

    console.log('Backup created successfully:', {
      accounts: backup.data.accounts.length,
      categories: backup.data.categories.length,
      operations: backup.data.operations.length,
      budgets: backup.data.budgets.length,
      balance_history: backup.data.balance_history.length,
      planned_operations: backup.data.planned_operations.length,
      notification_templates: backup.data.notification_templates.length,
      budget_plans: backup.data.budget_plans.length,
      budget_plan_lines: backup.data.budget_plan_lines.length,
      budget_plan_line_categories: backup.data.budget_plan_line_categories.length,
      budget_plan_line_groups: backup.data.budget_plan_line_groups.length,
      budget_plan_line_accounts: backup.data.budget_plan_line_accounts.length,
      budget_plan_line_labels: backup.data.budget_plan_line_labels.length,
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
  operations:         ['id', 'type', 'amount', 'account_id', 'category_id', 'to_account_id', 'date', 'created_at', 'description', 'exchange_rate', 'destination_amount', 'source_currency', 'destination_currency', 'original_balance', 'exclude_from_avg', 'exclude_from_charts', 'latitude', 'longitude'],
  budgets:            ['id', 'category_id', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled', 'created_at', 'updated_at'],
  app_metadata:       ['key', 'value', 'updated_at'],
  balance_history:    ['id', 'account_id', 'date', 'balance', 'created_at'],
  planned_operations: ['id', 'name', 'type', 'amount', 'account_id', 'category_id', 'to_account_id', 'description', 'is_recurring', 'last_executed_month', 'display_order', 'created_at', 'updated_at'],
  // `last_matched_at` orders the bindings list (NotificationRulesDB), so a rule
  // that loses it sinks under rules the user has not seen in months.
  notification_merchant_rules: ['id', 'merchant', 'package_name', 'category_id', 'label_override', 'last_matched_at', 'created_at', 'updated_at'],
  // `fields` and `triggers` are JSON blobs; they round-trip as opaque text.
  notification_templates: ['id', 'name', 'package_name', 'type', 'enabled', 'priority', 'category_id', 'currency', 'date_order', 'fields', 'triggers', 'sample_title', 'sample_text', 'created_at', 'updated_at'],
  budget_plans: ['id', 'month', 'currency', 'expected_income', 'created_at', 'updated_at'],
  // `plan_id` is nullable (NULL for a recurring/global line, migration 0019).
  // `is_recurring` / `currency` were added by that same migration.
  // `include_children` (migration 0021) says whether descendants of the linked
  // categories roll up into the line's actual.
  // `group_id` (migration 0022) is the envelope the line belongs to, or null.
  // `effective_from` / `effective_to` (migration 0026) bound the months a
  // RECURRING line applies to — both null means every month, which is what a
  // pre-0026 backup restores as.
  budget_plan_lines: ['id', 'plan_id', 'label', 'amount', 'comment', 'category_id', 'to_account_id', 'sort_order', 'is_recurring', 'currency', 'kind', 'account_id', 'last_executed_month', 'include_children', 'group_id', 'effective_from', 'effective_to', 'created_at', 'updated_at'],
  // The full category set of each line (migration 0021); `category_id` above is
  // only its primary entry.
  budget_plan_line_categories: ['line_id', 'category_id'],
  // Line groups (migration 0022). `amount`/`currency` are null for a group whose
  // budget is derived from its lines.
  budget_plan_line_groups: ['id', 'label', 'amount', 'currency', 'sort_order', 'created_at', 'updated_at'],
  // The source-account filter of each line (migration 0024). A line with no rows
  // here counts spending from any account.
  budget_plan_line_accounts: ['line_id', 'account_id'],
  budget_plan_line_labels: ['line_id', 'label'],
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
/**
 * Render a backup snapshot as the combined-CSV document the app writes and reads.
 *
 * Every table becomes a `[SECTION]` block of its own, so one file carries the
 * whole database without needing ZIP support. Split out of exportBackupCSV so
 * destinations that do not share a file (the Google Drive auto-export) can build
 * the same document rather than growing a second, drifting CSV writer.
 * @param {Object} backup - Snapshot from createBackup()
 * @returns {string} CSV document
 */
export const buildCombinedCSV = (backup) => {
  // Explicit field lists per table (issue #748) keep column order stable even
  // when a row object happens to be missing a key.
  const section = (name, rows, fields) =>
    `[${name}]\n${convertToCSV(rows || [], fields)}\n`;

  let csv = `# Money Tracker Backup - ${backup.timestamp}\n`;
  csv += `# Version: ${backup.version}\n\n`;

  const tables = [
    ['ACCOUNTS', 'accounts'],
    ['CATEGORIES', 'categories'],
    ['OPERATIONS', 'operations'],
    ['BUDGETS', 'budgets'],
    ['APP_METADATA', 'app_metadata'],
    ['BALANCE_HISTORY', 'balance_history'],
    ['PLANNED_OPERATIONS', 'planned_operations'],
    ['BUDGET_PLANS', 'budget_plans'],
    ['BUDGET_PLAN_LINES', 'budget_plan_lines'],
    ['BUDGET_PLAN_LINE_CATEGORIES', 'budget_plan_line_categories'],
    ['BUDGET_PLAN_LINE_GROUPS', 'budget_plan_line_groups'],
    ['BUDGET_PLAN_LINE_ACCOUNTS', 'budget_plan_line_accounts'],
    ['BUDGET_PLAN_LINE_LABELS', 'budget_plan_line_labels'],
    // Notification data (#1695). Without these two sections a CSV restore
    // carried no rules or templates, and the restore had to choose between
    // wiping the live ones and leaving them untouched — neither of which is a
    // backup. `fields` and `triggers` are JSON blobs and CSV-quote fine.
    ['NOTIFICATION_MERCHANT_RULES', 'notification_merchant_rules'],
    ['NOTIFICATION_TEMPLATES', 'notification_templates'],
  ];

  tables.forEach(([label, key], index) => {
    csv += section(label, backup.data[key], TABLE_FIELDS[key]);
    // The importer tolerates either, but the historical layout separated every
    // section but the last with a blank line — keep byte-compatible output.
    if (index < tables.length - 1) csv += '\n';
  });

  return csv;
};

/**
 * Copy the live SQLite database to `destUri`, checkpointing WAL first.
 *
 * The checkpoint is the whole point: without it the copy misses everything
 * still sitting in the write-ahead log. Split out of exportBackupSQLite so the
 * Drive auto-export produces a byte-identical snapshot instead of copying a
 * database that is missing its most recent writes.
 * @param {string} destUri - Where to write the copy
 * @returns {Promise<string>} destUri
 */
export const writeSQLiteSnapshot = async (destUri) => {
  const sourceUri = `${FileSystem.documentDirectory}SQLite/penny.db`;

  const fileInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!fileInfo.exists) {
    throw new Error('Database file not found');
  }

  // Force a checkpoint so WAL contents are merged into the main database file.
  console.log('Checkpointing database before export...');
  try {
    const { executeQuery: runQuery } = await import('./db');
    await runQuery('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log('Database checkpoint completed');
  } catch (checkpointError) {
    console.warn('Failed to checkpoint database:', checkpointError);
    // Continue anyway, the copy might still work
  }

  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
};

/**
 * Export backup as a single combined CSV file and hand it to the share sheet.
 * @returns {Promise<string>} Filename
 */
export const exportBackupCSV = async () => {
  try {
    const backup = await createBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const combinedCSV = buildCombinedCSV(backup);

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
    const destUri = `${FileSystem.documentDirectory}${filename}`;

    await writeSQLiteSnapshot(destUri);

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

/**
 * A backed-up YYYY-MM month key, or null for anything else — '' (what a CSV
 * round trip makes of a null), a missing column in a pre-0026 backup, or a value
 * that isn't a month at all. Used for the effective range of a recurring budget
 * line, where null legitimately means "unbounded on that side".
 * @param {*} value
 * @returns {string|null}
 */
const asBackupMonth = (value) => (
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null
);

/**
 * Read a boolean-ish backup column as 0 or 1.
 *
 * Every CSV cell arrives as a string (`parseCSV` keeps text as text), so a
 * stored `0` comes back as the string `'0'` — which is TRUTHY in JS. A plain
 * `value ? 1 : 0` therefore flipped every flag ON for every row of every CSV
 * restore (#1693): after restoring a CSV backup, every operation was excluded
 * from averages and charts and the Graphs tab came back empty. Compare
 * numerically instead, and treat an absent/blank cell as the caller's default
 * (older backups simply lack the newer columns).
 * @param {*} value - Raw column value from JSON, CSV or SQLite
 * @param {0|1} [fallback=0] - Result for an absent, blank or unreadable value
 * @returns {0|1}
 */
const asFlag = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  if (text === '') return fallback;
  if (text === 'true') return 1;
  if (text === 'false') return 0;
  const numeric = Number(text);
  if (Number.isNaN(numeric)) return fallback;
  return numeric === 0 ? 0 : 1;
};

/**
 * Read a nullable column, treating a blank cell as "not stated".
 *
 * A Google Sheets cell comes back as '' rather than null, and '' is not the
 * same value: in `deleted_at` it reads as a soft-deleted account, in a REAL
 * column it lands as text no comparison can read.
 * @param {*} value - Raw column value
 * @returns {*} The value, or null when absent or blank
 */
const asNullable = (value) => (value === '' || value == null ? null : value);

/**
 * Read a numeric backup column, tolerating the strings a CSV round trip yields.
 * @param {*} value - Raw column value
 * @param {number} [fallback=0] - Result for an absent, blank or unreadable value
 * @returns {number}
 */
const asNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

/**
 * Order categories so a parent always precedes its children.
 *
 * Categories are exported in creation order, and `parent_id` is an immediate
 * (non-deferrable) foreign key with `PRAGMA foreign_keys = ON`. Re-parenting is
 * a supported action, so any category moved into a folder created LATER than
 * itself sorted before its own parent and its INSERT failed, rolling back the
 * entire restore with a raw "FOREIGN KEY constraint failed" (#1694). Sorting
 * parents-first fixes that without touching FK enforcement, so every other
 * row-level guard in the restore keeps failing per statement instead of at
 * COMMIT.
 *
 * Rows the restore will skip anyway (no id) keep their original position, and a
 * cycle — impossible through the UI, but a hand-edited backup can carry one —
 * resolves to *some* order; the restore loop nulls any parent it has not
 * inserted yet, so a cycle costs one link, not the import.
 * @param {Array<Object>} categories - Category rows from the backup
 * @returns {Array<Object>} The same rows, parents before children
 */
const sortCategoriesParentsFirst = (categories) => {
  const rows = Array.isArray(categories) ? categories : [];
  const byId = new Map();
  for (const category of rows) {
    if (category && category.id != null && !byId.has(String(category.id))) {
      byId.set(String(category.id), category);
    }
  }

  const ordered = [];
  const emitted = new Set();
  const visiting = new Set();

  const visit = (category) => {
    if (emitted.has(category) || visiting.has(category)) return;
    visiting.add(category);
    if (category.parent_id != null && category.parent_id !== '') {
      const parent = byId.get(String(category.parent_id));
      if (parent && parent !== category) visit(parent);
    }
    visiting.delete(category);
    emitted.add(category);
    ordered.push(category);
  };

  for (const category of rows) {
    if (!category || category.id == null) {
      ordered.push(category);
      continue;
    }
    visit(category);
  }

  return ordered;
};

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

      // Notification data a backup cannot carry is PRESERVED across the restore,
      // and not clearing its table is not enough to do that (#1695): the
      // `DELETE FROM categories` below cascades every merchant rule that binds a
      // category out of existence (ON DELETE CASCADE) and blanks every
      // template's fallback category (ON DELETE SET NULL). So read them back
      // first and re-apply them once the new categories are in.
      const readPreserved = async (sql) => {
        try {
          return (await db.getAllAsync(sql)) || [];
        } catch {
          // Pre-0010/0025 database: the table isn't there, so there is nothing
          // to preserve.
          return [];
        }
      };
      const preservedRules = Array.isArray(backup.data.notification_merchant_rules)
        ? null
        : await readPreserved('SELECT * FROM notification_merchant_rules');
      const preservedTemplateCategories = Array.isArray(backup.data.notification_templates)
        ? null
        : await readPreserved('SELECT id, category_id FROM notification_templates');

      // Clear existing data (in reverse order due to foreign keys)
      // Merchant rules and parse templates are cleared ONLY when the backup
      // actually carries them. A source that cannot express them — an
      // "Import from Google Sheets", a CSV written before those sections
      // existed — hands us a `data` object with no such key, and clearing
      // unconditionally wiped every merchant → category binding while restoring
      // nothing in its place (#1695): every purchase the app used to book
      // silently went back to the review queue.
      if (Array.isArray(backup.data.notification_merchant_rules)) {
        await db.runAsync('DELETE FROM notification_merchant_rules').catch(() => {});
      }
      if (Array.isArray(backup.data.notification_templates)) {
        await db.runAsync('DELETE FROM notification_templates').catch(() => {});
      }
      await db.runAsync('DELETE FROM planned_operations').catch(() => {});
      await db.runAsync('DELETE FROM budgets');
      // Budgets v2: lines reference plans (cascade), categories and accounts (set
      // null), so clear lines before plans, and both before categories/accounts.
      // Guarded so a restore into a pre-0018 database doesn't fail.
      // The junction cascades off both lines and categories, but clear it first
      // and explicitly — relying on a cascade would leave stale links behind on
      // any build where foreign_keys happens to be off.
      await db.runAsync('DELETE FROM budget_plan_line_categories').catch(() => {});
      // The source-account filter junction (migration 0024) cascades off both
      // lines and accounts; cleared first and explicitly for the same reason as
      // the category junction above.
      await db.runAsync('DELETE FROM budget_plan_line_accounts').catch(() => {});
      // The label junction (migration 0028) has only a line-side FK, so it too is
      // cleared before the lines rather than left to a cascade.
      await db.runAsync('DELETE FROM budget_plan_line_labels').catch(() => {});
      await db.runAsync('DELETE FROM budget_plan_lines').catch(() => {});
      await db.runAsync('DELETE FROM budget_plans').catch(() => {});
      // Groups (migration 0022) reference nothing and are referenced by lines
      // (ON DELETE SET NULL), so they clear after the lines that point at them.
      await db.runAsync('DELETE FROM budget_plan_line_groups').catch(() => {});
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
              asFlag(account.hidden, 0),
              asNullable(account.monthly_target),
              asNullable(account.card_mask),
              asNullable(account.auto_txn_rounding),
              asNullable(account.auto_txn_rounding_mode),
              // Preserve soft-delete state — omitting it resurrects deleted accounts on restore
              asNullable(account.deleted_at),
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
              asFlag(account.hidden, 0),
              asNullable(account.monthly_target),
              asNullable(account.card_mask),
              asNullable(account.auto_txn_rounding),
              asNullable(account.auto_txn_rounding_mode),
              asNullable(account.deleted_at),
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
      // Which categories actually landed — plan-line category links (migration
      // 0021) reference them through a NOT NULL FK, so a link to a category that
      // was skipped here has to be dropped rather than abort the restore.
      // Ids are normalized to strings: a CSV round trip stringifies everything,
      // and every consumer below compares against a reference read from the same
      // backup, so one shape for the whole set keeps those comparisons honest.
      const restoredCategoryIds = new Set();
      // Parents before children (#1694) — `parent_id` is an immediate FK, and
      // creation order does not follow the tree once a category has been moved.
      for (const category of sortCategoriesParentsFirst(backup.data.categories)) {
        // Validate required fields
        if (!category || !category.id || !category.name) {
          console.warn('Skipping category with missing id or name:', category);
          continue;
        }

        // A parent the backup does not contain (or one caught in a cycle, which
        // only a hand-edited file can produce) restores at the top level rather
        // than failing its FK and taking the whole import down.
        let parentId = category.parent_id || null;
        if (parentId != null && !restoredCategoryIds.has(String(parentId))) {
          console.warn(`Category ${category.id} references unknown parent ${parentId} - restoring it at the top level`);
          parentId = null;
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
            parentId,
            category.icon || null,
            category.color || null,
            // '0' from a CSV cell is truthy — read the flag numerically (#1693).
            asFlag(category.is_shadow, 0),
            category.created_at || new Date().toISOString(),
            category.updated_at || new Date().toISOString(),
          ],
        );
        restoredCategoryIds.add(String(category.id));
      }
      console.log(`Restored ${backup.data.categories.length} categories`);
      appEvents.emit(IMPORT_PROGRESS_EVENT, {
        stepId: 'categories',
        status: 'completed',
        data: backup.data.categories.length,
      });

      // Shadow categories are what balance adjustments are booked against, and
      // an operation referencing one is only insertable once the row exists — so
      // this runs BEFORE operations rather than at the very end of the restore,
      // where a backup missing the pair (a hand-built CSV, an old export) left
      // every adjustment operation dangling (#1694).
      const shadowCategories = (await db.getAllAsync(
        'SELECT id FROM categories WHERE id IN (?, ?)',
        ['shadow-adjustment-expense', 'shadow-adjustment-income'],
      )) || [];

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
      // Present either way now, so a reference to one is never nulled below.
      restoredCategoryIds.add('shadow-adjustment-expense');
      restoredCategoryIds.add('shadow-adjustment-income');

      /**
       * A category reference that survived the restore, or null.
       *
       * Only ACCOUNT references were pre-validated, so one dangling category id
       * — a category row skipped for a missing name, a hand-edited Sheet, a
       * partial CSV — killed the entire restore with a raw SQLite message
       * (#1694). Every category FK but the legacy budgets table is nullable, so
       * the row survives uncategorised and the user keeps their import.
       */
      const resolveCategoryReference = (rawId, context) => {
        if (rawId == null || rawId === '') return null;
        if (restoredCategoryIds.has(String(rawId))) return rawId;
        console.warn(`Dropping unknown category reference "${rawId}" on ${context}`);
        return null;
      };


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
          'INSERT INTO operations (type, amount, account_id, category_id, to_account_id, date, created_at, description, exchange_rate, destination_amount, source_currency, destination_currency, original_balance, exclude_from_avg, exclude_from_charts, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            opType,
            operation.amount || '0',
            mappedAccountId,
            resolveCategoryReference(operation.category_id, 'operation'),
            mappedToAccountId,
            operation.date || new Date().toISOString(),
            operation.created_at || new Date().toISOString(),
            operation.description || null,
            operation.exchange_rate || null,
            operation.destination_amount || null,
            operation.source_currency || null,
            operation.destination_currency || null,
            asNullable(operation.original_balance),
            // Older backups lack this column → default to 0 (counted). Read
            // numerically: a CSV cell is the STRING '0', which is truthy, so a
            // plain truthiness test excluded every operation ever restored from
            // a CSV backup from averages and charts (#1693).
            asFlag(operation.exclude_from_avg, 0),
            // Same for the chart-exclusion flag (added in migration 0023) → 0 (shown).
            asFlag(operation.exclude_from_charts, 0),
            asNullable(operation.latitude),
            asNullable(operation.longitude),
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
          // `budgets.category_id` is the one category FK that is NOT NULL, so a
          // dangling reference cannot degrade to null — the row is skipped
          // instead of aborting the restore (#1694). These are legacy v1
          // budgets, already bridged into recurring plan lines below.
          if (!restoredCategoryIds.has(String(budget.category_id))) {
            console.warn(`Skipping budget ${budget.id}: unknown category ${budget.category_id}`);
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
              asFlag(budget.is_recurring, 1),
              asFlag(budget.rollover_enabled, 0),
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
        const groups = backup.data.budget_plan_line_groups || [];
        appEvents.emit(IMPORT_PROGRESS_EVENT, {
          stepId: 'budget_plans',
          status: 'in_progress',
          data: plans.length,
        });

        // Groups first: a line's group_id references them. Only the ones that
        // really landed may be assigned below, for the same reason plans are
        // tracked — a dangling FK would abort the entire restore.
        const restoredGroupIds = new Set();
        for (const group of groups) {
          if (!group.id || !group.label) {
            console.warn('Skipping budget line group with missing required fields:', group);
            continue;
          }
          // A CSV round trip turns a null amount into '', which must restore as a
          // DERIVED group (null), not as the string '' sitting in a numeric column.
          const amount = group.amount === '' || group.amount == null ? null : String(group.amount);
          await db.runAsync(
            'INSERT INTO budget_plan_line_groups (id, label, amount, currency, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              group.id,
              group.label,
              amount,
              // The currency only means anything alongside an override amount.
              amount === null ? null : (group.currency || null),
              Number.isInteger(group.sort_order) ? group.sort_order : Number(group.sort_order) || 0,
              group.created_at || new Date().toISOString(),
              group.updated_at || new Date().toISOString(),
            ],
          );
          restoredGroupIds.add(group.id);
        }

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

        // Only insert one-off lines whose parent plan was actually restored, so an
        // orphaned line (dangling plan_id) is skipped rather than aborting the
        // whole import on an FK violation. A recurring (global) line has no
        // plan_id at all (migration 0019) and is restored regardless of `plans`.
        // Same idea as restoredPlanIds, one level down: only a line that really
        // made it into the table may be given category links.
        const restoredLineIds = new Set();
        let restoredLines = 0;
        for (const line of lines) {
          // amount is a NOT NULL text column; treat null/empty as invalid and
          // skip (mirrors how budgets skip rows with missing required fields).
          if (!line.id || line.amount == null || line.amount === '') {
            console.warn('Skipping budget plan line with missing required fields:', line);
            continue;
          }
          const isRecurring = Number(line.is_recurring) === 1;
          if (!isRecurring) {
            if (!line.plan_id) {
              console.warn('Skipping budget plan line with missing required fields:', line);
              continue;
            }
            if (!restoredPlanIds.has(line.plan_id)) {
              console.warn('Skipping budget plan line with unknown plan_id:', line.plan_id);
              continue;
            }
          }
          let mappedToAccountId = null;
          if (line.to_account_id != null) {
            mappedToAccountId = accountIdMapping.get(String(line.to_account_id)) ?? line.to_account_id;
          }
          // Execution account of a line carrying a template (migration 0020) —
          // remapped like every other account reference. A reference the backup
          // has no account for drops to NULL (the line stays, as a pure analytic
          // target) rather than failing the FK and aborting the whole restore:
          // losing one execute button beats losing the import.
          let mappedAccountId = null;
          if (line.account_id != null && line.account_id !== '') {
            mappedAccountId = accountIdMapping.get(String(line.account_id)) ?? null;
          }
          await db.runAsync(
            'INSERT INTO budget_plan_lines (id, plan_id, label, amount, comment, category_id, to_account_id, sort_order, is_recurring, currency, kind, account_id, last_executed_month, include_children, group_id, effective_from, effective_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              line.id,
              isRecurring ? null : line.plan_id,
              line.label ?? null,
              line.amount,
              line.comment ?? null,
              resolveCategoryReference(line.category_id, 'budget plan line'),
              mappedToAccountId,
              Number.isInteger(line.sort_order) ? line.sort_order : Number(line.sort_order) || 0,
              isRecurring ? 1 : 0,
              // A one-off line may carry its own currency too since 0020 (a
              // template is priced in its account's currency), so this is no
              // longer gated on is_recurring.
              line.currency || null,
              VALID_OPERATION_TYPES.includes(line.kind) ? line.kind : null,
              mappedAccountId,
              line.last_executed_month || null,
              // Absent on every pre-0021 backup, where descendants always rolled
              // up — so absent restores as 1, not 0. A CSV backup yields '' for a
              // missing column and `Number('')` is 0, so the blank case has to be
              // caught before any numeric comparison.
              (line.include_children === '' || line.include_children == null)
                ? 1
                : (Number(line.include_children) === 0 ? 0 : 1),
              // Group membership (migration 0022). A group the backup doesn't
              // contain drops to NULL — the line restores ungrouped rather than
              // failing its FK and taking the whole import down with it. Absent
              // on every pre-0022 backup, where '' likewise means "no group".
              (line.group_id && restoredGroupIds.has(line.group_id)) ? line.group_id : null,
              // The months a recurring line applies to (migration 0026). Absent
              // on every pre-0026 backup — and meaningless on a one-off line,
              // whose plan_id already names its month — where null restores the
              // pre-0026 reading: every month there is. A CSV round trip turns a
              // null into '', so anything that isn't a month key drops to null
              // rather than landing in the column as a string no comparison can
              // read.
              isRecurring ? asBackupMonth(line.effective_from) : null,
              isRecurring ? asBackupMonth(line.effective_to) : null,
              line.created_at || new Date().toISOString(),
              line.updated_at || new Date().toISOString(),
            ],
          );
          restoredLineIds.add(line.id);
          restoredLines++;
        }

        // Category links (migration 0021). A backup that carries the junction is
        // restored from it; an older one has only each line's single category_id,
        // so the links are rebuilt from that — without this, every line restored
        // from a pre-0021 backup would read as broken and track nothing.
        const backedUpLinks = backup.data.budget_plan_line_categories || [];
        const linkRows = backedUpLinks.length > 0
          ? backedUpLinks.map(link => ({ lineId: link.line_id, categoryId: link.category_id }))
          : lines
            .filter(line => restoredLineIds.has(line.id) && line.category_id)
            .map(line => ({ lineId: line.id, categoryId: line.category_id }));

        let restoredLinks = 0;
        for (const { lineId, categoryId } of linkRows) {
          // Skip a link whose line was skipped above or whose category the backup
          // doesn't contain: the FKs are NOT NULL here, so an unknown reference
          // would abort the entire restore rather than lose one link.
          if (!lineId || !categoryId) continue;
          if (!restoredLineIds.has(lineId)) {
            console.warn('Skipping plan line category link for an unknown line:', lineId);
            continue;
          }
          if (!restoredCategoryIds.has(String(categoryId))) {
            console.warn('Skipping plan line category link for an unknown category:', categoryId);
            continue;
          }
          await db.runAsync(
            'INSERT OR IGNORE INTO budget_plan_line_categories (line_id, category_id) VALUES (?, ?)',
            [lineId, categoryId],
          );
          restoredLinks++;
        }

        // Source-account filter links (migration 0024). Unlike the category
        // links above there is NO fallback to rebuild from: no pre-0024 line
        // could carry this filter, and an absent section means "counts any
        // account", which is a line with no rows here.
        let restoredAccountLinks = 0;
        for (const link of backup.data.budget_plan_line_accounts || []) {
          if (!link.line_id || link.account_id == null || link.account_id === '') continue;
          if (!restoredLineIds.has(link.line_id)) {
            console.warn('Skipping plan line account link for an unknown line:', link.line_id);
            continue;
          }
          // Accounts are re-keyed on restore (UUID ids become integers), so the
          // filter has to travel through the same mapping every other account
          // reference does — an unmapped id is an account the backup doesn't
          // contain, and inserting it would fail the NOT NULL FK and abort the
          // entire import for the sake of one filter entry.
          const mappedId = accountIdMapping.get(String(link.account_id));
          if (mappedId == null) {
            console.warn('Skipping plan line account link for an unknown account:', link.account_id);
            continue;
          }
          await db.runAsync(
            'INSERT OR IGNORE INTO budget_plan_line_accounts (line_id, account_id) VALUES (?, ?)',
            [link.line_id, mappedId],
          );
          restoredAccountLinks++;
        }

        // Label filter links (migration 0028). Like the account links there is no
        // fallback: no pre-0028 line could carry labels, and an absent section
        // means the line is not tracked by label. Labels are plain text and need
        // no re-keying — an operation's label is matched by value, not by id.
        let restoredLabelLinks = 0;
        for (const link of backup.data.budget_plan_line_labels || []) {
          if (!link.line_id || link.label == null || link.label === '') continue;
          if (!restoredLineIds.has(link.line_id)) {
            console.warn('Skipping plan line label link for an unknown line:', link.line_id);
            continue;
          }
          await db.runAsync(
            'INSERT OR IGNORE INTO budget_plan_line_labels (line_id, label) VALUES (?, ?)',
            [link.line_id, String(link.label)],
          );
          restoredLabelLinks++;
        }
        console.log(`Restored ${restoredPlans} budget plans, ${restoredLines} plan lines, ${restoredLinks} category links, ${restoredAccountLinks} account links and ${restoredLabelLinks} label links`);
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

      // Bridge legacy per-category budgets (v1) into recurring budget_plan_lines
      // (Budgets v3 phase 2), so a backup that predates that consolidation still
      // ends up with a single source of truth after restore. Idempotent — reuses
      // the SAME completion flag the live migration's postMigration handler sets
      // (app_metadata was just restored above), so a backup taken AFTER this
      // migration shipped — whose app_metadata already carries the flag — is not
      // re-derived, avoiding double-counted recurring lines.
      try {
        const bridgeResult = await BudgetPlansDB.migrateLegacyBudgetsToRecurringLines(db);
        console.log(
          `Bridged ${bridgeResult.migrated} legacy budget(s) into recurring plan lines`
          + (bridgeResult.skipped ? ' (already migrated, skipped)' : ''),
        );
      } catch (bridgeError) {
        console.warn('Failed to bridge legacy budgets into recurring plan lines:', bridgeError);
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
              resolveCategoryReference(planned.category_id, 'planned operation'),
              mappedToAccountId,
              planned.description || null,
              asFlag(planned.is_recurring, 1),
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

      // Bridge planned operations (and any plan's stored expected income) into
      // plan lines (Budgets v3 phase 3), so a backup that predates that
      // consolidation still ends up with a single source of truth. Runs AFTER the planned_operations insert above — it
      // reads that table. Idempotent via the same completion flag migration
      // 0020's postMigration handler sets (app_metadata was restored above), so
      // a newer backup is not re-derived into duplicate lines.
      try {
        const plannedBridge = await BudgetPlansDB.migratePlannedOperationsToLines(db);
        console.log(
          `Bridged ${plannedBridge.migratedTemplates} planned operation(s) and `
          + `${plannedBridge.migratedIncome} expected-income figure(s) into plan lines`
          + (plannedBridge.skipped ? ' (already migrated, skipped)' : ''),
        );
      } catch (bridgeError) {
        console.warn('Failed to bridge planned operations into plan lines:', bridgeError);
      }

      appEvents.emit(IMPORT_PROGRESS_EVENT, { stepId: 'upgrades', status: 'in_progress' });

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
            'INSERT OR IGNORE INTO notification_merchant_rules (id, merchant, package_name, category_id, label_override, last_matched_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              rule.id,
              rule.merchant,
              rule.package_name || null,
              resolveCategoryReference(rule.category_id, 'merchant rule'),
              rule.label_override || null,
              // Absent from any backup taken before this column was written out;
              // NULL then, which is what NotificationRulesDB already falls back
              // from (it orders on COALESCE(last_matched_at, updated_at)).
              asNullable(rule.last_matched_at),
              rule.created_at || new Date().toISOString(),
              rule.updated_at || new Date().toISOString(),
            ],
          ).catch((e) => { console.warn('Skipping merchant rule:', e.message); });
          restoredRules += 1;
        }
        console.log(`Restored ${restoredRules} merchant rules`);
      }

      // Restore user-defined notification parse templates
      if (backup.data.notification_templates && backup.data.notification_templates.length > 0) {
        let restoredTemplates = 0;
        for (const template of backup.data.notification_templates) {
          // `fields` is what makes a template a template — a row without one
          // could never match anything, so skip it rather than store a stub.
          if (!template.id || !template.name || !template.fields) {
            console.warn('Skipping notification template with missing id, name or fields:', template.id);
            continue;
          }
          await db.runAsync(
            'INSERT OR IGNORE INTO notification_templates (id, name, package_name, type, enabled, priority, category_id, currency, date_order, fields, triggers, sample_title, sample_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              template.id,
              template.name,
              template.package_name || null,
              template.type === 'income' ? 'income' : 'expense',
              // A CSV cell is a string, so neither `=== 0` nor Number.isFinite
              // reads it: an exported-then-restored template came back enabled
              // whatever it was, at priority 0 whatever it was (#1693/#1695).
              asFlag(template.enabled, 1),
              asNumber(template.priority, 0),
              resolveCategoryReference(template.category_id, 'notification template'),
              template.currency || null,
              template.date_order || 'dmy',
              template.fields,
              template.triggers || null,
              template.sample_title || null,
              template.sample_text || null,
              template.created_at || new Date().toISOString(),
              template.updated_at || new Date().toISOString(),
            ],
          ).catch((e) => { console.warn('Skipping notification template:', e.message); });
          restoredTemplates += 1;
        }
        console.log(`Restored ${restoredTemplates} notification templates`);
      }

      // Put back what the backup could not carry. A rule whose category the new
      // category set no longer has keeps the merchant and loses the binding —
      // the next notification from that shop re-learns it — rather than being
      // dropped altogether. A rule with no category at all was never cascaded
      // away, so INSERT OR IGNORE simply steps over it.
      if (preservedRules && preservedRules.length > 0) {
        let keptRules = 0;
        for (const rule of preservedRules) {
          if (!rule.id || !rule.merchant) continue;
          await db.runAsync(
            'INSERT OR IGNORE INTO notification_merchant_rules (id, merchant, package_name, category_id, label_override, last_matched_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              rule.id,
              rule.merchant,
              rule.package_name || null,
              resolveCategoryReference(rule.category_id, 'preserved merchant rule'),
              rule.label_override || null,
              // The row came from the live table, so this is the real
              // last-matched stamp: dropping it would push exactly the rules
              // the user matches most often to the bottom of the bindings list.
              asNullable(rule.last_matched_at),
              rule.created_at || new Date().toISOString(),
              rule.updated_at || new Date().toISOString(),
            ],
          ).catch((e) => { console.warn('Skipping preserved merchant rule:', e.message); });
          keptRules += 1;
        }
        console.log(`Preserved ${keptRules} merchant rules the backup did not carry`);
      }

      // Templates survive the clear (their category FK is ON DELETE SET NULL),
      // so only the binding has to be put back.
      if (preservedTemplateCategories && preservedTemplateCategories.length > 0) {
        let keptTemplateCategories = 0;
        for (const template of preservedTemplateCategories) {
          if (!template.id || !template.category_id) continue;
          const categoryId = resolveCategoryReference(template.category_id, 'preserved notification template');
          if (categoryId == null) continue;
          await db.runAsync(
            'UPDATE notification_templates SET category_id = ? WHERE id = ?',
            [categoryId, template.id],
          ).catch((e) => { console.warn('Skipping preserved template category:', e.message); });
          keptTemplateCategories += 1;
        }
        console.log(`Preserved the category of ${keptTemplateCategories} notification templates`);
      }

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
    budget_plan_line_categories: [],
    budget_plan_line_groups: [],
    budget_plan_line_accounts: [],
    budget_plan_line_labels: [],
  };

  // Split by section markers. The six [BUDGET_PLAN*] markers don't collide:
  // each marker + newline (`[BUDGET_PLANS]\n`, `[BUDGET_PLAN_LINES]\n`) is not a
  // substring of any of the others.
  const accountsMatch = fileContent.match(/\[ACCOUNTS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const categoriesMatch = fileContent.match(/\[CATEGORIES\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const operationsMatch = fileContent.match(/\[OPERATIONS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetsMatch = fileContent.match(/\[BUDGETS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const metadataMatch = fileContent.match(/\[APP_METADATA\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const balanceHistoryMatch = fileContent.match(/\[BALANCE_HISTORY\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const plannedOpsMatch = fileContent.match(/\[PLANNED_OPERATIONS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetPlansMatch = fileContent.match(/\[BUDGET_PLANS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetPlanLinesMatch = fileContent.match(/\[BUDGET_PLAN_LINES\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetPlanLineCategoriesMatch = fileContent.match(/\[BUDGET_PLAN_LINE_CATEGORIES\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetPlanLineGroupsMatch = fileContent.match(/\[BUDGET_PLAN_LINE_GROUPS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetPlanLineAccountsMatch = fileContent.match(/\[BUDGET_PLAN_LINE_ACCOUNTS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const budgetPlanLineLabelsMatch = fileContent.match(/\[BUDGET_PLAN_LINE_LABELS\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const merchantRulesMatch = fileContent.match(/\[NOTIFICATION_MERCHANT_RULES\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);
  const notificationTemplatesMatch = fileContent.match(/\[NOTIFICATION_TEMPLATES\]\n([\s\S]*?)(?=\n\[[A-Z_]+\]\n|$)/);

  if (accountsMatch) sections.accounts = parseCSV(accountsMatch[1]);
  if (categoriesMatch) sections.categories = parseCSV(categoriesMatch[1]);
  if (operationsMatch) sections.operations = parseCSV(operationsMatch[1]);
  if (budgetsMatch) sections.budgets = parseCSV(budgetsMatch[1]);
  if (metadataMatch) sections.app_metadata = parseCSV(metadataMatch[1]);
  if (balanceHistoryMatch) sections.balance_history = parseCSV(balanceHistoryMatch[1]);
  if (plannedOpsMatch) sections.planned_operations = parseCSV(plannedOpsMatch[1]);
  if (budgetPlansMatch) sections.budget_plans = parseCSV(budgetPlansMatch[1]);
  if (budgetPlanLinesMatch) sections.budget_plan_lines = parseCSV(budgetPlanLinesMatch[1]);
  if (budgetPlanLineCategoriesMatch) sections.budget_plan_line_categories = parseCSV(budgetPlanLineCategoriesMatch[1]);
  if (budgetPlanLineGroupsMatch) sections.budget_plan_line_groups = parseCSV(budgetPlanLineGroupsMatch[1]);
  if (budgetPlanLineAccountsMatch) sections.budget_plan_line_accounts = parseCSV(budgetPlanLineAccountsMatch[1]);
  if (budgetPlanLineLabelsMatch) sections.budget_plan_line_labels = parseCSV(budgetPlanLineLabelsMatch[1]);
  // Only set when the section is really there: an absent key is what tells
  // restoreBackup to leave the live rules and templates alone, rather than
  // clearing them and restoring nothing (#1695). A CSV written by an older
  // build has no such section, and its restore must not cost the user their
  // merchant bindings.
  if (merchantRulesMatch) sections.notification_merchant_rules = parseCSV(merchantRulesMatch[1]);
  if (notificationTemplatesMatch) sections.notification_templates = parseCSV(notificationTemplatesMatch[1]);

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

    // Parse templates may not exist in pre-0025 backups. Same reasoning as the
    // merchant rules above: without this extraction restoreBackup clears the live
    // table and re-inserts nothing, wiping every template the user built.
    let notificationTemplates = [];
    try {
      notificationTemplates = await tempDb.getAllAsync('SELECT * FROM notification_templates ORDER BY priority ASC, created_at ASC');
    } catch (e) {
      console.warn('No notification_templates table in imported database (older format)');
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

    // The multi-category junction (migration 0021) is newer still, so it gets its
    // own guard: a database that has plan lines but no junction is a pre-0021 one
    // whose links restoreBackup rebuilds from each line's category_id.
    let budgetPlanLineCategories = [];
    try {
      budgetPlanLineCategories = await tempDb.getAllAsync(
        'SELECT * FROM budget_plan_line_categories ORDER BY line_id ASC, category_id ASC',
      );
    } catch (e) {
      console.warn('No budget_plan_line_categories table in imported database (older format)');
    }

    // Line groups (migration 0022), newer still — its own guard for the same
    // reason: a pre-0022 database has no groups and every line imports ungrouped.
    let budgetPlanLineGroups = [];
    try {
      budgetPlanLineGroups = await tempDb.getAllAsync(
        'SELECT * FROM budget_plan_line_groups ORDER BY sort_order ASC, created_at ASC',
      );
    } catch (e) {
      console.warn('No budget_plan_line_groups table in imported database (older format)');
    }

    // The source-account filter (migration 0024), newest of the lot — its own
    // guard for the same reason: a pre-0024 database has no filters and every
    // line imports counting spending from any account, exactly as it did.
    let budgetPlanLineAccounts = [];
    try {
      budgetPlanLineAccounts = await tempDb.getAllAsync(
        'SELECT * FROM budget_plan_line_accounts ORDER BY line_id ASC, account_id ASC',
      );
    } catch (e) {
      console.warn('No budget_plan_line_accounts table in imported database (older format)');
    }

    // The label filter (migration 0028), guarded for the same reason: a pre-0028
    // database has no labels and every line imports untracked by label.
    let budgetPlanLineLabels = [];
    try {
      budgetPlanLineLabels = await tempDb.getAllAsync(
        'SELECT * FROM budget_plan_line_labels ORDER BY line_id ASC, label ASC',
      );
    } catch (e) {
      console.warn('No budget_plan_line_labels table in imported database (older format)');
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
        notification_templates: notificationTemplates || [],
        budget_plans: budgetPlans || [],
        budget_plan_lines: budgetPlanLines || [],
        budget_plan_line_categories: budgetPlanLineCategories || [],
        budget_plan_line_groups: budgetPlanLineGroups || [],
        budget_plan_line_accounts: budgetPlanLineAccounts || [],
        budget_plan_line_labels: budgetPlanLineLabels || [],
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
