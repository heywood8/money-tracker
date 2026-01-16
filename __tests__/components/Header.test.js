/**
 * Header Component Tests
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Header from '../../app/components/Header';
import { appEvents } from '../../app/services/eventEmitter';
import { getDatabaseVersion } from '../../app/services/db';
import { IMPORT_PROGRESS_EVENT } from '../../app/services/BackupRestore';

// Mock contexts
const mockSetTheme = jest.fn();
let mockColorScheme = 'light';

jest.mock('../../app/contexts/ThemeConfigContext', () => ({
  useThemeConfig: () => ({
    colorScheme: mockColorScheme,
    setTheme: mockSetTheme,
  }),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      surface: '#FFFFFF',
      border: '#E0E0E0',
      text: '#000000',
      mutedText: '#999999',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
  }),
}));

// Mock db service
jest.mock('../../app/services/db', () => ({
  getDatabaseVersion: jest.fn(),
}));

// Mock eventEmitter
jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(),
    off: jest.fn(),
  },
}));

// Mock BackupRestore
jest.mock('../../app/services/BackupRestore', () => ({
  IMPORT_PROGRESS_EVENT: 'import_progress',
}));

// Mock expo vector icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIonicons({ name }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MockIonicons.propTypes = { name: PropTypes.string, size: PropTypes.number, color: PropTypes.string };
  return { Ionicons: MockIonicons };
});

// Mock layout constants
jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
}));

describe('Header', () => {
  const mockOnOpenSettings = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getDatabaseVersion.mockResolvedValue(5);
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByText('Penny')).toBeTruthy();
    });

    it('renders app title', () => {
      const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByText('Penny')).toBeTruthy();
    });

    it('renders version information', async () => {
      const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      await waitFor(() => {
        expect(getByText(/v.*\| DB v5/)).toBeTruthy();
      });
    });

    it('renders settings icon', () => {
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('icon-settings-outline')).toBeTruthy();
    });

    it('renders theme toggle icon (sunny for light mode)', () => {
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('icon-sunny')).toBeTruthy();
    });

    it('renders app icon image', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByLabelText('Penny app icon')).toBeTruthy();
    });
  });

  describe('Settings button', () => {
    it('calls onOpenSettings when pressed', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      const settingsButton = getByLabelText('settings');
      fireEvent.press(settingsButton);

      expect(mockOnOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('has correct accessibility properties', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      const settingsButton = getByLabelText('settings');
      expect(settingsButton.props.accessibilityRole).toBe('button');
      expect(settingsButton.props.accessibilityHint).toBe('Opens settings menu');
    });
  });

  describe('Theme toggle', () => {
    it('calls setTheme with dark when in light mode', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      const themeButton = getByLabelText('Switch to dark theme');
      fireEvent.press(themeButton);

      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('has correct accessibility properties for light mode', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      const themeButton = getByLabelText('Switch to dark theme');
      expect(themeButton.props.accessibilityRole).toBe('button');
      expect(themeButton.props.accessibilityHint).toBe('Toggles between light and dark theme');
    });
  });

  describe('Database version', () => {
    it('fetches database version on mount', async () => {
      render(<Header onOpenSettings={mockOnOpenSettings} />);

      await waitFor(() => {
        expect(getDatabaseVersion).toHaveBeenCalled();
      });
    });

    it('displays database version when loaded', async () => {
      getDatabaseVersion.mockResolvedValue(10);

      const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      await waitFor(() => {
        expect(getByText(/DB v10/)).toBeTruthy();
      });
    });

    it('displays ? when database version fails to load', async () => {
      getDatabaseVersion.mockRejectedValue(new Error('DB error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      // Version should show ? since loading failed
      await waitFor(() => {
        expect(getByText(/DB v\?/)).toBeTruthy();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch database version:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Import progress event listener', () => {
    it('subscribes to import progress events on mount', () => {
      render(<Header onOpenSettings={mockOnOpenSettings} />);

      expect(appEvents.on).toHaveBeenCalledWith(
        IMPORT_PROGRESS_EVENT,
        expect.any(Function),
      );
    });

    it('unsubscribes from import progress events on unmount', () => {
      const { unmount } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      unmount();

      expect(appEvents.off).toHaveBeenCalledWith(
        IMPORT_PROGRESS_EVENT,
        expect.any(Function),
      );
    });

    it('refreshes DB version when import completes', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      render(<Header onOpenSettings={mockOnOpenSettings} />);

      // Initial fetch
      expect(getDatabaseVersion).toHaveBeenCalledTimes(1);

      // Simulate import completion event
      eventHandler({ stepId: 'complete', status: 'completed' });

      await waitFor(() => {
        expect(getDatabaseVersion).toHaveBeenCalledTimes(2);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Import completed, refreshing DB version...');
      consoleSpy.mockRestore();
    });

    it('does not refresh DB version for non-complete events', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
      });

      render(<Header onOpenSettings={mockOnOpenSettings} />);

      // Initial fetch
      expect(getDatabaseVersion).toHaveBeenCalledTimes(1);

      // Simulate non-complete event
      eventHandler({ stepId: 'accounts', status: 'in_progress' });

      // Should not have been called again
      expect(getDatabaseVersion).toHaveBeenCalledTimes(1);
    });

    it('does not refresh DB version for complete step with non-completed status', async () => {
      let eventHandler;
      appEvents.on.mockImplementation((event, handler) => {
        eventHandler = handler;
      });

      render(<Header onOpenSettings={mockOnOpenSettings} />);

      // Initial fetch
      expect(getDatabaseVersion).toHaveBeenCalledTimes(1);

      // Simulate complete step but not completed status
      eventHandler({ stepId: 'complete', status: 'in_progress' });

      // Should not have been called again
      expect(getDatabaseVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Default props', () => {
    it('uses default onOpenSettings when not provided', () => {
      // Should not throw
      const { getByLabelText } = render(<Header />);

      const settingsButton = getByLabelText('settings');
      fireEvent.press(settingsButton);

      // Default is a no-op function, so nothing should happen
    });
  });

  describe('Dark theme mode', () => {
    beforeEach(() => {
      mockColorScheme = 'dark';
    });

    afterEach(() => {
      mockColorScheme = 'light';
    });

    it('shows moon icon in dark mode', () => {
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('icon-moon')).toBeTruthy();
    });

    it('has correct accessibility label for dark mode', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      const themeButton = getByLabelText('Switch to light theme');
      expect(themeButton).toBeTruthy();
    });

    it('calls setTheme with light when in dark mode', () => {
      const { getByLabelText } = render(<Header onOpenSettings={mockOnOpenSettings} />);

      const themeButton = getByLabelText('Switch to light theme');
      fireEvent.press(themeButton);

      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });
});

