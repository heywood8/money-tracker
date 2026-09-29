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
import { countRows } from './backupBaseline';
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

/**
 * How long, from the date in its name, rotation keeps a backup that holds much
 * more than the newest one (see cleanupDriveBackups): long enough to restore it
 * onto a fresh install, not forever after a deliberate, lasting shrink.
 */
export const DAILY_PROTECTION_DAYS = 30;
export const WEEKLY_PROTECTION_DAYS = 84;

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * How small a backup may be, relative to one already in Drive, before it is no
 * longer allowed to take that one's place — the same 50% floor as the local
 * snapshot guard (isSnapshotValid).
 *
 * The local guard measures against local history, and a fresh install (a new
 * phone, a reinstall) has none: turning the Drive backup on before restoring
 * used to replace today's and this week's files with a near-empty snapshot, and
 * the rotation then deleted the old device's dailies one per day. So both the
 * overwrite and the rotation measure against what is in Drive — by the row
 * count every upload records on its file (ROWS_PROPERTY), and by byte size for
 * a file uploaded before that existed.
 */
const SHRINK_GUARD_RATIO = 0.5;

/**
 * The Drive `appProperties` key each upload records its snapshot's row count
 * under: accounts + operations, the measure the local guard uses (countRows),
 * so both guards agree on what "much smaller" means. Categories are left out on
 * purpose — a fresh install seeds a whole tree of them.
 *
 * Bytes alone mislead for the database: a fresh install's .db is schema pages
 * and seed data, never vacuumed, and often weighs more than half a light user's
 * real one, while holding none of their operations.
 */
const ROWS_PROPERTY = 'pennyRows';

/**
 * Whether `size` is too small to replace `remoteSize` — bytes, or rows. An
 * unknown measure on either side never blocks: the guard only acts on a
 * measured drop.
 * @param {number|string} size
 * @param {number|string} remoteSize - Drive reports sizes as strings
 * @returns {boolean}
 */
const isMuchSmaller = (size, remoteSize) => {
  const local = Number(size);
  const remote = Number(remoteSize);
  if (!Number.isFinite(local) || !Number.isFinite(remote) || remote <= 0) return false;
  return local < remote * SHRINK_GUARD_RATIO;
};

/**
 * The row count a Drive file was uploaded with, or null for one uploaded before
 * ROWS_PROPERTY existed.
 * @param {{appProperties?: Object}} file
 * @returns {number|null}
 */
const rowsOf = (file) => {
  const value = file?.appProperties?.[ROWS_PROPERTY];
  if (value === undefined || value === null || value === '') return null;
  const rows = Number(value);
  return Number.isFinite(rows) ? rows : null;
};

/**
 * Whether Drive file `candidate` holds too little to take `reference`'s place:
 * by the row count when both carry one, by byte size otherwise.
 * @param {{size?: string, appProperties?: Object}} candidate
 * @param {{size?: string, appProperties?: Object}} reference
 * @returns {boolean}
 */
const holdsMuchLess = (candidate, reference) => {
  const candidateRows = rowsOf(candidate);
  const referenceRows = rowsOf(reference);
  if (candidateRows !== null && referenceRows !== null) {
    return isMuchSmaller(candidateRows, referenceRows);
  }
  return isMuchSmaller(candidate.size, reference.size);
};

/**
 * UTF-8 byte length of a string — what Drive will report as the file's size.
 * @param {string} text
 * @returns {number}
 */
