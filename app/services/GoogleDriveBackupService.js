/**
 * Google Drive automatic backup service.
 *
 * The middle ground between the local daily backups (automatic, but lost with the
 * phone) and the Google Sheets export (off-device, but manual and not restorable
 * one-for-one): the same snapshot the local rotation writes, uploaded to a folder
 * on the user's Drive on the same day/week schedule.
 *
 * Scope note — the app holds `drive.file`, which grants access only to files it
 * created itself. That is why the destination is a folder this service creates
 * rather than one the user picks: listing or writing an arbitrary existing folder
 * would need the restricted `drive` scope and Google app verification. The folder
 * is tracked by id, so the user may freely rename or move it in Drive afterwards.
 *
 * Off by default. Nothing here runs until the user turns it on.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { createBackup, buildCombinedCSV, writeSQLiteSnapshot } from './BackupRestore';
import {
  getTodayDateString,
  getISOWeekString,
  isSnapshotValid,
} from './DailyBackupService';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';
import { appEvents } from './eventEmitter';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Emitted as the run advances so the UI can show a live status. */
export const DRIVE_BACKUP_PROGRESS_EVENT = 'driveBackup:progress';

/** Default name for the folder the service creates on first use. */
export const DEFAULT_FOLDER_NAME = 'Penny Backups';

/** Rotation windows, mirroring the local backups so both stores age alike. */
export const MAX_DAILY_BACKUPS = 7;
export const MAX_WEEKLY_BACKUPS = 15;

/** The three formats a run can upload, in the order they are written. */
export const BACKUP_FORMATS = ['json', 'csv', 'sqlite'];

const FORMAT_META = {
  json: { ext: 'json', mimeType: 'application/json' },
  csv: { ext: 'csv', mimeType: 'text/csv' },
  sqlite: { ext: 'db', mimeType: 'application/x-sqlite3' },
};

// Scratch directory for the SQLite snapshot, which unlike JSON and CSV has to
// exist as a file on disk before it can be uploaded.
const STAGING_DIR = `${FileSystem.documentDirectory}drive_backup_tmp/`;

/**
 * Translate a failed Drive response into one of the error codes the UI maps to a
 * message. Anything unrecognised keeps the HTTP status so logs stay useful.
 * @param {Response} response
 * @returns {Promise<Error>}
 */
const driveError = async (response) => {
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    // Body already consumed or unreadable — the status alone still identifies it.
  }
  if (response.status === 401) return new Error('auth_expired');
  if (response.status === 403) {
    // 403 covers both "out of quota" and "storage full"; they need different
    // fixes, so tell them apart by the reason Drive puts in the body.
    if (/storageQuotaExceeded/i.test(detail)) return new Error('storage_full');
    return new Error('quota_exceeded');
  }
  if (response.status === 404) return new Error('folder_missing');
  return new Error(`drive_request_failed_${response.status}: ${detail.slice(0, 200)}`);
};

/**
 * Emit a progress update. Purely advisory — nothing waits on a listener.
 * @param {Object} payload
 */
const emitProgress = (payload) => {
  appEvents.emit(DRIVE_BACKUP_PROGRESS_EVENT, payload);
};

/**
 * Whether the user has turned the Drive auto-export on. Off unless explicitly set.
 * @returns {Promise<boolean>}
 */
export const isDriveBackupEnabled = async () => {
  const value = await getPreference(PREF_KEYS.DRIVE_BACKUP_ENABLED, 'false');
  return value === 'true';
};

/**
 * Turn the Drive auto-export on or off.
 * @param {boolean} enabled
 */
export const setDriveBackupEnabled = async (enabled) => {
  await setPreference(PREF_KEYS.DRIVE_BACKUP_ENABLED, enabled ? 'true' : 'false');
};

/**
 * Which formats a run uploads. Defaults to all three; an empty or unparsable
 * stored value falls back to the default rather than silently uploading nothing.
 * @returns {Promise<string[]>}
 */
export const getDriveBackupFormats = async () => {
  const raw = await getPreference(PREF_KEYS.DRIVE_BACKUP_FORMATS, null);
  if (!raw) return [...BACKUP_FORMATS];
  try {
    const parsed = JSON.parse(raw);
    const valid = Array.isArray(parsed) ? parsed.filter(f => BACKUP_FORMATS.includes(f)) : [];
    return valid.length > 0 ? valid : [...BACKUP_FORMATS];
  } catch {
    return [...BACKUP_FORMATS];
  }
};

