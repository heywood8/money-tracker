/**
 * SQLite backup and restore service (Native platforms: iOS/Android)
 * Supports multiple export formats: JSON, CSV, Excel, SQLite
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { queryAll, executeQuery, executeTransaction, getDatabase } from './db';

const BACKUP_VERSION = 1;

/**
 * Create a backup of the entire database
 * @returns {Promise<Object>} Backup data object
 */
export const createBackup = async () => {
  try {
    console.log('Creating database backup...');

    // Fetch all data from all tables
    const [accounts, categories, operations, appMetadata] = await Promise.all([
      queryAll('SELECT * FROM accounts ORDER BY created_at ASC'),
      queryAll('SELECT * FROM categories ORDER BY created_at ASC'),
      queryAll('SELECT * FROM operations ORDER BY created_at ASC'),
      queryAll('SELECT * FROM app_metadata'),
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
        app_metadata: appMetadata || [],
      },
    };

    console.log('Backup created successfully:', {
      accounts: backup.data.accounts.length,
      categories: backup.data.categories.length,
      operations: backup.data.operations.length,
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
      'app_metadata.csv': convertToCSV(backup.data.app_metadata),
      'backup_info.csv': `version,timestamp,platform\n${backup.version},${backup.timestamp},${backup.platform}`,
    };

    // For simplicity, we'll combine all CSVs into one file with section markers
    // This makes import easier and doesn't require ZIP support
    let combinedCSV = `# Money Tracker Backup - ${backup.timestamp}\n`;
    combinedCSV += `# Version: ${backup.version}\n\n`;

    combinedCSV += `[ACCOUNTS]\n${csvFiles['accounts.csv']}\n\n`;
    combinedCSV += `[CATEGORIES]\n${csvFiles['categories.csv']}\n\n`;
    combinedCSV += `[OPERATIONS]\n${csvFiles['operations.csv']}\n\n`;
    combinedCSV += `[APP_METADATA]\n${csvFiles['app_metadata.csv']}\n`;

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
 * Export backup as Excel file
 * @returns {Promise<string>} Filename
 */
export const exportBackupExcel = async () => {
  try {
    const backup = await createBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Add backup info sheet
    const infoSheet = XLSX.utils.json_to_sheet([
      {
        'Backup Version': backup.version,
        'Timestamp': backup.timestamp,
        'Platform': backup.platform,
        'Accounts': backup.data.accounts.length,
        'Categories': backup.data.categories.length,
        'Operations': backup.data.operations.length,
      }
    ]);
    XLSX.utils.book_append_sheet(wb, infoSheet, 'Backup Info');

    // Add accounts sheet
    if (backup.data.accounts.length > 0) {
      const accountsSheet = XLSX.utils.json_to_sheet(backup.data.accounts);
      XLSX.utils.book_append_sheet(wb, accountsSheet, 'Accounts');
    }

    // Add categories sheet
    if (backup.data.categories.length > 0) {
      const categoriesSheet = XLSX.utils.json_to_sheet(backup.data.categories);
      XLSX.utils.book_append_sheet(wb, categoriesSheet, 'Categories');
    }

    // Add operations sheet
    if (backup.data.operations.length > 0) {
      const operationsSheet = XLSX.utils.json_to_sheet(backup.data.operations);
      XLSX.utils.book_append_sheet(wb, operationsSheet, 'Operations');
    }

    // Add app metadata sheet
    if (backup.data.app_metadata && backup.data.app_metadata.length > 0) {
      const metadataSheet = XLSX.utils.json_to_sheet(backup.data.app_metadata);
      XLSX.utils.book_append_sheet(wb, metadataSheet, 'App Metadata');
    }

    // Write workbook to file
    const filename = `money_tracker_backup_${timestamp}.xlsx`;
    const fileUri = `${FileSystem.documentDirectory}${filename}`;

    // Convert workbook to binary
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    // Write to file
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Excel backup file created:', fileUri);

    // Share the file
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Export Excel Backup',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }

    return filename;
  } catch (error) {
    console.error('Failed to export Excel backup:', error);
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
 * @param {string} format - Export format: 'json', 'csv', 'excel', or 'sqlite'
 * @returns {Promise<string>} Filename
 */
export const exportBackup = async (format = 'json') => {
  switch (format.toLowerCase()) {
    case 'csv':
      return await exportBackupCSV();
    case 'excel':
    case 'xlsx':
      return await exportBackupExcel();
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
      `Backup version ${backup.version} is not supported by this app version (max: ${BACKUP_VERSION})`
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

    // Validate backup
    validateBackup(backup);

    await executeTransaction(async (db) => {
      // Clear existing data (in reverse order due to foreign keys)
      await db.runAsync('DELETE FROM operations');
      await db.runAsync('DELETE FROM categories');
      await db.runAsync('DELETE FROM accounts');
      await db.runAsync('DELETE FROM app_metadata WHERE key != ?', ['db_version']);

      console.log('Existing data cleared');

      // Restore accounts
      for (const account of backup.data.accounts) {
        await db.runAsync(
          'INSERT INTO accounts (id, name, balance, currency, display_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            account.id,
            account.name,
            account.balance || '0',
            account.currency || 'USD',
            account.display_order ?? null,
            account.created_at,
            account.updated_at,
          ]
        );
      }
      console.log(`Restored ${backup.data.accounts.length} accounts`);

      // Restore categories
      for (const category of backup.data.categories) {
        await db.runAsync(
          'INSERT INTO categories (id, name, type, category_type, parent_id, icon, color, is_shadow, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            category.id,
            category.name,
            category.type || 'folder',
            category.category_type || 'expense',
            category.parent_id || null,
            category.icon || null,
            category.color || null,
            category.is_shadow || 0,
            category.created_at,
            category.updated_at,
          ]
        );
      }
      console.log(`Restored ${backup.data.categories.length} categories`);

      // Restore operations
      for (const operation of backup.data.operations) {
        await db.runAsync(
          'INSERT INTO operations (id, type, amount, account_id, category_id, to_account_id, date, created_at, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            operation.id,
            operation.type,
            operation.amount,
            operation.account_id,
            operation.category_id || null,
            operation.to_account_id || null,
            operation.date,
            operation.created_at,
            operation.description || null,
          ]
        );
      }
      console.log(`Restored ${backup.data.operations.length} operations`);

      // Restore app metadata (except db_version)
      if (backup.data.app_metadata) {
        for (const meta of backup.data.app_metadata) {
          if (meta.key !== 'db_version') {
            await db.runAsync(
              'INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
              [meta.key, meta.value, meta.updated_at]
            );
          }
        }
        console.log(`Restored ${backup.data.app_metadata.length} metadata entries`);
      }

      // Post-restore upgrades: Ensure shadow categories exist
      console.log('Performing post-restore database upgrades...');
      const shadowCategories = await db.getAllAsync(
        'SELECT id FROM categories WHERE id IN (?, ?)',
        ['shadow-adjustment-expense', 'shadow-adjustment-income']
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
            ]
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
            ]
          );
          console.log('Shadow income category added');
        }

        console.log('Shadow categories added successfully');
      } else {
        console.log('Shadow categories already exist in backup');
      }

      console.log('Post-restore upgrades completed');
    });

    console.log('Database restored successfully');
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
  const fileContent = await FileSystem.readAsStringAsync(fileUri);

  // Parse sections
  const sections = {
    accounts: [],
    categories: [],
    operations: [],
    app_metadata: [],
  };

  // Split by section markers
  const accountsMatch = fileContent.match(/\[ACCOUNTS\]\n([\s\S]*?)(?=\n\[|$)/);
  const categoriesMatch = fileContent.match(/\[CATEGORIES\]\n([\s\S]*?)(?=\n\[|$)/);
  const operationsMatch = fileContent.match(/\[OPERATIONS\]\n([\s\S]*?)(?=\n\[|$)/);
  const metadataMatch = fileContent.match(/\[APP_METADATA\]\n([\s\S]*?)(?=\n\[|$)/);

  if (accountsMatch) sections.accounts = parseCSV(accountsMatch[1]);
  if (categoriesMatch) sections.categories = parseCSV(categoriesMatch[1]);
  if (operationsMatch) sections.operations = parseCSV(operationsMatch[1]);
  if (metadataMatch) sections.app_metadata = parseCSV(metadataMatch[1]);

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

  await restoreBackup(backup);
  return backup;
};

/**
 * Import backup from Excel file
 * @param {string} fileUri - File URI
 * @returns {Promise<Object>} Imported backup object
 */
const importBackupExcel = async (fileUri) => {
  console.log('Importing Excel backup...');
  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Parse Excel file
  const wb = XLSX.read(fileContent, { type: 'base64' });

  // Extract data from sheets
  const backup = {
    version: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    platform: 'excel',
    data: {
      accounts: [],
      categories: [],
      operations: [],
      app_metadata: [],
    },
  };

  // Read Backup Info sheet if exists
  if (wb.SheetNames.includes('Backup Info')) {
    const infoSheet = wb.Sheets['Backup Info'];
    const infoData = XLSX.utils.sheet_to_json(infoSheet);
    if (infoData.length > 0) {
      backup.version = infoData[0]['Backup Version'] || BACKUP_VERSION;
      backup.timestamp = infoData[0]['Timestamp'] || backup.timestamp;
    }
  }

  // Read data sheets
  if (wb.SheetNames.includes('Accounts')) {
    backup.data.accounts = XLSX.utils.sheet_to_json(wb.Sheets['Accounts']);
  }
  if (wb.SheetNames.includes('Categories')) {
    backup.data.categories = XLSX.utils.sheet_to_json(wb.Sheets['Categories']);
  }
  if (wb.SheetNames.includes('Operations')) {
    backup.data.operations = XLSX.utils.sheet_to_json(wb.Sheets['Operations']);
  }
  if (wb.SheetNames.includes('App Metadata')) {
    backup.data.app_metadata = XLSX.utils.sheet_to_json(wb.Sheets['App Metadata']);
  }

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

  const destUri = `${FileSystem.documentDirectory}SQLite/penny.db`;
  const backupUri = `${FileSystem.documentDirectory}SQLite/penny_backup_temp.db`;

  // Create backup of current database first
  const currentDbExists = await FileSystem.getInfoAsync(destUri);
  if (currentDbExists.exists) {
    await FileSystem.copyAsync({
      from: destUri,
      to: backupUri,
    });
  }

  try {
    // Copy imported database to replace current one
    await FileSystem.copyAsync({
      from: fileUri,
      to: destUri,
    });

    console.log('SQLite database replaced successfully');

    // Delete temp backup
    if (currentDbExists.exists) {
      await FileSystem.deleteAsync(backupUri, { idempotent: true });
    }

    return {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      platform: 'sqlite',
    };
  } catch (error) {
    // Restore from backup if copy failed
    if (currentDbExists.exists) {
      await FileSystem.copyAsync({
        from: backupUri,
        to: destUri,
      });
      await FileSystem.deleteAsync(backupUri, { idempotent: true });
    }
    throw error;
  }
};

/**
 * Detect file format from extension
 * @param {string} filename - Filename
 * @returns {string} Format: 'json', 'csv', 'excel', or 'sqlite'
 */
const detectFileFormat = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'csv':
      return 'csv';
    case 'xlsx':
    case 'xls':
      return 'excel';
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

    // Import based on format
    let backup;
    switch (format) {
      case 'csv':
        backup = await importBackupCSV(fileUri);
        break;
      case 'excel':
        backup = await importBackupExcel(fileUri);
        break;
      case 'sqlite':
        backup = await importBackupSQLite(fileUri);
        break;
      case 'json':
      default:
        // Original JSON import
        const fileContent = await FileSystem.readAsStringAsync(fileUri);
        try {
          backup = JSON.parse(fileContent);
        } catch (error) {
          throw new Error('Invalid backup file: not valid JSON');
        }
        await restoreBackup(backup);
        break;
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
    };
  } catch (error) {
    return null;
  }
};
