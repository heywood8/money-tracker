/**
 * Daily Backup Service
 * Automatically creates one backup per day on first app open.
 * Stores up to 7 recent backups in the app's document directory.
 * Purpose: preserve a recoverable snapshot of financial data.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { createBackup } from './BackupRestore';
import { getPreference, setPreference } from './PreferencesDB';

const LAST_BACKUP_DATE_KEY = 'last_daily_backup_date';
export const DAILY_BACKUP_DIR = `${FileSystem.documentDirectory}daily_backups/`;
export const MAX_BACKUPS_TO_KEEP = 7;

/**
 * Ensure the daily backup directory exists
 */
const ensureBackupDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DAILY_BACKUP_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DAILY_BACKUP_DIR, { intermediates: true });
  }
};

/**
 * Get today's date string in YYYY-MM-DD format
 * @returns {string}
 */
export const getTodayDateString = () => new Date().toISOString().split('T')[0];

/**
 * Get list of existing daily backup file URIs sorted oldest-first
 * @returns {Promise<string[]>}
 */
export const getStoredBackups = async () => {
  try {
    await ensureBackupDir();
    const filenames = await FileSystem.readDirectoryAsync(DAILY_BACKUP_DIR);
    return filenames
      .filter(name => name.startsWith('backup_') && name.endsWith('.json'))
      .sort()
      .map(name => `${DAILY_BACKUP_DIR}${name}`);
  } catch (error) {
    console.error('[DailyBackup] Error reading backup directory:', error);
    return [];
  }
};

/**
 * Delete backup files beyond MAX_BACKUPS_TO_KEEP (removes oldest first)
 */
const cleanupOldBackups = async () => {
  const backups = await getStoredBackups();
  const excess = backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS_TO_KEEP));
  for (const uri of excess) {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      console.log('[DailyBackup] Deleted old backup:', uri.split('/').pop());
    } catch (error) {
      console.warn('[DailyBackup] Failed to delete old backup:', uri, error);
    }
  }
};

/**
 * Create a daily backup if one hasn't been created today.
 * Safe to call on every app open – will no-op after the first call of the day.
 * Errors are caught and logged so they never block app startup.
 * @returns {Promise<boolean>} true if a new backup was written, false if skipped
 */
export const performDailyBackupIfNeeded = async () => {
  try {
    const today = getTodayDateString();
    const lastBackupDate = await getPreference(LAST_BACKUP_DATE_KEY, null);

    if (lastBackupDate === today) {
      console.log('[DailyBackup] Backup already performed today, skipping');
      return false;
    }

    console.log('[DailyBackup] Creating daily backup for', today);
    await ensureBackupDir();

    const backup = await createBackup();
    const filename = `backup_${today}.json`;
    const fileUri = `${DAILY_BACKUP_DIR}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup));
    await setPreference(LAST_BACKUP_DATE_KEY, today);

    console.log('[DailyBackup] Daily backup saved:', filename);

    await cleanupOldBackups();
    return true;
  } catch (error) {
    console.error('[DailyBackup] Failed to create daily backup:', error);
    // Never throw – backup failure must not block app startup
    return false;
  }
};

/**
 * Return metadata for the most recent stored backup, or null if none exist.
 * @returns {Promise<{uri: string, date: string|null, filename: string}|null>}
 */
export const getLatestBackupInfo = async () => {
  const backups = await getStoredBackups();
  if (backups.length === 0) return null;

  const uri = backups[backups.length - 1];
  const filename = uri.split('/').pop();
  const dateMatch = filename.match(/^backup_(\d{4}-\d{2}-\d{2})\.json$/);
  return {
    uri,
    date: dateMatch ? dateMatch[1] : null,
    filename,
  };
};
