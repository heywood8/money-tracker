/**
 * Tests for DailyBackupService.js
 * Covers: daily/weekly deduplication, backup creation, cleanup of old backups,
 * directory initialisation, snapshot reuse, and error resilience.
 */

import {
  acceptBackupBaseline,
  getBackupStatus,
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
  readAsStringAsync: jest.fn(),
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
    accounts: [{ id: 'acc-1', name: 'Checking', balance: '1000.00', currency: 'USD' }],
    categories: [],
    operations: [],
    budgets: [],
    app_metadata: [],
    balance_history: [],
  },
});

const makeEmptyBackup = () => ({
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
const mockPrefs = ({ daily = null, weekly = null, lastGood = null, baseline = null, skipped = null } = {}) => {
  mockPreferencesDB.getPreference.mockImplementation((key, defaultVal = null) => {
    if (key === 'last_daily_backup_date') return Promise.resolve(daily);
    if (key === 'last_weekly_backup_week') return Promise.resolve(weekly);
    if (key === 'last_good_daily_backup_date') return Promise.resolve(lastGood);
    if (key === 'backup_baseline_rows') return Promise.resolve(baseline);
    if (key === 'backup_last_skipped') return Promise.resolve(skipped);
    return Promise.resolve(defaultVal);
  });
};

/** A backup payload with `rows` operations alongside one account. */
const backupWithRows = (rows) => ({
  version: 1,
  timestamp: `${TODAY}T10:00:00.000Z`,
  platform: 'native',
  data: {
    accounts: [{ id: 'acc-1', name: 'Checking', balance: '1000.00', currency: 'USD' }],
    categories: [],
    operations: Array.from({ length: rows }, (_, i) => ({ id: `op-${i}` })),
    budgets: [],
    app_metadata: [],
    balance_history: [],
  },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DailyBackupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(`${TODAY}T10:00:00.000Z`));
    jest.clearAllMocks();

    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
    mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
    mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(makeSampleBackup()));
    mockFileSystem.deleteAsync.mockResolvedValue(undefined);

    mockBackupRestore.createBackup.mockResolvedValue(makeSampleBackup());
    mockPreferencesDB.setPreference.mockResolvedValue(undefined);

    // Default: no prior backups
    mockPrefs();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── getTodayDateString ─────────────────────────────────────────────────────

  describe('getTodayDateString', () => {
    it('returns a string matching YYYY-MM-DD', async () => {
      expect(getTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── getISOWeekString ───────────────────────────────────────────────────────

  describe('getISOWeekString', () => {
    it('returns a string matching YYYY-WNN', async () => {
      expect(getISOWeekString()).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('is consistent with getTodayDateString for the same instant', async () => {
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

    it('includes manual backup files alongside daily and weekly', async () => {
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        'daily_2026-02-26.json',
        'manual_2026-02-26_14-32-05.json',
        'weekly_2026-W09.json',
      ]);

      const result = await getStoredBackups();
      expect(result).toContain(`${DAILY_BACKUP_DIR}manual_2026-02-26_14-32-05.json`);
      expect(result).toContain(`${DAILY_BACKUP_DIR}daily_2026-02-26.json`);
      expect(result).toContain(`${DAILY_BACKUP_DIR}weekly_2026-W09.json`);
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

      it('updates last_good_daily_backup_date after a successful daily write', async () => {
        const today = getTodayDateString();
        await performDailyBackupIfNeeded();

        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith(
          'last_good_daily_backup_date',
          today,
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
        expect(calls).toContain('last_good_daily_backup_date');
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

    describe('empty snapshot protection', () => {
      beforeEach(() => mockPrefs({ daily: null, weekly: null }));

      it('skips the write when the new snapshot has 0 accounts but a prior backup had data', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({ data: { accounts: [{ id: 'acc-1' }, { id: 'acc-2' }] } }),
        );

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(false);
        expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      });

      it('does not advance the backup bookkeeping when the snapshot is rejected', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({ data: { accounts: [{ id: 'acc-1' }] } }),
        );

        await performDailyBackupIfNeeded();

        const written = mockPreferencesDB.setPreference.mock.calls.map(([key]) => key);
        expect(written).not.toContain('last_daily_backup_date');
        expect(written).not.toContain('last_weekly_backup_week');
        expect(written).not.toContain('last_good_daily_backup_date');
        expect(written).not.toContain('backup_baseline_rows');
        // The refusal itself IS recorded — that is the whole point of #1715:
        // a skipped run used to be announced by nothing but a console.warn.
        expect(written).toContain('backup_last_skipped');
      });

      it('does not trigger cleanup when the snapshot is rejected', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({ data: { accounts: [{ id: 'acc-1' }] } }),
        );

        await performDailyBackupIfNeeded();

        expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
      });

      it('allows the write when the new snapshot has 0 accounts and there are no prior backups', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue([]);

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('allows the write when the prior backup also had 0 accounts', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({ data: { accounts: [] } }),
        );

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('allows the write when the prior backup cannot be parsed', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue('not-valid-json{{{');

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('allows the write when readAsStringAsync throws', async () => {
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockRejectedValue(new Error('File not found'));

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('proceeds normally when the snapshot has real account data', async () => {
        // makeSampleBackup has 1 account — isSnapshotValid returns true immediately
        mockFileSystem.readDirectoryAsync.mockResolvedValue([]);
        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });
    });

    describe('row-count regression protection (layer 2)', () => {
      beforeEach(() => mockPrefs({ daily: null, weekly: null }));

      it('skips write when total rows drop by more than 50% vs prior backup', async () => {
        // New snapshot: 1 account, 0 operations = 1 total row
        // Prior backup: 1 account, 100 operations = 101 total rows — 1/101 < 50%
        mockBackupRestore.createBackup.mockResolvedValue({
          version: 1,
          timestamp: `${TODAY}T10:00:00.000Z`,
          platform: 'native',
          data: {
            accounts: [{ id: 'acc-1', name: 'Checking', balance: '1000.00', currency: 'USD' }],
            categories: [],
            operations: [],
            budgets: [],
            app_metadata: [],
            balance_history: [],
          },
        });

        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({
            data: {
              accounts: [{ id: 'acc-1' }],
              operations: Array.from({ length: 100 }, (_, i) => ({ id: i })),
            },
          }),
        );

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(false);
        expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
        expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
      });

      it('allows write when total rows drop by exactly 50% (boundary)', async () => {
        // New: 1 account + 1 op = 2 total; Prior: 1 account + 3 ops = 4 total
        // 2/4 = 50% — not strictly less than 50%, so allowed
        mockBackupRestore.createBackup.mockResolvedValue({
          version: 1,
          timestamp: `${TODAY}T10:00:00.000Z`,
          platform: 'native',
          data: {
            accounts: [{ id: 'acc-1', name: 'Checking', balance: '1000.00', currency: 'USD' }],
            categories: [],
            operations: [{ id: 'op-1' }],
            budgets: [],
            app_metadata: [],
            balance_history: [],
          },
        });

        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({
            data: {
              accounts: [{ id: 'acc-1' }],
              operations: [{ id: 'op-1' }, { id: 'op-2' }, { id: 'op-3' }],
            },
          }),
        );

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('allows write when prior backup is unreadable (fail-open)', async () => {
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockRejectedValue(new Error('File not found'));

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('allows write when prior backup has 0 rows (fresh app)', async () => {
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({ data: { accounts: [], operations: [] } }),
        );

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });
    });

    // Regression for issue #1715. The guard used to measure a new snapshot
    // against the newest backup FILE. After a legitimate shrink — restoring an
    // older or partial backup, a reset followed by a small import — every later
    // snapshot was smaller than that file, so nothing was ever written, so the
    // file never moved and the comparison never changed. Automatic backups
    // stopped for good, announced by nothing but a console.warn.
    describe('baseline re-anchoring after a restore (#1715)', () => {
      it('writes a backup once a restore has re-anchored the baseline', async () => {
        // The user restored a 10-row backup over a 101-row database.
        mockPrefs({ daily: null, weekly: null, baseline: '11' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(10));

        // The newest file on disk is still the big pre-restore one.
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({
            data: {
              accounts: [{ id: 'acc-1' }],
              operations: Array.from({ length: 100 }, (_, i) => ({ id: i })),
            },
          }),
        );

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(true);
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      });

      it('still refuses a real collapse measured against the baseline', async () => {
        // No restore: the baseline is the full database, and the snapshot has
        // lost almost all of it — which is what the guard is for.
        mockPrefs({ daily: null, weekly: null, baseline: '101' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(0));
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);

        const result = await performDailyBackupIfNeeded();

        expect(result).toBe(false);
        expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      });

      it('records the refusal so Settings can show it', async () => {
        mockPrefs({ daily: null, weekly: null, baseline: '101' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(0));
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);

        await performDailyBackupIfNeeded();

        const skipWrite = mockPreferencesDB.setPreference.mock.calls
          .find(([key]) => key === 'backup_last_skipped');
        expect(skipWrite).toBeDefined();
        expect(JSON.parse(skipWrite[1])).toMatchObject({ baselineRows: 101, snapshotRows: 1 });
      });

      it('advances the baseline and clears the refusal on an accepted snapshot', async () => {
        mockPrefs({ daily: null, weekly: null, baseline: '5' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(9));
        mockFileSystem.readDirectoryAsync.mockResolvedValue([]);

        await performDailyBackupIfNeeded();

        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('backup_baseline_rows', '10');
        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('backup_last_skipped', '');
      });

      // Falls back to the file for a database that predates the baseline, so an
      // upgrade does not silently drop the protection.
      it('uses the newest backup file when no baseline is stored yet', async () => {
        mockPrefs({ daily: null, weekly: null, baseline: null });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(0));
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({
            data: {
              accounts: [{ id: 'acc-1' }],
              operations: Array.from({ length: 100 }, (_, i) => ({ id: i })),
            },
          }),
        );

        expect(await performDailyBackupIfNeeded()).toBe(false);
      });
    });

    // isSnapshotValid is a verdict, not a write. The Drive backup asks the same
    // guard (GoogleDriveBackupService), and a yes there says nothing about
    // whether the local rotation wrote anything, so only a real write may
    // advance the baseline.
    describe('the guard is a verdict, not bookkeeping (#1715)', () => {
      it('does not advance the baseline when nothing is written', async () => {
        // Both up to date: performDailyBackupIfNeeded returns before any write.
        mockPrefs({ daily: TODAY, weekly: THIS_WEEK, baseline: '5' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(9));

        await performDailyBackupIfNeeded();

        const written = mockPreferencesDB.setPreference.mock.calls.map(([key]) => key);
        expect(written).not.toContain('backup_baseline_rows');
      });
    });

    describe('getBackupStatus and acceptBackupBaseline (#1715)', () => {
      it('reports the last backup and the current refusal', async () => {
        mockPrefs({
          daily: '2026-02-20',
          weekly: '2026-W08',
          skipped: JSON.stringify({ at: '2026-02-25T10:00:00.000Z', baselineRows: 101, snapshotRows: 10 }),
        });

        const status = await getBackupStatus();

        expect(status.lastDailyDate).toBe('2026-02-20');
        expect(status.lastWeeklyWeek).toBe('2026-W08');
        expect(status.skipped).toMatchObject({ baselineRows: 101, snapshotRows: 10 });
      });

      it('reports no refusal once backups are landing again', async () => {
        mockPrefs({ daily: TODAY, weekly: THIS_WEEK, skipped: '' });
        expect((await getBackupStatus()).skipped).toBeNull();
      });

      // The user answering the guard: this smaller dataset is the real one.
      it('takes the current size as the baseline and writes immediately', async () => {
        mockPrefs({ daily: TODAY, weekly: THIS_WEEK, baseline: '101' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(9));
        mockFileSystem.readDirectoryAsync.mockResolvedValue([]);

        expect(await acceptBackupBaseline()).toBe(true);

        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('backup_baseline_rows', '10');
        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith('backup_last_skipped', '');
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
          `${DAILY_BACKUP_DIR}daily_${TODAY}.json`,
          expect.any(String),
        );
      });

      it('reports failure rather than throwing when the write fails', async () => {
        mockPrefs({ baseline: '101' });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(9));
        mockFileSystem.writeAsStringAsync.mockRejectedValue(new Error('disk full'));

        expect(await acceptBackupBaseline()).toBe(false);
      });

      // The order matters: clearing the standing refusal before the write left
      // Settings saying "all good" with nothing on disk behind it.
      it('does not clear the refusal when the write fails', async () => {
        mockPrefs({ baseline: '101', skipped: JSON.stringify({ at: 'x', baselineRows: 101, snapshotRows: 10 }) });
        mockBackupRestore.createBackup.mockResolvedValue(backupWithRows(9));
        mockFileSystem.writeAsStringAsync.mockRejectedValue(new Error('disk full'));

        await acceptBackupBaseline();

        const written = mockPreferencesDB.setPreference.mock.calls.map(([key]) => key);
        expect(written).not.toContain('backup_last_skipped');
        expect(written).not.toContain('backup_baseline_rows');
      });

      // Accepting a SMALLER dataset is the user's call; accepting an EMPTY one
      // is the failed-database-read signature the guard exists for — and this
      // path overwrites today's file and moves the last-good pin onto it.
      it('refuses to accept a snapshot with no accounts', async () => {
        mockPrefs({ baseline: '101' });
        mockBackupRestore.createBackup.mockResolvedValue({
          version: 1,
          timestamp: `${TODAY}T10:00:00.000Z`,
          platform: 'native',
          data: { accounts: [], categories: [], operations: [], budgets: [], app_metadata: [], balance_history: [] },
        });

        expect(await acceptBackupBaseline()).toBe(false);
        expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      });
    });

    describe('pinned last-good backup protection (layer 3)', () => {
      it('pins the last-good backup date after a successful daily write', async () => {
        mockPrefs({ daily: null, weekly: THIS_WEEK });
        const today = getTodayDateString();

        await performDailyBackupIfNeeded();

        expect(mockPreferencesDB.setPreference).toHaveBeenCalledWith(
          'last_good_daily_backup_date',
          today,
        );
      });

      it('does not update last-good backup date when snapshot is rejected', async () => {
        mockPrefs({ daily: null, weekly: null });
        mockBackupRestore.createBackup.mockResolvedValue(makeEmptyBackup());
        mockFileSystem.readDirectoryAsync.mockResolvedValue(['daily_2026-02-25.json']);
        mockFileSystem.readAsStringAsync.mockResolvedValue(
          JSON.stringify({ data: { accounts: [{ id: 'acc-1' }] } }),
        );

        await performDailyBackupIfNeeded();

        const goodDateCalls = mockPreferencesDB.setPreference.mock.calls.filter(
          c => c[0] === 'last_good_daily_backup_date',
        );
        expect(goodDateCalls).toHaveLength(0);
      });

      it('excludes pinned backup from cleanup even when over MAX_DAILY_BACKUPS', async () => {
        const pinnedDate = '2026-02-18';
        mockPrefs({ daily: null, weekly: THIS_WEEK, lastGood: pinnedDate });

        const today = getTodayDateString();

        // Simulate MAX_DAILY_BACKUPS files on disk after write, including pinned date at oldest slot
        const filenames = [
          `daily_${pinnedDate}.json`,
          ...Array.from({ length: MAX_DAILY_BACKUPS - 1 }, (_, i) => {
            const d = new Date('2026-02-19');
            d.setDate(d.getDate() + i);
            return `daily_${d.toISOString().split('T')[0]}.json`;
          }),
          `daily_${today}.json`,
        ];

        mockFileSystem.readDirectoryAsync.mockResolvedValue(filenames);

        await performDailyBackupIfNeeded();

        // deleteAsync should have been called, but NOT for the pinned backup
        const deletedUris = mockFileSystem.deleteAsync.mock.calls.map(c => c[0]);
        expect(deletedUris).not.toContain(
          `${DAILY_BACKUP_DIR}daily_${pinnedDate}.json`,
        );
      });
    });
  });
});

