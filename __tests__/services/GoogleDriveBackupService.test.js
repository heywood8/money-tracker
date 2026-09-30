/**
 * Tests for GoogleDriveBackupService.js
 *
 * Covers: the enable/format preferences, folder resolution and its recovery when
 * the folder is gone, the daily/weekly schedule gate, rotation per format,
 * upload shapes (multipart for text, streamed for the database), the empty-
 * snapshot guard, and the promise that a failure never escapes to the caller.
 */

import {
  performDriveBackup,
  cancelDriveBackup,
  performDriveBackupIfNeeded,
  ensureBackupFolder,
  cleanupDriveBackups,
  uploadTextFile,
  uploadBinaryFile,
  isDriveBackupEnabled,
  setDriveBackupEnabled,
  getDriveBackupFormats,
  setDriveBackupFormats,
  BACKUP_FORMATS,
  MAX_DAILY_BACKUPS,
  MAX_WEEKLY_BACKUPS,
  DAILY_PROTECTION_DAYS,
  WEEKLY_PROTECTION_DAYS,
  DRIVE_BACKUP_PROGRESS_EVENT,
} from '../../app/services/GoogleDriveBackupService';
import { appEvents } from '../../app/services/eventEmitter';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../app/services/BackupRestore', () => ({
  createBackup: jest.fn(),
  buildCombinedCSV: jest.fn(() => '[ACCOUNTS]\nid,name\nacc-1,Checking\n'),
  writeSQLiteSnapshot: jest.fn(async (uri) => uri),
}));

jest.mock('../../app/services/DailyBackupService', () => ({
  getTodayDateString: jest.fn(() => '2026-02-26'),
  getISOWeekString: jest.fn(() => '2026-W09'),
  isSnapshotValid: jest.fn(async () => true),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
  PREF_KEYS: {
    DRIVE_BACKUP_ENABLED: 'drive_backup_enabled',
    DRIVE_BACKUP_FOLDER_ID: 'drive_backup_folder_id',
    DRIVE_BACKUP_FORMATS: 'drive_backup_formats',
    DRIVE_BACKUP_LAST_DAILY: 'drive_backup_last_daily_date',
    DRIVE_BACKUP_LAST_WEEKLY: 'drive_backup_last_weekly_week',
    DRIVE_BACKUP_LAST_RESULT: 'drive_backup_last_result',
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/document/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(async () => {}),
  uploadAsync: jest.fn(async () => ({ status: 200, body: '{"id":"file-db"}' })),
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

const mockFileSystem = require('expo-file-system/legacy');
const mockBackupRestore = require('../../app/services/BackupRestore');
const mockDailyBackup = require('../../app/services/DailyBackupService');
const mockPreferencesDB = require('../../app/services/PreferencesDB');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = '2026-02-26';
const THIS_WEEK = '2026-W09';
const FOLDER_ID = 'folder-123';

const makeSampleBackup = () => ({
  version: 1,
  timestamp: `${TODAY}T10:00:00.000Z`,
  platform: 'native',
  data: {
    accounts: [{ id: 'acc-1', name: 'Checking', balance: '1000.00', currency: 'USD' }],
    operations: [],
  },
});

const getAccessToken = jest.fn(async () => 'token-abc');

/**
 * Drive responses are matched by URL and method rather than by call order, so a
 * test states only the calls it cares about and stays readable when the service
 * adds a lookup. Each handler returns the JSON body; anything unmatched fails
 * loudly rather than silently resolving to undefined.
 */
const routeFetch = (handlers) => {
  global.fetch = jest.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    for (const handler of handlers) {
      if (handler.method && handler.method !== method) continue;
      if (!handler.match(url)) continue;
      const status = handler.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => handler.body ?? {},
        text: async () => JSON.stringify(handler.body ?? {}),
      };
    }
    throw new Error(`Unmatched fetch: ${method} ${url}`);
  });
};

// The happy-path route table: an existing folder, no name collisions, uploads
// and deletes that succeed.
const routeHappyPath = ({ existingFiles = [] } = {}) => routeFetch([
  { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
  { method: 'GET', match: (u) => u.includes('in+parents') || u.includes('in%20parents'), body: { files: existingFiles } },
  { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
  { method: 'POST', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'uploaded-file' } },
  { method: 'PATCH', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'uploaded-file' } },
  { method: 'PATCH', match: (u) => u.includes('/drive/v3/files/'), body: { id: 'uploaded-file' } },
  { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'created-file' } },
  { method: 'DELETE', match: (u) => u.includes('/drive/v3/files/'), body: {} },
]);

