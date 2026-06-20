import { renderHook, act } from '@testing-library/react-native';
import { Linking } from 'react-native';
import {
  useSqliteFileImport,
  deriveImportFilename,
  isOpenableFileUri,
} from '../../app/hooks/useSqliteFileImport';
import { importBackupFromFile, CancelledImportError } from '../../app/services/BackupRestore';

// --- Mocks -----------------------------------------------------------------

const mockShowDialog = jest.fn();
const mockStartImport = jest.fn();
const mockCompleteImport = jest.fn();
const mockCancelImport = jest.fn();
const mockCancelToken = { cancelled: false };

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: mockStartImport,
    completeImport: mockCompleteImport,
    cancelImport: mockCancelImport,
    getCancelToken: () => mockCancelToken,
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../app/services/BackupRestore', () => {
  class CancelledImportError extends Error {}
  return {
    importBackupFromFile: jest.fn(() => Promise.resolve({})),
    CancelledImportError,
  };
});

// Flush queued microtasks (e.g. the resolved getInitialURL promise and any
// chained state updates) so they settle inside an act() scope.
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// Pull the confirm/cancel button handlers out of the most recent showDialog call.
const getDialogButtons = () => {
  const lastCall = mockShowDialog.mock.calls[mockShowDialog.mock.calls.length - 1];
  return lastCall[2];
};
const pressButton = async (style) => {
  const button = getDialogButtons().find((b) => b.style === style);
  await act(async () => {
    button.onPress();
    await flushMicrotasks();
  });
};

describe('useSqliteFileImport helpers', () => {
  describe('isOpenableFileUri', () => {
    it('accepts content and file URIs', () => {
      expect(isOpenableFileUri('content://downloads/123')).toBe(true);
      expect(isOpenableFileUri('file:///storage/backup.db')).toBe(true);
    });

    it('rejects custom-scheme, http, null and non-string inputs', () => {
      expect(isOpenableFileUri('com.heywood8.monkeep://path')).toBe(false);
      expect(isOpenableFileUri('https://example.com/x.db')).toBe(false);
      expect(isOpenableFileUri(null)).toBe(false);
      expect(isOpenableFileUri(undefined)).toBe(false);
      expect(isOpenableFileUri(42)).toBe(false);
    });
  });

  describe('deriveImportFilename', () => {
    it('keeps recognized backup extensions from the URI', () => {
      expect(deriveImportFilename('file:///x/penny.db')).toBe('penny.db');
      expect(deriveImportFilename('file:///x/backup.sqlite')).toBe('backup.sqlite');
      expect(deriveImportFilename('file:///x/data.sqlite3')).toBe('data.sqlite3');
      expect(deriveImportFilename('file:///x/export.json')).toBe('export.json');
      expect(deriveImportFilename('file:///x/export.csv')).toBe('export.csv');
    });

    it('decodes percent-encoded filenames', () => {
      expect(deriveImportFilename('content://p/my%20backup.db')).toBe('my backup.db');
    });

    it('defaults to a .db name when no recognizable extension is present', () => {
      expect(deriveImportFilename('content://providers/document/1234')).toBe('imported_backup.db');
      expect(deriveImportFilename('file:///x/archive.bin')).toBe('imported_backup.db');
    });
  });
});

