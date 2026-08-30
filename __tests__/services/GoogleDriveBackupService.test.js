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
  performDriveBackupIfNeeded,
  ensureBackupFolder,
  cleanupDriveBackups,
  uploadTextFile,
  isDriveBackupEnabled,
  setDriveBackupEnabled,
  getDriveBackupFormats,
  setDriveBackupFormats,
  BACKUP_FORMATS,
  MAX_DAILY_BACKUPS,
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
});
