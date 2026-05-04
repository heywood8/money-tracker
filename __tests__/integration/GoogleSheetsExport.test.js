import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsModal from '../../app/modals/SettingsModal';

const mockShowDialog = jest.fn();

jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(),
  exchangeAndStoreTokens: jest.fn(),
  exportToSheets: jest.fn(),
}));

jest.mock('../../app/services/BackupRestore', () => ({
  exportBackup: jest.fn(),
  importBackup: jest.fn(),
  restoreBackup: jest.fn(),
  createBackup: jest.fn().mockResolvedValue({ data: {} }),
}));

jest.mock('../../app/services/DailyBackupService', () => ({
  getStoredBackups: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: jest.fn(),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  setPreference: jest.fn(),
  getPreference: jest.fn(),
  PREF_KEYS: {
    UPDATE_LAST_CHECK_AT: 'update_last_check_at',
    GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  },
}));

jest.mock('../../app/hooks/useLogEntries', () => ({
  useLogEntries: () => ({ entries: [], clearLogs: jest.fn(), getExportText: jest.fn() }),
}));

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: jest.fn(),
    cancelImport: jest.fn(),
    completeImport: jest.fn(),
  }),
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({ startDownload: jest.fn() }),
}));

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({ hideBalances: false, setHideBalances: jest.fn() }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
    language: 'en',
    setLanguage: jest.fn(),
    availableLanguages: ['en'],
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));

jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: () => ({ resetDatabase: jest.fn() }),
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(),
}));

const { getValidAccessToken, exchangeAndStoreTokens, exportToSheets } =
  require('../../app/services/GoogleSheetsService');

describe('GoogleSheetsExport integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = () =>
    render(<SettingsModal visible={true} onClose={jest.fn()} />);

  it('shows success dialog with Open button after successful export', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    exportToSheets.mockResolvedValue(
      'https://docs.google.com/spreadsheets/d/sheet-123',
    );

    const { getByTestId } = renderModal();

    // Open export sub-panel
    fireEvent.press(getByTestId('settings-export-row'));

    // Tap Google Sheets option
    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.stringContaining('google_sheets'),
        expect.stringContaining('google_sheets_export_success'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'google_sheets_open' }),
        ]),
      );
    });
  });

  it('shows sign-in error dialog when auth fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('no_refresh_token'));

    const { useAuthRequest } = require('expo-auth-session');
    useAuthRequest.mockReturnValue([
      { codeVerifier: 'verifier' },
      null,
      jest.fn().mockResolvedValue({ type: 'error' }),
    ]);

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('google_sheets_signin_failed'),
        expect.anything(),
      );
    });
  });

  it('shows revoked-access error when refresh fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('refresh_failed'));

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('google_sheets_access_revoked'),
        expect.anything(),
      );
    });
  });
});