/** Preference reads, keyed so a test only states what differs from the default. */
const setPreferences = (overrides = {}) => {
  const values = {
    drive_backup_enabled: 'true',
    drive_backup_folder_id: FOLDER_ID,
    drive_backup_formats: null,
    drive_backup_last_daily_date: null,
    drive_backup_last_weekly_week: null,
    drive_backup_last_result: null,
    backup_restored_on: null,
    ...overrides,
  };
  mockPreferencesDB.getPreference.mockImplementation(async (key, fallback = null) =>
    (values[key] !== undefined && values[key] !== null ? values[key] : fallback));
  return values;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBackupRestore.createBackup.mockResolvedValue(makeSampleBackup());
  mockBackupRestore.writeSQLiteSnapshot.mockImplementation(async (uri) => uri);
  mockDailyBackup.isSnapshotValid.mockResolvedValue(true);
  mockDailyBackup.getTodayDateString.mockReturnValue(TODAY);
  mockDailyBackup.getISOWeekString.mockReturnValue(THIS_WEEK);
  mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
  mockFileSystem.uploadAsync.mockResolvedValue({ status: 200, body: '{"id":"file-db"}' });
  setPreferences();
  routeHappyPath();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GoogleDriveBackupService', () => {
  describe('Preferences', () => {
    it('is off unless it has been explicitly turned on', async () => {
      setPreferences({ drive_backup_enabled: null });
      expect(await isDriveBackupEnabled()).toBe(false);
    });

    it('reports enabled once the preference says so', async () => {
      setPreferences({ drive_backup_enabled: 'true' });
      expect(await isDriveBackupEnabled()).toBe(true);
    });

    it('persists the toggle as a string flag', async () => {
      await setDriveBackupEnabled(true);
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('drive_backup_enabled', 'true');
      await setDriveBackupEnabled(false);
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('drive_backup_enabled', 'false');
    });

    it('defaults to uploading all three formats', async () => {
      setPreferences({ drive_backup_formats: null });
      expect(await getDriveBackupFormats()).toEqual(BACKUP_FORMATS);
    });

    it('round-trips a narrowed format selection', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify(['json', 'sqlite']) });
      expect(await getDriveBackupFormats()).toEqual(['json', 'sqlite']);
    });

    it('drops unknown formats from a stored selection', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify(['json', 'parquet']) });
      expect(await getDriveBackupFormats()).toEqual(['json']);
    });

    it('falls back to all formats when the stored value is empty or corrupt', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify([]) });
      expect(await getDriveBackupFormats()).toEqual(BACKUP_FORMATS);
      setPreferences({ drive_backup_formats: 'not json' });
      expect(await getDriveBackupFormats()).toEqual(BACKUP_FORMATS);
    });

    it('stores only valid formats', async () => {
      await setDriveBackupFormats(['csv', 'bogus']);
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith(
        'drive_backup_formats', JSON.stringify(['csv']),
      );
    });
  });

  describe('ensureBackupFolder', () => {
    it('reuses the remembered folder without searching or creating', async () => {
      const id = await ensureBackupFolder('token-abc');
      expect(id).toBe(FOLDER_ID);
      const posts = global.fetch.mock.calls.filter(([, o]) => o?.method === 'POST');
      expect(posts).toHaveLength(0);
    });

    it('recreates the folder when the remembered one was deleted', async () => {
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), status: 404, body: {} },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'folder-new' } },
      ]);
      const id = await ensureBackupFolder('token-abc');
      expect(id).toBe('folder-new');
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('drive_backup_folder_id', 'folder-new');
    });

    it('recreates the folder when the remembered one is in the trash', async () => {
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: true } },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'folder-new' } },
      ]);
      expect(await ensureBackupFolder('token-abc')).toBe('folder-new');
    });

    it('adopts an existing folder found by name rather than making a second one', async () => {
      setPreferences({ drive_backup_folder_id: null });
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [{ id: 'folder-found', name: 'Penny Backups' }] } },
      ]);
      expect(await ensureBackupFolder('token-abc')).toBe('folder-found');
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('drive_backup_folder_id', 'folder-found');
    });

    it('creates the folder with the Drive folder mime type', async () => {
      setPreferences({ drive_backup_folder_id: null });
      let createdBody = null;
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        {
          method: 'POST',
          match: (u) => u.includes('/drive/v3/files'),
          body: { id: 'folder-new' },
        },
      ]);
      const originalFetch = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        if (options?.method === 'POST') createdBody = JSON.parse(options.body);
        return originalFetch(url, options);
      });
      await ensureBackupFolder('token-abc');
      expect(createdBody).toEqual({
        name: 'Penny Backups',
        mimeType: 'application/vnd.google-apps.folder',
      });
    });

    it('does not create a second folder when the probe fails transiently', async () => {
      // A rate limit or a 5xx says nothing about whether the folder exists.
      // Falling through would orphan every backup already in the real folder.
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), status: 503, body: {} },
      ]);
      await expect(ensureBackupFolder('token-abc')).rejects.toThrow(/drive_request_failed_503/);
    });

    it('escapes backslashes and quotes in a folder name (CodeQL alert)', async () => {
      // A name ending in a backslash used to have that backslash escape the
      // closing quote of the q= string, swallowing the rest of the query.
      setPreferences({ drive_backup_folder_id: null });
      let searchUrl = null;
      routeFetch([
        { method: 'GET', match: (u) => { searchUrl = u; return u.includes('q='); }, body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'folder-new' } },
      ]);

      await ensureBackupFolder('token-abc', 'Backups\\');

      const query = decodeURIComponent(searchUrl.split('q=')[1].split('&')[0]);
      expect(query).toContain("name='Backups\\\\'");
      // The trailing quote still closes the name, so the rest of the query survives.
      expect(query).toContain('trashed=false');
    });

    it('escapes a folder name containing a quote', async () => {
      setPreferences({ drive_backup_folder_id: null });
      let searchUrl = null;
      routeFetch([
        { method: 'GET', match: (u) => { searchUrl = u; return u.includes('q='); }, body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'folder-new' } },
      ]);

      await ensureBackupFolder('token-abc', "Bob's Backups");

      const query = decodeURIComponent(searchUrl.split('q=')[1].split('&')[0]);
      expect(query).toContain("name='Bob\\'s Backups'");
    });

    it('surfaces an expired token instead of creating a duplicate folder', async () => {
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), status: 401, body: {} },
      ]);
      await expect(ensureBackupFolder('stale-token')).rejects.toThrow('auth_expired');
    });
  });

  describe('uploadTextFile', () => {
    it('creates a new file with the folder as its parent', async () => {
      let request = null;
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'new-file' } },
      ]);
      const original = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        if (options?.method === 'POST') request = { url, options };
        return original(url, options);
      });

      const id = await uploadTextFile('token-abc', {
        folderId: FOLDER_ID, name: 'penny_daily_2026-02-26.json',
        mimeType: 'application/json', content: '{"a":1}',
      });

      expect(id).toBe('new-file');
      expect(request.url).toContain('uploadType=multipart');
      expect(request.options.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
      expect(request.options.body).toContain(`"parents":["${FOLDER_ID}"]`);
      expect(request.options.body).toContain('{"a":1}');
    });

    it('updates the existing file in place when the name is already taken', async () => {
      let request = null;
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [{ id: 'existing-file' }] } },
        { method: 'PATCH', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'existing-file' } },
      ]);
      const original = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        if (options?.method === 'PATCH') request = { url, options };
        return original(url, options);
      });

      const id = await uploadTextFile('token-abc', {
        folderId: FOLDER_ID, name: 'penny_daily_2026-02-26.json',
        mimeType: 'application/json', content: '{"a":1}',
      });

      expect(id).toBe('existing-file');
      expect(request.url).toContain('/upload/drive/v3/files/existing-file');
      // Drive rejects `parents` on an update — a move goes through addParents.
      expect(request.options.body).not.toContain('parents');
    });

    it('maps a full Drive to storage_full rather than a generic quota error', async () => {
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        {
          method: 'POST',
          match: (u) => u.includes('/upload/drive/v3/files'),
          status: 403,
          body: { error: { errors: [{ reason: 'storageQuotaExceeded' }] } },
        },
      ]);
      await expect(uploadTextFile('token-abc', {
        folderId: FOLDER_ID, name: 'x.json', mimeType: 'application/json', content: '{}',
      })).rejects.toThrow('storage_full');
    });
  });

  describe('Scheduling', () => {
    it('uploads a daily and a weekly set on the first run of a new week', async () => {
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result.status).toBe('success');
      // Three formats x (daily + weekly)
      expect(result.files).toEqual([
        'penny_daily_2026-02-26.json',
        'penny_daily_2026-02-26.csv',
        'penny_daily_2026-02-26.db',
        'penny_weekly_2026-W09.json',
        'penny_weekly_2026-W09.csv',
        'penny_weekly_2026-W09.db',
      ]);
    });

    it('uploads only the daily set when the week is already covered', async () => {
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK });
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result.files.every(name => name.includes('daily'))).toBe(true);
    });

    it('does nothing on a second launch the same day', async () => {
      setPreferences({
        drive_backup_last_daily_date: TODAY,
        drive_backup_last_weekly_week: THIS_WEEK,
      });
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result).toEqual({ status: 'skipped', reason: 'up_to_date' });
      expect(mockBackupRestore.createBackup).not.toHaveBeenCalled();
      expect(getAccessToken).not.toHaveBeenCalled();
    });

    it('does not run at all while the feature is off', async () => {
      setPreferences({ drive_backup_enabled: 'false' });
      const result = await performDriveBackupIfNeeded(getAccessToken);
      expect(result).toEqual({ status: 'skipped', reason: 'disabled' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refuses to start a second run while one is in flight', async () => {
      let releaseUpload;
      const gate = new Promise(resolve => { releaseUpload = resolve; });
      const base = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        if (url.includes('/upload/')) await gate;
        return base(url, options);
      });

      const first = performDriveBackup({ mode: 'auto', getAccessToken });
      const second = await performDriveBackup({ mode: 'manual', getAccessToken });
      releaseUpload();
      await first;

      expect(second).toEqual({ status: 'skipped', reason: 'already_running' });
    });

    it('records the day and week only after their uploads land', async () => {
      await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('drive_backup_last_daily_date', TODAY);
      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('drive_backup_last_weekly_week', THIS_WEEK);
    });

    it('leaves the schedule marks untouched when an upload fails', async () => {
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/upload/'), status: 500, body: {} },
      ]);
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result.status).toBe('error');
      expect(mockPreferencesDB.setPreference).not.toHaveBeenCalledWith('drive_backup_last_daily_date', TODAY);
    });

    it('builds one snapshot for every file in a run', async () => {
      await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(mockBackupRestore.createBackup).toHaveBeenCalledTimes(1);
    });

    it('uploads only the selected formats', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify(['json']) });
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result.files).toEqual([
        'penny_daily_2026-02-26.json',
        'penny_weekly_2026-W09.json',
      ]);
    });
  });

  describe('Manual runs', () => {
    it('runs even when the scheduled backup is switched off', async () => {
      // The button is an explicit request; gating it on the schedule toggle would
      // make the tap a silent no-op.
      setPreferences({ drive_backup_enabled: 'false' });
      const result = await performDriveBackup({ mode: 'manual', getAccessToken });
      expect(result.status).toBe('success');
    });

    it('writes a timestamped set regardless of the schedule', async () => {
      setPreferences({
        drive_backup_last_daily_date: TODAY,
        drive_backup_last_weekly_week: THIS_WEEK,
      });
      const result = await performDriveBackup({ mode: 'manual', getAccessToken });
      expect(result.status).toBe('success');
      expect(result.files).toHaveLength(3);
      result.files.forEach(name => expect(name).toMatch(/^penny_manual_2026-02-26_\d{2}-\d{2}-\d{2}\./));
    });

    it('never advances the daily or weekly marks', async () => {
      await performDriveBackup({ mode: 'manual', getAccessToken });
      expect(mockPreferencesDB.setPreference).not.toHaveBeenCalledWith('drive_backup_last_daily_date', TODAY);
      expect(mockPreferencesDB.setPreference).not.toHaveBeenCalledWith('drive_backup_last_weekly_week', THIS_WEEK);
    });

    it('does not rotate, so a manual backup is never auto-deleted', async () => {
      await performDriveBackup({ mode: 'manual', getAccessToken });
      const deletes = global.fetch.mock.calls.filter(([, o]) => o?.method === 'DELETE');
      expect(deletes).toHaveLength(0);
    });
  });

  describe('SQLite upload', () => {
    it('streams the staged database file instead of building a multipart body', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify(['sqlite']) });
      await performDriveBackup({ mode: 'manual', getAccessToken });

      expect(mockFileSystem.uploadAsync).toHaveBeenCalledTimes(1);
      const [url, fileUri, options] = mockFileSystem.uploadAsync.mock.calls[0];
      expect(url).toContain('uploadType=media');
      expect(fileUri).toContain('drive_backup_tmp/');
      expect(options.httpMethod).toBe('PATCH');
      expect(options.uploadType).toBe(mockFileSystem.FileSystemUploadType.BINARY_CONTENT);
      expect(options.headers.Authorization).toBe('Bearer token-abc');
    });

    it('checkpoints the database into the staged copy before uploading', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify(['sqlite']) });
      await performDriveBackup({ mode: 'manual', getAccessToken });
      expect(mockBackupRestore.writeSQLiteSnapshot).toHaveBeenCalledTimes(1);
    });

    it('removes the placeholder file when the bytes fail to upload', async () => {
      // Metadata lands, media does not: without the rollback a 0-byte file keeps
      // a good backup's name and later takes its slot in the rotation window.
      setPreferences({ drive_backup_formats: JSON.stringify(['sqlite']) });
      mockFileSystem.uploadAsync.mockResolvedValue({ status: 500, body: 'boom' });
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'placeholder-file' } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);

      const result = await performDriveBackup({ mode: 'manual', getAccessToken });

      expect(result.status).toBe('error');
      expect(deleted).toEqual(['placeholder-file']);
    });

    it('leaves an existing file alone when a re-upload over it fails', async () => {
      // Here the file predates this run and still holds the previous backup —
      // deleting it would turn a failed upload into data loss.
      setPreferences({ drive_backup_formats: JSON.stringify(['sqlite']) });
      mockFileSystem.uploadAsync.mockResolvedValue({ status: 500, body: 'boom' });
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [{ id: 'yesterdays-file' }] } },
        { method: 'DELETE', match: (u) => { deleted.push(u); return true; }, body: {} },
      ]);

      await performDriveBackup({ mode: 'manual', getAccessToken });

      expect(deleted).toEqual([]);
    });

    it('deletes the staged copy even when the upload fails', async () => {
      setPreferences({ drive_backup_formats: JSON.stringify(['sqlite']) });
      mockFileSystem.uploadAsync.mockResolvedValue({ status: 500, body: 'boom' });

      const result = await performDriveBackup({ mode: 'manual', getAccessToken });

      expect(result.status).toBe('error');
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.stringContaining('drive_backup_tmp/'),
        { idempotent: true },
      );
    });
  });

  describe('Rotation', () => {
    it('keeps the newest files and deletes the excess within each format', async () => {
      const files = [];
      for (let day = 1; day <= 10; day += 1) {
        const date = `2026-02-${String(day).padStart(2, '0')}`;
        files.push({ id: `json-${day}`, name: `penny_daily_${date}.json` });
        files.push({ id: `csv-${day}`, name: `penny_daily_${date}.csv` });
      }
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        {
          method: 'DELETE',
          match: (u) => { deleted.push(u.split('/').pop()); return u.includes('/drive/v3/files/'); },
          body: {},
        },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);

      // 10 of each format, keeping 7: days 1-3 go, days 4-10 stay.
      expect(deleted.sort()).toEqual(['csv-1', 'csv-2', 'csv-3', 'json-1', 'json-2', 'json-3'].sort());
    });

    it('rotates each format over its own window', async () => {
      // Eight JSON files but only two CSV: turning CSV on late must not push the
      // JSON history out early, and the thin CSV group must lose nothing.
      const files = [];
      for (let day = 1; day <= 8; day += 1) {
        files.push({ id: `json-${day}`, name: `penny_daily_2026-02-0${day}.json` });
      }
      files.push({ id: 'csv-7', name: 'penny_daily_2026-02-07.csv' });
      files.push({ id: 'csv-8', name: 'penny_daily_2026-02-08.csv' });

      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        {
          method: 'DELETE',
          match: (u) => { deleted.push(u.split('/').pop()); return true; },
          body: {},
        },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);
      expect(deleted).toEqual(['json-1']);
    });

    it('leaves files the user put in the folder alone', async () => {
      const files = [{ id: 'mine', name: 'my notes.txt' }, { id: 'sheet', name: 'Budget 2026.xlsx' }];
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u); return true; }, body: {} },
      ]);
      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', 1);
      expect(deleted).toEqual([]);
    });

    it('does not fail the run when a delete is rejected', async () => {
      const files = [];
      for (let day = 1; day <= 9; day += 1) {
        files.push({ id: `json-${day}`, name: `penny_daily_2026-02-0${day}.json` });
      }
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: () => true, status: 500, body: {} },
      ]);
      await expect(
        cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS),
      ).resolves.toBeUndefined();
    });
  });

  // A new phone or a reinstall with the Drive backup turned on before restoring:
  // its snapshot is near-empty and it has no local history for the snapshot
  // guard to compare with. It used to replace today's and this week's files and
  // then rotate the old device's dailies out one per day.
  describe('A fresh install next to an existing backup set', () => {
    const FULL_SIZE = String(512 * 1024);
    const dailyFiles = (fromDay, toDay, size, idPrefix) => {
      const files = [];
      for (let day = fromDay; day <= toDay; day += 1) {
        const date = `2026-02-${String(day).padStart(2, '0')}`;
        files.push({ id: `${idPrefix}-${day}`, name: `penny_daily_${date}.json`, size });
      }
      return files;
    };

    // Routes a run whose name lookups find `existingByExt[ext]` (or nothing),
    // recording every write so a test can say none happened.
    const routeExisting = (existingByExt) => routeFetch([
      { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
      ...Object.entries(existingByExt).map(([ext, file]) => ({
        method: 'GET',
        match: (u) => u.includes('name%3D') && u.includes(`.${ext}'`),
        body: { files: [file] },
      })),
      { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
      { method: 'POST', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'uploaded-file' } },
      { method: 'PATCH', match: (u) => u.includes('/upload/drive/v3/files/'), body: { id: 'uploaded-file' } },
      { method: 'PATCH', match: (u) => u.includes('/drive/v3/files/'), body: { id: 'uploaded-file' } },
      { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'created-file' } },
      { method: 'DELETE', match: (u) => u.includes('/drive/v3/files/'), body: {} },
    ]);
    const writes = () => global.fetch.mock.calls.filter(([, o]) => ['POST', 'PATCH'].includes(o?.method));

    it('refuses every format of a snapshot when any one of them would shrink', async () => {
      // Only the daily snapshot is due. Its JSON would shrink far below the old
      // device's, but its never-vacuumed database weighs 75% of the old one —
      // on bytes alone the .db would go through and take the old one's slot.
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK });
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 6144 });
      routeExisting({
        json: { id: 'old-json', size: FULL_SIZE },
        db: { id: 'old-db', size: '8192' },
      });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result).toMatchObject({ status: 'skipped', reason: 'remote_larger' });
      expect(writes()).toHaveLength(0);
      expect(mockFileSystem.uploadAsync).not.toHaveBeenCalled();
    });

    it('compares by the row count both files carry rather than by bytes', async () => {
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK, drive_backup_formats: JSON.stringify(['sqlite']) });
      // Bytes say the fresh database is the bigger one; the rows say it holds
      // one account against the old device's 400 rows.
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 900000 });
      routeExisting({ db: { id: 'old-db', size: '800000', appProperties: { pennyRows: '400' } } });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result).toMatchObject({ status: 'skipped', reason: 'remote_larger' });
      expect(mockFileSystem.uploadAsync).not.toHaveBeenCalled();
    });

    it('replaces a file holding the same rows, however its bytes compare', async () => {
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK, drive_backup_formats: JSON.stringify(['json']) });
      routeExisting({ json: { id: 'same-day-json', size: FULL_SIZE, appProperties: { pennyRows: '1' } } });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result.status).toBe('success');
      expect(writes().map(([url]) => url)).toEqual([
        expect.stringContaining('/upload/drive/v3/files/same-day-json'),
      ]);
    });

    it('records the snapshot\'s row count on every file it uploads', async () => {
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK });
      routeExisting({
        json: { id: 'old-json', size: '10' },
        db: { id: 'old-db', size: '10' },
      });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result.status).toBe('success');
      const recorded = '"appProperties":{"pennyRows":"1"}';
      const bodyOf = (fragment, method) => writes()
        .find(([url, o]) => url.includes(fragment) && o.method === method)[1].body;
      // The replaced JSON and the new CSV carry it in their multipart metadata…
      expect(bodyOf('/upload/drive/v3/files/old-json', 'PATCH')).toContain(recorded);
      expect(bodyOf('/upload/drive/v3/files?', 'POST')).toContain(recorded);
      // …and the replaced database, whose media upload carries no metadata, in a
      // metadata PATCH of its own.
      expect(bodyOf('/drive/v3/files/old-db?', 'PATCH')).toBe(`{${recorded}}`);
    });

    it('records which files it kept when only part of the run was refused', async () => {
      // Today's daily is new; this week's weekly already came from the old
      // device, with far more rows in it.
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
        {
          method: 'GET',
          match: (u) => u.includes('name%3D') && u.includes('penny_weekly_'),
          body: { files: [{ id: 'old-weekly', size: FULL_SIZE, appProperties: { pennyRows: '500' } }] },
        },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'uploaded-file' } },
        { method: 'POST', match: (u) => u.includes('/drive/v3/files'), body: { id: 'created-file' } },
      ]);

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      const weekly = ['penny_weekly_2026-W09.json', 'penny_weekly_2026-W09.csv', 'penny_weekly_2026-W09.db'];
      expect(result).toMatchObject({ status: 'success', kept: weekly });
      expect(result.files.every(name => name.startsWith('penny_daily_'))).toBe(true);
      const stored = mockPreferencesDB.setPreference.mock.calls
        .find(([key]) => key === 'drive_backup_last_result');
      expect(JSON.parse(stored[1])).toMatchObject({ status: 'success', kept: weekly });
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Kept 3 larger file(s)'), weekly.join(', '));
    });

    it('counts a lone surrogate as the 3 bytes it is sent as, not half of a pair', async () => {
      // "\uD800" alone goes out as U+FFFD (3 bytes) and "é" is 2: 5 bytes,
      // exactly half of the file in Drive, so not "much smaller". Reading the
      // lone surrogate as a 4-byte pair swallowed the "é" and made it 4.
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK, drive_backup_formats: JSON.stringify(['csv']) });
      mockBackupRestore.buildCombinedCSV.mockReturnValueOnce('\uD800\u00e9');
      routeExisting({ csv: { id: 'old-csv', size: '10' } });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result.status).toBe('success');
      expect(writes().map(([url]) => url)).toEqual([expect.stringContaining('/upload/drive/v3/files/old-csv')]);
    });

    it('measures a text format and lets it go, building it again for the upload', async () => {
      // Files uploaded before the row count existed are compared on bytes.
      // Holding each measured string until its upload kept the JSON and the CSV
      // of a large dataset in memory together.
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK, drive_backup_formats: JSON.stringify(['json', 'csv']) });
      routeExisting({ json: { id: 'old-json', size: '10' }, csv: { id: 'old-csv', size: '10' } });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result.status).toBe('success');
      // Once to measure, once to upload.
      expect(mockBackupRestore.buildCombinedCSV).toHaveBeenCalledTimes(2);
    });

    it('looks up every format\'s existing file at once', async () => {
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK });
      routeExisting({});
      const base = global.fetch;
      const held = [];
      let holding = true;
      global.fetch = jest.fn((url, options) => {
        if (holding && url.includes('name%3D')) {
          return new Promise(resolve => held.push(() => resolve(base(url, options))));
        }
        return base(url, options);
      });

      const run = performDriveBackup({ mode: 'auto', getAccessToken });
      for (let tick = 0; tick < 50 && held.length < 3; tick += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const inFlightTogether = held.length;
      holding = false;
      held.forEach(release => release());
      const result = await run;

      expect(inFlightTogether).toBe(3);
      expect(result.status).toBe('success');
    });

    it('lets a snapshot replace this morning\'s larger file on the day of a restore', async () => {
      // The user restored an older, smaller backup today, which also rolled the
      // upload marks back — so today's files are uploaded again, over the
      // pre-restore ones. That is their choice, not a fresh install's.
      setPreferences({
        drive_backup_last_weekly_week: THIS_WEEK,
        drive_backup_formats: JSON.stringify(['json']),
        backup_restored_on: TODAY,
      });
      routeExisting({ json: { id: 'pre-restore-json', size: FULL_SIZE, appProperties: { pennyRows: '400' } } });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result.status).toBe('success');
      expect(result.kept).toBeUndefined();
      expect(writes().map(([url]) => url)).toEqual([
        expect.stringContaining('/upload/drive/v3/files/pre-restore-json'),
      ]);
    });

    it('keeps guarding on any other day after a restore', async () => {
      setPreferences({
        drive_backup_last_weekly_week: THIS_WEEK,
        drive_backup_formats: JSON.stringify(['json']),
        backup_restored_on: '2026-02-25',
      });
      routeExisting({ json: { id: 'pre-restore-json', size: FULL_SIZE, appProperties: { pennyRows: '400' } } });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result).toMatchObject({ status: 'skipped', reason: 'remote_larger' });
      expect(writes()).toHaveLength(0);
    });

    it('records it on a database created from scratch as well', async () => {
      routeExisting({});

      await uploadBinaryFile('token-abc', {
        folderId: FOLDER_ID, name: 'penny_daily_2026-02-26.db', mimeType: 'application/x-sqlite3',
        fileUri: 'file:///staged.db', appProperties: { pennyRows: '12' },
      });

      const create = writes().find(([url, o]) => url.includes('/drive/v3/files?') && o.method === 'POST');
      expect(JSON.parse(create[1].body)).toMatchObject({ appProperties: { pennyRows: '12' } });
    });

    it('keeps the old device\'s daily and weekly files and reports the run as skipped', async () => {
      // The staged database is as small as the rest of the fresh install.
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 4096 });
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
        // Every name this run writes is already taken by the old device's backup.
        { method: 'GET', match: (u) => u.includes('name%3D'), body: { files: [{ id: 'old-device-file', size: FULL_SIZE }] } },
        { method: 'GET', match: (u) => u.includes('orderBy=name'), body: { files: [] } },
      ]);

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result).toMatchObject({ status: 'skipped', reason: 'remote_larger' });
      const writes = global.fetch.mock.calls.filter(([, o]) => ['POST', 'PATCH', 'DELETE'].includes(o?.method));
      expect(writes).toHaveLength(0);
      expect(mockFileSystem.uploadAsync).not.toHaveBeenCalled();
    });

    it('does not rotate the old device\'s backups out with its own small ones', async () => {
      // Seven full-size dailies from the old device, then the fresh install's first.
      const files = [...dailyFiles(1, 7, FULL_SIZE, 'old'), ...dailyFiles(8, 8, '2048', 'fresh')];
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);

      expect(deleted).toEqual([]);
    });

    it('keeps rotating the small files, so the folder stays bounded', async () => {
      const files = [...dailyFiles(1, 7, FULL_SIZE, 'old'), ...dailyFiles(8, 15, '2048', 'fresh')];
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);

      expect(deleted).toEqual(['fresh-8']);
    });

    it('keeps the old device\'s databases when bytes alone say the fresh one is comparable', async () => {
      // A never-vacuumed fresh database weighs two thirds of the real one but
      // holds 3 rows against 1000.
      const files = [];
      for (let day = 1; day <= 7; day += 1) {
        files.push({ id: `old-${day}`, name: `penny_daily_2026-02-0${day}.db`, size: '300000', appProperties: { pennyRows: '1000' } });
      }
      files.push({ id: 'fresh-8', name: 'penny_daily_2026-02-08.db', size: '200000', appProperties: { pennyRows: '3' } });
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);

      expect(deleted).toEqual([]);
    });

    it('rotates normally when the rows match, however the bytes compare', async () => {
      const files = [];
      for (let day = 1; day <= 7; day += 1) {
        files.push({ id: `day-${day}`, name: `penny_daily_2026-02-0${day}.db`, size: '2000000', appProperties: { pennyRows: '1000' } });
      }
      files.push({ id: 'day-8', name: 'penny_daily_2026-02-08.db', size: '800000', appProperties: { pennyRows: '1000' } });
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);

      expect(deleted).toEqual(['day-1']);
    });

    // Every backup in `files` routed as the folder listing; returns what rotation deleted.
    const rotate = async (files, prefix, maxToKeep, protectDays) => {
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);
      await cleanupDriveBackups('token-abc', FOLDER_ID, prefix, maxToKeep, protectDays);
      return deleted;
    };
    const dated = (id, date, size, ext = 'json') => ({ id, name: `penny_daily_${date}.${ext}`, size });
    const days = (month, from, to, size, idPrefix) => {
      const list = [];
      for (let day = from; day <= to; day += 1) {
        list.push(dated(`${idPrefix}-${month}-${day}`, `2026-${month}-${String(day).padStart(2, '0')}`, size));
      }
      return list;
    };
    // ISO weeks counted back from this one, 2026-W09 (2025 has 52 of them).
    const weekBefore = (offset) => {
      let year = 2026;
      let week = 9 - offset;
      while (week < 1) { year -= 1; week += 52; }
      return `${year}-W${String(week).padStart(2, '0')}`;
    };
    const weeklies = (fromOffset, toOffset, size, idPrefix) => {
      const list = [];
      for (let offset = fromOffset; offset <= toOffset; offset += 1) {
        list.push({ id: `${idPrefix}-${offset}`, name: `penny_weekly_${weekBefore(offset)}.json`, size });
      }
      return list;
    };

    it('counts the protection from when the shrink began, not from each file\'s age', async () => {
      // Full-size dailies up to 2026-02-18, 8 days before today: the shrink began
      // then, so every one of them is kept — January's too, though each is more
      // than 30 days old by itself.
      const files = [...days('01', 10, 31, FULL_SIZE, 'old'), ...days('02', 1, 18, FULL_SIZE, 'old'), ...days('02', 19, 26, '2048', 'small')];

      const deleted = await rotate(files, 'penny_daily_', MAX_DAILY_BACKUPS, DAILY_PROTECTION_DAYS);

      expect(deleted).toEqual(['small-02-19']);
    });

    it('lets the larger dailies go once the shrink is older than the protection period', async () => {
      // The last full-size daily is 2026-01-20, 37 days ago.
      const files = [...days('01', 10, 20, FULL_SIZE, 'old'), ...days('02', 20, 26, '2048', 'small')];

      const deleted = await rotate(files, 'penny_daily_', MAX_DAILY_BACKUPS, DAILY_PROTECTION_DAYS);

      expect(deleted.sort()).toEqual(days('01', 10, 20, FULL_SIZE, 'old').map(f => f.id).sort());
    });

    it('protects larger weeklies past the real window while the shrink is under twelve weeks old', async () => {
      // 20 full-size weeklies up to 6 weeks ago, then 5 small ones. The 10 past
      // the 15-file window are each over 15 weeks old; judged by their own age
      // none could ever be protected.
      const files = [...weeklies(6, 25, FULL_SIZE, 'old'), ...weeklies(0, 4, '2048', 'small')];

      const deleted = await rotate(files, 'penny_weekly_', MAX_WEEKLY_BACKUPS, WEEKLY_PROTECTION_DAYS);

      expect(deleted).toEqual([]);
    });

    it('lets the larger weeklies go once the shrink is over twelve weeks old', async () => {
      // The last full-size weekly is 13 weeks back.
      const files = [...weeklies(13, 32, FULL_SIZE, 'old'), ...weeklies(0, 4, '2048', 'small')];

      const deleted = await rotate(files, 'penny_weekly_', MAX_WEEKLY_BACKUPS, WEEKLY_PROTECTION_DAYS);

      expect(deleted.sort()).toEqual(weeklies(23, 32, FULL_SIZE, 'old').map(f => f.id).sort());
    });

    it('keeps every format of a day whose backup is protected in any format', async () => {
      // The JSON carries row counts and shows the shrink; the database predates
      // them, and its bytes barely moved. Rotating the .db out beside its kept
      // JSON would leave half a backup for that day.
      const json = (day, rows) => ({
        id: `json-${day}`, name: `penny_daily_2026-02-0${day}.json`, size: '1000', appProperties: { pennyRows: rows },
      });
      const db = (day, size) => ({ id: `db-${day}`, name: `penny_daily_2026-02-0${day}.db`, size });
      const files = [];
      for (let day = 1; day <= 7; day += 1) files.push(json(day, '1000'), db(day, '300000'));
      files.push(json(8, '3'), db(8, '200000'));

      const deleted = await rotate(files, 'penny_daily_', MAX_DAILY_BACKUPS, DAILY_PROTECTION_DAYS);

      expect(deleted).toEqual([]);
    });

    it('rotates the old files normally once the newest backup is full-size again', async () => {
      const files = dailyFiles(1, 8, FULL_SIZE, 'day');
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes('q='), body: { files } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);

      await cleanupDriveBackups('token-abc', FOLDER_ID, 'penny_daily_', MAX_DAILY_BACKUPS);

      expect(deleted).toEqual(['day-1']);
    });
  });

  describe('Snapshot guard', () => {
    it('refuses to upload a snapshot that looks like a failed database read', async () => {
      mockDailyBackup.isSnapshotValid.mockResolvedValue(false);
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('invalid_snapshot');
      const uploads = global.fetch.mock.calls.filter(([url]) => url.includes('/upload/'));
      expect(uploads).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('reports a failure instead of throwing it at app startup', async () => {
      getAccessToken.mockRejectedValueOnce(new Error('not_signed_in'));
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result).toMatchObject({ status: 'error', error: 'not_signed_in' });
    });

    it('survives a network failure mid-upload', async () => {
      global.fetch = jest.fn(async () => { throw new Error('Network request failed'); });
      const result = await performDriveBackup({ mode: 'auto', getAccessToken });
      expect(result).toMatchObject({ status: 'error', error: 'Network request failed' });
    });

    it('stores the outcome so settings can show it later', async () => {
      await performDriveBackup({ mode: 'auto', getAccessToken });
      const stored = mockPreferencesDB.setPreference.mock.calls
        .find(([key]) => key === 'drive_backup_last_result');
      expect(JSON.parse(stored[1])).toMatchObject({ status: 'success', files: 6 });
    });
  });

  describe('Progress reporting', () => {
    it('walks through the phases and ends on done', async () => {
      const phases = [];
      const unsubscribe = appEvents.on(DRIVE_BACKUP_PROGRESS_EVENT, (p) => phases.push(p.phase));
      await performDriveBackup({ mode: 'auto', getAccessToken });
      unsubscribe();

      // Auth first, then the snapshot: a revoked session must fail before the
      // whole database is read for nothing.
      expect(phases[0]).toBe('folder');
      expect(phases).toContain('preparing');
      expect(phases).toContain('uploading');
      expect(phases).toContain('cleanup');
      expect(phases[phases.length - 1]).toBe('done');
    });

    it('counts uploads so the indicator can show progress', async () => {
      const uploads = [];
      const unsubscribe = appEvents.on(DRIVE_BACKUP_PROGRESS_EVENT, (p) => {
        if (p.phase === 'uploading') uploads.push(`${p.current}/${p.total}`);
      });
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK });
      await performDriveBackup({ mode: 'auto', getAccessToken });
      unsubscribe();

      expect(uploads).toEqual(['1/3', '2/3', '3/3']);
    });

    it('ends on error when the run fails', async () => {
      const phases = [];
      const unsubscribe = appEvents.on(DRIVE_BACKUP_PROGRESS_EVENT, (p) => phases.push(p.phase));
      getAccessToken.mockRejectedValueOnce(new Error('refresh_failed'));
      await performDriveBackup({ mode: 'auto', getAccessToken });
      unsubscribe();

      expect(phases[phases.length - 1]).toBe('error');
    });
  });

  describe('Cancellation', () => {
    it('does nothing when there is no run to cancel', () => {
      expect(cancelDriveBackup()).toBe(false);
    });

    it('stops at the next checkpoint and reports a cancelled run', async () => {
      // Hold the first upload open so the cancel lands mid-run, exactly as a tap
      // on the search pill would.
      let releaseUpload;
      const gate = new Promise(resolve => { releaseUpload = resolve; });
      const base = global.fetch;
      let uploads = 0;
      global.fetch = jest.fn(async (url, options) => {
        if (url.includes('/upload/')) {
          uploads += 1;
          if (uploads === 1) await gate;
        }
        return base(url, options);
      });

      const phases = [];
      const unsubscribe = appEvents.on(DRIVE_BACKUP_PROGRESS_EVENT, (p) => phases.push(p.phase));

      const run = performDriveBackup({ mode: 'manual', getAccessToken });
      // Let the run reach the gated upload before asking it to stop.
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(cancelDriveBackup()).toBe(true);
      releaseUpload();
      const result = await run;
      unsubscribe();

      expect(result.status).toBe('cancelled');
      expect(phases[phases.length - 1]).toBe('cancelled');
      // The file that was already streaming finished; the ones after it never started.
      expect(uploads).toBe(1);
    });

    it('records the cancellation as the last outcome', async () => {
      let releaseUpload;
      const gate = new Promise(resolve => { releaseUpload = resolve; });
      const base = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        if (url.includes('/upload/')) await gate;
        return base(url, options);
      });

      const run = performDriveBackup({ mode: 'manual', getAccessToken });
      await new Promise(resolve => setTimeout(resolve, 0));
      cancelDriveBackup();
      releaseUpload();
      await run;

      const stored = mockPreferencesDB.setPreference.mock.calls
        .find(([key]) => key === 'drive_backup_last_result');
      expect(JSON.parse(stored[1])).toMatchObject({ status: 'cancelled' });
    });

    it('finishes and rotates a run whose files have all landed', async () => {
      // The last checkpoint is between files, so a cancel that lands during the
      // final upload arrives with nothing left to skip. Reporting that as
      // cancelled would call a finished backup a failure and, worse, skip the
      // rotation — which the next launch will not redo, because the day is
      // already marked.
      setPreferences({ drive_backup_last_weekly_week: THIS_WEEK });
      const files = [];
      for (let day = 1; day <= 10; day += 1) {
        files.push({ id: `json-${day}`, name: `penny_daily_2026-02-${String(day).padStart(2, '0')}.json` });
      }
      const deleted = [];
      routeFetch([
        { method: 'GET', match: (u) => u.includes(`/files/${FOLDER_ID}?`), body: { id: FOLDER_ID, trashed: false } },
        { method: 'GET', match: (u) => u.includes('in+parents') || u.includes('in%20parents'), body: { files } },
        { method: 'GET', match: (u) => u.includes('q='), body: { files: [] } },
        { method: 'POST', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'uploaded-file' } },
        { method: 'PATCH', match: (u) => u.includes('/upload/drive/v3/files'), body: { id: 'uploaded-file' } },
        { method: 'PATCH', match: (u) => u.includes('/drive/v3/files/'), body: { id: 'uploaded-file' } },
        { method: 'DELETE', match: (u) => { deleted.push(u.split('/').pop()); return true; }, body: {} },
      ]);
      // SQLite is the last format, so the tap lands while the final file streams.
      mockFileSystem.uploadAsync.mockImplementationOnce(async () => {
        cancelDriveBackup();
        return { status: 200, body: '{"id":"file-db"}' };
      });

      const result = await performDriveBackup({ mode: 'auto', getAccessToken });

      expect(result.status).toBe('success');
      expect(deleted.length).toBeGreaterThan(0);
    });

    it('does not carry a cancel over into the next run', async () => {
      let releaseUpload;
      const gate = new Promise(resolve => { releaseUpload = resolve; });
      const base = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        if (url.includes('/upload/')) await gate;
        return base(url, options);
      });

      const first = performDriveBackup({ mode: 'manual', getAccessToken });
      await new Promise(resolve => setTimeout(resolve, 0));
      cancelDriveBackup();
      releaseUpload();
      await first;

      global.fetch = base;
      const second = await performDriveBackup({ mode: 'manual', getAccessToken });
      expect(second.status).toBe('success');
    });
  });
});
