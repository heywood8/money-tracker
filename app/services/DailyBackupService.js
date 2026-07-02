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
const LAST_GOOD_DAILY_BACKUP_DATE_KEY = 'last_good_daily_backup_date';

// KNOWN ISSUE (won't fix): backup files are stored unencrypted under documentDirectory/daily_backups/
// and are therefore inherited by Google Auto-Backup, making them accessible to an attacker with
// device access. Encrypting via expo-secure-store or Android Keystore was considered but ruled out
// (see https://github.com/heywood8/money-tracker/issues/593).
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
 * Today's date as "YYYY-MM-DD" in the user's local timezone — the "already
 * backed up today" boundary must roll at local midnight, not UTC midnight
 * (getISOWeekString below already uses local date components).
 * @returns {string}
 */
export const getTodayDateString = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

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
          (name.startsWith('daily_') || name.startsWith('weekly_') || name.startsWith('manual_')) &&
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
 * The optional `pinnedUri` is never deleted even if it falls outside the window.
 */
const cleanupBackups = async (backups, maxToKeep, pinnedUri = null) => {
  // Exclude the pinned file before computing excess so it is never deleted.
  const deletable = pinnedUri ? backups.filter(uri => uri !== pinnedUri) : backups;
  const excess = deletable.slice(0, Math.max(0, deletable.length - maxToKeep));
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
 * Returns false when the snapshot looks like a silent DB read failure.
 *
 * Layer 1 — zero-account check:
 *   A snapshot with zero accounts is rejected when any prior backup recorded
 *   real accounts — that pattern is the fingerprint of a locked/mid-migration DB
 *   returning empty arrays, not a user who deleted everything.
 *
 * Layer 2 — row-count regression check:
 *   Even when accounts > 0, if total rows (accounts + operations) dropped by
 *   more than 50% relative to the most recent backup, treat it as suspicious
 *   and skip the write.  A 50% floor is generous enough to survive legitimate
 *   mass-deletes while catching the all-empty / near-empty failure mode.
 */
const isSnapshotValid = async (backup) => {
  const accountCount = backup?.data?.accounts?.length ?? 0;
  const operationCount = backup?.data?.operations?.length ?? 0;
  const newTotal = accountCount + operationCount;

  // Resolve the most recent backup file (daily or weekly) once; reused for both layers.
  const existingFiles = [
    ...(await getDailyBackups()),
    ...(await getWeeklyBackups()),
  ].sort();
  const latestUri = existingFiles[existingFiles.length - 1];

  // ── Layer 1: zero-account guard ───────────────────────────────────────────
  if (accountCount === 0) {
    if (!latestUri) {
      // No prior backup — allow writing (first-run / fresh install)
      return true;
    }

    try {
      const prevJson = await FileSystem.readAsStringAsync(latestUri);
      const prev = JSON.parse(prevJson);
      const prevAccounts = prev?.data?.accounts?.length ?? 0;
      if (prevAccounts > 0) {
        console.warn(
          `[DailyBackup] Refusing empty snapshot: previous backup had ${prevAccounts} account(s) — skipping to protect existing backups`,
        );
        return false;
      }
    } catch {
      // Can't read/parse the previous backup — allow writing rather than blocking indefinitely
    }

    return true;
  }

  // ── Layer 2: row-count regression check ───────────────────────────────────
  // Only meaningful when we have a prior backup to compare against.
  if (latestUri) {
    try {
      const prevJson = await FileSystem.readAsStringAsync(latestUri);
      const prev = JSON.parse(prevJson);
      const prevAccounts = prev?.data?.accounts?.length ?? 0;
      const prevOperations = prev?.data?.operations?.length ?? 0;
      const prevTotal = prevAccounts + prevOperations;

      // Only fire when the previous snapshot was substantial (>0 rows) and the
      // new one has dropped by more than half.
      if (prevTotal > 0 && newTotal < prevTotal * 0.5) {
        console.warn(
          `[DailyBackup] Suspicious row-count drop: ${prevTotal} → ${newTotal} rows (>${50}% reduction) — skipping write to protect existing backups`,
        );
        return false;
      }
    } catch {
      // Unreadable prior file — don't block the write
    }
  }

  return true;
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

    const [lastDailyDate, lastWeeklyWeek, lastGoodDailyDate] = await Promise.all([
      getPreference(LAST_DAILY_BACKUP_DATE_KEY, null),
      getPreference(LAST_WEEKLY_BACKUP_WEEK_KEY, null),
      getPreference(LAST_GOOD_DAILY_BACKUP_DATE_KEY, null),
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

    // Guard: never overwrite good backups with a snapshot that looks like a DB read failure
    if (!(await isSnapshotValid(backup))) {
      console.warn('[DailyBackup] Snapshot rejected; skipping write to protect existing backups');
      return false;
    }

    const backupJson = JSON.stringify(backup);

    // Layer 3: resolve the pinned URI for the last known-good daily backup so
    // cleanupBackups never evicts it, even if it's outside the normal rotation window.
    const pinnedDailyUri = lastGoodDailyDate
      ? `${DAILY_BACKUP_DIR}daily_${lastGoodDailyDate}.json`
      : null;

    if (needsDaily) {
      const uri = `${DAILY_BACKUP_DIR}daily_${today}.json`;
      await FileSystem.writeAsStringAsync(uri, backupJson);
      await setPreference(LAST_DAILY_BACKUP_DATE_KEY, today);
      // This snapshot passed validation — advance the "last good" pin.
      await setPreference(LAST_GOOD_DAILY_BACKUP_DATE_KEY, today);
      console.log(`[DailyBackup] Daily backup saved: daily_${today}.json`);
      // Pass pinnedDailyUri from *before* this write so we protect the previous
      // good backup during the transition (today's file is already within window).
      await cleanupBackups(await getDailyBackups(), MAX_DAILY_BACKUPS, pinnedDailyUri);
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
