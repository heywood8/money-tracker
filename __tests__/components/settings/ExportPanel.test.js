/* eslint-disable react/prop-types */
/**
 * Tests for the export subpanel: the destination list, the per-row status
 * lifecycle, and the Google Sheets run with its progress view.
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import ExportPanel from '../../../app/components/settings/ExportPanel';

const mockExportBackup = jest.fn(() => Promise.resolve());
const mockCreateBackup = jest.fn(() => Promise.resolve({ version: 1 }));
const mockExportToSheets = jest.fn(() => Promise.resolve('https://sheet'));
const mockGetValidAccessToken = jest.fn(() => Promise.resolve('token'));
const mockSignIn = jest.fn(() => Promise.resolve('token'));
const mockShowDialog = jest.fn();

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: { text: '#000', mutedText: '#888', primary: '#6200ee', destructive: '#d9534f' },
  }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));
jest.mock('../../../app/services/BackupRestore', () => ({
  exportBackup: (...a) => mockExportBackup(...a),
  createBackup: (...a) => mockCreateBackup(...a),
}));
jest.mock('../../../app/services/DailyBackupService', () => ({
  DAILY_BACKUP_DIR: '/mock/daily/',
}));
jest.mock('../../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: (...a) => mockGetValidAccessToken(...a),
  signIn: (...a) => mockSignIn(...a),
  exportToSheets: (...a) => mockExportToSheets(...a),
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

const noop = () => {};

const setup = (props = {}) => render(
  <ExportPanel
    step="list"
    onPushStep={noop}
    onPopToRoot={noop}
    onBusyChange={noop}
    onRegisterBack={noop}
    {...props}
  />,
);

describe('ExportPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExportBackup.mockImplementation(() => Promise.resolve());
    mockExportToSheets.mockImplementation(() => Promise.resolve('https://sheet'));
  });

  describe('destination list', () => {
    it('offers every destination', async () => {
      const { getByText, getByTestId } = await setup();

      expect(getByTestId('settings-export-save-local-backup')).toBeTruthy();
      expect(getByTestId('settings-export-google-sheets')).toBeTruthy();
      expect(getByText('Save externally to SQLite')).toBeTruthy();
      expect(getByText('Save externally to CSV')).toBeTruthy();
      expect(getByText('Save externally to JSON')).toBeTruthy();
    });

    it('exports the chosen file format and reports success on that row alone', async () => {
      const { getByText, getAllByText } = await setup();

      await act(async () => {
        fireEvent.press(getByText('Save externally to CSV'));
      });

      expect(mockExportBackup).toHaveBeenCalledWith('csv');
      expect(getByText('export_success')).toBeTruthy();
      // The other two file rows are untouched and still advertise themselves.
      expect(getAllByText(/description/).length).toBeGreaterThan(0);
      expect(getByText('sqlite_description')).toBeTruthy();
      expect(getByText('json_description')).toBeTruthy();
    });

    it('reports a failed export and leaves the row usable', async () => {
      mockExportBackup.mockImplementation(() => Promise.reject(new Error('disk full')));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getByText } = await setup();

      await act(async () => {
        fireEvent.press(getByText('Save externally to JSON'));
      });

      await waitFor(() => expect(mockShowDialog).toHaveBeenCalled());
      // Back to its resting description, not stuck on "Exporting…".
      expect(getByText('json_description')).toBeTruthy();

      consoleError.mockRestore();
    });

    it('locks the local backup row once written, since each tap writes a new file', async () => {
      const { getByText, getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('settings-export-save-local-backup'));
      });

      expect(getByText('save_local_backup_success')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('settings-export-save-local-backup'));
      });
      expect(mockCreateBackup).toHaveBeenCalledTimes(1);
    });
  });

  describe('Google Sheets run', () => {
    it('steps into the progress view and reports success', async () => {
      const onPushStep = jest.fn();
      const { getByTestId } = await setup({ onPushStep });

      await act(async () => {
        fireEvent.press(getByTestId('settings-export-google-sheets'));
      });

      expect(onPushStep).toHaveBeenCalledWith('sheets-progress');
      expect(mockExportToSheets).toHaveBeenCalled();
    });

    it('unwinds to the list when the user cancels the Google sign-in', async () => {
      mockGetValidAccessToken.mockImplementation(() => Promise.reject(new Error('auth_failed')));
      mockSignIn.mockImplementation(() => Promise.reject(new Error('sign_in_cancelled')));
      const onPopToRoot = jest.fn();
      const { getByTestId } = await setup({ onPopToRoot });

      await act(async () => {
        fireEvent.press(getByTestId('settings-export-google-sheets'));
      });

      expect(onPopToRoot).toHaveBeenCalled();
    });

    it('releases the back lock after a cancelled sign-in', async () => {
      // Regression: the run marks `auth` in-flight before sign-in resolves. If
      // bailing out left that stage in flight, the host's back lock would stay
      // on with no progress view in sight — no back arrow, no swipe, no
      // hardware back, and no auto-close on backgrounding.
      mockGetValidAccessToken.mockImplementation(() => Promise.reject(new Error('auth_failed')));
      mockSignIn.mockImplementation(() => Promise.reject(new Error('sign_in_cancelled')));
      const onBusyChange = jest.fn();
      const { getByTestId } = await setup({ onBusyChange });

      await act(async () => {
        fireEvent.press(getByTestId('settings-export-google-sheets'));
      });

      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });

    it('renders the run and its outcome on the progress step', async () => {
      const { getByText } = await setup({ step: 'sheets-progress' });

      // Every stage is listed up front so the user can see what is coming.
      expect(getByText('Signing in to Google')).toBeTruthy();
      expect(getByText('Uploading data')).toBeTruthy();
      expect(getByText('Export complete')).toBeTruthy();
    });
  });

  describe('host handshake', () => {
    it('reports not-busy on mount and releases on unmount', async () => {
      const onBusyChange = jest.fn();
      const { unmount } = await setup({ onBusyChange });

      expect(onBusyChange).toHaveBeenCalledWith(false);
      await act(async () => { unmount(); });
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });

    it('registers a back hook and drops it on unmount', async () => {
      const onRegisterBack = jest.fn();
      const { unmount } = await setup({ onRegisterBack });

      expect(typeof onRegisterBack.mock.calls[0][0]).toBe('function');
      await act(async () => { unmount(); });
      expect(onRegisterBack).toHaveBeenLastCalledWith(null);
    });

    it('never claims the back gesture — the host owns the stack', async () => {
      const onRegisterBack = jest.fn();
      await setup({ onRegisterBack, step: 'sheets-progress' });

      const hook = onRegisterBack.mock.calls[0][0];
      expect(hook()).toBe(false);
    });
  });
});
