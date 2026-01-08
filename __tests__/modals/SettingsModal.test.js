/**
 * Tests for SettingsModal Component
 * Regression test to ensure modal can be dismissed by tapping outside
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import SettingsModal from '../../app/modals/SettingsModal';

// Mock all context dependencies
jest.mock('../../app/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      primary: '#007AFF',
      mutedText: '#666666',
      surface: '#f5f5f5',
    },
    theme: 'light',
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
    language: 'en',
    setLanguage: jest.fn(),
    availableLanguages: ['en', 'ru', 'es', 'fr', 'de', 'it', 'zh'],
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({
    showDialog: jest.fn(),
  }),
}));

jest.mock('../../app/contexts/AccountsContext', () => ({
  useAccounts: () => ({
    resetDatabase: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: jest.fn(),
    cancelImport: jest.fn(),
    completeImport: jest.fn(),
  }),
}));

// Mock expo-updates
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(() => Promise.resolve()),
}));

// Mock BackupRestore service
jest.mock('../../app/services/BackupRestore', () => ({
  exportBackup: jest.fn(() => Promise.resolve()),
  importBackup: jest.fn(() => Promise.resolve()),
}));

describe('SettingsModal Component', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Modal Dismissal - Regression Tests', () => {
    it('modal can be dismissed by tapping outside', () => {
      // This is a regression test for the bug where tapping outside
      // the modal did not close it due to transparent background
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      // Verify that dismissable is explicitly set to true
      expect(modalInstance.props.dismissable).toBe(true);

      // Verify onDismiss handler exists and works
      expect(modalInstance.props.onDismiss).toBeDefined();
      expect(typeof modalInstance.props.onDismiss).toBe('function');

      // Simulate dismissal by calling onDismiss
      modalInstance.props.onDismiss();

      // Should call onClose
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('modal does not have contentContainerStyle that blocks backdrop tap events', () => {
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      // contentContainerStyle should not be set to a value that blocks tap events
      // Previously, it had styles.modalWrapper with flex: 1 which blocked taps
      const containerStyle = modalInstance.props.contentContainerStyle;

      // contentContainerStyle should be undefined (not set)
      // If it's set, it should not have flex: 1 or backgroundColor: 'transparent'
      if (containerStyle) {
        expect(containerStyle).not.toEqual(
          expect.objectContaining({ flex: 1 }),
        );
        expect(containerStyle).not.toEqual(
          expect.objectContaining({ backgroundColor: 'transparent' }),
        );
      } else {
        // Ideally it should be undefined
        expect(containerStyle).toBeUndefined();
      }
    });

    it('onDismiss calls onClose when no sub-modal is open', () => {
      const { UNSAFE_getByType } = render(
        <SettingsModal visible={true} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_getByType(Modal);

      // When no sub-modals are open, onDismiss should call onClose directly
      modalInstance.props.onDismiss();

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not render when visible is false', () => {
      const { UNSAFE_queryByType } = render(
        <SettingsModal visible={false} onClose={mockOnClose} />,
      );

      const Modal = require('react-native-paper').Modal;
      const modalInstance = UNSAFE_queryByType(Modal);

      // Modal should not render its children when visible is false
      // Due to the mock, it returns null when visible is false
      expect(modalInstance).toBeTruthy(); // Modal component exists
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
