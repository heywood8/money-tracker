/**
 * Daily + Weekly Backup Service
 *
 * On first app open each day  → write a daily  backup (daily_YYYY-MM-DD.json), keep last 7.
 * On first app open each week → write a weekly backup (weekly_YYYY-WNN.json),  keep last 15.
 *
 * Both are stored in the same directory and share a single createBackup() call
 * when both are needed at the same time (e.g. Monday morning).
 */
import * as FileSystem from 'expo-file-system/legacy';
import { createBackup } from './BackupRestore';
import { getPreference, setPreference } from './PreferencesDB';

const LAST_DAILY_BACKUP_DATE_KEY = 'last_daily_backup_date';
const LAST_WEEKLY_BACKUP_WEEK_KEY = 'last_weekly_backup_week';

export const DAILY_BACKUP_DIR = `${FileSystem.documentDirectory}daily_backups/`;
export const MAX_DAILY_BACKUPS = 7;
export const MAX_WEEKLY_BACKUPS = 15;

/**
 * Ensure the backup directory exists.
 */
const ensureBackupDir = async () => {
  const dirInfo = await FileSystem.getInfoAsync(DAILY_BACKUP_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DAILY_BACKUP_DIR, { intermediates: true });
  }
};

/**
 * Today's date as "YYYY-MM-DD".
 * @returns {string}
 */
export const getTodayDateString = () => new Date().toISOString().split('T')[0];

/**
 * Current ISO 8601 week identifier as "YYYY-WNN".
 * ISO weeks start on Monday; week 1 contains the year's first Thursday.
 * @returns {string}
 */
export const getISOWeekString = () => {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // Sunday → 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // Shift to nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

/**
 * Sorted URIs for all daily backup files (oldest first).
 * @returns {Promise<string[]>}
 */
export const getDailyBackups = async () => {
  try {
    await ensureBackupDir();
    const filenames = await FileSystem.readDirectoryAsync(DAILY_BACKUP_DIR);
    return filenames
      .filter(name => name.startsWith('daily_') && name.endsWith('.json'))
      .sort()
      .map(name => `${DAILY_BACKUP_DIR}${name}`);
  } catch (error) {
    console.error('[DailyBackup] Error reading daily backups:', error);
    return [];
  }
};

/**
 * Sorted URIs for all weekly backup files (oldest first).
 * @returns {Promise<string[]>}
 */
export const getWeeklyBackups = async () => {
  try {
    await ensureBackupDir();
    const filenames = await FileSystem.readDirectoryAsync(DAILY_BACKUP_DIR);
    return filenames
      .filter(name => name.startsWith('weekly_') && name.endsWith('.json'))
      .sort()
      .map(name => `${DAILY_BACKUP_DIR}${name}`);
  } catch (error) {
    console.error('[DailyBackup] Error reading weekly backups:', error);
    return [];
  }
};

/**
 * All backup URIs (daily files followed by weekly files), each group sorted oldest-first.
 * @returns {Promise<string[]>}
 */
export const getStoredBackups = async () => {
  try {
    await ensureBackupDir();
    const filenames = await FileSystem.readDirectoryAsync(DAILY_BACKUP_DIR);
    return filenames
      .filter(
        name =>
          (name.startsWith('daily_') || name.startsWith('weekly_')) &&
          name.endsWith('.json'),
      )
      .sort()
      .map(name => `${DAILY_BACKUP_DIR}${name}`);
  } catch (error) {
    console.error('[DailyBackup] Error reading backup directory:', error);
    return [];
  }
};

/**
 * Delete the oldest entries in `backups` until at most `maxToKeep` remain.
 */
const cleanupBackups = async (backups, maxToKeep) => {
  const excess = backups.slice(0, Math.max(0, backups.length - maxToKeep));
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
 * Create daily and/or weekly backups if not yet done for the current day/week.
 * Safe to call on every app open – no-ops when both are already up to date.
 * A single createBackup() snapshot is reused for both file types when both are needed.
 * Errors are swallowed so they never block app startup.
 * @returns {Promise<boolean>} true if at least one new backup was written
 */
export const performDailyBackupIfNeeded = async () => {
  try {
    const today = getTodayDateString();
    const currentWeek = getISOWeekString();

    const [lastDailyDate, lastWeeklyWeek] = await Promise.all([
      getPreference(LAST_DAILY_BACKUP_DATE_KEY, null),
      getPreference(LAST_WEEKLY_BACKUP_WEEK_KEY, null),
    ]);

    const needsDaily = lastDailyDate !== today;
    const needsWeekly = lastWeeklyWeek !== currentWeek;

    if (!needsDaily && !needsWeekly) {
      console.log('[DailyBackup] All backups up to date, skipping');
      return false;
    }

    await ensureBackupDir();

    // One snapshot serves both daily and weekly writes if both are needed
    const backup = await createBackup();
    const backupJson = JSON.stringify(backup);

    if (needsDaily) {
      const uri = `${DAILY_BACKUP_DIR}daily_${today}.json`;
      await FileSystem.writeAsStringAsync(uri, backupJson);
      await setPreference(LAST_DAILY_BACKUP_DATE_KEY, today);
      console.log(`[DailyBackup] Daily backup saved: daily_${today}.json`);
      await cleanupBackups(await getDailyBackups(), MAX_DAILY_BACKUPS);
    }

    if (needsWeekly) {
      const uri = `${DAILY_BACKUP_DIR}weekly_${currentWeek}.json`;
      await FileSystem.writeAsStringAsync(uri, backupJson);
      await setPreference(LAST_WEEKLY_BACKUP_WEEK_KEY, currentWeek);
      console.log(`[DailyBackup] Weekly backup saved: weekly_${currentWeek}.json`);
      await cleanupBackups(await getWeeklyBackups(), MAX_WEEKLY_BACKUPS);
    }

    return true;
  } catch (error) {
    console.error('[DailyBackup] Failed to create backup:', error);
    // Never throw – backup failure must not block app startup
    return false;
  }
};

/**
 * Metadata for the most recent daily backup, or null if none exist.
 * @returns {Promise<{uri: string, date: string|null, filename: string}|null>}
 */
export const getLatestBackupInfo = async () => {
  const backups = await getDailyBackups();
  if (backups.length === 0) return null;

  const uri = backups[backups.length - 1];
  const filename = uri.split('/').pop();
  const dateMatch = filename.match(/^daily_(\d{4}-\d{2}-\d{2})\.json$/);
  return {
    uri,
    date: dateMatch ? dateMatch[1] : null,
    filename,
  };
};