/**
 * Persist the chosen formats. Storing an empty list is treated as "all three" on
 * read, so the feature can never end up enabled but uploading nothing.
 * @param {string[]} formats
 */
export const setDriveBackupFormats = async (formats) => {
  const valid = (formats || []).filter(f => BACKUP_FORMATS.includes(f));
  await setPreference(PREF_KEYS.DRIVE_BACKUP_FORMATS, JSON.stringify(valid));
};

/**
 * The outcome of the last run, for the status line in settings.
 * @returns {Promise<{status: string, at: string, error?: string, files?: number}|null>}
 */
export const getLastDriveBackupResult = async () => {
  const raw = await getPreference(PREF_KEYS.DRIVE_BACKUP_LAST_RESULT, null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const setLastDriveBackupResult = async (result) => {
  await setPreference(PREF_KEYS.DRIVE_BACKUP_LAST_RESULT, JSON.stringify(result));
};

/**
 * Resolve the destination folder, creating it the first time.
 *
 * Three steps, cheapest first: the remembered id (re-validated, because the user
 * may have deleted the folder in Drive), then a search by name among the files
 * this app created, then a fresh folder. The id is what is stored — renaming or
 * moving the folder in Drive does not break the binding.
 * @param {string} accessToken
 * @param {string} [folderName]
 * @returns {Promise<string>} Folder id
 */
export const ensureBackupFolder = async (accessToken, folderName = DEFAULT_FOLDER_NAME) => {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const storedId = await getPreference(PREF_KEYS.DRIVE_BACKUP_FOLDER_ID, null);
  if (storedId) {
    const response = await fetch(
      `${DRIVE_API}/${storedId}?fields=id,trashed`,
      { headers },
    );
    if (response.ok) {
      const file = await response.json();
      if (!file.trashed) return file.id;
    } else if (response.status !== 404) {
      // Only a 404 proves the folder is gone. A 401, a rate limit or a 5xx say
      // nothing about it, and falling through on those would create a second
      // "Penny Backups", rebind the stored id and orphan every earlier backup —
      // the failure mode a user who renamed their folder would never spot.
      throw await driveError(response);
    }
    // 404 or trashed: the folder really is gone, so make a new one.
    console.log('[DriveBackup] Stored folder is gone, recreating');
  }

  // Escape single quotes so a renamed folder cannot break the query syntax.
  const escapedName = folderName.replace(/'/g, "\\'");
  const query = `mimeType='${FOLDER_MIME}' and name='${escapedName}' and trashed=false`;
  const searchResponse = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10`,
    { headers },
  );
  if (!searchResponse.ok) throw await driveError(searchResponse);
  const { files } = await searchResponse.json();
  if (files && files.length > 0) {
    await setPreference(PREF_KEYS.DRIVE_BACKUP_FOLDER_ID, files[0].id);
    return files[0].id;
  }

  const createResponse = await fetch(`${DRIVE_API}?fields=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: FOLDER_MIME }),
  });
  if (!createResponse.ok) throw await driveError(createResponse);
  const created = await createResponse.json();
  await setPreference(PREF_KEYS.DRIVE_BACKUP_FOLDER_ID, created.id);
  console.log('[DriveBackup] Created backup folder:', created.id);
  return created.id;
};

/**
 * Delete one file, reporting rather than raising when it cannot be removed.
 *
 * Every caller is tidying up — rotating old backups, or withdrawing a file whose
 * upload failed — and in neither case should a delete that does not go through
 * turn into the run's failure.
 * @param {string} accessToken
 * @param {string} fileId
 * @param {string} [name] - For the log line only
 */