const utf8ByteLength = (text) => {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one 4-byte character.
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
};

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
 * Escape a value for interpolation into a Drive `q=` search string.
 *
 * Backslash first, then the quote: Drive's query grammar escapes with a
 * backslash, so a name ending in one ("Backups\") would otherwise have its own
 * trailing backslash escape the closing quote and swallow the rest of the query.
 * Quoting alone is not enough — that is the whole bug.
 * @param {string} value
 * @returns {string}
 */
const escapeDriveQueryValue = (value) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'");

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

  const escapedName = escapeDriveQueryValue(folderName);
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
 * @returns {Promise<Array<{id: string, name: string, size?: string, appProperties?: Object}>>}
 */
export const listBackupFiles = async (accessToken, folderId) => {
  const query = `'${folderId}' in parents and trashed=false`;
  const response = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name,size,appProperties)&pageSize=1000&orderBy=name`,
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
 * @returns {Promise<{id: string, size?: string, appProperties?: Object}|null>} The file, or null
 */
const findFileByName = async (accessToken, folderId, name) => {
  const escapedName = escapeDriveQueryValue(name);
  const query = `'${folderId}' in parents and name='${escapedName}' and trashed=false`;
  const response = await fetch(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,size,appProperties)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw await driveError(response);
  const { files } = await response.json();
  return files && files.length > 0 ? files[0] : null;
};

/**
 * Upload a text document (JSON or CSV) in one multipart request.
 *
 * Text goes through fetch rather than a file upload because the content is
 * already a string in memory — writing it to disk first would buy nothing.
 *
 * Whether the upload may replace a file of the same name is decided before
 * this is called, for the whole snapshot at once (see uploadSnapshot).
 * @param {string} accessToken
 * @param {Object} params
 * @param {string} params.folderId
 * @param {string} params.name
 * @param {string} params.mimeType
 * @param {string} params.content
 * @param {?Object} [params.existing] - the file already under `name`, when the
 *   caller has looked it up (null: none); looked up here when omitted
 * @param {Object} [params.appProperties] - recorded on the file (see ROWS_PROPERTY)
 * @returns {Promise<string>} File id
 */
export const uploadTextFile = async (accessToken, {
  folderId, name, mimeType, content, existing, appProperties,
}) => {
  const current = existing === undefined
    ? await findFileByName(accessToken, folderId, name)
    : existing;
  const existingId = current?.id ?? null;
  const boundary = `penny-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // A PATCH must not carry `parents` — Drive rejects it there and takes moves
  // through addParents/removeParents instead. The file is already in the folder.
  const metadata = existingId
    ? { name, mimeType }
    : { name, mimeType, parents: [folderId] };
  if (appProperties) metadata.appProperties = appProperties;

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
 *
 * A media upload carries no metadata, so on a file that already exists the
 * `appProperties` go in a metadata PATCH once the bytes have landed; a new
 * file gets them with its create.
 * @param {string} accessToken
 * @param {Object} params
 * @param {string} params.folderId
 * @param {string} params.name
 * @param {string} params.mimeType
 * @param {string} params.fileUri
 * @param {?Object} [params.existing] - as for uploadTextFile
 * @param {Object} [params.appProperties] - as for uploadTextFile
 * @returns {Promise<string>} File id
 */
export const uploadBinaryFile = async (accessToken, {
  folderId, name, mimeType, fileUri, existing, appProperties,
}) => {
  const current = existing === undefined
    ? await findFileByName(accessToken, folderId, name)
    : existing;
  let fileId = current?.id ?? null;
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
      body: JSON.stringify({
        name, mimeType, parents: [folderId], ...(appProperties ? { appProperties } : {}),
      }),
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

  if (!createdHere && appProperties) {
    const metadataResponse = await fetch(`${DRIVE_API}/${fileId}?fields=id`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appProperties }),
    });
    if (!metadataResponse.ok) throw await driveError(metadataResponse);
  }

  return fileId;
};

/**
 * The day a backup's name dates it to, as a UTC timestamp: the date of a daily
 * (`…_YYYY-MM-DD.ext`), the Monday of a weekly's ISO week (`…_YYYY-Www.ext`).
 * @param {string} name
 * @returns {number|null} null for a name carrying neither
 */
const backupDateOf = (name) => {
  const day = /_(\d{4})-(\d{2})-(\d{2})\./.exec(name);
  if (day) return Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  const week = /_(\d{4})-W(\d{2})\./.exec(name);
  if (week) {
    // 4 January always falls in ISO week 1, so its week's Monday anchors the count.
    const jan4 = Date.UTC(Number(week[1]), 0, 4);
    const weekOneMonday = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * DAY_MS;
    return weekOneMonday + (Number(week[2]) - 1) * 7 * DAY_MS;
  }
  return null;
};

