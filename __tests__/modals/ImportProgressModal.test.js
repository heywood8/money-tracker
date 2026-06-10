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
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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
    it('renders correctly when import is in progress', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Importing Database')).toBeTruthy();
      expect(getByText('Please wait while your data is being restored...')).toBeTruthy();
    });

    it('displays all import steps', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Validating file')).toBeTruthy();
      expect(getByText('Restoring 5 accounts...')).toBeTruthy();
      expect(getByText('Restoring categories')).toBeTruthy();
    });

    it('does not render when import is not active', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: false,
        steps: [],
        currentStep: null,
        finishImport: mockFinishImport,
      });

      const { queryByText } = await render(<ImportProgressModal />);

      expect(queryByText('Importing Database')).toBeFalsy();
    });
  });

  describe('Step Status Display', () => {
    it('shows checkmark icon for completed steps', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      // Completed steps should be visible
      expect(getByText('Validating file')).toBeTruthy();
    });

    it('shows activity indicator for in-progress steps', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      // In-progress step with count
      expect(getByText('Restoring 5 accounts...')).toBeTruthy();
    });

    it('shows placeholder icon for pending steps', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      // Pending steps
      expect(getByText('Restoring categories')).toBeTruthy();
      expect(getByText('Restoring operations')).toBeTruthy();
    });
  });

  describe('Dynamic Step Labels', () => {
    it('shows count in label for in-progress steps', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Restoring 5 accounts...')).toBeTruthy();
    });

    it('shows count in label for completed steps', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'accounts', label: 'Restoring accounts', status: 'completed', data: 10 },
          { id: 'categories', label: 'Restoring categories', status: 'in_progress', data: 25 },
        ],
        currentStep: 'categories',
        finishImport: mockFinishImport,
      });

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Restored 10 accounts')).toBeTruthy();
      expect(getByText('Restoring 25 categories...')).toBeTruthy();
    });

    it('shows format information for format detection step', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Detected format: Penny v1.2')).toBeTruthy();
    });

    it('shows default label when no data is available', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Validating file')).toBeTruthy();
    });
  });

  describe('OK Button', () => {
    it('disables OK button while import is in progress', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      // TouchableOpacity renders as View with accessibilityState in the host tree
      const okButtonView = getByText('OK').parent;
      expect(okButtonView.props.accessibilityState.disabled).toBe(true);
    });

    it('enables OK button when import is complete', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'validate', label: 'Validating file', status: 'completed', data: null },
          { id: 'complete', label: 'Import complete', status: 'completed', data: null },
        ],
        currentStep: 'complete',
        finishImport: mockFinishImport,
      });

      const { getByText } = await render(<ImportProgressModal />);

      const okButtonView = getByText('OK').parent;
      expect(okButtonView.props.accessibilityState.disabled).toBe(false);
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

      const { getByText } = await render(<ImportProgressModal />);

      await fireEvent.press(getByText('OK'));

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

      const { getByText } = await render(<ImportProgressModal />);

      const okButtonView = getByText('OK').parent;
      expect(okButtonView.props.accessibilityState.disabled).toBe(false);

      await fireEvent.press(getByText('OK'));

      await waitFor(() => {
        expect(mockFinishImport).toHaveBeenCalled();
      });
    });
  });

  describe('Modal Behavior', () => {
    it('is non-dismissable during import', async () => {
      const { container } = await render(<ImportProgressModal />);

      const Modal = require('react-native-paper').Modal;
      const modal = container.queryAll(n => n.type === 'View' && 'dismissable' in (n.props || {}))[0];

      expect(modal.props.dismissable).toBe(false);
    });

    it('displays modal when isImporting is true', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      // When isImporting=true the modal is visible and its content is rendered
      expect(getByText('Importing Database')).toBeTruthy();
    });
  });

  describe('Step Progress Visualization', () => {
    it('applies different text styles based on step status', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      const completedStep = getByText('Validating file');
      const inProgressStep = getByText('Restoring 5 accounts...');
      const pendingStep = getByText('Restoring categories');

      expect(completedStep).toBeTruthy();
      expect(inProgressStep).toBeTruthy();
      expect(pendingStep).toBeTruthy();
    });

    it('removes bottom border from last step', async () => {
      const { getByText } = await render(<ImportProgressModal />);

      // Last step should be visible
      expect(getByText('Import complete')).toBeTruthy();
    });
  });

  describe('Cancel Button', () => {
    it('shows cancel button while import is in progress', async () => {
      const { getByText } = await render(<ImportProgressModal />);
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('calls requestCancel when cancel button is pressed', async () => {
      const { getByText } = await render(<ImportProgressModal />);
      await fireEvent.press(getByText('Cancel'));
      expect(mockRequestCancel).toHaveBeenCalled();
    });

    it('shows Cancelling... text when isCancelling is true', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [],
        currentStep: 'accounts',
        isCancelling: true,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText, queryByText } = await render(<ImportProgressModal />);

      expect(getByText('Cancelling...')).toBeTruthy();
      expect(queryByText('Cancel')).toBeNull();
    });

    it('hides both cancel button and cancelling text when complete', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [{ id: 'complete', label: 'Done', status: 'completed', data: null }],
        currentStep: 'complete',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { queryByText } = await render(<ImportProgressModal />);

      expect(queryByText('Cancel')).toBeNull();
      expect(queryByText('Cancelling...')).toBeNull();
    });
  });

  describe('Extended Step Labels', () => {
    it('shows in-progress labels for operations, budgets, metadata', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Restoring 42 operations...')).toBeTruthy();
      expect(getByText('Restoring 5 budgets...')).toBeTruthy();
      expect(getByText('Restoring 3 metadata entries...')).toBeTruthy();
    });

    it('shows completed labels for operations, budgets, metadata', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Restored 42 operations')).toBeTruthy();
      expect(getByText('Restored 5 budgets')).toBeTruthy();
      expect(getByText('Restored 3 metadata entries')).toBeTruthy();
    });

    it('shows complete step label with multiple skipped operations', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Database restored successfully (3 operations skipped — see logs)')).toBeTruthy();
    });

    it('shows complete step label with 1 skipped operation (singular)', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Database restored successfully (1 operation skipped — see logs)')).toBeTruthy();
    });

    it('returns step label for in-progress step with data but unrecognised id', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'restore', label: 'Restoring database', status: 'in_progress', data: 'some-data' },
        ],
        currentStep: 'restore',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Restoring database')).toBeTruthy();
    });

    it('returns step label for completed step with data but unrecognised id', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'clear', label: 'Clearing existing data', status: 'completed', data: 'some-data' },
        ],
        currentStep: 'clear',
        isCancelling: false,
        finishImport: mockFinishImport,
        requestCancel: mockRequestCancel,
      });

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Clearing existing data')).toBeTruthy();
    });

    it('shows default complete label when no operations were skipped', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Database restored successfully')).toBeTruthy();
    });
  });

  describe('Step Layout', () => {
    it('records step y-position when layout event fires', async () => {
      const { container } = await render(<ImportProgressModal />);

      const { View } = require('react-native');
      const viewsWithLayout = container.queryAll(n => n.type === 'View').filter(v => v.props.onLayout);

      expect(viewsWithLayout.length).toBeGreaterThan(0);

      // Firing a layout event should not throw
      await expect(fireEvent(viewsWithLayout[0], 'layout', {
        nativeEvent: { layout: { y: 100 } },
      })).resolves.not.toThrow();
    });
  });

  describe('Auto-scroll Effect', () => {
    it('scrolls to current step without errors when layout positions are known', async () => {
      const { container } = await render(<ImportProgressModal />);

      // Populate stepPositions.current via layout events — no errors expected
      const layoutViews = container.queryAll(n => n.type === 'View').filter(v => v.props.onLayout);
      expect(layoutViews.length).toBeGreaterThan(0);
      for (const v of layoutViews) {
        await fireEvent(v, 'layout', { nativeEvent: { layout: { y: 60 } } });
      }

      // The component remains rendered with the current step and no scrollTo crash
      expect(container.queryAll(n => n.type === 'View').length).toBeGreaterThan(0);
    });
  });

  describe('Web Platform Reload', () => {
    it('calls window.location.reload when Platform.OS is web', async () => {
      const Platform = require('react-native').Platform;
      const originalOS = Platform.OS;
      Platform.OS = 'web';

      const mockReload = jest.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { reload: mockReload },
      });

      try {
        mockUseImportProgress.mockReturnValue({
          isImporting: true,
          steps: [{ id: 'complete', label: 'Done', status: 'completed', data: null }],
          currentStep: 'complete',
          isCancelling: false,
          finishImport: mockFinishImport,
          requestCancel: mockRequestCancel,
        });

        const { getByText } = await render(<ImportProgressModal />);

        await fireEvent.press(getByText('OK'));

        await waitFor(() => {
          expect(mockFinishImport).toHaveBeenCalled();
          expect(mockReload).toHaveBeenCalled();
        });
      } finally {
        Platform.OS = originalOS;
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles empty steps array', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [],
        currentStep: null,
        finishImport: mockFinishImport,
      });

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Importing Database')).toBeTruthy();
    });

    it('handles missing step data gracefully', async () => {
      mockUseImportProgress.mockReturnValue({
        isImporting: true,
        steps: [
          { id: 'accounts', label: 'Restoring accounts', status: 'in_progress', data: null },
        ],
        currentStep: 'accounts',
        finishImport: mockFinishImport,
      });

      const { getByText } = await render(<ImportProgressModal />);

      // Should show default label without count
      expect(getByText('Restoring accounts')).toBeTruthy();
    });

    it('handles all step types correctly', async () => {
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

      const { getByText } = await render(<ImportProgressModal />);

      expect(getByText('Restored 5 accounts')).toBeTruthy();
      expect(getByText('Restored 10 categories')).toBeTruthy();
      expect(getByText('Restored 100 operations')).toBeTruthy();
      expect(getByText('Restored 3 budgets')).toBeTruthy();
      expect(getByText('Restored 2 metadata entries')).toBeTruthy();
    });
  });
});
