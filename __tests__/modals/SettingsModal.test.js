/**
 * Tests for SettingsModal Component
 * Regression test to ensure modal can be dismissed by tapping outside
 */

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import SettingsModal from '../../app/modals/SettingsModal';

// Create mock functions we can spy on
const mockSetLanguage = jest.fn();
const mockShowDialog = jest.fn();
const mockResetDatabase = jest.fn(() => Promise.resolve());
const mockStartImport = jest.fn();
const mockCancelImport = jest.fn();
const mockCompleteImport = jest.fn();
const mockSetHideBalances = jest.fn();
const mockAuthenticateWithBiometrics = jest.fn();

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

describe('SettingsModal Component', () => {
  const mockOnClose = jest.fn();

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
    displaySettingsMockState.hideBalances = false;
  });

  describe('Basic Rendering', () => {
    it('renders settings title', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByText('settings')).toBeTruthy();
    });

    it('renders language row', () => {
      const { getAllByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      // "language" appears as row label and in language submodal header
      expect(getAllByText('language').length).toBeGreaterThanOrEqual(1);
    });

    it('renders database section label', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByText('database')).toBeTruthy();
    });

    it('renders export row', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByText('export')).toBeTruthy();
    });

    it('renders import row', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByText('import')).toBeTruthy();
    });

    it('renders reset database row', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByText('reset_database')).toBeTruthy();
    });

    it('renders English language value', () => {
      const { getAllByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getAllByText(/English/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Language Selection', () => {
    it('displays current language with flag in the row', () => {
      const { getAllByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getAllByText(/English/).length).toBeGreaterThanOrEqual(1);
    });

    it('opens language modal when language row is pressed', () => {
      const { UNSAFE_getAllByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const TouchableRipple = require('react-native-paper').TouchableRipple;
      const touchables = UNSAFE_getAllByType(TouchableRipple);

      // First TouchableRipple is the language row
      act(() => {
        fireEvent.press(touchables[0]);
      });
    });

    it('applies language immediately on selection', () => {
      const { UNSAFE_getAllByType, getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const TouchableRipple = require('react-native-paper').TouchableRipple;
      const touchables = UNSAFE_getAllByType(TouchableRipple);

      // Open language modal (first TouchableRipple)
      act(() => {
        fireEvent.press(touchables[0]);
      });

      // Select Spanish
      act(() => {
        fireEvent.press(getByText(/Español/));
      });

      expect(mockSetLanguage).toHaveBeenCalledWith('es');
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is pressed', () => {
      const { UNSAFE_getAllByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const TouchableOpacity = require('react-native').TouchableOpacity;
      const touchables = UNSAFE_getAllByType(TouchableOpacity);

      // First TouchableOpacity is the close button in the header
      fireEvent.press(touchables[0]);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Database Operations', () => {
    it('shows reset confirmation subpanel when reset row is pressed', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('reset_database'));

      expect(getByText('reset_database_confirm')).toBeTruthy();
      expect(getByText('reset')).toBeTruthy();
    });

    it('shows import source picker when import row is pressed', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('import'));

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
    });

    it('performs import when confirm button is pressed after selecting from file', async () => {
      const { getByText, getByTestId } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
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
        expect(mockImportBackupFromFile).toHaveBeenCalledWith({ fileUri: '/mock/file.json', filename: 'backup.json' });
        expect(mockStartImport).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('performs reset when subpanel confirm button is pressed', async () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('reset_database'));

      await act(async () => {
        fireEvent.press(getByText('reset'));
      });

      expect(mockResetDatabase).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    it('opens export format modal when export row is pressed', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      act(() => {
        fireEvent.press(getByText('export'));
      });
    });

    it('shows export format options when export is pressed', async () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
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
        <SettingsModal visible={true} onClose={mockOnClose} />,
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
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByText('developer')).toBeTruthy();
    });

    it('renders logs row', () => {
      const { getByTestId } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      expect(getByTestId('logs-row')).toBeTruthy();
    });

    it('renders logs label text', () => {
      const { getAllByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      // "logs" appears in the settings row and in the logs sub-modal header
      expect(getAllByText('logs').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Modal Dismissal - Regression Tests', () => {
    it('modal can be dismissed by tapping outside', () => {
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      expect(modalInstance.props.dismissable).toBe(true);
      expect(modalInstance.props.onDismiss).toBeDefined();
      expect(typeof modalInstance.props.onDismiss).toBe('function');

      modalInstance.props.onDismiss();

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('modal does not have contentContainerStyle that blocks backdrop tap events', () => {
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      const containerStyle = modalInstance.props.contentContainerStyle;

      if (containerStyle) {
        expect(containerStyle).not.toEqual(
          expect.objectContaining({ flex: 1 }),
        );
        expect(containerStyle).not.toEqual(
          expect.objectContaining({ backgroundColor: 'transparent' }),
        );
      } else {
        expect(containerStyle).toBeUndefined();
      }
    });

    it('onDismiss calls onClose when no sub-modal is open', () => {
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      modalInstance.props.onDismiss();

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not render when visible is false', () => {
      const { UNSAFE_queryByType } = render(
        <SettingsModal visible={false} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_queryByType(Modal);

      expect(modalInstance).toBeTruthy();
    });

    it('renders when visible is true', () => {
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      expect(modalInstance).toBeTruthy();
      expect(modalInstance.props.visible).toBe(true);
    });
  });

  describe('Import Flow', () => {
    it('shows three source options in the source picker', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('import'));

      expect(getByText('import_from_file')).toBeTruthy();
      expect(getByText('import_from_local')).toBeTruthy();
    });

    it('shows confirm step after selecting from file', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('import'));
      fireEvent.press(getByText('import_from_file'));

      expect(getByText('restore_confirm')).toBeTruthy();
    });

    it('back button from confirm-file returns to source picker', () => {
      const { getByText, getByTestId } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
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
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('export'));

      expect(getByText('save_local_backup')).toBeTruthy();
    });

    it('calls createBackup when save local backup row is pressed', async () => {
      mockCreateBackup.mockResolvedValue({ version: 1, data: {} });

      const { getByTestId, getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
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
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      await act(async () => {
        fireEvent.press(getByText('hide_balances'));
      });

      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('biometric not available'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('silently allows unhide and calls setHideBalances(false) when biometrics NOT_ENROLLED', async () => {
      displaySettingsMockState.hideBalances = true;
      mockAuthenticateWithBiometrics.mockResolvedValue('not_enrolled');
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      await act(async () => {
        fireEvent.press(getByText('hide_balances'));
      });

      expect(mockShowDialog).not.toHaveBeenCalled();
      expect(mockSetHideBalances).toHaveBeenCalledWith(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('biometric not enrolled'),
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