/**
 * Delete the oldest files until at most `maxToKeep` remain in each group.
 *
 * Grouping is by prefix *and* extension: three formats each rotate over their own
 * window, so turning CSV on later does not push seven days of JSON out of the
 * folder. Only files this service names are ever considered — anything else the
 * user put in the folder is left alone.
 *
 * A file holding much more than the group's newest (see holdsMuchLess) is kept
 * past the window for `protectDays` from the date in its name: the newest is
 * the dataset as it stands now, and one that small next to an older backup is a
 * fresh install (or a second device on the same account) whose uploads would
 * otherwise push the real backups out one per day. That leaves time to restore
 * one. After it the file rotates like any other — the smaller dataset may be a
 * deliberate, lasting one, and the newest backup would then never be full-size
 * again. Meanwhile the group runs past `maxToKeep` by at most the protected
 * files, since the smaller ones keep rotating.
 * @param {string} accessToken
 * @param {string} folderId
 * @param {string} prefix - 'penny_daily_' or 'penny_weekly_'
 * @param {number} maxToKeep
 * @param {number} [protectDays=DAILY_PROTECTION_DAYS]
 */
export const cleanupDriveBackups = async (
  accessToken, folderId, prefix, maxToKeep, protectDays = DAILY_PROTECTION_DAYS,
) => {
  const today = backupDateOf(`_${getTodayDateString()}.`);
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
    const newest = group[group.length - 1];
    const excess = group.slice(0, Math.max(0, group.length - maxToKeep));
    for (const file of excess) {
      const fileDate = backupDateOf(file.name);
      const withinProtection = fileDate !== null && today !== null
        && (today - fileDate) / DAY_MS <= protectDays;
      if (withinProtection && holdsMuchLess(newest, file)) {
        console.warn(`[DriveBackup] Keeping ${file.name}: it holds much more than the newest backup, ${newest.name}`);
        continue;
      }
      await deleteDriveFile(accessToken, file.id, file.name);
    }
  }
};

/**
 * Build every selected format from one snapshot and upload it under `label`.
 *
 * One snapshot serves all three files so the JSON, CSV and database copies of a
 * given day describe the same instant rather than three reads seconds apart.
 *
 * Whether it may replace files already under those names is decided once, for
 * the snapshot as a whole: if ANY of its formats holds much less than the file
 * it would replace, none is uploaded. Deciding per file let the one format
 * whose measure misleads (bytes, for a never-vacuumed .db) through while the
 * others were refused — and that .db then took a real backup's slot.
 * @param {string} accessToken
 * @param {Object} params
 * @returns {Promise<{uploaded: string[], kept: string[]}>} Names of the uploaded
 *   files, and of the ones not uploaded because a much larger backup holds the slot
 */