describe('useSqliteFileImport hook', () => {
  let urlListener;
  let activeUnmount;
  const originalGetInitialURL = Linking.getInitialURL;
  const originalAddEventListener = Linking.addEventListener;

  // Render the hook and flush the async getInitialURL handling inside act() so
  // the resolved promise (and any showDialog it triggers) doesn't leak past the
  // test and cause overlapping act() warnings / cross-test contamination.
  const mountHook = async (options) => {
    let utils;
    await act(async () => {
      utils = renderHook(() => useSqliteFileImport(options));
      await flushMicrotasks();
    });
    activeUnmount = utils.unmount;
    return utils;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCancelToken.cancelled = false;
    urlListener = null;
    activeUnmount = null;
    Linking.getInitialURL = jest.fn().mockResolvedValue(null);
    Linking.addEventListener = jest.fn((event, cb) => {
      if (event === 'url') urlListener = cb;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    if (activeUnmount) {
      act(() => activeUnmount());
    }
    Linking.getInitialURL = originalGetInitialURL;
    Linking.addEventListener = originalAddEventListener;
  });

  it('does nothing when disabled', async () => {
    Linking.getInitialURL.mockResolvedValue('file:///x/penny.db');
    await mountHook({ enabled: false });
    expect(Linking.getInitialURL).not.toHaveBeenCalled();
    expect(mockShowDialog).not.toHaveBeenCalled();
  });

  it('ignores non-file URIs from the initial URL', async () => {
    Linking.getInitialURL.mockResolvedValue('https://example.com/penny.db');
    await mountHook();
    expect(mockShowDialog).not.toHaveBeenCalled();
  });

  it('shows a confirmation warning when launched by opening a file', async () => {
    Linking.getInitialURL.mockResolvedValue('file:///x/penny.db');
    await mountHook();

    expect(mockShowDialog).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = mockShowDialog.mock.calls[0];
    expect(title).toBe('restore_database');
    expect(message).toBe('restore_confirm');
    expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);
    // No import starts until the user confirms.
    expect(mockStartImport).not.toHaveBeenCalled();
  });

  it('starts the import with the derived filename when confirmed', async () => {
    Linking.getInitialURL.mockResolvedValue('file:///x/penny.db');
    await mountHook();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);

    await pressButton('destructive');

    expect(mockStartImport).toHaveBeenCalledTimes(1);
    expect(importBackupFromFile).toHaveBeenCalledWith(
      { fileUri: 'file:///x/penny.db', filename: 'penny.db' },
      mockCancelToken,
    );
    expect(mockCompleteImport).toHaveBeenCalledTimes(1);
  });

  it('does not import when the warning is cancelled', async () => {
    Linking.getInitialURL.mockResolvedValue('file:///x/penny.db');
    await mountHook();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);

    await pressButton('cancel');

    expect(mockStartImport).not.toHaveBeenCalled();
    expect(importBackupFromFile).not.toHaveBeenCalled();
  });

  it('surfaces an error dialog when the import fails', async () => {
    importBackupFromFile.mockRejectedValueOnce(new Error('bad file'));
    Linking.getInitialURL.mockResolvedValue('content://providers/document/1');
    await mountHook();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);

    await pressButton('destructive');

    expect(mockCancelImport).toHaveBeenCalledTimes(1);
    // First dialog = warning, second dialog = error.
    expect(mockShowDialog).toHaveBeenCalledTimes(2);
    expect(mockShowDialog.mock.calls[1][1]).toBe('bad file');
    expect(mockCompleteImport).not.toHaveBeenCalled();
  });

  it('silently aborts when the import is cancelled mid-flight', async () => {
    importBackupFromFile.mockRejectedValueOnce(new CancelledImportError('cancelled'));
    Linking.getInitialURL.mockResolvedValue('file:///x/penny.db');
    await mountHook();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);

    await pressButton('destructive');

    expect(mockCancelImport).toHaveBeenCalledTimes(1);
    // Only the original warning dialog - no error dialog for user cancellation.
    expect(mockShowDialog).toHaveBeenCalledTimes(1);
  });

  it('handles files opened while the app is already running (warm start)', async () => {
    await mountHook();
    expect(mockShowDialog).not.toHaveBeenCalled();

    await act(async () => {
      urlListener({ url: 'file:///x/penny.db' });
      await flushMicrotasks();
    });
    expect(mockShowDialog).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second warning while one is already pending', async () => {
    Linking.getInitialURL.mockResolvedValue('file:///x/penny.db');
    await mountHook();
    expect(mockShowDialog).toHaveBeenCalledTimes(1);

    await act(async () => {
      urlListener({ url: 'file:///x/another.db' });
      await flushMicrotasks();
    });
    // Still only one dialog - the pending prompt blocks a second.
    expect(mockShowDialog).toHaveBeenCalledTimes(1);
  });
});
