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
}));

// Mock PreferencesDB
jest.mock('../../app/services/PreferencesDB', () => ({
  getPreference: jest.fn(() => Promise.resolve(null)),
  setPreference: jest.fn(() => Promise.resolve()),
  PREF_KEYS: {
    GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  },
}));

// Mock GoogleSheetsService
jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(() => Promise.resolve(null)),
  signIn: jest.fn(() => Promise.resolve(null)),
  exportToSheets: jest.fn(() => Promise.resolve()),
  importFromSheets: jest.fn(() => Promise.resolve()),
}));

// Mock UpdateContentPanel
jest.mock('../../app/components/UpdateContentPanel', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function UpdateContentPanel() {
    return React.createElement(View, { testID: 'update-content-panel' });
  };
});

// Mock AccountsScreen (embedded in the accounts subpanel) to avoid pulling in
// its heavy dependency tree (draggable list, accounts/operations contexts, etc.)
jest.mock('../../app/screens/AccountsScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  const PropTypes = require('prop-types');
  function AccountsScreen({ embedded }) {
    return React.createElement(View, { testID: 'accounts-screen', accessibilityLabel: embedded ? 'embedded' : 'standalone' });
  }
  AccountsScreen.propTypes = { embedded: PropTypes.bool };
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
    it('renders the settings rows', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('settings-language-row')).toBeTruthy();
      expect(getByTestId('settings-export-row')).toBeTruthy();
    });

    it('renders accounts row', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('settings-accounts-row')).toBeTruthy();
    });

    it('opens the accounts subpanel when the accounts row is pressed', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByTestId('settings-accounts-row'));

      expect(getByTestId('accounts-screen')).toBeTruthy();
      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });

    it('renders categories row', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('settings-categories-row')).toBeTruthy();
    });

    it('opens categories subpanel when categories row is pressed', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByTestId('settings-categories-row'));

      expect(getByTestId('categories-screen')).toBeTruthy();
      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });

    it('renders language row', () => {
      const { getAllByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      // "language" appears as row label and in language submodal header
      expect(getAllByText('language').length).toBeGreaterThanOrEqual(1);
    });

    it('renders database section label', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('database')).toBeTruthy();
    });

    it('renders export row', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('export')).toBeTruthy();
    });

    it('renders import row', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('import')).toBeTruthy();
    });

    it('renders reset database row', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('reset_database')).toBeTruthy();
    });

    it('renders English language value', () => {
      const { getAllByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getAllByText(/English/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('setSubPanelActive signalling', () => {
    it('calls setSubPanelActive(false) on initial mount (no subpanel open)', () => {
      render(<SettingsScreen setSubPanelActive={mockSetSubPanelActive} />);
      expect(mockSetSubPanelActive).toHaveBeenCalledWith(false);
    });

    it('calls setSubPanelActive(true) when a subpanel opens', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      mockSetSubPanelActive.mockClear();

      fireEvent.press(getByTestId('settings-language-row'));

      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });

    it('calls setSubPanelActive(true) when export subpanel opens', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );
      mockSetSubPanelActive.mockClear();

      fireEvent.press(getByTestId('settings-export-row'));

      expect(mockSetSubPanelActive).toHaveBeenCalledWith(true);
    });
  });

  describe('Language Selection', () => {
    it('displays current language with flag in the row', () => {
      const { getAllByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getAllByText(/English/).length).toBeGreaterThanOrEqual(1);
    });

    it('opens language modal when language row is pressed', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      act(() => {
        fireEvent.press(getByTestId('settings-language-row'));
      });
    });

    it('applies language immediately on selection', () => {
      const { getByTestId, getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      // Open language modal
      act(() => {
        fireEvent.press(getByTestId('settings-language-row'));
      });

      // Select Spanish
      act(() => {
        fireEvent.press(getByText(/Español/));
      });

      expect(mockSetLanguage).toHaveBeenCalledWith('es');
    });
  });

  describe('Database Operations', () => {
    it('shows reset confirmation subpanel when reset row is pressed', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('reset_database'));

      expect(getByText('reset_database_confirm')).toBeTruthy();
      expect(getByText('reset')).toBeTruthy();
    });

    it('shows import source picker when import row is pressed', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('import'));

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
    });

    it('performs import when confirm button is pressed after selecting from file', async () => {
      const { getByText, getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('import'));
      fireEvent.press(getByText('import_from_file'));

      expect(getByText('restore_confirm')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('confirm-import-file-btn'));
      });

      expect(mockPickImportFile).toHaveBeenCalled();
      expect(mockCancelImport).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(mockImportBackupFromFile).toHaveBeenCalledWith({ fileUri: '/mock/file.json', filename: 'backup.json' }, expect.any(Object));
        expect(mockStartImport).toHaveBeenCalled();
      });
    });

    it('performs reset when subpanel confirm button is pressed', async () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('reset_database'));

      await act(async () => {
        fireEvent.press(getByText('reset'));
      });

      expect(mockResetDatabase).toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    it('opens export format modal when export row is pressed', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      act(() => {
        fireEvent.press(getByText('export'));
      });
    });

    it('shows export format options when export is pressed', async () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      act(() => {
        fireEvent.press(getByText('export'));
      });

      expect(getByText('Save externally to JSON')).toBeTruthy();
      expect(getByText('Save externally to CSV')).toBeTruthy();
      expect(getByText('Save externally to SQLite')).toBeTruthy();
    });

    it('renders export format descriptions', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      act(() => {
        fireEvent.press(getByText('export'));
      });

      expect(getByText('json_description')).toBeTruthy();
      expect(getByText('csv_description')).toBeTruthy();
      expect(getByText('sqlite_description')).toBeTruthy();
    });
  });

  describe('Developer Section', () => {
    it('renders developer section label', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByText('developer')).toBeTruthy();
    });

    it('renders logs row', () => {
      const { getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      expect(getByTestId('logs-row')).toBeTruthy();
    });

    it('renders logs label text', () => {
      const { getAllByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      // "logs" appears in the settings row and in the logs sub-modal header
      expect(getAllByText('logs').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Import Flow', () => {
    it('shows three source options in the source picker', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('import'));

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
    });

    it('shows confirm step after selecting from file', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('import'));
      fireEvent.press(getByText('import_from_file'));

      expect(getByText('restore_confirm')).toBeTruthy();
    });

    it('back button from confirm-file returns to source picker', () => {
      const { getByText, getByTestId } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('import'));
      fireEvent.press(getByText('import_from_file'));
      fireEvent.press(getByTestId('settings-subpanel-back'));

      expect(getByText('import_from_file')).toBeTruthy();
    });
  });

  describe('Save Local Backup', () => {
    it('shows save local backup option in export panel', () => {
      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('export'));

      expect(getByText('save_local_backup')).toBeTruthy();
    });

    it('calls createBackup when save local backup row is pressed', async () => {
      mockCreateBackup.mockResolvedValue({ version: 1, data: {} });

      const { getByTestId, getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      fireEvent.press(getByText('export'));

      await act(async () => {
        fireEvent.press(getByTestId('settings-export-save-local-backup'));
      });

      expect(mockCreateBackup).toHaveBeenCalled();
    });
  });

  describe('Hide Balances Toggle', () => {
    it('silently allows unhide and calls setHideBalances(false) when biometrics NOT_AVAILABLE', async () => {
      displaySettingsMockState.hideBalances = true;
      mockAuthenticateWithBiometrics.mockResolvedValue('not_available');

      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        fireEvent.press(getByText('hide_balances'));
      });

      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
    });

    it('silently allows unhide and calls setHideBalances(false) when biometrics NOT_ENROLLED', async () => {
      displaySettingsMockState.hideBalances = true;
      mockAuthenticateWithBiometrics.mockResolvedValue('not_enrolled');

      const { getByText } = render(
        <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
      );

      await act(async () => {
        fireEvent.press(getByText('hide_balances'));
      });

      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
    });
  });
});