const uploadSnapshot = async (accessToken, { folderId, label, backup, formats, onProgress }) => {
  const rows = countRows(backup);
  const appProperties = { [ROWS_PROPERTY]: String(rows) };
  const targets = formats.map((format) => {
    const { ext, mimeType } = FORMAT_META[format];
    return { format, mimeType, name: `penny_${label}.${ext}`, existing: null };
  });

  // Each built at most once, and only when something needs it — the byte-size
  // comparison against a file uploaded before ROWS_PROPERTY, or the upload.
  const contents = new Map();
  const contentOf = (format) => {
    if (!contents.has(format)) {
      contents.set(format, format === 'json' ? JSON.stringify(backup) : buildCombinedCSV(backup));
    }
    return contents.get(format);
  };
  let stagedUri = null;
  const stageDatabase = async (name) => {
    if (stagedUri) return stagedUri;
    // Staged on disk: the upload streams from a file, and copying the live
    // database also gets the WAL checkpointed into it.
    const dirInfo = await FileSystem.getInfoAsync(STAGING_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(STAGING_DIR, { intermediates: true });
    }
    stagedUri = `${STAGING_DIR}${name}`;
    await writeSQLiteSnapshot(stagedUri);
    return stagedUri;
  };
  const localBytes = async (target) => (target.format === 'sqlite'
    ? (await FileSystem.getInfoAsync(await stageDatabase(target.name))).size
    : utf8ByteLength(contentOf(target.format)));

  try {
    throwIfCancelled();
    for (const target of targets) {
      target.existing = await findFileByName(accessToken, folderId, target.name);
    }

    for (const target of targets) {
      if (!target.existing) continue;
      const remoteRows = rowsOf(target.existing);
      const refused = remoteRows !== null
        ? isMuchSmaller(rows, remoteRows)
        : isMuchSmaller(await localBytes(target), target.existing.size);
      if (refused) {
        const measure = remoteRows !== null
          ? `${remoteRows} rows against ${rows}`
          : `${target.existing.size} bytes`;
        console.warn(`[DriveBackup] Keeping the ${label} backup in Drive: ${target.name} holds much more (${measure})`);
        return { uploaded: [], kept: targets.map(t => t.name) };
      }
    }

    const uploaded = [];
    for (let index = 0; index < targets.length; index += 1) {
      // Between files, not inside one: a format already uploaded stays uploaded,
      // and the one being streamed finishes rather than landing truncated.
      throwIfCancelled();

      const { format, mimeType, name, existing } = targets[index];
      onProgress?.({ phase: 'uploading', format, current: index + 1, total: targets.length, name });

      if (format === 'sqlite') {
        const fileUri = await stageDatabase(name);
        await uploadBinaryFile(accessToken, { folderId, name, mimeType, fileUri, existing, appProperties });
      } else {
        await uploadTextFile(accessToken, {
          folderId, name, mimeType, content: contentOf(format), existing, appProperties,
        });
        contents.delete(format);
      }
      uploaded.push(name);
    }
    return { uploaded, kept: [] };
  } finally {
    // Always reclaim the staged copy, including when the upload threw — a
    // whole database left behind on every failed run adds up fast.
    if (stagedUri) await FileSystem.deleteAsync(stagedUri, { idempotent: true }).catch(() => {});
  }
};

// True while a run is in flight. The guard lives here rather than in the React
// context because the scheduled run starts at app launch, before any provider is
// mounted: two runs would otherwise race on the same filenames, build two
// snapshots at once, and have the first one's "done" event clear the indicator
// while the second was still uploading.
let runInFlight = false;

/**
 * Cancellation.
 *
 * A run is a sequence of awaits — build the snapshot, upload one file per
 * format, rotate old copies — so stopping it means not starting the next step
 * rather than tearing down the one in flight: a half-written Drive upload would
 * leave a truncated file under a name the rotation trusts. The flag is read at
 * each checkpoint and unwinds the run through the normal error path, which is
 * also why it is a module-level flag and not an AbortController: the run the
 * user cancels may be the one started at app launch, before any React tree that
 * could hold a controller exists.
 *
 * So a cancel is a request, not a stop: the file being streamed when it lands
 * finishes, and a run whose last file has already landed finishes too. Nothing
 * in the UI waits on the run to acknowledge it (see OperationsScreen).
 */
const CANCELLED_CODE = 'cancelled';

class BackupCancelledError extends Error {
  constructor() {
    super(CANCELLED_CODE);
    this.name = 'BackupCancelledError';
  }
}

let cancelRequested = false;

const throwIfCancelled = () => {
  if (cancelRequested) throw new BackupCancelledError();
};

/**
 * Ask the run in flight to stop at its next checkpoint.
 *
 * Returns false when there is nothing to cancel, so a caller can tell a request
 * that will produce a 'cancelled' event from one that will produce nothing.
 * @returns {boolean}
 */
export const cancelDriveBackup = () => {
  if (!runInFlight) return false;
  cancelRequested = true;
  return true;
};

