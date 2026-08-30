/**
 * Tests for DriveBackupPanel.js
 *
 * Covers the three things the panel promises: the feature is off until the
 * toggle is turned on (and turning it on is what asks for the Google account),
 * the "back up now" button starts a run without blocking on it, and the status
 * line reports what is happening.
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import DriveBackupPanel from '../../../app/components/settings/DriveBackupPanel';

const mockStartBackup = jest.fn();
const mockGetValidAccessToken = jest.fn();
const mockSignIn = jest.fn();
const mockSetEnabled = jest.fn();
const mockSetFormats = jest.fn();

let mockDriveState = { isRunning: false, progress: null, lastResult: null };
let mockEnabledState = false;
let mockFormatsState = ['json', 'csv', 'sqlite'];

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      text: '#000', mutedText: '#888', primary: '#6200ee',
      destructive: '#d9534f', border: '#ddd', surface: '#fff',
    },
  }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../../app/contexts/DriveBackupContext', () => ({
  useDriveBackup: () => ({ ...mockDriveState, startBackup: mockStartBackup }),
}));
jest.mock('../../../app/services/GoogleDriveBackupService', () => ({
  isDriveBackupEnabled: () => Promise.resolve(mockEnabledState),
  setDriveBackupEnabled: (...a) => mockSetEnabled(...a),
  getDriveBackupFormats: () => Promise.resolve(mockFormatsState),
  setDriveBackupFormats: (...a) => mockSetFormats(...a),
  BACKUP_FORMATS: ['json', 'csv', 'sqlite'],
  DEFAULT_FOLDER_NAME: 'Penny Backups',
  MAX_DAILY_BACKUPS: 7,
  MAX_WEEKLY_BACKUPS: 15,
}));
jest.mock('../../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: (...a) => mockGetValidAccessToken(...a),
  signIn: (...a) => mockSignIn(...a),
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React2 = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => React2.createElement(Text, { testID: `icon-${name}` }, name);
  return Icon;
});

const setup = async () => {
  let utils;
  await act(async () => {
    utils = render(<DriveBackupPanel bottomInset={0} />);
  });
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDriveState = { isRunning: false, progress: null, lastResult: null };
  mockEnabledState = false;
  mockFormatsState = ['json', 'csv', 'sqlite'];
  mockGetValidAccessToken.mockResolvedValue('token');
  mockSignIn.mockResolvedValue('token');
});

describe('DriveBackupPanel', () => {
  describe('Enable toggle', () => {
    it('reads as off until it has been turned on', async () => {
      const { getByText } = await setup();
      expect(getByText('drive_backup_enable_hint_off')).toBeTruthy();
    });

    it('signs in and persists the toggle when turned on', async () => {
      mockGetValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
      const { getByTestId, getByText } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-enable-toggle'));
      });

      expect(mockSignIn).toHaveBeenCalled();
      expect(mockSetEnabled).toHaveBeenCalledWith(true);
      await waitFor(() => expect(getByText('drive_backup_enable_hint_on')).toBeTruthy());
    });

    it('does not sign in again when a session already exists', async () => {
      const { getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-enable-toggle'));
      });

      expect(mockSignIn).not.toHaveBeenCalled();
      expect(mockSetEnabled).toHaveBeenCalledWith(true);
    });

    it('stays off, and says nothing, when the user backs out of the sign-in sheet', async () => {
      mockGetValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
      mockSignIn.mockRejectedValue(new Error('sign_in_cancelled'));
      const { getByTestId, getByText, queryByText } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-enable-toggle'));
      });

      expect(mockSetEnabled).not.toHaveBeenCalled();
      expect(getByText('drive_backup_enable_hint_off')).toBeTruthy();
      expect(queryByText('google_sheets_signin_failed')).toBeNull();
    });

    it('reports a failed sign-in and stays off', async () => {
      mockGetValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
      mockSignIn.mockRejectedValue(new Error('auth_failed'));
      const { getByTestId, getByText } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-enable-toggle'));
      });

      expect(mockSetEnabled).not.toHaveBeenCalled();
      expect(getByText('google_sheets_signin_failed')).toBeTruthy();
    });

    it('turns off without touching Google', async () => {
      mockEnabledState = true;
      const { getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-enable-toggle'));
      });

      expect(mockSetEnabled).toHaveBeenCalledWith(false);
      expect(mockGetValidAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('Format selection', () => {
    it('persists a format the user switches off', async () => {
      const { getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-format-csv'));
      });

      expect(mockSetFormats).toHaveBeenCalledWith(['json', 'sqlite']);
    });

    it('refuses to switch off the last remaining format', async () => {
      mockFormatsState = ['json'];
      const { getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-format-json'));
      });

      // Enabled but uploading nothing looks like it works and does not.
      expect(mockSetFormats).not.toHaveBeenCalled();
    });
  });

  describe('Back up now', () => {
    it('starts a manual run', async () => {
      const { getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-now-button'));
      });

      expect(mockStartBackup).toHaveBeenCalledWith({ mode: 'manual', interactive: true });
    });

    it('does not wait for the run to finish', async () => {
      // A run that never settles must still leave the panel interactive — the
      // whole point is that the upload continues while the user moves on.
      mockStartBackup.mockReturnValue(new Promise(() => {}));
      const { getByTestId } = await setup();

      await act(async () => {
        fireEvent.press(getByTestId('drive-backup-now-button'));
      });

      expect(getByTestId('drive-backup-now-button')).toBeTruthy();
    });

    it('is disabled while a run is already in flight', async () => {
      mockDriveState = { isRunning: true, progress: { phase: 'uploading', current: 1, total: 3 }, lastResult: null };
      const { getByTestId } = await setup();

      fireEvent.press(getByTestId('drive-backup-now-button'));

      expect(mockStartBackup).not.toHaveBeenCalled();
    });
  });

  describe('Status line', () => {
    it('says so when nothing has been uploaded yet', async () => {
      const { getByText } = await setup();
      expect(getByText('drive_backup_never_run')).toBeTruthy();
    });

    it('reports the live phase and file count while running', async () => {
      mockDriveState = { isRunning: true, progress: { phase: 'uploading', current: 2, total: 3 }, lastResult: null };
      const { getByText } = await setup();
      expect(getByText('drive_backup_status_uploading 2/3')).toBeTruthy();
    });

    it('shows when the last run succeeded', async () => {
      mockDriveState = {
        isRunning: false,
        progress: null,
        lastResult: { status: 'success', at: '2026-02-26T10:00:00.000Z', files: 3 },
      };
      const { getByText } = await setup();
      expect(getByText(/drive_backup_last_success/)).toBeTruthy();
    });

    it('surfaces the error from a failed run', async () => {
      mockDriveState = {
        isRunning: false,
        progress: null,
        lastResult: { status: 'error', at: '2026-02-26T10:00:00.000Z', error: 'storage_full' },
      };
      const { getByText } = await setup();
      expect(getByText(/drive_backup_last_error/)).toBeTruthy();
      expect(getByText('storage_full')).toBeTruthy();
    });
  });
});
