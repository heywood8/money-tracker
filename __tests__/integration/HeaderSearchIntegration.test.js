import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Header from '../../app/components/Header';
import { useSearch } from '../../app/contexts/SearchContext';

// Mock contexts
let mockOpenSearch = jest.fn();
jest.mock('../../app/contexts/SearchContext', () => ({
  useSearch: jest.fn(),
}));

jest.mock('../../app/contexts/ThemeConfigContext', () => ({
  useThemeConfig: () => ({
    colorScheme: 'light',
    setTheme: jest.fn(),
  }),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#FFFFFF',
      surface: '#F5F5F5',
      border: '#E0E0E0',
      text: '#000000',
      mutedText: '#999999',
      primary: '#007AFF',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
  }),
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({
    isDownloading: false,
    downloadProgress: null,
  }),
}));

jest.mock('../../app/services/db', () => ({
  getDatabaseVersion: jest.fn(() => Promise.resolve(1)),
}));

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: {
    on: jest.fn(),
    off: jest.fn(),
  },
}));

jest.mock('../../app/services/BackupRestore', () => ({
  IMPORT_PROGRESS_EVENT: 'import_progress',
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIonicons({ name }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MockIonicons.propTypes = { name: PropTypes.string };
  return { Ionicons: MockIonicons };
});

jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
}));

describe('Header Search Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenSearch = jest.fn();
    useSearch.mockReturnValue({
      openSearch: mockOpenSearch,
      registerSearchHandler: jest.fn(),
    });
  });

  describe('Search Button Visibility', () => {
    it('does not show search button when activeScreen is not Operations', () => {
      const { queryByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Accounts" operationsData={null} />,
      );

      expect(queryByTestId('search-button')).toBeNull();
    });

    it('shows search button when activeScreen is Operations', () => {
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { getByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      expect(getByTestId('search-button')).toBeTruthy();
    });

    it('does not show search button when rightContent is provided', () => {
      const CustomContent = () => <></>;
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { queryByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" rightContent={<CustomContent />} operationsData={mockOperationsData} />,
      );

      expect(queryByTestId('search-button')).toBeNull();
    });
  });

  describe('Search Button Functionality', () => {
    it('calls openSearch when button is pressed', () => {
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { getByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      const searchButton = getByTestId('search-button');
      fireEvent.press(searchButton);

      expect(mockOpenSearch).toHaveBeenCalledTimes(1);
    });

    it('does not throw when search button is pressed', () => {
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { getByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      const searchButton = getByTestId('search-button');

      expect(() => {
        fireEvent.press(searchButton);
      }).not.toThrow();
    });
  });

  describe('Filter Badge', () => {
    it('does not show filter badge when no search filters are active', () => {
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { queryByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      expect(queryByTestId('filter-badge')).toBeNull();
    });

    it('shows filter badge with count when filters are active', () => {
      const mockOperationsData = {
        hasActiveSearch: true,
        getSearchFilterCount: () => 3,
      };

      const { getByTestId, getByText } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      expect(getByTestId('filter-badge')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
    });
  });

  describe('Integration with Other Header Buttons', () => {
    it('shows search button alongside theme toggle and settings buttons', () => {
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { getByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      expect(getByTestId('search-button')).toBeTruthy();
      expect(getByTestId('theme-toggle-button')).toBeTruthy();
      expect(getByTestId('settings-button')).toBeTruthy();
    });

    it('all buttons remain functional when search button is present', () => {
      const mockOpenSettings = jest.fn();
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { getByTestId } = render(
        <Header onOpenSettings={mockOpenSettings} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      // Press each button
      fireEvent.press(getByTestId('search-button'));
      fireEvent.press(getByTestId('theme-toggle-button'));
      fireEvent.press(getByTestId('settings-button'));

      expect(mockOpenSearch).toHaveBeenCalledTimes(1);
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
      // Theme toggle doesn't have a mock, but it should not throw
    });
  });

  describe('Accessibility', () => {
    it('has proper accessibility props on search button', () => {
      const mockOperationsData = {
        hasActiveSearch: false,
        getSearchFilterCount: () => 0,
      };

      const { getByTestId } = render(
        <Header onOpenSettings={() => {}} activeScreen="Operations" operationsData={mockOperationsData} />,
      );

      const searchButton = getByTestId('search-button');

      expect(searchButton.props.accessibilityLabel).toBe('Search operations');
      expect(searchButton.props.accessibilityRole).toBe('button');
    });
  });
});
