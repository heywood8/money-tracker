/**
 * What the automatic-backup guard compares a new snapshot against, and what it
 * records when it refuses one.
 *
 * `isSnapshotValid` (DailyBackupService) protects existing backups from being
 * overwritten by a snapshot that looks like a failed database read: an empty
 * one, or one that has lost more than half its rows. It used to measure that
 * against the newest backup FILE on disk, which has a trap in it — after a
 * legitimate shrink (restoring an older or partial backup, a reset followed by
 * a small import) every future snapshot is smaller than that file, nothing new
 * is ever written, so the file never moves and the comparison never changes.
 * Backups then stopped for good, announced by nothing but a `console.warn`.
 *
 * A stored baseline fixes both halves: a restore re-anchors it to what was
 * actually restored, and a refusal is recorded where the UI can show it and
 * offer to accept the new size.
 *
 * This module is deliberately tiny and depends only on PreferencesDB, so both
 * BackupRestore and DailyBackupService can import it — they already import each
 * other's neighbourhood, and anything heavier here would be a cycle.
 */
import { getPreference, setPreference } from './PreferencesDB';

const BASELINE_ROWS_KEY = 'backup_baseline_rows';
const LAST_SKIPPED_KEY = 'backup_last_skipped';

/**
 * Row count of a backup, as the guard counts it: accounts + operations.
 *
 * @param {Object} backup - A createBackup()/restore payload.
 * @returns {number}
 */
export const countRows = (backup) => (
  (backup?.data?.accounts?.length ?? 0) + (backup?.data?.operations?.length ?? 0)
);

/**
 * The accepted row count a new snapshot is measured against, or null when none
 * has been recorded yet (a fresh install, or an upgrade from before this
 * existed — the guard falls back to reading the newest backup file there).
 *
 * @returns {Promise<number|null>}
 */
export const getBaselineRows = async () => {
  const stored = await getPreference(BASELINE_ROWS_KEY, null);
  if (stored === null || stored === undefined || stored === '') return null;
  const rows = Number(stored);
  return Number.isFinite(rows) ? rows : null;
};

/**
 * Record the dataset size the guard should now consider normal.
 *
 * Called after a snapshot the guard accepted, and after a RESTORE — that second
 * one is the fix: a restore is the user deliberately choosing a dataset, so its
 * size is legitimate by definition, however much smaller it is.
 *
 * @param {number} rows
 */
export const setBaselineRows = async (rows) => {
  await setPreference(BASELINE_ROWS_KEY, String(rows ?? 0));
};

/**
 * The last refusal, or null when the most recent run was accepted.
 *
 * @returns {Promise<{at: string, baselineRows: number, snapshotRows: number}|null>}
 */
export const getLastSkipped = async () => {
  const raw = await getPreference(LAST_SKIPPED_KEY, null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Record that the guard refused a snapshot, so Settings can say so instead of
 * leaving the user to believe they are backed up.
 *
 * @param {{baselineRows: number, snapshotRows: number}} detail
 */
export const setLastSkipped = async (detail) => {
  await setPreference(LAST_SKIPPED_KEY, JSON.stringify({
    at: new Date().toISOString(),
    baselineRows: detail?.baselineRows ?? 0,
    snapshotRows: detail?.snapshotRows ?? 0,
  }));
};

/** Clear the refusal record. Called whenever a snapshot is accepted. */
export const clearLastSkipped = async () => {
  await setPreference(LAST_SKIPPED_KEY, '');
};

/**
 * Take the current dataset size as the new normal and forget the refusal, so
 * the next run writes. This is what the "accept new baseline" action in
 * Settings calls; the user is telling us the smaller dataset is the real one.
 *
 * @param {number} rows
 */
export const acceptBaseline = async (rows) => {
  await setBaselineRows(rows);
  await clearLastSkipped();
};
