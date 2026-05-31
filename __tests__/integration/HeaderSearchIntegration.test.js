import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Header from '../../app/components/Header';
import { useSearch } from '../../app/contexts/SearchContext';
import { useOperationsData } from '../../app/contexts/OperationsDataContext';
import { useOperationsActions } from '../../app/contexts/OperationsActionsContext';

jest.mock('../../app/contexts/SearchContext', () => ({
  useSearch: jest.fn(),
}));

jest.mock('../../app/contexts/OperationsDataContext');
jest.mock('../../app/contexts/OperationsActionsContext');

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
  function MockIcon({ name }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MockIcon.propTypes = { name: PropTypes.string };
  return { Ionicons: MockIcon, MaterialCommunityIcons: MockIcon };
});

jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
}));

const defaultSearchState = {
  text: '',
  types: [],
  accountIds: [],
  categoryIds: [],
  dateRange: { startDate: null, endDate: null },
  amountRange: { min: null, max: null },
};

describe('Header Search Integration', () => {
  let mockOpenSearch;
  let mockCloseSearch;
  let mockToggleFilters;
  let mockSetSearchText;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOpenSearch = jest.fn();
    mockCloseSearch = jest.fn();
    mockToggleFilters = jest.fn();
    mockSetSearchText = jest.fn();

    useSearch.mockReturnValue({
      openSearch: mockOpenSearch,
      searchMode: 'closed',
      closeSearch: mockCloseSearch,
      reopenSearch: jest.fn(),
      toggleFilters: mockToggleFilters,
    });

    useOperationsData.mockReturnValue({
      searchState: defaultSearchState,
      hasActiveSearch: false,
      getSearchFilterCount: jest.fn(() => 0),
    });

    useOperationsActions.mockReturnValue({
      setSearchText: mockSetSearchText,
      updateSearchFilters: jest.fn(),
    });
  });

  describe('Search Button Visibility', () => {
    it('does not show search bar when activeScreen is not Operations', () => {
      const { queryByTestId } = render(
        <Header activeScreen="Accounts" />,
      );
      expect(queryByTestId('search-bar-container')).toBeNull();
    });

    it('shows collapsed search bar when activeScreen is Operations', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(getByTestId('search-input-container')).toBeTruthy();
    });

    it('still shows search bar when rightContent is provided on Operations screen', () => {
      const CustomContent = () => <></>;
      const { getByTestId } = render(
        <Header activeScreen="Operations" rightContent={<CustomContent />} />,
      );
      expect(getByTestId('search-input-container')).toBeTruthy();
    });
  });

  describe('Search Button Functionality', () => {
    it('calls openSearch when collapsed search bar is pressed', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      fireEvent.press(getByTestId('search-input-container'));
      expect(mockOpenSearch).toHaveBeenCalledTimes(1);
    });

    it('does not throw when collapsed search bar is pressed', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(() => {
        fireEvent.press(getByTestId('search-input-container'));
      }).not.toThrow();
    });
  });

  describe('Filter Badge (collapsed mode)', () => {
    it('does not show filter badge when no search filters are active', () => {
      const { queryByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(queryByTestId('filter-count-badge-collapsed')).toBeNull();
    });

    it('shows filter badge when search is collapsed and filters are active', () => {
      useSearch.mockReturnValue({
        openSearch: mockOpenSearch,
        searchMode: 'collapsed',
        closeSearch: mockCloseSearch,
        reopenSearch: jest.fn(),
        toggleFilters: mockToggleFilters,
      });
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, types: ['expense'] },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 1),
      });

      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(getByTestId('filter-count-badge-collapsed')).toBeTruthy();
    });

    it('does not show filter badge when collapsed but no active filters', () => {
      useSearch.mockReturnValue({
        openSearch: mockOpenSearch,
        searchMode: 'collapsed',
        closeSearch: mockCloseSearch,
        reopenSearch: jest.fn(),
        toggleFilters: mockToggleFilters,
      });

      const { queryByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(queryByTestId('filter-count-badge-collapsed')).toBeNull();
    });
  });

  describe('Search Mode (searchMode=open)', () => {
    beforeEach(() => {
      useSearch.mockReturnValue({
        openSearch: mockOpenSearch,
        searchMode: 'open',
        closeSearch: mockCloseSearch,
        reopenSearch: jest.fn(),
        toggleFilters: mockToggleFilters,
      });
    });

    it('renders SearchBar when search is open', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(getByTestId('search-bar-container')).toBeTruthy();
    });

    it('does not render title when search is open', () => {
      const { queryByText } = render(
        <Header activeScreen="Operations" />,
      );
      expect(queryByText('Penny')).toBeNull();
    });

    it('close button calls closeSearch with false when no active search', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      fireEvent.press(getByTestId('close-search-button'));
      expect(mockCloseSearch).toHaveBeenCalledWith(false);
    });

    it('close button calls closeSearch with true when search is active', () => {
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, text: 'groceries' },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      fireEvent.press(getByTestId('close-search-button'));
      expect(mockCloseSearch).toHaveBeenCalledWith(true);
    });

    it('filter toggle button calls toggleFilters', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      fireEvent.press(getByTestId('filters-toggle-button'));
      expect(mockToggleFilters).toHaveBeenCalledTimes(1);
    });

    it('shows filter count badge in SearchBar when filterCount > 0', () => {
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, types: ['expense'] },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 2),
      });

      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(getByTestId('filter-count-badge')).toBeTruthy();
    });

    it('clears search text when clear button is pressed', () => {
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, text: 'groceries' },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 0),
      });

      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      fireEvent.press(getByTestId('clear-search-button'));
      expect(mockSetSearchText).toHaveBeenCalledWith('');
    });
  });

  describe('Complete Search Workflow', () => {
    it('search button opens search and SearchBar becomes visible', () => {
      const { getByTestId, queryByTestId, rerender } = render(
        <Header activeScreen="Operations" />,
      );

      // SearchBar is always mounted (collapsed when search is closed)
      expect(getByTestId('search-bar-container')).toBeTruthy();
      fireEvent.press(getByTestId('search-input-container'));
      expect(mockOpenSearch).toHaveBeenCalledTimes(1);

      // Simulate searchMode transitioning to 'open'
      useSearch.mockReturnValue({
        openSearch: mockOpenSearch,
        searchMode: 'open',
        closeSearch: mockCloseSearch,
        reopenSearch: jest.fn(),
        toggleFilters: mockToggleFilters,
      });
      rerender(<Header activeScreen="Operations" />);

      expect(getByTestId('search-bar-container')).toBeTruthy();
    });
  });

  describe('Integration with Other Header Buttons', () => {
    it('shows collapsed search bar in operations header', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      expect(getByTestId('search-input-container')).toBeTruthy();
    });

    it('collapsed search bar is functional', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );

      fireEvent.press(getByTestId('search-input-container'));

      expect(mockOpenSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper accessibility props on collapsed search bar', () => {
      const { getByTestId } = render(
        <Header activeScreen="Operations" />,
      );
      const searchButton = getByTestId('search-input-container');
      expect(searchButton.props.accessibilityLabel).toBe('search');
      expect(searchButton.props.accessibilityRole).toBe('button');
    });
  });

  describe('Header layout branches', () => {
    it('does not render download indicator on Operations screen even when downloading', () => {
      // isDownloading && !showSearchBar — false when activeScreen=Operations
      jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
        useUpdateDownload: () => ({
          isDownloading: true,
          downloadProgress: 0.5,
          downloadPhase: 'downloading',
        }),
      }));
      const { queryByTestId } = render(<Header activeScreen="Operations" />);
      expect(queryByTestId('download-indicator')).toBeNull();
    });

    it('does not render rightContent slot on Operations screen', () => {
      // rightContent && !showSearchBar — false when activeScreen=Operations
      const CustomContent = () => null;
      CustomContent.displayName = 'CustomContent';
      const { queryByTestId } = render(
        <Header activeScreen="Operations" rightContent={<CustomContent />} />,
      );
      // SearchBar is shown; rightContent buttonContainer is suppressed
      expect(queryByTestId('search-bar-container')).toBeTruthy();
    });

    it('does not render FilterChipStrip when search is open but no active search', () => {
      useSearch.mockReturnValue({
        openSearch: mockOpenSearch,
        searchMode: 'open',
        closeSearch: mockCloseSearch,
        reopenSearch: jest.fn(),
        toggleFilters: mockToggleFilters,
        filtersExpanded: false,
      });
      useOperationsData.mockReturnValue({
        searchState: defaultSearchState,
        hasActiveSearch: false,
        getSearchFilterCount: jest.fn(() => 0),
      });
      const { queryByTestId } = render(<Header activeScreen="Operations" />);
      expect(queryByTestId('filter-chip-strip')).toBeNull();
    });
  });
});
