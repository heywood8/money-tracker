import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsModal from '../../app/modals/SettingsModal';

const mockShowDialog = jest.fn();

jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  exportToSheets: jest.fn(),
  importFromSheets: jest.fn(),
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

const { getValidAccessToken, signIn, exportToSheets } =
  require('../../app/services/GoogleSheetsService');


describe('GoogleSheetsExport integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = () =>
    render(<SettingsModal visible={true} onClose={jest.fn()} />);

  it('shows inline Open button after successful export (already signed in)', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    exportToSheets.mockResolvedValue('https://docs.google.com/spreadsheets/d/sheet-123');

    const { getByTestId, getByText } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(getByText('google_sheets_open')).toBeTruthy();
    });

    expect(mockShowDialog).not.toHaveBeenCalledWith(
      expect.stringContaining('google_sheets'),
      expect.stringContaining('google_sheets_export_success'),
      expect.anything(),
    );
  });

  it('falls back to signIn when not signed in, then exports successfully', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockResolvedValue('new-access-token');
    exportToSheets.mockResolvedValue('https://docs.google.com/spreadsheets/d/sheet-456');

    const { getByTestId, getByText } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(signIn).toHaveBeenCalled();
      expect(getByText('google_sheets_open')).toBeTruthy();
    });
  });

  it('shows sign-in error inline when signIn fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockRejectedValue(new Error('auth_failed'));

    const { getByTestId, getByText } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(getByText('google_sheets_signin_failed')).toBeTruthy();
    });
    expect(mockShowDialog).not.toHaveBeenCalled();
  });

  it('shows revoked-access error inline when refresh fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('refresh_failed'));

    const { getByTestId, getByText } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(getByText('google_sheets_access_revoked')).toBeTruthy();
    });
    expect(mockShowDialog).not.toHaveBeenCalled();
  });

  it('silently returns when sign-in is cancelled', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockRejectedValue(new Error('sign_in_cancelled'));

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).not.toHaveBeenCalled();
    });
  });
});

describe('From Google Sheets import', () => {
  const { getValidAccessToken, importFromSheets } = require('../../app/services/GoogleSheetsService');
  const { restoreBackup } = require('../../app/services/BackupRestore');
  const { getPreference } = require('../../app/services/PreferencesDB');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders From Google Sheets row in import subpanel', async () => {
    const { getByText, getByTestId } = render(
      <SettingsModal visible={true} onClose={jest.fn()} />,
    );
    fireEvent.press(getByText('import'));
    await waitFor(() => {
      expect(getByTestId('settings-import-google-sheets')).toBeTruthy();
    });
  });

  it('shows no-spreadsheet message when no spreadsheet ID is saved', async () => {
    getPreference.mockResolvedValue(null);
    const { getByText, getByTestId } = render(
      <SettingsModal visible={true} onClose={jest.fn()} />,
    );
    fireEvent.press(getByText('import'));
    await waitFor(() => getByTestId('settings-import-google-sheets'));
    fireEvent.press(getByTestId('settings-import-google-sheets'));
    await waitFor(() => {
      expect(getByTestId('settings-import-no-spreadsheet')).toBeTruthy();
    });
  });

  it('calls importFromSheets when tapped and spreadsheet is configured', async () => {
    getPreference.mockResolvedValue('sheet-id-123');
    getValidAccessToken.mockResolvedValue('token');
    importFromSheets.mockResolvedValue({
      version: 1,
      timestamp: new Date().toISOString(),
      platform: 'native',
      data: { accounts: [], categories: [], operations: [], budgets: [], app_metadata: [], balance_history: [], planned_operations: [] },
    });
    restoreBackup.mockResolvedValue();

    const { getByText, getByTestId } = render(
      <SettingsModal visible={true} onClose={jest.fn()} />,
    );
    fireEvent.press(getByText('import'));
    await waitFor(() => getByTestId('settings-import-google-sheets'));
    fireEvent.press(getByTestId('settings-import-google-sheets'));

    await waitFor(() => {
      expect(importFromSheets).toHaveBeenCalledWith('token', expect.any(Function));
    });
  });
});
