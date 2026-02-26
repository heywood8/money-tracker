/**
 * Tests for DailyBackupService.js
 * Covers: daily deduplication, backup creation, cleanup of old backups,
 * directory initialisation, and error resilience.
 */

import {
  performDailyBackupIfNeeded,
  getStoredBackups,
  getLatestBackupInfo,
  getTodayDateString,
  DAILY_BACKUP_DIR,
  MAX_BACKUPS_TO_KEEP,
} from '../../app/services/DailyBackupService';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../app/services/BackupRestore', () => ({
  createBackup: jest.fn(),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/document/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

const mockFileSystem = require('expo-file-system/legacy');
const mockBackupRestore = require('../../app/services/BackupRestore');
const mockPreferencesDB = require('../../app/services/PreferencesDB');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = '2026-02-26';

const makeSampleBackup = () => ({
  version: 1,
  timestamp: `${TODAY}T10:00:00.000Z`,
  platform: 'native',
  data: { accounts: [], categories: [], operations: [], budgets: [], app_metadata: [], balance_history: [] },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DailyBackupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Directory exists by default
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
    mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    mockFileSystem.deleteAsync.mockResolvedValue(undefined);

    // Backup creation succeeds
    mockBackupRestore.createBackup.mockResolvedValue(makeSampleBackup());

    // No prior backup by default
    mockPreferencesDB.getPreference.mockResolvedValue(null);
    mockPreferencesDB.setPreference.mockResolvedValue(undefined);
  });

  // ── getTodayDateString ─────────────────────────────────────────────────────

  describe('getTodayDateString', () => {
    it('returns a string matching YYYY-MM-DD', () => {
      const result = getTodayDateString();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── getStoredBackups ───────────────────────────────────────────────────────

  describe('getStoredBackups', () => {
    it('returns empty array when directory is empty', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
      const result = await getStoredBackups();
      expect(result).toEqual([]);
    });

    it('returns sorted backup URIs excluding non-backup files', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'backup_2026-02-25.json',
        'readme.txt',
        'backup_2026-02-24.json',
        'backup_2026-02-26.json',
      ]);

      const result = await getStoredBackups();
      expect(result).toEqual([
        `${DAILY_BACKUP_DIR}backup_2026-02-24.json`,
        `${DAILY_BACKUP_DIR}backup_2026-02-25.json`,
        `${DAILY_BACKUP_DIR}backup_2026-02-26.json`,
      ]);
    });

    it('creates the directory if it does not exist', async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });
      mockFileSystem.readDirectoryAsync.mockResolvedValue([]);

      await getStoredBackups();

      expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        DAILY_BACKUP_DIR,
        { intermediates: true },
      );
    });

    it('returns empty array on filesystem error', async () => {
      mockFileSystem.readDirectoryAsync.mockRejectedValue(new Error('IO error'));
      const result = await getStoredBackups();
      expect(result).toEqual([]);
    });
  });

  // ── getLatestBackupInfo ────────────────────────────────────────────────────

  describe('getLatestBackupInfo', () => {
    it('returns null when no backups exist', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
      const result = await getLatestBackupInfo();
      expect(result).toBeNull();
    });

    it('returns info for the most recent backup', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'backup_2026-02-24.json',
        'backup_2026-02-25.json',
        'backup_2026-02-26.json',
      ]);

      const result = await getLatestBackupInfo();
      expect(result).toEqual({
        uri: `${DAILY_BACKUP_DIR}backup_2026-02-26.json`,
        date: '2026-02-26',
        filename: 'backup_2026-02-26.json',
      });
    });

    it('returns null date for a malformed filename', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue(['backup_corrupt.json']);
      const result = await getLatestBackupInfo();
      expect(result.date).toBeNull();
    });
  });

  // ── performDailyBackupIfNeeded ─────────────────────────────────────────────

  describe('performDailyBackupIfNeeded', () => {
    it('creates a backup when none has been made today', async () => {
      mockPreferencesDB.getPreference.mockResolvedValue(null);

      const result = await performDailyBackupIfNeeded();

      expect(result).toBe(true);
      expect(mockBackupRestore.createBackup).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    });

    it('writes the backup to the correct file path', async () => {
      mockPreferencesDB.getPreference.mockResolvedValue(null);
      const today = getTodayDateString();

      await performDailyBackupIfNeeded();

      const expectedPath = `${DAILY_BACKUP_DIR}backup_${today}.json`;
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expectedPath,
        expect.any(String),
      );
    });

    it('records today as the last backup date after success', async () => {
      mockPreferencesDB.getPreference.mockResolvedValue(null);
      const today = getTodayDateString();

      await performDailyBackupIfNeeded();

      expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith(
        'last_daily_backup_date',
        today,
      );
    });

    it('skips backup when one was already created today', async () => {
      const today = getTodayDateString();
      mockPreferencesDB.getPreference.mockResolvedValue(today);

      const result = await performDailyBackupIfNeeded();

      expect(result).toBe(false);
      expect(mockBackupRestore.createBackup).not.toHaveBeenCalled();
      expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    });

    it('creates a new backup the day after the previous one', async () => {
      mockPreferencesDB.getPreference.mockResolvedValue('2026-02-25'); // yesterday

      const result = await performDailyBackupIfNeeded();

      expect(result).toBe(true);
      expect(mockBackupRestore.createBackup).toHaveBeenCalledTimes(1);
    });

    it('returns false (does not throw) when createBackup fails', async () => {
      mockPreferencesDB.getPreference.mockResolvedValue(null);
      mockBackupRestore.createBackup.mockRejectedValue(new Error('DB error'));

      const result = await performDailyBackupIfNeeded();

      expect(result).toBe(false);
    });

    it('returns false (does not throw) when file write fails', async () => {
      mockPreferencesDB.getPreference.mockResolvedValue(null);
      mockFileSystem.writeAsStringAsync.mockRejectedValue(new Error('Disk full'));

      const result = await performDailyBackupIfNeeded();

      expect(result).toBe(false);
    });

    describe('old backup cleanup', () => {
      it('deletes backups beyond MAX_BACKUPS_TO_KEEP', async () => {
        mockPreferencesDB.getPreference.mockResolvedValue(null);
        const today = getTodayDateString();

        // Simulate MAX_BACKUPS_TO_KEEP existing backups plus today's (as the filesystem
        // would look after writeAsStringAsync – the mock doesn't actually create the file,
        // so we return the post-write state directly).
        const existingFiles = Array.from({ length: MAX_BACKUPS_TO_KEEP }, (_, i) => {
          const date = new Date('2026-02-19');
          date.setDate(date.getDate() + i);
          return `backup_${date.toISOString().split('T')[0]}.json`;
        });
        const filesAfterWrite = [...existingFiles, `backup_${today}.json`];
        mockFileSystem.readDirectoryAsync.mockResolvedValue(filesAfterWrite);

        await performDailyBackupIfNeeded();

        // MAX+1 files → oldest 1 deleted
        expect(mockFileSystem.deleteAsync).toHaveBeenCalledTimes(1);
        expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}${existingFiles[0]}`,
          { idempotent: true },
        );
      });

      it('does not delete anything when under the limit', async () => {
        mockPreferencesDB.getPreference.mockResolvedValue(null);

        // 3 existing files → after adding today's = 4, still under 7
        mockFileSystem.readDirectoryAsync.mockResolvedValue([
          'backup_2026-02-23.json',
          'backup_2026-02-24.json',
          'backup_2026-02-25.json',
        ]);

        await performDailyBackupIfNeeded();

        expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
      });
    });
  });
});
