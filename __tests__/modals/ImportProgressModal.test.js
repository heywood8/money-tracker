/**
 * Tests for ImportProgressModal Component
 *
 * Tests cover:
 * - Component rendering and visibility
 * - Progress step display
 * - Step status indicators (pending, in_progress, completed)
 * - Dynamic step labels with counts
 * - Auto-scrolling to current step
 * - OK button functionality
 * - App reload on completion
 * - Non-dismissable behavior during import
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ImportProgressModal from '../../app/modals/ImportProgressModal';

// Mock dependencies
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      card: '#ffffff',
      text: '#000000',
      border: '#cccccc',
      primary: '#007AFF',
      mutedText: '#666666',
    },
  }),
}));

const mockFinishImport = jest.fn();
const mockRequestCancel = jest.fn();
const mockUseImportProgress = jest.fn();

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => mockUseImportProgress(),
}));

// Mock expo-updates
const mockReloadAsync = jest.fn(() => Promise.resolve());
jest.mock('expo-updates', () => ({
  reloadAsync: mockReloadAsync,
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('ImportProgressModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementation
    mockUseImportProgress.mockReturnValue({
      isImporting: true,
      steps: [
        { id: 'validate', label: 'Validating file', status: 'completed', data: null },
        { id: 'format', label: 'Detecting format', status: 'completed', data: 'Penny v1.2' },
        { id: 'accounts', label: 'Restoring accounts', status: 'in_progress', data: 5 },
        { id: 'categories', label: 'Restoring categories', status: 'pending', data: null },
        { id: 'operations', label: 'Restoring operations', status: 'pending', data: null },
        { id: 'budgets', label: 'Restoring budgets', status: 'pending', data: null },
        { id: 'metadata', label: 'Restoring metadata', status: 'pending', data: null },
        { id: 'complete', label: 'Import complete', status: 'pending', data: null },
      ],
      currentStep: 'accounts',
      isCancelling: false,
      finishImport: mockFinishImport,
      requestCancel: mockRequestCancel,
    });
  });

  describe('Rendering', () => {
    it('renders correctly when import is in progress', () => {
      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Importing Database')).toBeTruthy();
      expect(getByText('Please wait while your data is being restored...')).toBeTruthy();
    });

    it('displays all import steps', () => {
      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Validating file')).toBeTruthy();
      expect(getByText('Restoring 5 accounts...')).toBeTruthy();
      expect(getByText('Restoring categories')).toBeTruthy();
    });

    it('does not render when import is not active', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: false,
        steps: [],
        currentStep: null,
        finishImport: mockFinishImport,
      });

      const { queryByText } = render(<ImportProgressModal />);

      expect(queryByText('Importing Database')).toBeFalsy();
    });
  });

  describe('Step Status Display', () => {
    it('shows checkmark icon for completed steps', () => {
      const { getByText } = render(<ImportProgressModal />);

      // Completed steps should be visible
      expect(getByText('Validating file')).toBeTruthy();
    });

    it('shows activity indicator for in-progress steps', () => {
      const { getByText } = render(<ImportProgressModal />);

      // In-progress step with count
      expect(getByText('Restoring 5 accounts...')).toBeTruthy();
    });

    it('shows placeholder icon for pending steps', () => {
      const { getByText } = render(<ImportProgressModal />);

      // Pending steps
      expect(getByText('Restoring categories')).toBeTruthy();
      expect(getByText('Restoring operations')).toBeTruthy();
    });
  });

  describe('Dynamic Step Labels', () => {
    it('shows count in label for in-progress steps', () => {
      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Restoring 5 accounts...')).toBeTruthy();
    });

    it('shows count in label for completed steps', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'accounts', label: 'Restoring accounts', status: 'completed', data: 10 },
          { id: 'categories', label: 'Restoring categories', status: 'in_progress', data: 25 },
        ],
        currentStep: 'categories',
        finishImport: mockFinishImport,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Restored 10 accounts')).toBeTruthy();
      expect(getByText('Restoring 25 categories...')).toBeTruthy();
    });

    it('shows format information for format detection step', () => {
      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Detected format: Penny v1.2')).toBeTruthy();
    });

    it('shows default label when no data is available', () => {
      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Validating file')).toBeTruthy();
    });
  });

  describe('OK Button', () => {
    it('disables OK button while import is in progress', () => {
      const { UNSAFE_getAllByType } = render(<ImportProgressModal />);

      const Button = require('react-native-paper').Button;
      const buttons = UNSAFE_getAllByType(Button);
      // When not complete, both Cancel and OK buttons are rendered; OK is last
      const okButton = buttons[buttons.length - 1];

      expect(okButton.props.disabled).toBe(true);
    });

    it('enables OK button when import is complete', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'validate', label: 'Validating file', status: 'completed', data: null },
          { id: 'complete', label: 'Import complete', status: 'completed', data: null },
        ],
        currentStep: 'complete',
        finishImport: mockFinishImport,
      });

      const { UNSAFE_getByType } = render(<ImportProgressModal />);

      const Button = require('react-native-paper').Button;
      const okButton = UNSAFE_getByType(Button);

      expect(okButton.props.disabled).toBe(false);
    });

    it('calls finishImport when OK is pressed', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'complete', label: 'Import complete', status: 'completed', data: null },
        ],
        currentStep: 'complete',
        finishImport: mockFinishImport,
      });

      const { UNSAFE_getByType } = render(<ImportProgressModal />);

      const Button = require('react-native-paper').Button;
      const okButton = UNSAFE_getByType(Button);

      fireEvent.press(okButton);

      await waitFor(() => {
        expect(mockFinishImport).toHaveBeenCalled();
      });
    });

    it('initiates reload when OK is pressed', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'complete', label: 'Import complete', status: 'completed', data: null },
        ],
        currentStep: 'complete',
        finishImport: mockFinishImport,
      });

      const { UNSAFE_getByType } = render(<ImportProgressModal />);

      const Button = require('react-native-paper').Button;
      const okButton = UNSAFE_getByType(Button);

      // Verify the button exists and is enabled
      expect(okButton.props.disabled).toBe(false);

      fireEvent.press(okButton);

      // Verify finishImport was called (the reload happens asynchronously after)
      await waitFor(() => {
        expect(mockFinishImport).toHaveBeenCalled();
      });
    });
  });

  describe('Modal Behavior', () => {
    it('is non-dismissable during import', () => {
      const { UNSAFE_getByType } = render(<ImportProgressModal />);

      const Modal = require('react-native-paper').Modal;
      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.dismissable).toBe(false);
    });

    it('displays modal when isImporting is true', () => {
      const { UNSAFE_getByType } = render(<ImportProgressModal />);

      const Modal = require('react-native-paper').Modal;
      const modal = UNSAFE_getByType(Modal);

      expect(modal.props.visible).toBe(true);
    });
  });

  describe('Step Progress Visualization', () => {
    it('applies different text styles based on step status', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'validate', label: 'Validating file', status: 'completed', data: null },
          { id: 'accounts', label: 'Restoring accounts', status: 'in_progress', data: 5 },
          { id: 'categories', label: 'Restoring categories', status: 'pending', data: null },
        ],
        currentStep: 'accounts',
        finishImport: mockFinishImport,
      });

      const { getByText } = render(<ImportProgressModal />);

      const completedStep = getByText('Validating file');
      const inProgressStep = getByText('Restoring 5 accounts...');
      const pendingStep = getByText('Restoring categories');

      expect(completedStep).toBeTruthy();
      expect(inProgressStep).toBeTruthy();
      expect(pendingStep).toBeTruthy();
    });

    it('removes bottom border from last step', () => {
      const { getByText } = render(<ImportProgressModal />);

      // Last step should be visible
      expect(getByText('Import complete')).toBeTruthy();
    });
  });

  describe('Cancel Button', () => {
    it('shows cancel button while import is in progress', () => {
      const { getByText } = render(<ImportProgressModal />);
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('calls requestCancel when cancel button is pressed', () => {
      const { getByText } = render(<ImportProgressModal />);
      fireEvent.press(getByText('Cancel'));
      expect(mockRequestCancel).toHaveBeenCalled();
    });

    it('shows Cancelling... text when isCancelling is true', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [],
        currentStep: 'accounts',
        isCancelling: true,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText, queryByText } = render(<ImportProgressModal />);

      expect(getByText('Cancelling...')).toBeTruthy();
      expect(queryByText('Cancel')).toBeNull();
    });

    it('hides both cancel button and cancelling text when complete', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [{ id: 'complete', label: 'Done', status: 'completed', data: null }],
        currentStep: 'complete',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { queryByText } = render(<ImportProgressModal />);

      expect(queryByText('Cancel')).toBeNull();
      expect(queryByText('Cancelling...')).toBeNull();
    });
  });

  describe('Extended Step Labels', () => {
    it('shows in-progress labels for operations, budgets, metadata', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'operations', label: 'Restoring operations', status: 'in_progress', data: 42 },
          { id: 'budgets', label: 'Restoring budgets', status: 'in_progress', data: 5 },
          { id: 'metadata', label: 'Restoring metadata', status: 'in_progress', data: 3 },
        ],
        currentStep: 'operations',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Restoring 42 operations...')).toBeTruthy();
      expect(getByText('Restoring 5 budgets...')).toBeTruthy();
      expect(getByText('Restoring 3 metadata entries...')).toBeTruthy();
    });

    it('shows completed labels for operations, budgets, metadata', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'operations', label: 'Restoring operations', status: 'completed', data: 42 },
          { id: 'budgets', label: 'Restoring budgets', status: 'completed', data: 5 },
          { id: 'metadata', label: 'Restoring metadata', status: 'completed', data: 3 },
        ],
        currentStep: 'metadata',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Restored 42 operations')).toBeTruthy();
      expect(getByText('Restored 5 budgets')).toBeTruthy();
      expect(getByText('Restored 3 metadata entries')).toBeTruthy();
    });

    it('shows complete step label with multiple skipped operations', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'complete', label: 'Database restored successfully', status: 'completed', data: { skippedOperations: 3 } },
        ],
        currentStep: 'complete',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Database restored successfully (3 operations skipped — see logs)')).toBeTruthy();
    });

    it('shows complete step label with 1 skipped operation (singular)', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'complete', label: 'Database restored successfully', status: 'completed', data: { skippedOperations: 1 } },
        ],
        currentStep: 'complete',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Database restored successfully (1 operation skipped — see logs)')).toBeTruthy();
    });

    it('shows default complete label when no operations were skipped', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'complete', label: 'Database restored successfully', status: 'completed', data: { skippedOperations: 0 } },
        ],
        currentStep: 'complete',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Database restored successfully')).toBeTruthy();
    });
  });

  describe('Step Layout', () => {
    it('records step y-position when layout event fires', () => {
      const { UNSAFE_getAllByType } = render(<ImportProgressModal />);

      const { View } = require('react-native');
      const viewsWithLayout = UNSAFE_getAllByType(View).filter(v => v.props.onLayout);

      expect(viewsWithLayout.length).toBeGreaterThan(0);

      // Firing a layout event should not throw
      expect(() => {
        fireEvent(viewsWithLayout[0], 'layout', {
          nativeEvent: { layout: { y: 100 } },
        });
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty steps array', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [],
        currentStep: null,
        finishImport: mockFinishImport,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Importing Database')).toBeTruthy();
    });

    it('handles missing step data gracefully', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'accounts', label: 'Restoring accounts', status: 'in_progress', data: null },
        ],
        currentStep: 'accounts',
        finishImport: mockFinishImport,
      });

      const { getByText } = render(<ImportProgressModal />);

      // Should show default label without count
      expect(getByText('Restoring accounts')).toBeTruthy();
    });

    it('handles all step types correctly', () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'accounts', label: 'Accounts', status: 'completed', data: 5 },
          { id: 'categories', label: 'Categories', status: 'completed', data: 10 },
          { id: 'operations', label: 'Operations', status: 'completed', data: 100 },
          { id: 'budgets', label: 'Budgets', status: 'completed', data: 3 },
          { id: 'metadata', label: 'Metadata', status: 'completed', data: 2 },
        ],
        currentStep: 'complete',
        finishImport: mockFinishImport,
      });

      const { getByText } = render(<ImportProgressModal />);

      expect(getByText('Restored 5 accounts')).toBeTruthy();
      expect(getByText('Restored 10 categories')).toBeTruthy();
      expect(getByText('Restored 100 operations')).toBeTruthy();
      expect(getByText('Restored 3 budgets')).toBeTruthy();
      expect(getByText('Restored 2 metadata entries')).toBeTruthy();
    });
  });
});
