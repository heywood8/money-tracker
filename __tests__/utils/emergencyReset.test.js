import { forceDeleteDatabase, getDatabaseFileInfo } from '../../app/utils/emergencyReset';
import * as FileSystem from 'expo-file-system';

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/path/',
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

describe('emergencyReset', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('forceDeleteDatabase', () => {
    it('should delete database file when it exists', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      const result = await forceDeleteDatabase();

      expect(result).toBe(true);
      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///mock/path/SQLite/penny.db');
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///mock/path/SQLite/penny.db',
        { idempotent: true },
      );
    });

    it('should log messages when database file exists and is deleted', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Emergency database deletion initiated...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Database path:', 'file:///mock/path/SQLite/penny.db');
      expect(consoleLogSpy).toHaveBeenCalledWith('Database file found, deleting...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Database file deleted successfully');
      expect(consoleLogSpy).toHaveBeenCalledWith('Emergency database deletion completed');
    });

    it('should handle case when database file does not exist', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
      FileSystem.deleteAsync.mockResolvedValue();

      const result = await forceDeleteDatabase();

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith('Database file does not exist');
      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2); // Only WAL and SHM
    });

    it('should attempt to delete WAL and SHM files', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///mock/path/SQLite/penny.db',
        { idempotent: true },
      );
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///mock/path/SQLite/penny.db-wal',
        { idempotent: true },
      );
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///mock/path/SQLite/penny.db-shm',
        { idempotent: true },
      );
      expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(3);
    });

    it('should log when WAL file is deleted', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('WAL file deleted');
    });

    it('should log when SHM file is deleted', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('SHM file deleted');
    });

    it('should handle WAL file deletion failure gracefully', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync
        .mockResolvedValueOnce() // Main DB file succeeds
        .mockRejectedValueOnce(new Error('WAL not found')) // WAL fails
        .mockResolvedValueOnce(); // SHM succeeds

      const result = await forceDeleteDatabase();

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith('No WAL file to delete');
      expect(consoleLogSpy).toHaveBeenCalledWith('SHM file deleted');
    });

    it('should handle SHM file deletion failure gracefully', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync
        .mockResolvedValueOnce() // Main DB file succeeds
        .mockResolvedValueOnce() // WAL succeeds
        .mockRejectedValueOnce(new Error('SHM not found')); // SHM fails

      const result = await forceDeleteDatabase();

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith('WAL file deleted');
      expect(consoleLogSpy).toHaveBeenCalledWith('No SHM file to delete');
    });

    it('should return false and log error if main operation fails', async () => {
      const error = new Error('Permission denied');
      FileSystem.getInfoAsync.mockRejectedValue(error);

      const result = await forceDeleteDatabase();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Emergency database deletion failed:', error);
    });

    it('should return false if database deletion fails', async () => {
      const error = new Error('Failed to delete');
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockRejectedValue(error);

      const result = await forceDeleteDatabase();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Emergency database deletion failed:', error);
    });

    it('should use correct database path format', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(
        expect.stringMatching(/SQLite\/penny\.db$/),
      );
    });
  });

  describe('getDatabaseFileInfo', () => {
    it('should return file info when database exists', async () => {
      const mockFileInfo = {
        exists: true,
        size: 1024000,
        modificationTime: 1234567890,
      };
      FileSystem.getInfoAsync.mockResolvedValue(mockFileInfo);

      const result = await getDatabaseFileInfo();

      expect(result).toEqual({
        path: 'file:///mock/path/SQLite/penny.db',
        exists: true,
        size: 1024000,
        modificationTime: 1234567890,
      });
      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///mock/path/SQLite/penny.db');
    });

    it('should return file info when database does not exist', async () => {
      const mockFileInfo = {
        exists: false,
        size: undefined,
        modificationTime: undefined,
      };
      FileSystem.getInfoAsync.mockResolvedValue(mockFileInfo);

      const result = await getDatabaseFileInfo();

      expect(result).toEqual({
        path: 'file:///mock/path/SQLite/penny.db',
        exists: false,
        size: undefined,
        modificationTime: undefined,
      });
    });

    it('should return null and log error if operation fails', async () => {
      const error = new Error('Failed to get file info');
      FileSystem.getInfoAsync.mockRejectedValue(error);

      const result = await getDatabaseFileInfo();

      expect(result).toBe(null);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to get database file info:', error);
    });

    it('should include correct database path in result', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        size: 2048,
        modificationTime: 9876543210,
      });

      const result = await getDatabaseFileInfo();

      expect(result.path).toBe('file:///mock/path/SQLite/penny.db');
    });

    it('should handle zero-size database file', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        size: 0,
        modificationTime: 1234567890,
      });

      const result = await getDatabaseFileInfo();

      expect(result.size).toBe(0);
      expect(result.exists).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent forceDeleteDatabase calls', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10)));

      const promise1 = forceDeleteDatabase();
      const promise2 = forceDeleteDatabase();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(FileSystem.deleteAsync).toHaveBeenCalled();
    });

    it('should handle FileSystem.documentDirectory being null', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({ exists: false });

      const result = await forceDeleteDatabase(null);

      // Should construct path as "nullSQLite/penny.db" and continue
      expect(result).toBe(true);
    });

    it('should handle all file deletions failing', async () => {
      const error = new Error('Permission denied');
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockRejectedValue(error);

      const result = await forceDeleteDatabase();

      expect(result).toBe(false);
    });

    it('should handle partial file info from FileSystem', async () => {
      FileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        // Missing size and modificationTime
      });

      const result = await getDatabaseFileInfo();

      expect(result.exists).toBe(true);
      expect(result.size).toBeUndefined();
      expect(result.modificationTime).toBeUndefined();
    });
  });

  describe('Regression Tests', () => {
    it('should use idempotent option for all delete operations', async () => {
      // Regression: Ensure idempotent option is used to avoid errors if file doesn't exist
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.any(String),
        { idempotent: true },
      );
    });

    it('should delete main database even if WAL/SHM deletion fails', async () => {
      // Regression: Ensure main database is deleted even if auxiliary files fail
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync
        .mockResolvedValueOnce() // Main DB succeeds
        .mockRejectedValueOnce(new Error('WAL failed')) // WAL fails
        .mockRejectedValueOnce(new Error('SHM failed')); // SHM fails

      const result = await forceDeleteDatabase();

      expect(result).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith('Database file deleted successfully');
    });

    it('should construct correct database file paths', async () => {
      // Regression: Ensure paths are constructed correctly with SQLite subdirectory
      FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
      FileSystem.deleteAsync.mockResolvedValue();

      await forceDeleteDatabase();

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.stringMatching(/SQLite\/penny\.db$/),
        expect.any(Object),
      );
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.stringMatching(/SQLite\/penny\.db-wal$/),
        expect.any(Object),
      );
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.stringMatching(/SQLite\/penny\.db-shm$/),
        expect.any(Object),
      );
    });

    it('should not fail silently when file operations throw', async () => {
      // Regression: Ensure errors are properly caught and logged
      const error = new Error('Unexpected error');
      FileSystem.getInfoAsync.mockRejectedValue(error);

      const result = await forceDeleteDatabase();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Emergency database deletion failed:', error);
    });
  });
});
