import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SearchOverlay from '../../app/components/search/SearchOverlay';
import { useOperationsData } from '../../app/contexts/OperationsDataContext';
import { useOperationsActions } from '../../app/contexts/OperationsActionsContext';
import { useAccountsData } from '../../app/contexts/AccountsDataContext';
import { useSearch } from '../../app/contexts/SearchContext';

jest.mock('../../app/contexts/OperationsDataContext');
jest.mock('../../app/contexts/OperationsActionsContext');
jest.mock('../../app/contexts/AccountsDataContext');
jest.mock('../../app/contexts/SearchContext');

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: jest.fn((date) => date.toISOString().split('T')[0]),
}));

describe('Search Integration', () => {
  const mockColors = {
    surface: '#fff',
    background: '#f5f5f5',
    text: '#000',
    mutedText: '#999',
    border: '#ddd',
    primary: '#007AFF',
    inputBackground: '#f5f5f5',
    inputBorder: '#ddd',
  };

  const mockT = (key) => key;
  let mockUpdateSearchFilters;

  const defaultSearchState = {
    text: '',
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSearchFilters = jest.fn();

    useOperationsData.mockReturnValue({
      searchState: defaultSearchState,
      hasActiveSearch: false,
      getSearchFilterCount: jest.fn(() => 0),
    });

    useOperationsActions.mockReturnValue({
      setSearchText: jest.fn(),
      updateSearchFilters: mockUpdateSearchFilters,
    });

    useAccountsData.mockReturnValue({
      visibleAccounts: [
        { id: 'acc-1', name: 'Checking' },
        { id: 'acc-2', name: 'Savings' },
      ],
    });

    useSearch.mockReturnValue({
      filtersExpanded: false,
      toggleFilters: jest.fn(),
    });
  });

  describe('SearchOverlay Visibility', () => {
    it('does not render when visible is false', () => {
      const { queryByTestId } = render(
        <SearchOverlay visible={false} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      expect(queryByTestId('expandable-filters')).toBeNull();
    });

    it('does not render filters when filtersExpanded is false', () => {
      const { queryByTestId } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      expect(queryByTestId('expandable-filters')).toBeNull();
    });

    it('renders filters when filtersExpanded is true', () => {
      useSearch.mockReturnValue({ filtersExpanded: true, toggleFilters: jest.fn() });
      const { queryByTestId } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      expect(queryByTestId('expandable-filters')).toBeTruthy();
    });
  });

  describe('Filter Sections', () => {
    beforeEach(() => {
      useSearch.mockReturnValue({ filtersExpanded: true, toggleFilters: jest.fn() });
    });

    it('renders all filter sections when expanded', () => {
      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      expect(getByText('operation_type')).toBeTruthy();
      expect(getByText('date_range')).toBeTruthy();
      expect(getByText('amount_range')).toBeTruthy();
      expect(getByText('accounts')).toBeTruthy();
    });

    it('renders type filter chips', () => {
      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      expect(getByText('expense')).toBeTruthy();
      expect(getByText('income')).toBeTruthy();
      expect(getByText('transfer')).toBeTruthy();
    });

    it('renders account chips for each visible account', () => {
      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      expect(getByText('Checking')).toBeTruthy();
      expect(getByText('Savings')).toBeTruthy();
    });
  });

  describe('Filter Interactions', () => {
    beforeEach(() => {
      useSearch.mockReturnValue({ filtersExpanded: true, toggleFilters: jest.fn() });
    });

    it('selects a type filter when chip is pressed', () => {
      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      fireEvent.press(getByText('expense'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({ types: ['expense'] });
    });

    it('allows multiple type filters to be selected', () => {
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, types: ['expense'] },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 1),
      });

      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      fireEvent.press(getByText('income'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({ types: ['expense', 'income'] });
    });

    it('deselects a type filter when selected chip is pressed again', () => {
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, types: ['expense'] },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 1),
      });

      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      fireEvent.press(getByText('expense'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({ types: [] });
    });

    it('toggles account filter on', () => {
      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      fireEvent.press(getByText('Checking'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({ accountIds: ['acc-1'] });
    });

    it('toggles account filter off when already selected', () => {
      useOperationsData.mockReturnValue({
        searchState: { ...defaultSearchState, accountIds: ['acc-1'] },
        hasActiveSearch: true,
        getSearchFilterCount: jest.fn(() => 1),
      });

      const { getByText } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      fireEvent.press(getByText('Checking'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({ accountIds: [] });
    });

    it('clear all button resets all filters via updateSearchFilters', () => {
      const { getByTestId } = render(
        <SearchOverlay visible={true} onClose={jest.fn()} colors={mockColors} t={mockT} />,
      );
      fireEvent.press(getByTestId('clear-all-button'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({
        types: [],
        accountIds: [],
        categoryIds: [],
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      });
    });
  });
});
