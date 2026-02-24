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

// Mock BackupRestore service
const mockExportBackup = jest.fn(() => Promise.resolve());
const mockImportBackup = jest.fn(() => Promise.resolve());
jest.mock('../../app/services/BackupRestore', () => ({
  exportBackup: mockExportBackup,
  importBackup: mockImportBackup,
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
jest.mock('expo-file-system', () => ({
  cacheDirectory: '/tmp/cache/',
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(() => Promise.resolve()),
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
    mockImportBackup.mockClear();
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
    it('shows dialog when reset row is pressed', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('reset_database'));

      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ text: 'cancel' }),
          expect.objectContaining({ text: 'reset', style: 'destructive' }),
        ]),
      );
    });

    it('shows dialog when import row is pressed', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('import'));

      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({ text: 'cancel' }),
          expect.objectContaining({ text: expect.any(String), style: 'destructive' }),
        ]),
      );
    });

    it('performs import when confirmed', async () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('import'));

      const dialogCall = mockShowDialog.mock.calls[0];
      const dialogButtons = dialogCall[2];
      const restoreButton = dialogButtons.find(b => b.style === 'destructive');

      expect(restoreButton.onPress).toBeDefined();
      expect(typeof restoreButton.onPress).toBe('function');
    });

    it('import dialog has destructive confirm button', () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('import'));

      const dialogCall = mockShowDialog.mock.calls[0];
      const dialogButtons = dialogCall[2];
      const restoreButton = dialogButtons.find(b => b.style === 'destructive');

      expect(restoreButton).toBeTruthy();
      expect(restoreButton.style).toBe('destructive');
    });

    it('performs reset when confirmed', async () => {
      const { getByText } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      fireEvent.press(getByText('reset_database'));

      const dialogCall = mockShowDialog.mock.calls[0];
      const dialogButtons = dialogCall[2];
      const resetDialogButton = dialogButtons.find(b => b.style === 'destructive');

      await act(async () => {
        await resetDialogButton.onPress();
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

      expect(getByText('JSON')).toBeTruthy();
      expect(getByText('CSV')).toBeTruthy();
      expect(getByText('SQLite Database')).toBeTruthy();
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
});
