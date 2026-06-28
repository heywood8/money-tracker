/**
 * Tests for SettingsScreen Component
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../../app/screens/SettingsScreen';

// Create mock functions we can spy on
const mockSetLanguage = jest.fn();
const mockShowDialog = jest.fn();
const mockResetDatabase = jest.fn(() => Promise.resolve());
const mockStartImport = jest.fn();
const mockCancelImport = jest.fn();
const mockCompleteImport = jest.fn();
const mockSetHideBalances = jest.fn();
const mockAuthenticateWithBiometrics = jest.fn();
const mockSetSubPanelActive = jest.fn();

// Mutable state so individual tests can control hideBalances
const displaySettingsMockState = { hideBalances: false };

// Mock all context dependencies
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      primary: '#007AFF',
      mutedText: '#666666',
      surface: '#f5f5f5',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
    language: 'en',
    setLanguage: mockSetLanguage,
    availableLanguages: ['en', 'ru', 'es', 'fr', 'de', 'it', 'zh'],
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: mockShowDialog,
  }),
}));

jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: () => ({
    resetDatabase: mockResetDatabase,
  }),
}));

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: mockStartImport,
    cancelImport: mockCancelImport,
    completeImport: mockCompleteImport,
    getCancelToken: jest.fn(() => ({ cancelled: false })),
  }),
}));

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({
    hideBalances: displaySettingsMockState.hideBalances,
    setHideBalances: mockSetHideBalances,
  }),
}));

jest.mock('../../app/services/BiometricService', () => ({
  authenticateWithBiometrics: (...args) => mockAuthenticateWithBiometrics(...args),
  BiometricResult: {
    SUCCESS: 'success',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    NOT_AVAILABLE: 'not_available',
    NOT_ENROLLED: 'not_enrolled',
  },
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({
    isDownloading: false,
    downloadProgress: null,
    startDownload: jest.fn(),
  }),
}));

// Mock BackupRestore service
const mockExportBackup = jest.fn(() => Promise.resolve());
const mockPickImportFile = jest.fn(() => Promise.resolve({ fileUri: '/mock/file.json', filename: 'backup.json' }));
const mockImportBackupFromFile = jest.fn(() => Promise.resolve());
const mockRestoreBackup = jest.fn(() => Promise.resolve());
const mockCreateBackup = jest.fn(() => Promise.resolve({ version: 1, data: {} }));
const mockGetPreRestoreSnapshots = jest.fn(() => Promise.resolve([]));
jest.mock('../../app/services/BackupRestore', () => ({
  exportBackup: (...args) => mockExportBackup(...args),
  pickImportFile: (...args) => mockPickImportFile(...args),
  importBackupFromFile: (...args) => mockImportBackupFromFile(...args),
  restoreBackup: (...args) => mockRestoreBackup(...args),
  createBackup: (...args) => mockCreateBackup(...args),
  getPreRestoreSnapshots: (...args) => mockGetPreRestoreSnapshots(...args),
}));

// Mock DailyBackupService
const mockGetStoredBackups = jest.fn(() => Promise.resolve([]));
jest.mock('../../app/services/DailyBackupService', () => ({
  getStoredBackups: (...args) => mockGetStoredBackups(...args),
  DAILY_BACKUP_DIR: '/mock/docs/daily_backups/',
}));

// Mock expo-file-system/legacy
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/docs/',
  getInfoAsync: jest.fn(() => Promise.resolve({ size: 1024, exists: true })),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  readAsStringAsync: jest.fn(() => Promise.resolve(JSON.stringify({ version: 1, data: {} }))),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
}));

// Mock useLogEntries hook
const mockClearLogs = jest.fn();
const mockGetExportText = jest.fn(() => 'log text');
jest.mock('../../app/hooks/useLogEntries', () => ({
  useLogEntries: () => ({
    entries: [],
    clearLogs: mockClearLogs,
    getExportText: mockGetExportText,
  }),
}));

// Mock expo-file-system
const mockFileWrite = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: '/tmp/cache/penny-logs.txt',
    write: mockFileWrite,
  })),
  Paths: { cache: '/tmp/cache/' },
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(() => Promise.resolve()),
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Mock react-native-gesture-handler
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

  const Gesture = {
    Pan: jest.fn(() => gestureObj),
  };

  return {
    GestureDetector,
    Gesture,
    GestureHandlerRootView: View,
  };
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
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

// Mock AppUpdateService
jest.mock('../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: jest.fn(() => Promise.resolve(null)),
  listDownloadedApks: jest.fn(() => Promise.resolve([])),
  installApk: jest.fn(() => Promise.resolve()),
  checkAlreadyDownloaded: jest.fn(() => Promise.resolve(null)),
  verifyCachedApk: jest.fn(() => Promise.resolve({ exists: false })),
}));

const mockGetDefaultAccountId = jest.fn(() => Promise.resolve(null));
const mockSetDefaultAccountId = jest.fn(() => Promise.resolve());
const mockVisibleAccounts = [
  { id: 1, name: 'Savings', currency: 'USD', balance: '100' },
  { id: 2, name: 'Checking', currency: 'EUR', balance: '200' },
];

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    visibleAccounts: [
      { id: 1, name: 'Savings', currency: 'USD', balance: '100' },
      { id: 2, name: 'Checking', currency: 'EUR', balance: '200' },
    ],
  }),
}));

// Mock PreferencesDB
jest.mock('../../app/services/PreferencesDB', () => ({
  getPreference: jest.fn(() => Promise.resolve(null)),
  setPreference: jest.fn(() => Promise.resolve()),
  PREF_KEYS: {
    GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  },
  getDefaultAccountId: jest.fn(() => Promise.resolve(null)),
  setDefaultAccountId: jest.fn(() => Promise.resolve()),
}));

// Mock GoogleSheetsService
jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(() => Promise.resolve(null)),
  signIn: jest.fn(() => Promise.resolve(null)),
  exportToSheets: jest.fn(() => Promise.resolve()),
  importFromSheets: jest.fn(() => Promise.resolve()),
}));

// Mock UpdateContentPanel — capture the props it receives so tests can assert
// what the screen forwards (e.g. currentVersion for installed-version highlighting).
const updatePanelProps = { last: null };
jest.mock('../../app/components/UpdateContentPanel', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function UpdateContentPanel(props) {
    updatePanelProps.last = props;
    return React.createElement(View, { testID: 'update-content-panel' });
  };
});

// Captures the embedded accounts screen's reported internal back handler so a
// test can verify the parent drills into it before closing the panel.
const mockAccountsBack = { goBack: null };

// Mock AccountsScreen (embedded in the accounts subpanel) to avoid pulling in
// its heavy dependency tree (draggable list, accounts/operations contexts, etc.)
jest.mock('../../app/screens/AccountsScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');
  function AccountsScreen({ embedded, onBackStateChange }) {
    // Simulate an internal level being open so the parent should step back here.
    React.useEffect(() => {
      mockAccountsBack.goBack = jest.fn();
      onBackStateChange?.(mockAccountsBack.goBack);
      return () => onBackStateChange?.(null);
    }, [onBackStateChange]);
    return React.createElement(View, { testID: 'accounts-screen', accessibilityLabel: embedded ? 'embedded' : 'standalone' });
  }
  AccountsScreen.propTypes = { embedded: PropTypes.bool, onBackStateChange: PropTypes.func };
  return AccountsScreen;
});

// Mock CategoriesScreen (embedded in the categories subpanel)
jest.mock('../../app/screens/CategoriesScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');
  function CategoriesScreen({ embedded }) {
    return React.createElement(View, { testID: 'categories-screen', accessibilityLabel: embedded ? 'embedded' : 'standalone' });
  }
  CategoriesScreen.propTypes = { embedded: PropTypes.bool };
  return CategoriesScreen;
});

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetLanguage.mockClear();
    mockShowDialog.mockClear();
    mockResetDatabase.mockClear();
    mockStartImport.mockClear();
    mockCancelImport.mockClear();
    mockCompleteImport.mockClear();
    mockExportBackup.mockClear();
    mockPickImportFile.mockClear();
    mockImportBackupFromFile.mockClear();
    mockRestoreBackup.mockClear();
    mockCreateBackup.mockClear();
    mockGetStoredBackups.mockClear();
    mockGetPreRestoreSnapshots.mockClear();
    mockSetHideBalances.mockClear();
    mockAuthenticateWithBiometrics.mockClear();
    mockSetSubPanelActive.mockClear();
    displaySettingsMockState.hideBalances = false;
  });

  describe('Basic Rendering', () => {
    it('renders the settings rows', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('settings-language-row')).toBeTruthy();
      expect(getByTestId('settings-export-row')).toBeTruthy();
    });

    it('renders accounts row', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('settings-accounts-row')).toBeTruthy();
    });

    it('opens the accounts subpanel when the accounts row is pressed', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByTestId('settings-accounts-row'));

      expect(getByTestId('accounts-screen')).toBeTruthy();
      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });

    it('back navigation drills into the embedded accounts screen before closing the panel', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByTestId('settings-accounts-row'));
      });

      // The embedded screen reported an internal back handler (form/picker open);
      // pressing back should step up there rather than close the whole panel.
      await act(async () => {
        await fireEvent.press(getByTestId('settings-subpanel-back'));
      });

      expect(mockAccountsBack.goBack).toHaveBeenCalled();
      // Panel stays open — the embedded screen popped a level, not the panel.
      expect(getByTestId('accounts-screen')).toBeTruthy();
    });

    it('renders categories row', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('settings-categories-row')).toBeTruthy();
    });

    it('opens categories subpanel when categories row is pressed', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByTestId('settings-categories-row'));

      expect(getByTestId('categories-screen')).toBeTruthy();
      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });

    it('renders language row', async () => {
      const { getAllByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      // "language" appears as row label and in language submodal header
      expect(getAllByText('language').length).toBeGreaterThanOrEqual(1);
    });

    it('renders database section label', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('database')).toBeTruthy();
    });

    it('renders export row', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('export')).toBeTruthy();
    });

    it('renders import row', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('import')).toBeTruthy();
    });

    it('renders reset database row', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('reset_database')).toBeTruthy();
    });

    it('renders English language value', async () => {
      const { getAllByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getAllByText(/English/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('setSubPanelActive signalling', () => {
    it('calls setSubPanelActive(false) on initial mount (no subpanel open)', async () => {
      await render(<SettingsScreen setSubPanelActive={mockSetSubPanelActive} />);
      expect(mockSetSubPanelActive).toHaveBeenCalledWith(false);
    });

    it('calls setSubPanelActive(true) when a subpanel opens', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      mockSetSubPanelActive.mockClear();

      await fireEvent.press(getByTestId('settings-language-row'));

      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });

    it('calls setSubPanelActive(true) when export subpanel opens', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      mockSetSubPanelActive.mockClear();

      await fireEvent.press(getByTestId('settings-export-row'));

      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });
  });

  describe('Language Selection', () => {
    it('displays current language with flag in the row', async () => {
      const { getAllByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getAllByText(/English/).length).toBeGreaterThanOrEqual(1);
    });

    it('opens language modal when language row is pressed', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByTestId('settings-language-row'));
      });
    });

    it('applies language immediately on selection', async () => {
      const { getByTestId, getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      // Open language modal
      await act(async () => {
        await fireEvent.press(getByTestId('settings-language-row'));
      });

      // Select Spanish
      await act(async () => {
        await fireEvent.press(getByText(/Español/));
      });

      expect(mockSetLanguage).toHaveBeenCalledWith('es');
    });
  });

  describe('Database Operations', () => {
    it('shows reset confirmation subpanel when reset row is pressed', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('reset_database'));

      expect(getByText('reset_database_confirm')).toBeTruthy();
      expect(getByText('reset')).toBeTruthy();
    });

    it('shows import source picker when import row is pressed', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('import'));

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
    });

    it('performs import when confirm button is pressed after selecting from file', async () => {
      const { getByText, getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('import'));
      await fireEvent.press(getByText('import_from_file'));

      expect(getByText('restore_confirm')).toBeTruthy();

      await act(async () => {
        await fireEvent.press(getByTestId('confirm-import-file-btn'));
      });

      expect(mockPickImportFile).toHaveBeenCalled();
      expect(mockCancelImport).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(mockImportBackupFromFile).toHaveBeenCalledWith({ fileUri: '/mock/file.json', filename: 'backup.json' }, expect.any(Object));
        expect(mockStartImport).toHaveBeenCalled();
      });
    });

    it('performs reset when subpanel confirm button is pressed', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('reset_database'));

      await act(async () => {
        await fireEvent.press(getByText('reset'));
      });

      expect(mockResetDatabase).toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    it('opens export format modal when export row is pressed', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByText('export'));
      });
    });

    it('shows export format options when export is pressed', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByText('export'));
      });

      expect(getByText('Save externally to JSON')).toBeTruthy();
      expect(getByText('Save externally to CSV')).toBeTruthy();
      expect(getByText('Save externally to SQLite')).toBeTruthy();
    });

    it('renders export format descriptions', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByText('export'));
      });

      expect(getByText('json_description')).toBeTruthy();
      expect(getByText('csv_description')).toBeTruthy();
      expect(getByText('sqlite_description')).toBeTruthy();
    });

    it('shows success state after SQLite export completes', async () => {
      mockExportBackup.mockResolvedValue();
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('export'));

      await act(async () => {
        await fireEvent.press(getByText('Save externally to SQLite'));
      });

      expect(mockExportBackup).toHaveBeenCalledWith('sqlite');
      expect(getByText('export_success')).toBeTruthy();
    });

    it('shows success state after CSV export completes', async () => {
      mockExportBackup.mockResolvedValue();
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('export'));

      await act(async () => {
        await fireEvent.press(getByText('Save externally to CSV'));
      });

      expect(mockExportBackup).toHaveBeenCalledWith('csv');
      expect(getByText('export_success')).toBeTruthy();
    });

    it('shows success state after JSON export completes', async () => {
      mockExportBackup.mockResolvedValue();
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('export'));

      await act(async () => {
        await fireEvent.press(getByText('Save externally to JSON'));
      });

      expect(mockExportBackup).toHaveBeenCalledWith('json');
      expect(getByText('export_success')).toBeTruthy();
    });

    it('shows error dialog when an external export fails', async () => {
      mockExportBackup.mockRejectedValue(new Error('Export failed'));
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('export'));

      await act(async () => {
        await fireEvent.press(getByText('Save externally to SQLite'));
      });

      expect(mockShowDialog).toHaveBeenCalled();
    });

    it('shows loading indicator while SQLite export is in progress', async () => {
      let resolveExport;
      mockExportBackup.mockReturnValue(new Promise(resolve => { resolveExport = resolve; }));

      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      await fireEvent.press(getByText('export'));
      // Do NOT await — the export never resolves until we call resolveExport,
      // and act() would block forever waiting for the hanging Promise.
      fireEvent.press(getByText('Save externally to SQLite'));

      await waitFor(() => expect(getByText('exporting')).toBeTruthy());

      await act(async () => { resolveExport(); });
      await waitFor(() => expect(getByText('export_success')).toBeTruthy());
    });

    it('shows loading indicator while CSV export is in progress', async () => {
      let resolveExport;
      mockExportBackup.mockReturnValue(new Promise(resolve => { resolveExport = resolve; }));

      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      await fireEvent.press(getByText('export'));
      fireEvent.press(getByText('Save externally to CSV'));

      await waitFor(() => expect(getByText('exporting')).toBeTruthy());

      await act(async () => { resolveExport(); });
      await waitFor(() => expect(getByText('export_success')).toBeTruthy());
    });

    it('shows loading indicator while JSON export is in progress', async () => {
      let resolveExport;
      mockExportBackup.mockReturnValue(new Promise(resolve => { resolveExport = resolve; }));

      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      await fireEvent.press(getByText('export'));
      fireEvent.press(getByText('Save externally to JSON'));

      await waitFor(() => expect(getByText('exporting')).toBeTruthy());

      await act(async () => { resolveExport(); });
      await waitFor(() => expect(getByText('export_success')).toBeTruthy());
    });
  });

  describe('Developer Section', () => {
    it('renders developer section label', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('developer')).toBeTruthy();
    });

    it('renders logs row', async () => {
      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('logs-row')).toBeTruthy();
    });

    it('renders logs label text', async () => {
      const { getAllByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      // "logs" appears in the settings row and in the logs sub-modal header
      expect(getAllByText('logs').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Import Flow', () => {
    it('shows three source options in the source picker', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('import'));

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
    });

    it('shows confirm step after selecting from file', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('import'));
      await fireEvent.press(getByText('import_from_file'));

      expect(getByText('restore_confirm')).toBeTruthy();
    });

    it('back button from confirm-file returns to source picker', async () => {
      const { getByText, getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('import'));
      await fireEvent.press(getByText('import_from_file'));
      await fireEvent.press(getByTestId('settings-subpanel-back'));

      expect(getByText('import_from_file')).toBeTruthy();
    });
  });

  describe('Save Local Backup', () => {
    it('shows save local backup option in export panel', async () => {
      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('export'));

      expect(getByText('save_local_backup')).toBeTruthy();
    });

    it('calls createBackup when save local backup row is pressed', async () => {
      mockCreateBackup.mockResolvedValue({ version: 1, data: {} });

      const { getByTestId, getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await fireEvent.press(getByText('export'));

      await act(async () => {
        await fireEvent.press(getByTestId('settings-export-save-local-backup'));
      });

      expect(mockCreateBackup).toHaveBeenCalled();
    });
  });

  describe('Hide Balances Toggle', () => {
    it('silently allows unhide and calls setHideBalances(false) when biometrics NOT_AVAILABLE', async () => {
      displaySettingsMockState.hideBalances = true;
      mockAuthenticateWithBiometrics.mockResolvedValue('not_available');

      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByText('hide_balances'));
      });

      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
    });

    it('silently allows unhide and calls setHideBalances(false) when biometrics NOT_ENROLLED', async () => {
      displaySettingsMockState.hideBalances = true;
      mockAuthenticateWithBiometrics.mockResolvedValue('not_enrolled');

      const { getByText } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        await fireEvent.press(getByText('hide_balances'));
      });

      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
    });
  });

  describe('Update check', () => {
    const { checkForAppUpdate } = require('../../app/services/AppUpdateService');

    it('forwards currentVersion to the panel when up to date so the latest card can be highlighted', async () => {
      checkForAppUpdate.mockResolvedValueOnce({
        success: true,
        isUpdateAvailable: false,
        currentVersion: '1.2.3',
        recentReleaseNotes: [{ version: '1.2.3', notes: 'Latest release' }],
        releasesUrl: 'https://github.com/example/releases',
      });

      const { getByTestId } = await render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        fireEvent.press(getByTestId('check-updates-row'));
      });

      await waitFor(() => {
        expect(updatePanelProps.last?.updateResult?.type).toBe('up_to_date');
      });
      // Regression: the up_to_date result must carry currentVersion, otherwise the
      // installed/latest release is never matched to its card and the confirmation
      // falls back to a standalone bottom block instead of the green card hint.
      expect(updatePanelProps.last.updateResult.currentVersion).toBe('1.2.3');
    });

    it('re-polls build progress on an interval while a release awaits its CI build', async () => {
      jest.useFakeTimers();
      try {
        checkForAppUpdate
          .mockResolvedValueOnce({
            success: false,
            errorCode: 'releases_without_apks',
            currentVersion: '1.2.3',
            releaseNotes: [{ version: '1.3.0', notes: 'Building', hasApk: false }],
            releasesUrl: 'https://github.com/example/releases',
            buildProgress: { percent: 40, status: 'in_progress' },
          })
          .mockResolvedValueOnce({
            success: false,
            errorCode: 'releases_without_apks',
            currentVersion: '1.2.3',
            releaseNotes: [{ version: '1.3.0', notes: 'Building', hasApk: false }],
            releasesUrl: 'https://github.com/example/releases',
            buildProgress: { percent: 50, status: 'in_progress' },
          });

        const { getByTestId } = await render(
          <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
        );

        await act(async () => {
          fireEvent.press(getByTestId('check-updates-row'));
        });

        await waitFor(() => {
          expect(updatePanelProps.last?.updateResult?.buildProgress?.percent).toBe(40);
        });
        expect(checkForAppUpdate).toHaveBeenCalledTimes(1);

        // Advancing past the poll interval triggers a silent re-check that updates the percent.
        await act(async () => {
          jest.advanceTimersByTime(5000);
        });

        await waitFor(() => {
          expect(updatePanelProps.last?.updateResult?.buildProgress?.percent).toBe(50);
        });
        expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('stops polling once the build finishes and an APK becomes available', async () => {
      jest.useFakeTimers();
      try {
        checkForAppUpdate
          .mockResolvedValueOnce({
            success: false,
            errorCode: 'releases_without_apks',
            currentVersion: '1.2.3',
            releaseNotes: [{ version: '1.3.0', notes: 'Building', hasApk: false }],
            releasesUrl: 'https://github.com/example/releases',
            buildProgress: { percent: 90, status: 'in_progress' },
          })
          .mockResolvedValueOnce({
            success: true,
            isUpdateAvailable: true,
            latestVersion: '1.3.0',
            currentVersion: '1.2.3',
            downloadUrl: 'https://example.com/penny-1.3.0.apk',
            releasesUrl: 'https://github.com/example/releases',
          });

        const { getByTestId } = await render(
          <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
        );

        await act(async () => {
          fireEvent.press(getByTestId('check-updates-row'));
        });

        await waitFor(() => {
          expect(updatePanelProps.last?.updateResult?.buildProgress?.percent).toBe(90);
        });

        await act(async () => {
          jest.advanceTimersByTime(5000);
        });

        await waitFor(() => {
          expect(updatePanelProps.last?.updateResult?.type).toBe('available');
        });
        expect(checkForAppUpdate).toHaveBeenCalledTimes(2);

        // The build is done — no further polling should occur.
        await act(async () => {
          jest.advanceTimersByTime(60000);
        });
        expect(checkForAppUpdate).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