const deleteDriveFile = async (accessToken, fileId, name = fileId) => {
  try {
    const response = await fetch(`${DRIVE_API}/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok || response.status === 404) {
      console.log('[DriveBackup] Deleted file:', name);
    } else {
      console.warn('[DriveBackup] Failed to delete', name, response.status);
    }
  } catch (error) {
    console.warn('[DriveBackup] Failed to delete', name, error);
  }
};

/**
 * Every file the app put in the backup folder, newest last.
 * @param {string} accessToken
 * @param {string} folderId
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export const listBackupFiles = async (accessToken, folderId) => {
  const query = `'${folderId}' in parents and trashed=false`;
  const response = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1000&orderBy=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw await driveError(response);
  const { files } = await response.json();
  return files || [];
};

/**
 * Look up a file by exact name inside the folder, so a re-run of the same day
 * replaces its file instead of leaving two copies with identical names — Drive
 * allows duplicate names, so nothing else prevents that.
 * @param {string} accessToken
 * @param {string} folderId
 * @param {string} name
 * @returns {Promise<string|null>} File id, or null
 */
const findFileIdByName = async (accessToken, folderId, name) => {
  const escapedName = name.replace(/'/g, "\\'");
  const query = `'${folderId}' in parents and name='${escapedName}' and trashed=false`;
  const response = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw await driveError(response);
  const { files } = await response.json();
  return files && files.length > 0 ? files[0].id : null;
};

/**
 * Upload a text document (JSON or CSV) in one multipart request.
 *
 * Text goes through fetch rather than a file upload because the content is
 * already a string in memory — writing it to disk first would buy nothing.
 * @param {string} accessToken
 * @param {{folderId: string, name: string, mimeType: string, content: string}} params
 * @returns {Promise<string>} File id
 */
export const uploadTextFile = async (accessToken, { folderId, name, mimeType, content }) => {
  const existingId = await findFileIdByName(accessToken, folderId, name);
  const boundary = `penny-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // A PATCH must not carry `parents` — Drive rejects it there and takes moves
  // through addParents/removeParents instead. The file is already in the folder.
  const metadata = existingId
    ? { name, mimeType }
    : { name, mimeType, parents: [folderId] };

  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const url = existingId
    ? `${DRIVE_UPLOAD_API}/${existingId}?uploadType=multipart&fields=id`
    : `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`;

  const response = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) throw await driveError(response);
  const { id } = await response.json();
  return id;
};

/**
 * Upload a file from disk (the SQLite snapshot) as raw bytes.
 *
 * Two requests rather than one multipart: the metadata goes as JSON, then the
 * bytes stream straight off disk via uploadAsync. Reading the database into a
 * base64 string to build a multipart body is what makes large files run the app
 * out of memory (see the base64 notes in AppUpdateService), and uploadAsync
 * never materialises the file in JS at all.
 * @param {string} accessToken
 * @param {{folderId: string, name: string, mimeType: string, fileUri: string}} params
 * @returns {Promise<string>} File id
 */
export const uploadBinaryFile = async (accessToken, { folderId, name, mimeType, fileUri }) => {
  let fileId = await findFileIdByName(accessToken, folderId, name);
  // Whether this call is what brought the file into existence, which decides
  // whether a failed upload should take it away again.
  const createdHere = !fileId;

  if (!fileId) {
    const createResponse = await fetch(`${DRIVE_API}?fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, mimeType, parents: [folderId] }),
    });
    if (!createResponse.ok) throw await driveError(createResponse);
    ({ id: fileId } = await createResponse.json());
  }

  const uploadResult = await FileSystem.uploadAsync(
    `${DRIVE_UPLOAD_API}/${fileId}?uploadType=media&fields=id`,
    fileUri,
    {
      httpMethod: 'PATCH',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
    },
  );

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    if (createdHere) {
      // The metadata landed but the bytes did not, leaving an empty file that
      // carries a perfectly good backup's name — and would later take a real
      // backup's place in the rotation window. Take it back out.
      await deleteDriveFile(accessToken, fileId, name);
    }
    // uploadAsync returns a plain result rather than throwing, so map it onto
    // the same codes the fetch paths produce.
    throw await driveError({
      status: uploadResult.status,
      text: async () => uploadResult.body || '',
    });
  }

  return fileId;
};

/**
 * Delete the oldest files until at most `maxToKeep` remain in each group.
 *
 * Grouping is by prefix *and* extension: three formats each rotate over their own
 * window, so turning CSV on later does not push seven days of JSON out of the
 * folder. Only files this service names are ever considered — anything else the
 * user put in the folder is left alone.
 * @param {string} accessToken
 * @param {string} folderId
 * @param {string} prefix - 'penny_daily_' or 'penny_weekly_'
 * @param {number} maxToKeep
 */
export const cleanupDriveBackups = async (accessToken, folderId, prefix, maxToKeep) => {
  const files = await listBackupFiles(accessToken, folderId);

  const byExtension = {};
  for (const file of files) {
    if (!file.name.startsWith(prefix)) continue;
    const ext = file.name.split('.').pop();
    (byExtension[ext] ||= []).push(file);
  }

  for (const group of Object.values(byExtension)) {
    // Names embed a sortable date (YYYY-MM-DD / YYYY-Www), so lexical order is
    // chronological order and the excess is always at the front.
    group.sort((a, b) => a.name.localeCompare(b.name));
    const excess = group.slice(0, Math.max(0, group.length - maxToKeep));
    for (const file of excess) {
      await deleteDriveFile(accessToken, file.id, file.name);
    }
  }
};

/**
 * Build every selected format from one snapshot and upload it under `label`.
 *
 * One snapshot serves all three files so the JSON, CSV and database copies of a
 * given day describe the same instant rather than three reads seconds apart.
 * @param {string} accessToken
 * @param {Object} params
 * @returns {Promise<string[]>} Names of the uploaded files
 */
const uploadSnapshot = async (accessToken, { folderId, label, backup, formats, onProgress }) => {
  const uploaded = [];
  const total = formats.length;

  for (let index = 0; index < formats.length; index += 1) {
    const format = formats[index];
    const { ext, mimeType } = FORMAT_META[format];
    const name = `penny_${label}.${ext}`;

    onProgress?.({ phase: 'uploading', format, current: index + 1, total, name });

    if (format === 'sqlite') {
      // Staged on disk first: the upload streams from a file, and copying the
      // live database also gets the WAL checkpointed into it.
      const dirInfo = await FileSystem.getInfoAsync(STAGING_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(STAGING_DIR, { intermediates: true });
      }
      const stagedUri = `${STAGING_DIR}${name}`;
      try {
        await writeSQLiteSnapshot(stagedUri);
        await uploadBinaryFile(accessToken, { folderId, name, mimeType, fileUri: stagedUri });
      } finally {
        // Always reclaim the staged copy, including when the upload threw —
        // a whole database left behind on every failed run adds up fast.
        await FileSystem.deleteAsync(stagedUri, { idempotent: true }).catch(() => {});
      }
    } else {
      const content = format === 'json'
        ? JSON.stringify(backup)
        : buildCombinedCSV(backup);
      await uploadTextFile(accessToken, { folderId, name, mimeType, content });
    }

    uploaded.push(name);
  }

  return uploaded;
};

// True while a run is in flight. The guard lives here rather than in the React
// context because the scheduled run starts at app launch, before any provider is
// mounted: two runs would otherwise race on the same filenames, build two
// snapshots at once, and have the first one's "done" event clear the indicator
// while the second was still uploading.
let runInFlight = false;

/**
 * Run the Drive backup.
 *
 * `mode` is 'auto' for the scheduled run (which skips when the day and week are
 * already covered) or 'manual' for the "back up now" button, which always writes
 * a timestamped file and never touches the daily/weekly rotation.
 *
 * Never throws: the caller is app startup or a button, and neither should be able
 * to break on a network hiccup. The outcome is reported through the progress
 * event and the stored last-result instead.
 *
 * @param {Object} options
 * @param {'auto'|'manual'} [options.mode]
 * @param {() => Promise<string>} options.getAccessToken - Supplies a valid token
 * @returns {Promise<{status: 'success'|'skipped'|'error', files?: string[], error?: string}>}
 */
export const performDriveBackup = async ({ mode = 'auto', getAccessToken }) => {
  const onProgress = (payload) => emitProgress({ mode, ...payload });

  if (runInFlight) {
    console.log('[DriveBackup] A backup is already running, skipping');
    return { status: 'skipped', reason: 'already_running' };
  }
  runInFlight = true;

  try {
    // The toggle governs the *scheduled* run. A manual tap is the user asking
    // for this backup now, so it goes ahead whether or not the schedule is on —
    // otherwise the button is a no-op with nothing to show for it.
    if (mode === 'auto' && !(await isDriveBackupEnabled())) {
      return { status: 'skipped', reason: 'disabled' };
    }

    const formats = await getDriveBackupFormats();
    const today = getTodayDateString();
    const currentWeek = getISOWeekString();

    let needsDaily = true;
    let needsWeekly = false;

    if (mode === 'auto') {
      const [lastDaily, lastWeekly] = await Promise.all([
        getPreference(PREF_KEYS.DRIVE_BACKUP_LAST_DAILY, null),
        getPreference(PREF_KEYS.DRIVE_BACKUP_LAST_WEEKLY, null),
      ]);
      needsDaily = lastDaily !== today;
      needsWeekly = lastWeekly !== currentWeek;
      if (!needsDaily && !needsWeekly) {
        console.log('[DriveBackup] Already uploaded for today and this week, skipping');
        return { status: 'skipped', reason: 'up_to_date' };
      }
    }

    // The token comes first because it is the cheapest thing that can fail and
    // the likeliest: once a Google session is revoked, every launch would
    // otherwise build a full database snapshot only to throw it away.
    onProgress({ phase: 'folder' });
    const accessToken = await getAccessToken();

    onProgress({ phase: 'preparing' });
    const backup = await createBackup();

    // The same guard the local rotation uses: a snapshot that looks like a failed
    // database read must not be uploaded, or it overwrites a good remote copy
    // with an empty one.
    if (!(await isSnapshotValid(backup))) {
      console.warn('[DriveBackup] Snapshot rejected, skipping upload');
      const result = { status: 'skipped', reason: 'invalid_snapshot', at: new Date().toISOString() };
      await setLastDriveBackupResult(result);
      onProgress({ phase: 'skipped', reason: 'invalid_snapshot' });
      return result;
    }

    const folderId = await ensureBackupFolder(accessToken);

    const uploaded = [];

    if (mode === 'manual') {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${today}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      uploaded.push(...await uploadSnapshot(accessToken, {
        folderId, label: `manual_${stamp}`, backup, formats, onProgress,
      }));
    } else {
      if (needsDaily) {
        uploaded.push(...await uploadSnapshot(accessToken, {
          folderId, label: `daily_${today}`, backup, formats, onProgress,
        }));
        await setPreference(PREF_KEYS.DRIVE_BACKUP_LAST_DAILY, today);
      }
      if (needsWeekly) {
        uploaded.push(...await uploadSnapshot(accessToken, {
          folderId, label: `weekly_${currentWeek}`, backup, formats, onProgress,
        }));
        await setPreference(PREF_KEYS.DRIVE_BACKUP_LAST_WEEKLY, currentWeek);
      }

      onProgress({ phase: 'cleanup' });
      // Rotation runs after the marks are set, so a failure here cannot make the
      // next launch re-upload files that are already safely in Drive. Manual
      // backups are deliberately not rotated — same contract as the local ones.
      await cleanupDriveBackups(accessToken, folderId, 'penny_daily_', MAX_DAILY_BACKUPS);
      await cleanupDriveBackups(accessToken, folderId, 'penny_weekly_', MAX_WEEKLY_BACKUPS);
    }

    const result = {
      status: 'success',
      at: new Date().toISOString(),
      files: uploaded.length,
    };
    await setLastDriveBackupResult(result);
    onProgress({ phase: 'done', files: uploaded });
    console.log(`[DriveBackup] Uploaded ${uploaded.length} file(s):`, uploaded.join(', '));
    return { ...result, files: uploaded };
  } catch (error) {
    const code = error?.message || 'unknown_error';
    console.error('[DriveBackup] Backup failed:', code);
    const result = { status: 'error', at: new Date().toISOString(), error: code };
    // Best-effort: if the database is the thing that is broken, recording the
    // failure will fail too, and that must not mask the original error.
    await setLastDriveBackupResult(result).catch(() => {});
    onProgress({ phase: 'error', error: code });
    return result;
  } finally {
    runInFlight = false;
  }
};

/**
 * Startup entry point: run the scheduled Drive backup if it is due.
 *
 * Deliberately fire-and-forget from the caller's point of view — it resolves
 * immediately to 'skipped' when the feature is off or the user has never signed
 * in, so app startup never waits on the network.
 * @param {() => Promise<string>} getAccessToken
 * @returns {Promise<Object>}
 */
export const performDriveBackupIfNeeded = async (getAccessToken) => {
  if (!(await isDriveBackupEnabled())) {
    return { status: 'skipped', reason: 'disabled' };
  }
  return performDriveBackup({ mode: 'auto', getAccessToken });
};
