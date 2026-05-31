/**
 * Header Component Tests
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Header from '../../app/components/Header';

// Mock contexts
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
let mockDownloadPhase = null;
jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({
    isDownloading: mockIsDownloading,
    downloadProgress: mockDownloadProgress,
    downloadPhase: mockDownloadPhase,
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDownloading = false;
    mockDownloadProgress = null;
    mockDownloadPhase = null;
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const { toJSON } = render(<Header />);
      expect(toJSON()).toBeTruthy();
    });

    it('does not render version text in header', () => {
      const { queryByText } = render(<Header />);
      expect(queryByText(/v\d+\.\d+/)).toBeNull();
      expect(queryByText(/DB v/)).toBeNull();
    });

    it('does not render theme toggle button in header', () => {
      const { queryByTestId } = render(<Header />);
      expect(queryByTestId('theme-toggle-button')).toBeNull();
    });
  });

  describe('Download indicator', () => {
    it('does not show download indicator when not downloading', () => {
      mockIsDownloading = false;
      const { queryByTestId } = render(<Header />);
      expect(queryByTestId('download-indicator')).toBeNull();
    });

    it('shows download indicator when downloading', () => {
      mockIsDownloading = true;
      mockDownloadProgress = 0.42;
      const { getByTestId } = render(<Header />);
      expect(getByTestId('download-indicator')).toBeTruthy();
    });

    it('shows correct percentage when downloading', () => {
      mockIsDownloading = true;
      mockDownloadProgress = 0.75;
      const { getByText } = render(<Header />);
      expect(getByText('75%')).toBeTruthy();
    });

    it('shows sync-outline icon and "verifying_update" text when phase is verifying', () => {
      mockIsDownloading = true;
      mockDownloadProgress = 0;
      mockDownloadPhase = 'verifying';
      const { getByTestId, getByText, queryByText } = render(<Header />);

      expect(getByTestId('icon-sync-outline')).toBeTruthy();
      expect(getByText('verifying_update')).toBeTruthy();
      expect(queryByText('%')).toBeNull();
    });

    it('shows arrow-down-outline icon and percentage when phase is downloading', () => {
      mockIsDownloading = true;
      mockDownloadProgress = 0.6;
      mockDownloadPhase = 'downloading';
      const { getByTestId, getByText, queryByTestId } = render(<Header />);

      expect(getByTestId('icon-arrow-down-outline')).toBeTruthy();
      expect(getByText('60%')).toBeTruthy();
      expect(queryByTestId('icon-sync-outline')).toBeNull();
    });
  });

});
