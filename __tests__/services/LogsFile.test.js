/**
 * Tests for LogsFile.js - File system log persistence
 * Covers writing, reading, pruning, and clearing log files
 */

// Mock expo-file-system/legacy before imports
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/document/',
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import { writeTodayLogs, readAllLogs, pruneOldFiles, clearAllLogs } from '../../app/services/LogsFile';

const mockFS = require('expo-file-system/legacy');

// Stable date for all tests
const TODAY = '2026-05-16';

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-16T10:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFS.makeDirectoryAsync.mockResolvedValue(undefined);
  mockFS.writeAsStringAsync.mockResolvedValue(undefined);
  mockFS.getInfoAsync.mockResolvedValue({ exists: true });
  mockFS.readDirectoryAsync.mockResolvedValue([]);
  mockFS.readAsStringAsync.mockResolvedValue('[]');
  mockFS.deleteAsync.mockResolvedValue(undefined);
});

describe('writeTodayLogs', () => {
  it('writes only today\'s entries to the log file', async () => {
    const entries = [
      { timestamp: '2026-05-16T09:00:00.000Z', message: 'today entry' },
      { timestamp: '2026-05-15T09:00:00.000Z', message: 'yesterday entry' },
    ];

    await writeTodayLogs(entries);

    expect(mockFS.makeDirectoryAsync).toHaveBeenCalledWith(
      expect.stringContaining('logs/'),
      { intermediates: true },
    );
    expect(mockFS.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringContaining(`penny-logs-${TODAY}.json`),
      JSON.stringify([entries[0]]),
    );
  });

  it('writes empty array when no entries match today', async () => {
    const entries = [
      { timestamp: '2026-05-14T09:00:00.000Z', message: 'old entry' },
    ];

    await writeTodayLogs(entries);

    expect(mockFS.writeAsStringAsync).toHaveBeenCalledWith(
      expect.any(String),
      '[]',
    );
  });

  it('writes all entries when all match today', async () => {
    const entries = [
      { timestamp: '2026-05-16T08:00:00.000Z', message: 'a' },
      { timestamp: '2026-05-16T09:00:00.000Z', message: 'b' },
    ];

    await writeTodayLogs(entries);

    expect(mockFS.writeAsStringAsync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(entries),
    );
  });

  it('does not throw when filesystem write fails', async () => {
    mockFS.makeDirectoryAsync.mockRejectedValue(new Error('disk full'));

    await expect(writeTodayLogs([{ timestamp: '2026-05-16T09:00:00.000Z', message: 'x' }])).resolves.toBeUndefined();
  });
});

describe('readAllLogs', () => {
  it('returns empty array when logs directory does not exist', async () => {
    mockFS.getInfoAsync.mockResolvedValue({ exists: false });

    const result = await readAllLogs();

    expect(result).toEqual([]);
  });

  it('returns empty array when directory has no log files', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue(['other.txt', 'somefile.json']);

    const result = await readAllLogs();

    expect(result).toEqual([]);
  });

  it('reads and merges entries from multiple log files', async () => {
    const file1Entries = [{ timestamp: '2026-05-14T10:00:00.000Z', message: 'old' }];
    const file2Entries = [{ timestamp: '2026-05-16T08:00:00.000Z', message: 'new' }];

    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-14.json',
      'penny-logs-2026-05-16.json',
    ]);
    mockFS.readAsStringAsync
      .mockResolvedValueOnce(JSON.stringify(file1Entries))
      .mockResolvedValueOnce(JSON.stringify(file2Entries));

    const result = await readAllLogs();

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe('old');
    expect(result[1].message).toBe('new');
  });

  it('sorts entries by timestamp ascending', async () => {
    const entries = [
      { timestamp: '2026-05-16T12:00:00.000Z', message: 'later' },
      { timestamp: '2026-05-16T08:00:00.000Z', message: 'earlier' },
    ];
    mockFS.readDirectoryAsync.mockResolvedValue(['penny-logs-2026-05-16.json']);
    mockFS.readAsStringAsync.mockResolvedValue(JSON.stringify(entries));

    const result = await readAllLogs();

    expect(result[0].message).toBe('earlier');
    expect(result[1].message).toBe('later');
  });

  it('skips corrupt (non-JSON) files silently', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-15.json',
      'penny-logs-2026-05-16.json',
    ]);
    mockFS.readAsStringAsync
      .mockResolvedValueOnce('NOT_VALID_JSON')
      .mockResolvedValueOnce(JSON.stringify([{ timestamp: '2026-05-16T09:00:00.000Z', message: 'ok' }]));

    const result = await readAllLogs();

    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('ok');
  });

  it('skips files where parsed value is not an array', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue(['penny-logs-2026-05-16.json']);
    mockFS.readAsStringAsync.mockResolvedValue(JSON.stringify({ not: 'array' }));

    const result = await readAllLogs();

    expect(result).toEqual([]);
  });

  it('returns empty array when readDirectoryAsync throws', async () => {
    mockFS.readDirectoryAsync.mockRejectedValue(new Error('io error'));

    const result = await readAllLogs();

    expect(result).toEqual([]);
  });
});

