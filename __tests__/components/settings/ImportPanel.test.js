/* eslint-disable react/prop-types */
/**
 * Tests for the import subpanel: the source picker, the nested confirm steps,
 * and the Google Sheets run — including the dead-end that sends the user off to
 * set up an export first.
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import ImportPanel from '../../../app/components/settings/ImportPanel';

const mockPickImportFile = jest.fn(() => Promise.resolve({ fileUri: '/f.json' }));
const mockImportBackupFromFile = jest.fn(() => Promise.resolve());
const mockRestoreBackup = jest.fn(() => Promise.resolve());
const mockGetStoredBackups = jest.fn(() => Promise.resolve([]));
const mockGetPreRestoreSnapshots = jest.fn(() => Promise.resolve([]));
const mockImportFromSheets = jest.fn(() => Promise.resolve({ version: 1 }));
const mockGetValidAccessToken = jest.fn(() => Promise.resolve('token'));
const mockGetPreference = jest.fn(() => Promise.resolve('sheet-id'));
const mockShowDialog = jest.fn();
const mockStartImport = jest.fn();
const mockCompleteImport = jest.fn();
const mockCancelImport = jest.fn();

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee', destructive: '#d9534f' },
  }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));
jest.mock('../../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: mockStartImport,
    completeImport: mockCompleteImport,
    cancelImport: mockCancelImport,
    getCancelToken: () => ({ cancelled: false }),
  }),
}));
jest.mock('../../../app/services/BackupRestore', () => ({
  pickImportFile: (...a) => mockPickImportFile(...a),
  importBackupFromFile: (...a) => mockImportBackupFromFile(...a),
  restoreBackup: (...a) => mockRestoreBackup(...a),
  getPreRestoreSnapshots: (...a) => mockGetPreRestoreSnapshots(...a),
  // Declared inside the factory: a `class` in the enclosing scope is still in
  // its temporal dead zone when the hoisted factory runs, so `instanceof`
  // against it throws instead of matching.
  CancelledImportError: class CancelledImportError extends Error {},
}));
jest.mock('../../../app/services/DailyBackupService', () => ({
  getStoredBackups: (...a) => mockGetStoredBackups(...a),
}));
jest.mock('../../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: (...a) => mockGetValidAccessToken(...a),
  signIn: jest.fn(() => Promise.resolve('token')),
  importFromSheets: (...a) => mockImportFromSheets(...a),
}));
jest.mock('../../../app/services/PreferencesDB', () => ({
  getPreference: (...a) => mockGetPreference(...a),
  PREF_KEYS: { GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet' },
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(() => Promise.resolve({ size: 1024 })),
  readAsStringAsync: jest.fn(() => Promise.resolve('{"version":1}')),
  deleteAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

const noop = () => {};

const panel = (props = {}) => (
  <ImportPanel
    step="source"
    onPushStep={noop}
    onPopToRoot={noop}
    onBusyChange={noop}
    onRegisterBack={noop}
    onRegisterRefresh={noop}
    onDone={noop}
    onSetUpSheetsExport={noop}
    {...props}
  />
);

const setup = (props = {}) => render(panel(props));

describe('ImportPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPreference.mockImplementation(() => Promise.resolve('sheet-id'));
    mockGetStoredBackups.mockImplementation(() => Promise.resolve([]));
    mockImportFromSheets.mockImplementation(() => Promise.resolve({ version: 1 }));
  });

  describe('source picker', () => {
    it('offers all three sources', async () => {
      const { getByText } = await setup();

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
      expect(getByText('import_from_google_sheets')).toBeTruthy();
    });

    it('steps into the file confirmation', async () => {
      const onPushStep = jest.fn();
      const { getByText } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByText('import_from_file'));
      });

      expect(onPushStep).toHaveBeenCalledWith('confirm-file');
    });

    it('steps into the local backup list', async () => {
      const onPushStep = jest.fn();
      const { getByText } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByText('import_from_local'));
      });

      expect(onPushStep).toHaveBeenCalledWith('local-list');
    });

    it('reads the stored backups when it opens', async () => {
      await setup();
      await waitFor(() => expect(mockGetStoredBackups).toHaveBeenCalled());
    });
  });

  describe('confirm steps', () => {
    it('warns before restoring from a picked file', async () => {
      const { getByText, getByTestId } = await setup({ step: 'confirm-file' });

      expect(getByText('restore_confirm')).toBeTruthy();
      expect(getByTestId('confirm-import-file-btn')).toBeTruthy();
    });

    it('closes the panel and hands over to the import progress UI', async () => {
      const onDone = jest.fn();
      const { getByTestId } = await setup({ step: 'confirm-file', onDone });

      await act(async () => {
        fireEvent.press(getByTestId('confirm-import-file-btn'));
      });

      expect(onDone).toHaveBeenCalled();
      expect(mockStartImport).toHaveBeenCalled();
      expect(mockImportBackupFromFile).toHaveBeenCalled();
      expect(mockCompleteImport).toHaveBeenCalled();
    });

    it('unwinds to the source list when the file picker is cancelled', async () => {
      mockPickImportFile.mockImplementationOnce(() => Promise.reject(new Error('Import cancelled')));
      const onPopToRoot = jest.fn();
      const onDone = jest.fn();
      const { getByTestId } = await setup({ step: 'confirm-file', onPopToRoot, onDone });

      await act(async () => {
        fireEvent.press(getByTestId('confirm-import-file-btn'));
      });

      expect(onPopToRoot).toHaveBeenCalled();
      // A cancelled pick is not a restore: the panel stays put.
      expect(onDone).not.toHaveBeenCalled();
      expect(mockStartImport).not.toHaveBeenCalled();
    });

    it('reports a file picker that failed for any other reason', async () => {
      mockPickImportFile.mockImplementationOnce(() => Promise.reject(new Error('no file manager')));
      const onPopToRoot = jest.fn();
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getByTestId } = await setup({ step: 'confirm-file', onPopToRoot });

      await act(async () => {
        fireEvent.press(getByTestId('confirm-import-file-btn'));
      });

      expect(mockShowDialog).toHaveBeenCalled();
      // A failure is not a cancel: it stays on the confirmation, not the list.
      expect(onPopToRoot).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('reports a restore that failed after the file was read', async () => {
      mockImportBackupFromFile.mockImplementationOnce(() => Promise.reject(new Error('bad backup')));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getByTestId } = await setup({ step: 'confirm-file' });

      await act(async () => {
        fireEvent.press(getByTestId('confirm-import-file-btn'));
      });

      await waitFor(() => expect(mockCancelImport).toHaveBeenCalled());
      expect(mockCompleteImport).not.toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Google Sheets run', () => {
    it('stops on the source list with a set-up shortcut when no spreadsheet is configured', async () => {
      mockGetPreference.mockImplementation(() => Promise.resolve(null));
      const onPushStep = jest.fn();
      const { getByText, getByTestId } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });

      expect(onPushStep).not.toHaveBeenCalled();
      expect(getByTestId('settings-import-no-spreadsheet')).toBeTruthy();
      expect(getByTestId('settings-import-setup-export')).toBeTruthy();
    });

    it('sends the user to export when they take the shortcut', async () => {
      mockGetPreference.mockImplementation(() => Promise.resolve(null));
      const onSetUpSheetsExport = jest.fn();
      const { getByText, getByTestId } = await setup({ onSetUpSheetsExport });

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('settings-import-setup-export'));
      });

      expect(onSetUpSheetsExport).toHaveBeenCalled();
    });

    it('steps into the progress view and restores what it read', async () => {
      const onPushStep = jest.fn();
      const onDone = jest.fn();
      const { getByText } = await setup({ onPushStep, onDone });

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });

      expect(onPushStep).toHaveBeenCalledWith('sheets-progress');
      expect(onDone).toHaveBeenCalled();
      expect(mockRestoreBackup).toHaveBeenCalled();
    });

    it('releases the back lock when the spreadsheet turns out to be gone', async () => {
      // Regression: importFromSheets marks `connect` in-flight before it fails.
      // Unwinding to the source list with that stage still in flight would leave
      // the host's back lock on for good — the panel could not be left at all.
      mockImportFromSheets.mockImplementation(() => Promise.reject(new Error('no_spreadsheet_configured')));
      const onBusyChange = jest.fn();
      const { getByText } = await setup({ onBusyChange });

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });

      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });

    it('lists the stages on the progress step', async () => {
      const { getByText } = await setup({ step: 'sheets-progress' });
      expect(getByText('Connecting to spreadsheet')).toBeTruthy();
      expect(getByText('Reading sheet data')).toBeTruthy();
    });

    it.each([
      ['refresh_failed', 'google_sheets_access_revoked'],
      ['spreadsheet_not_found', 'google_sheets_not_found'],
      ['something unexpected', 'google_sheets_import_failed'],
    ])('stays on the progress view and explains a %s failure', async (thrown, message) => {
      mockImportFromSheets.mockImplementation(() => Promise.reject(new Error(thrown)));
      const onPopToRoot = jest.fn();
      const onDone = jest.fn();
      const { getByText, rerender } = await setup({ onPopToRoot, onDone });

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });

      // A failure the user can act on keeps the run on screen, unlike the
      // cancel and not-configured paths that unwind to the list.
      expect(onPopToRoot).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();

      await act(async () => {
        rerender(panel({ step: 'sheets-progress', onPopToRoot, onDone }));
      });
      expect(getByText(message)).toBeTruthy();
    });

    it('unwinds to the source list when the Google sign-in is cancelled', async () => {
      mockImportFromSheets.mockImplementation(() => Promise.reject(new Error('sign_in_cancelled')));
      const onPopToRoot = jest.fn();
      const onDone = jest.fn();
      const { getByText } = await setup({ onPopToRoot, onDone });

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });

      expect(onPopToRoot).toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    });

    it('signs in when there is no valid token yet', async () => {
      mockGetValidAccessToken.mockImplementationOnce(() => Promise.reject(new Error('expired')));
      const { getByText } = await setup();

      await act(async () => {
        fireEvent.press(getByText('import_from_google_sheets'));
      });

      expect(mockImportFromSheets).toHaveBeenCalled();
    });
  });

  describe('restoring a local backup', () => {
    const BACKUP = { uri: 'file:///daily_2026-08-01.json', filename: 'daily_2026-08-01.json', size: 1024 };

    beforeEach(() => {
      mockGetStoredBackups.mockImplementation(() => Promise.resolve([BACKUP.uri]));
    });

    it('names the backup being restored on the confirmation', async () => {
      const onPushStep = jest.fn();
      const { getAllByTestId, getByText, rerender } = await setup({ step: 'local-list', onPushStep });

      await waitFor(() => expect(getAllByTestId('icon-refresh-outline').length).toBeGreaterThan(0));
      await act(async () => {
        fireEvent.press(getAllByTestId('icon-refresh-outline')[0]);
      });
      expect(onPushStep).toHaveBeenCalledWith('confirm-local');

      // The host drives the step; the panel keeps the chosen backup across it.
      await act(async () => {
        rerender(panel({ step: 'confirm-local', onPushStep }));
      });

      expect(getByText('restore_confirm')).toBeTruthy();
      expect(getByText(/2026/)).toBeTruthy();
    });

    it('reports a failed restore rather than leaving it silent', async () => {
      mockRestoreBackup.mockImplementationOnce(() => Promise.reject(new Error('corrupt file')));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getAllByTestId, getByText, rerender } = await setup({ step: 'local-list' });

      await waitFor(() => expect(getAllByTestId('icon-refresh-outline').length).toBeGreaterThan(0));
      await act(async () => {
        fireEvent.press(getAllByTestId('icon-refresh-outline')[0]);
      });
      await act(async () => {
        rerender(panel({ step: 'confirm-local' }));
      });
      await act(async () => {
        fireEvent.press(getByText('restore_database'));
      });

      await waitFor(() => expect(mockCancelImport).toHaveBeenCalled());
      expect(mockShowDialog).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('drops a deleted backup from the list', async () => {
      const { getAllByTestId, getByText, queryAllByTestId } = await setup({ step: 'local-list' });

      await waitFor(() => expect(getAllByTestId('icon-trash-outline').length).toBe(1));
      await act(async () => {
        fireEvent.press(getAllByTestId('icon-trash-outline')[0]);
      });
      await act(async () => {
        fireEvent.press(getByText('delete'));
      });

      await waitFor(() => expect(queryAllByTestId('icon-trash-outline')).toHaveLength(0));
    });

    it('shows an empty list rather than crashing when the backups cannot be read', async () => {
      mockGetStoredBackups.mockImplementation(() => Promise.reject(new Error('no such dir')));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getByText } = await setup({ step: 'local-list' });

      await waitFor(() => expect(getByText('local_backups_empty')).toBeTruthy());
      consoleError.mockRestore();
    });
  });

  describe('host handshake', () => {
    it('offers a refresh action only while the backup list is showing', async () => {
      const onRegisterRefresh = jest.fn();

      await setup({ step: 'source', onRegisterRefresh });
      expect(onRegisterRefresh).toHaveBeenCalledWith(null);

      onRegisterRefresh.mockClear();
      await setup({ step: 'local-list', onRegisterRefresh });
      expect(typeof onRegisterRefresh.mock.calls[0][0]).toBe('function');
    });

    it('releases the chosen backup when backing out of its confirmation', async () => {
      const onRegisterBack = jest.fn();
      await setup({ step: 'confirm-local', onRegisterBack });

      const hook = onRegisterBack.mock.calls[0][0];
      // Cleans up but hands navigation back to the host.
      expect(hook()).toBe(false);
    });

    it('releases the busy flag on unmount', async () => {
      const onBusyChange = jest.fn();
      const { unmount } = await setup({ onBusyChange });

      await act(async () => { unmount(); });
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });
  });
});
