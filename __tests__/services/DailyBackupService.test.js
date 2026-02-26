/**
 * Tests for DailyBackupService.js
 * Covers: daily/weekly deduplication, backup creation, cleanup of old backups,
 * directory initialisation, snapshot reuse, and error resilience.
 */

import {
  performDailyBackupIfNeeded,
  getStoredBackups,
  getDailyBackups,
  getWeeklyBackups,
  getLatestBackupInfo,
  getTodayDateString,
  getISOWeekString,
  DAILY_BACKUP_DIR,
  MAX_DAILY_BACKUPS,
  MAX_WEEKLY_BACKUPS,
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
const THIS_WEEK = '2026-W09'; // ISO week containing 2026-02-26

const makeSampleBackup = () => ({
  version: 1,
  timestamp: `${TODAY}T10:00:00.000Z`,
  platform: 'native',
  data: {
    accounts: [],
    categories: [],
    operations: [],
    budgets: [],
    app_metadata: [],
    balance_history: [],
  },
});

/**
 * Configure getPreference mock to return different values per key.
 * Pass null to simulate "no prior backup".
 */
const mockPrefs = ({ daily = null, weekly = null } = {}) => {
  mockPreferencesDB.getPreference.mockImplementation((key, defaultVal = null) => {
    if (key === 'last_daily_backup_date') return Promise.resolve(daily);
    if (key === 'last_weekly_backup_week') return Promise.resolve(weekly);
    return Promise.resolve(defaultVal);
  });
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DailyBackupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
    mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    mockFileSystem.deleteAsync.mockResolvedValue(undefined);

    mockBackupRestore.createBackup.mockResolvedValue(makeSampleBackup());
    mockPreferencesDB.setPreference.mockResolvedValue(undefined);

    // Default: no prior backups
    mockPrefs();
  });

  // ── getTodayDateString ─────────────────────────────────────────────────────

  describe('getTodayDateString', () => {
    it('returns a string matching YYYY-MM-DD', () => {
      expect(getTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── getISOWeekString ───────────────────────────────────────────────────────

  describe('getISOWeekString', () => {
    it('returns a string matching YYYY-WNN', () => {
      expect(getISOWeekString()).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('is consistent with getTodayDateString for the same instant', () => {
      const today = getTodayDateString();
      const week = getISOWeekString();
      // Both are produced from the same "now", so year should match
      expect(week.startsWith(today.slice(0, 4))).toBe(true);
    });
  });

  // ── getDailyBackups ────────────────────────────────────────────────────────

  describe('getDailyBackups', () => {
    it('returns empty array when directory is empty', async () => {
      expect(await getDailyBackups()).toEqual([]);
    });

    it('returns sorted daily backup URIs, filtering out weekly and other files', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'daily_2026-02-25.json',
        'weekly_2026-W08.json',
        'readme.txt',
        'daily_2026-02-24.json',
        'daily_2026-02-26.json',
      ]);

      expect(await getDailyBackups()).toEqual([
        `${DAILY_BACKUP_DIR}daily_2026-02-24.json`,
        `${DAILY_BACKUP_DIR}daily_2026-02-25.json`,
        `${DAILY_BACKUP_DIR}daily_2026-02-26.json`,
      ]);
    });

    it('returns empty array on filesystem error', async () => {
      mockFileSystem.readDirectoryAsync.mockRejectedValue(new Error('IO error'));
      expect(await getDailyBackups()).toEqual([]);
    });
  });

  // ── getWeeklyBackups ───────────────────────────────────────────────────────

  describe('getWeeklyBackups', () => {
    it('returns empty array when directory is empty', async () => {
      expect(await getWeeklyBackups()).toEqual([]);
    });

    it('returns sorted weekly backup URIs, filtering out daily and other files', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'weekly_2026-W09.json',
        'daily_2026-02-26.json',
        'readme.txt',
        'weekly_2026-W07.json',
        'weekly_2026-W08.json',
      ]);

      expect(await getWeeklyBackups()).toEqual([
        `${DAILY_BACKUP_DIR}weekly_2026-W07.json`,
        `${DAILY_BACKUP_DIR}weekly_2026-W08.json`,
        `${DAILY_BACKUP_DIR}weekly_2026-W09.json`,
      ]);
    });

    it('returns empty array on filesystem error', async () => {
      mockFileSystem.readDirectoryAsync.mockRejectedValue(new Error('IO error'));
      expect(await getWeeklyBackups()).toEqual([]);
    });
  });

  // ── getStoredBackups ───────────────────────────────────────────────────────

  describe('getStoredBackups', () => {
    it('returns empty array when directory is empty', async () => {
      expect(await getStoredBackups()).toEqual([]);
    });

    it('returns all backup URIs sorted, excluding non-backup files', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'daily_2026-02-26.json',
        'readme.txt',
        'weekly_2026-W09.json',
        'daily_2026-02-25.json',
      ]);

      // 'd' < 'w' so daily files sort before weekly
      expect(await getStoredBackups()).toEqual([
        `${DAILY_BACKUP_DIR}daily_2026-02-25.json`,
        `${DAILY_BACKUP_DIR}daily_2026-02-26.json`,
        `${DAILY_BACKUP_DIR}weekly_2026-W09.json`,
      ]);
    });

    it('creates the backup directory if it does not exist', async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false });
      await getStoredBackups();
      expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        DAILY_BACKUP_DIR,
        { intermediates: true },
      );
    });

    it('returns empty array on filesystem error', async () => {
      mockFileSystem.readDirectoryAsync.mockRejectedValue(new Error('IO error'));
      expect(await getStoredBackups()).toEqual([]);
    });
  });

  // ── getLatestBackupInfo ────────────────────────────────────────────────────

  describe('getLatestBackupInfo', () => {
    it('returns null when no daily backups exist', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
      expect(await getLatestBackupInfo()).toBeNull();
    });

    it('returns info for the most recent daily backup', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'daily_2026-02-24.json',
        'daily_2026-02-25.json',
        'daily_2026-02-26.json',
        'weekly_2026-W09.json',
      ]);

      expect(await getLatestBackupInfo()).toEqual({
        uri: `${DAILY_BACKUP_DIR}daily_2026-02-26.json`,
        date: '2026-02-26',
        filename: 'daily_2026-02-26.json',
      });
    });

    it('returns null date for a malformed filename', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_corrupt.json']);
      const result = await getLatestBackupInfo();
      expect(result.date).toBeNull();
    });
  });

  // ── performDailyBackupIfNeeded ─────────────────────────────────────────────

  describe('performDailyBackupIfNeeded', () => {
    describe('when both daily and weekly are needed', () => {
      beforeEach(() => mockPrefs({ daily: null, weekly: null }));

      it('returns true', async () => {
        expect(await performDailyBackupIfNeeded()).toBe(true);
      });

      it('calls createBackup exactly once (snapshot reuse)', async () => {
        await performDailyBackupIfNeeded();
        expect(mockBackupRestore.createBackup).toHaveBeenCalledTimes(1);
      });

      it('writes both the daily and weekly files', async () => {
        const today = getTodayDateString();
        const week = getISOWeekString();
        await performDailyBackupIfNeeded();

        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(2);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}daily_${today}.json`,
          expect.any(String),
        );
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}weekly_${week}.json`,
          expect.any(String),
        );
      });

      it('records both the daily date and weekly week in preferences', async () => {
        const today = getTodayDateString();
        const week = getISOWeekString();
        await performDailyBackupIfNeeded();

        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith(
          'last_daily_backup_date',
          today,
        );
        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith(
          'last_weekly_backup_week',
          week,
        );
      });
    });

    describe('when only the daily backup is needed (same week, new day)', () => {
      beforeEach(() => mockPrefs({ daily: '2026-02-25', weekly: THIS_WEEK }));

      it('returns true', async () => {
        expect(await performDailyBackupIfNeeded()).toBe(true);
      });

      it('writes only the daily file', async () => {
        const today = getTodayDateString();
        await performDailyBackupIfNeeded();

        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}daily_${today}.json`,
          expect.any(String),
        );
      });

      it('records only the daily date preference', async () => {
        await performDailyBackupIfNeeded();
        const calls = mockPreferencesDB.setPreference.mock.calls.map(c => c[0]);
        expect(calls).toContain('last_daily_backup_date');
        expect(calls).not.toContain('last_weekly_backup_week');
      });
    });

    describe('when only the weekly backup is needed (new week, already backed up today)', () => {
      beforeEach(() => mockPrefs({ daily: getTodayDateString(), weekly: '2026-W08' }));

      it('returns true', async () => {
        expect(await performDailyBackupIfNeeded()).toBe(true);
      });

      it('writes only the weekly file', async () => {
        const week = getISOWeekString();
        await performDailyBackupIfNeeded();

        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}weekly_${week}.json`,
          expect.any(String),
        );
      });

      it('records only the weekly week preference', async () => {
        await performDailyBackupIfNeeded();
        const calls = mockPreferencesDB.setPreference.mock.calls.map(c => c[0]);
        expect(calls).toContain('last_weekly_backup_week');
        expect(calls).not.toContain('last_daily_backup_date');
      });
    });

    describe('when both are already up to date', () => {
      beforeEach(() => mockPrefs({ daily: getTodayDateString(), weekly: getISOWeekString() }));

      it('returns false', async () => {
        expect(await performDailyBackupIfNeeded()).toBe(false);
      });

      it('does not call createBackup', async () => {
        await performDailyBackupIfNeeded();
        expect(mockBackupRestore.createBackup).not.toHaveBeenCalled();
      });

      it('does not write any files', async () => {
        await performDailyBackupIfNeeded();
        expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      });
    });

    describe('error resilience', () => {
      it('returns false (does not throw) when createBackup fails', async () => {
        mockPrefs({ daily: null, weekly: null });
        mockBackupRestore.createBackup.mockRejectedValue(new Error('DB error'));
        expect(await performDailyBackupIfNeeded()).toBe(false);
      });

      it('returns false (does not throw) when a file write fails', async () => {
        mockPrefs({ daily: null, weekly: null });
        mockFileSystem.writeAsStringAsync.mockRejectedValue(new Error('Disk full'));
        expect(await performDailyBackupIfNeeded()).toBe(false);
      });
    });

    describe('daily backup cleanup', () => {
      it('deletes the oldest daily file when over MAX_DAILY_BACKUPS', async () => {
        mockPrefs({ daily: null, weekly: THIS_WEEK }); // only daily needed
        const today = getTodayDateString();

        // MAX+1 daily files as the directory would look after the write
        const existing = Array.from({ length: MAX_DAILY_BACKUPS }, (_, i) => {
          const d = new Date('2026-02-19');
          d.setDate(d.getDate() + i);
          return `daily_${d.toISOString().split('T')[0]}.json`;
        });
        const afterWrite = [...existing, `daily_${today}.json`];
        mockFileSystem.readDirectoryAsync.mockResolvedValue(afterWrite);

        await performDailyBackupIfNeeded();

        expect(mockFileSystem.deleteAsync).toHaveBeenCalledTimes(1);
        expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}${existing[0]}`,
          { idempotent: true },
        );
      });

      it('does not delete daily files when at or below MAX_DAILY_BACKUPS', async () => {
        mockPrefs({ daily: null, weekly: THIS_WEEK });

        // 3 existing + today's = 4, well under 7
        mockFileSystem.readDirectoryAsync.mockResolvedValue([
          'daily_2026-02-23.json',
          'daily_2026-02-24.json',
          'daily_2026-02-25.json',
        ]);

        await performDailyBackupIfNeeded();

        expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
      });
    });

    describe('weekly backup cleanup', () => {
      it('deletes the oldest weekly file when over MAX_WEEKLY_BACKUPS', async () => {
        mockPrefs({ daily: getTodayDateString(), weekly: '2026-W08' }); // only weekly needed
        const week = getISOWeekString();

        // MAX+1 weekly files as the directory would look after the write
        const existing = Array.from({ length: MAX_WEEKLY_BACKUPS }, (_, i) => {
          const w = i + 1;
          return `weekly_2025-W${String(w).padStart(2, '0')}.json`;
        });
        const afterWrite = [...existing, `weekly_${week}.json`];
        mockFileSystem.readDirectoryAsync.mockResolvedValue(afterWrite);

        await performDailyBackupIfNeeded();

        expect(mockFileSystem.deleteAsync).toHaveBeenCalledTimes(1);
        expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}${existing[0]}`,
          { idempotent: true },
        );
      });

      it('does not delete weekly files when at or below MAX_WEEKLY_BACKUPS', async () => {
        mockPrefs({ daily: getTodayDateString(), weekly: '2026-W08' });

        // 5 existing weekly files, well under 15
        mockFileSystem.readDirectoryAsync.mockResolvedValue([
          'weekly_2026-W04.json',
          'weekly_2026-W05.json',
          'weekly_2026-W06.json',
          'weekly_2026-W07.json',
          'weekly_2026-W08.json',
        ]);

        await performDailyBackupIfNeeded();

        expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
      });
    });
  });
});