/**
 * Run the Drive backup.
 *
 * `mode` is 'auto' for the scheduled run (which skips when the day and week are
 * already covered) or 'manual' for the "back up now" button, which always writes
 * a timestamped file and never touches the daily/weekly rotation.
 *
 * Never throws: the caller is app startup or a button, and neither should be able
 * to break on a network hiccup — a cancel included, which comes back as a
 * 'cancelled' status rather than a rejection. The outcome is reported through
 * the progress event and the stored last-result instead.
 *
 * @param {Object} options
 * @param {'auto'|'manual'} [options.mode]
 * @param {() => Promise<string>} options.getAccessToken - Supplies a valid token
 * @returns {Promise<{status: 'success'|'skipped'|'error'|'cancelled', files?: string[], error?: string}>}
 */
export const performDriveBackup = async ({ mode = 'auto', getAccessToken }) => {
  const onProgress = (payload) => emitProgress({ mode, ...payload });

  if (runInFlight) {
    console.log('[DriveBackup] A backup is already running, skipping');
    return { status: 'skipped', reason: 'already_running' };
  }
  runInFlight = true;
  // Cleared here rather than in `finally` as well: a cancel that lands between
  // two runs must not carry over and kill the next one before it starts.
  cancelRequested = false;

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
    throwIfCancelled();
    onProgress({ phase: 'folder' });
    const accessToken = await getAccessToken();

    throwIfCancelled();
    onProgress({ phase: 'preparing' });
    const backup = await createBackup();

    throwIfCancelled();

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
    const kept = [];
    const upload = async (label) => {
      const run = await uploadSnapshot(accessToken, { folderId, label, backup, formats, onProgress });
      uploaded.push(...run.uploaded);
      kept.push(...run.kept);
    };

    if (mode === 'manual') {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${today}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      await upload(`manual_${stamp}`);
    } else {
      // A file kept in place of this run's still covers its day or week — the
      // marks advance either way, or every launch today would rebuild the
      // snapshot only to be refused again.
      if (needsDaily) {
        await upload(`daily_${today}`);
        await setPreference(PREF_KEYS.DRIVE_BACKUP_LAST_DAILY, today);
      }
      if (needsWeekly) {
        await upload(`weekly_${currentWeek}`);
        await setPreference(PREF_KEYS.DRIVE_BACKUP_LAST_WEEKLY, currentWeek);
      }

      onProgress({ phase: 'cleanup' });
      // Rotation runs after the marks are set, so a failure here cannot make the
      // next launch re-upload files that are already safely in Drive. Manual
      // backups are deliberately not rotated — same contract as the local ones.
      //
      // Deliberately past the last checkpoint: every file has landed by now, so
      // the run is a success whatever the user tapped a second ago, and honouring
      // a cancel here would both report a finished backup as cancelled and leave
      // the folder unrotated for a day (the next launch sees the marks and skips).
      await cleanupDriveBackups(accessToken, folderId, 'penny_daily_', MAX_DAILY_BACKUPS, DAILY_PROTECTION_DAYS);
      await cleanupDriveBackups(accessToken, folderId, 'penny_weekly_', MAX_WEEKLY_BACKUPS, WEEKLY_PROTECTION_DAYS);
    }

    if (uploaded.length === 0 && kept.length > 0) {
      // Every file was refused in favour of a much larger one already in Drive:
      // reporting that as a successful backup would tell the user their data is
      // safe when nothing of theirs was uploaded.
      const result = { status: 'skipped', reason: 'remote_larger', at: new Date().toISOString() };
      await setLastDriveBackupResult(result);
      onProgress({ phase: 'skipped', reason: 'remote_larger' });
      return result;
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
    if (error instanceof BackupCancelledError) {
      // Whatever the run had already uploaded stays in Drive, and the daily /
      // weekly marks for those files are already set — the next scheduled run
      // picks up exactly where this one stopped.
      console.log('[DriveBackup] Backup cancelled by the user');
      const result = { status: CANCELLED_CODE, at: new Date().toISOString() };
      await setLastDriveBackupResult(result).catch(() => {});
      onProgress({ phase: CANCELLED_CODE });
      return result;
    }
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