describe('pruneOldFiles', () => {
  it('does nothing when directory does not exist', async () => {
    mockFS.getInfoAsync.mockResolvedValue({ exists: false });

    await pruneOldFiles(7);

    expect(mockFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('deletes files older than retention days', async () => {
    // Today is 2026-05-16, retention 7 days → cutoff is 2026-05-09
    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-08.json', // older than cutoff → delete
      'penny-logs-2026-05-09.json', // equal to cutoff → keep (not strictly less)
      'penny-logs-2026-05-16.json', // today → keep
    ]);

    await pruneOldFiles(7);

    expect(mockFS.deleteAsync).toHaveBeenCalledTimes(1);
    expect(mockFS.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('penny-logs-2026-05-08.json'),
      { idempotent: true },
    );
  });

  it('skips files that are not log files', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue([
      'other-file.txt',
      'backup.json',
      'penny-logs-2026-05-16.json',
    ]);

    await pruneOldFiles(7);

    expect(mockFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('does not delete files within retention period', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-12.json', // 4 days old, within 7-day window
      'penny-logs-2026-05-16.json',
    ]);

    await pruneOldFiles(7);

    expect(mockFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('handles delete failure silently', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue(['penny-logs-2026-05-01.json']);
    mockFS.deleteAsync.mockRejectedValue(new Error('permission denied'));

    await expect(pruneOldFiles(7)).resolves.toBeUndefined();
  });

  it('handles readDirectoryAsync failure silently', async () => {
    mockFS.readDirectoryAsync.mockRejectedValue(new Error('io error'));

    await expect(pruneOldFiles(7)).resolves.toBeUndefined();
  });

  it('uses custom retention days parameter', async () => {
    // Today is 2026-05-16, retention 1 day → cutoff 2026-05-15
    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-14.json', // 2 days old → delete
      'penny-logs-2026-05-15.json', // equal to cutoff → keep
      'penny-logs-2026-05-16.json', // today → keep
    ]);

    await pruneOldFiles(1);

    expect(mockFS.deleteAsync).toHaveBeenCalledTimes(1);
    expect(mockFS.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('penny-logs-2026-05-14.json'),
      { idempotent: true },
    );
  });
});

describe('clearAllLogs', () => {
  it('does nothing when directory does not exist', async () => {
    mockFS.getInfoAsync.mockResolvedValue({ exists: false });

    await clearAllLogs();

    expect(mockFS.deleteAsync).not.toHaveBeenCalled();
  });

  it('deletes all log files in directory', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-14.json',
      'penny-logs-2026-05-15.json',
      'penny-logs-2026-05-16.json',
    ]);

    await clearAllLogs();

    expect(mockFS.deleteAsync).toHaveBeenCalledTimes(3);
  });

  it('skips non-log files', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue([
      'other.txt',
      'penny-logs-2026-05-16.json',
    ]);

    await clearAllLogs();

    expect(mockFS.deleteAsync).toHaveBeenCalledTimes(1);
    expect(mockFS.deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('penny-logs-2026-05-16.json'),
      { idempotent: true },
    );
  });

  it('handles individual delete failure silently and continues', async () => {
    mockFS.readDirectoryAsync.mockResolvedValue([
      'penny-logs-2026-05-15.json',
      'penny-logs-2026-05-16.json',
    ]);
    mockFS.deleteAsync
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce(undefined);

    await expect(clearAllLogs()).resolves.toBeUndefined();
    expect(mockFS.deleteAsync).toHaveBeenCalledTimes(2);
  });

  it('handles readDirectoryAsync failure silently', async () => {
    mockFS.readDirectoryAsync.mockRejectedValue(new Error('io error'));

    await expect(clearAllLogs()).resolves.toBeUndefined();
  });
});
