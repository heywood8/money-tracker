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

class MockCancelledImportError extends Error {}

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
  CancelledImportError: MockCancelledImportError,
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

const setup = (props = {}) => render(
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
  />,
);

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
