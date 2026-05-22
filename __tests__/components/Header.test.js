/**
 * Header Component Tests
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Header from '../../app/components/Header';

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

// Mock UpdateDownloadContext
let mockIsDownloading = false;
let mockDownloadProgress = null;
jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({
    isDownloading: mockIsDownloading,
    downloadProgress: mockDownloadProgress,
    startDownload: jest.fn(),
  }),
}));

// Mock SearchContext
jest.mock('../../app/contexts/SearchContext', () => ({
  useSearch: () => ({
    openSearch: jest.fn(),
    registerSearchHandler: jest.fn(),
  }),
}));

describe('Header', () => {
  const mockOnOpenSettings = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDownloading = false;
    mockDownloadProgress = null;
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('settings-button')).toBeTruthy();
    });

    it('does not render version text in header', () => {
      const { queryByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(queryByText(/v\d+\.\d+/)).toBeNull();
      expect(queryByText(/DB v/)).toBeNull();
    });

    it('renders settings icon', () => {
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('icon-settings-outline')).toBeTruthy();
    });

    it('renders theme toggle icon (sunny for light mode)', () => {
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('icon-sunny')).toBeTruthy();
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

  describe('Download indicator', () => {
    it('does not show download indicator when not downloading', () => {
      mockIsDownloading = false;
      const { queryByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(queryByTestId('download-indicator')).toBeNull();
    });

    it('shows download indicator when downloading', () => {
      mockIsDownloading = true;
      mockDownloadProgress = 0.42;
      const { getByTestId } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByTestId('download-indicator')).toBeTruthy();
    });

    it('shows correct percentage when downloading', () => {
      mockIsDownloading = true;
      mockDownloadProgress = 0.75;
      const { getByText } = render(<Header onOpenSettings={mockOnOpenSettings} />);
      expect(getByText('75%')).toBeTruthy();
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
