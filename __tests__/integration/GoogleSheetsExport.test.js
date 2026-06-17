import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../../app/screens/SettingsScreen';

const mockShowDialog = jest.fn();

jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  exportToSheets: jest.fn(),
  importFromSheets: jest.fn(),
}));

jest.mock('../../app/services/DailyBackupService', () => ({
  getStoredBackups: jest.fn().mockResolvedValue([]),
  DAILY_BACKUP_DIR: '/mock/docs/daily_backups/',
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  setPreference: jest.fn(),
  getPreference: jest.fn(),
  PREF_KEYS: {
    UPDATE_LAST_CHECK_AT: 'update_last_check_at',
    GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  },
  getDefaultAccountId: jest.fn().mockResolvedValue(null),
  setDefaultAccountId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    visibleAccounts: [],
  }),
}));

jest.mock('../../app/hooks/useLogEntries', () => ({
  useLogEntries: () => ({ entries: [], clearLogs: jest.fn(), getExportText: jest.fn() }),
}));

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: jest.fn(),
    cancelImport: jest.fn(),
    completeImport: jest.fn(),
    getCancelToken: jest.fn(() => ({ cancelled: false })),
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

jest.mock('../../app/services/BackupRestore', () => ({
  exportBackup: jest.fn(),
  importBackup: jest.fn(),
  restoreBackup: jest.fn(),
  createBackup: jest.fn().mockResolvedValue({ data: {} }),
  pickImportFile: jest.fn(),
  importBackupFromFile: jest.fn(),
  getPreRestoreSnapshots: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: jest.fn(),
  listDownloadedApks: jest.fn().mockResolvedValue([]),
  installApk: jest.fn(),
  checkAlreadyDownloaded: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../app/services/BiometricService', () => ({
  authenticateWithBiometrics: jest.fn(),
  BiometricResult: {
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    NOT_AVAILABLE: 'not_available',
    NOT_ENROLLED: 'not_enrolled',
  },
}));

jest.mock('../../app/components/UpdateContentPanel', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function UpdateContentPanel() {
    return React.createElement(View, { testID: 'update-content-panel' });
  };
});

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: '/tmp/cache/penny-logs.txt',
    write: jest.fn(),
  })),
  Paths: { cache: '/tmp/cache/' },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/docs/',
  getInfoAsync: jest.fn().mockResolvedValue({ size: 1024, exists: true }),
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  readAsStringAsync: jest.fn().mockResolvedValue(JSON.stringify({ version: 1, data: {} })),
  writeAsStringAsync: jest.fn().mockResolvedValue(),
  deleteAsync: jest.fn().mockResolvedValue(),
  makeDirectoryAsync: jest.fn().mockResolvedValue(),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(),
  isAvailableAsync: jest.fn().mockResolvedValue(false),
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');
  function GestureDetector({ children }) {
    return React.createElement(View, {}, children);
  }
  GestureDetector.propTypes = { children: PropTypes.node };
  const gestureObj = {
    onStart: jest.fn(),
    onUpdate: jest.fn(),
    onEnd: jest.fn(),
    onFinalize: jest.fn(),
    enabled: jest.fn(),
    activeOffsetX: jest.fn(),
    activeOffsetY: jest.fn(),
    failOffsetX: jest.fn(),
    failOffsetY: jest.fn(),
    minDistance: jest.fn(),
    minPointers: jest.fn(),
    maxPointers: jest.fn(),
    shouldCancelWhenOutside: jest.fn(),
  };
  Object.keys(gestureObj).forEach((key) => {
    gestureObj[key].mockReturnValue(gestureObj);
  });
  const Gesture = { Pan: jest.fn(() => gestureObj) };
  return { GestureDetector, Gesture, GestureHandlerRootView: View };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = () => { const o = {}; o.duration = jest.fn(() => o); o.easing = jest.fn(() => o); return o; };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (C) => C },
    useSharedValue: jest.fn((v) => ({ value: v })),
    useAnimatedStyle: jest.fn(() => ({})),
    withSpring: jest.fn((v) => v),
    withTiming: jest.fn((v) => v),
    runOnJS: jest.fn((fn) => fn),
    Easing: {
      linear: jest.fn(), ease: jest.fn(), quad: jest.fn(), cubic: jest.fn(),
      in: jest.fn((e) => e), out: jest.fn((e) => e), inOut: jest.fn((e) => e),
    },
    SlideInRight: chainable(),
    SlideOutRight: chainable(),
    FadeIn: chainable(),
  };
});

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      primary: '#007AFF',
      mutedText: '#666666',
      surface: '#f5f5f5',
      background: '#ffffff',
    },
  }),
}));

const { getValidAccessToken, signIn, exportToSheets } =
  require('../../app/services/GoogleSheetsService');


describe('GoogleSheetsExport integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = async () => await render(<SettingsScreen setSubPanelActive={jest.fn()} />);

  it('shows inline Open button after successful export (already signed in)', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    exportToSheets.mockResolvedValue('https://docs.google.com/spreadsheets/d/sheet-123');

    const { getByTestId, getByText } = await renderModal();
    await fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(async () => {
      await fireEvent.press(getByTestId('settings-export-google-sheets'));
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

    const { getByTestId, getByText } = await renderModal();
    await fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(async () => {
      await fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(signIn).toHaveBeenCalled();
      expect(getByText('google_sheets_open')).toBeTruthy();
    });
  });

  it('shows sign-in error inline when signIn fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockRejectedValue(new Error('auth_failed'));

    const { getByTestId, getByText } = await renderModal();
    await fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(async () => {
      await fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(getByText('google_sheets_signin_failed')).toBeTruthy();
    });
    expect(mockShowDialog).not.toHaveBeenCalled();
  });

  it('shows revoked-access error inline when refresh fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('refresh_failed'));

    const { getByTestId, getByText } = await renderModal();
    await fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(async () => {
      await fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(getByText('google_sheets_access_revoked')).toBeTruthy();
    });
    expect(mockShowDialog).not.toHaveBeenCalled();
  });

  it('silently returns when sign-in is cancelled', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockRejectedValue(new Error('sign_in_cancelled'));

    const { getByTestId } = await renderModal();
    await fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(async () => {
      await fireEvent.press(getByTestId('settings-export-google-sheets'));
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
    const { getByText, getByTestId } = await render(
      <SettingsScreen setSubPanelActive={jest.fn()} />,
    );
    await fireEvent.press(getByText('import'));
    await waitFor(() => {
      expect(getByTestId('settings-import-google-sheets')).toBeTruthy();
    });
  });

  it('shows no-spreadsheet message when no spreadsheet ID is saved', async () => {
    getPreference.mockResolvedValue(null);
    const { getByText, getByTestId } = await render(
      <SettingsScreen setSubPanelActive={jest.fn()} />,
    );
    await fireEvent.press(getByText('import'));
    await waitFor(() => getByTestId('settings-import-google-sheets'));
    await fireEvent.press(getByTestId('settings-import-google-sheets'));
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

    const { getByText, getByTestId } = await render(
      <SettingsScreen setSubPanelActive={jest.fn()} />,
    );
    await fireEvent.press(getByText('import'));
    await waitFor(() => getByTestId('settings-import-google-sheets'));
    await fireEvent.press(getByTestId('settings-import-google-sheets'));

    await waitFor(() => {
      expect(importFromSheets).toHaveBeenCalledWith('token', expect.any(Function));
    });
  });
});
