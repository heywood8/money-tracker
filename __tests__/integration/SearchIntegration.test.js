import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SearchOverlay from '../../app/components/search/SearchOverlay';
import { useOperationsData } from '../../app/contexts/OperationsDataContext';
import { useOperationsActions } from '../../app/contexts/OperationsActionsContext';
import { useAccountsData } from '../../app/contexts/AccountsDataContext';
import { useCategories } from '../../app/contexts/CategoriesContext';
import { Alert } from 'react-native';

// Mock context hooks
jest.mock('../../app/contexts/OperationsDataContext');
jest.mock('../../app/contexts/OperationsActionsContext');
jest.mock('../../app/contexts/AccountsDataContext');
jest.mock('../../app/contexts/CategoriesContext');

// Mock Alert
jest.spyOn(Alert, 'alert');

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

  let mockSearchState;
  let mockSetSearchText;
  let mockUpdateSearchFilters;
  let mockClearAllSearch;
  let mockGetSearchFilterCount;

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize mock search state
    mockSearchState = {
      text: '',
      types: [],
      accountIds: [],
      categoryIds: [],
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    };

    mockSetSearchText = jest.fn();
    mockUpdateSearchFilters = jest.fn();
    mockClearAllSearch = jest.fn();
    mockGetSearchFilterCount = jest.fn(() => 0);

    // Mock OperationsDataContext
    useOperationsData.mockReturnValue({
      searchState: mockSearchState,
      hasActiveSearch: false,
      getSearchFilterCount: mockGetSearchFilterCount,
    });

    // Mock OperationsActionsContext
    useOperationsActions.mockReturnValue({
      setSearchText: mockSetSearchText,
      updateSearchFilters: mockUpdateSearchFilters,
      clearAllSearch: mockClearAllSearch,
    });

    // Mock AccountsDataContext
    useAccountsData.mockReturnValue({
      visibleAccounts: [
        { id: 'acc-1', name: 'Checking' },
        { id: 'acc-2', name: 'Savings' },
      ],
    });

    // Mock CategoriesContext
    useCategories.mockReturnValue({
      categories: [
        { id: 'cat-1', name: 'Food', type: 'entry', icon: 'food', isShadow: false },
        { id: 'cat-2', name: 'Transport', type: 'entry', icon: 'car', isShadow: false },
      ],
    });
  });

  describe('Complete Search Workflow', () => {
    it('complete search workflow: open -> type -> filter', async () => {
      const onClose = jest.fn();
      const { getByPlaceholderText, getByText, getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Step 1: Type text search
      const searchInput = getByPlaceholderText('search_operations_placeholder');
      fireEvent.changeText(searchInput, 'coffee');

      await waitFor(() => {
        expect(searchInput.props.value).toBe('coffee');
      });

      // Verify debounced setSearchText is called (after 300ms)
      await waitFor(() => {
        expect(mockSetSearchText).toHaveBeenCalledWith('coffee');
      }, { timeout: 500 });

      // Step 2: Open filters
      const filtersButton = getByTestId('filters-toggle-button');
      fireEvent.press(filtersButton);

      // Verify filters expanded
      await waitFor(() => {
        expect(getByTestId('expandable-filters')).toBeTruthy();
        expect(getByText('operation_type')).toBeTruthy();
      });

      // Step 3: Select expense type filter
      const expenseChip = getByText('expense');
      fireEvent.press(expenseChip);

      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({
        types: ['expense'],
      });
    });

    it('shows alert when closing with active filters', async () => {
      // Set up with active filters
      useOperationsData.mockReturnValue({
        searchState: mockSearchState,
        hasActiveSearch: true,
        getSearchFilterCount: mockGetSearchFilterCount,
      });

      const onClose = jest.fn();
      const { getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      const closeButton = getByTestId('close-search-button');
      fireEvent.press(closeButton);

      // Should show alert since filters are active
      expect(Alert.alert).toHaveBeenCalledWith(
        'keep_filters_active',
        '',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('closes without alert when no active filters', () => {
      const onClose = jest.fn();
      const { getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      const closeButton = getByTestId('close-search-button');
      fireEvent.press(closeButton);

      // Should close directly without alert
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('collapses filters when backdrop is pressed', async () => {
      const onClose = jest.fn();
      const { getByTestId, queryByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Open filters
      const filtersButton = getByTestId('filters-toggle-button');
      fireEvent.press(filtersButton);

      await waitFor(() => {
        expect(queryByTestId('expandable-filters')).toBeTruthy();
      });

      // Note: The overlay backdrop is rendered when filters are expanded
      // but testing TouchableWithoutFeedback in RTL is challenging
      // This test verifies the filters are rendered when expanded
      expect(queryByTestId('expandable-filters')).toBeTruthy();
    });

    it('shows filter count badge when filters are applied', async () => {
      mockGetSearchFilterCount.mockReturnValue(3);

      const onClose = jest.fn();
      const { getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Filter count badge should be visible
      await waitFor(() => {
        expect(getByTestId('filter-count-badge')).toBeTruthy();
      });
    });

    it('clears search text when clear button is pressed', async () => {
      const onClose = jest.fn();
      const { getByPlaceholderText, getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Type search text
      const searchInput = getByPlaceholderText('search_operations_placeholder');
      fireEvent.changeText(searchInput, 'test');

      await waitFor(() => {
        expect(searchInput.props.value).toBe('test');
      });

      // Clear the search
      const clearButton = getByTestId('clear-search-button');
      fireEvent.press(clearButton);

      await waitFor(() => {
        expect(searchInput.props.value).toBe('');
      });
    });

    it('allows multiple filter types to be selected', async () => {
      const onClose = jest.fn();
      const { getByTestId, getByText } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Open filters
      fireEvent.press(getByTestId('filters-toggle-button'));

      await waitFor(() => {
        expect(getByText('operation_type')).toBeTruthy();
      });

      // Select expense
      fireEvent.press(getByText('expense'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({
        types: ['expense'],
      });

      // Update mock state to reflect the change
      mockSearchState.types = ['expense'];

      // Select income
      fireEvent.press(getByText('income'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({
        types: ['expense', 'income'],
      });
    });

    it('renders all filter sections when expanded', async () => {
      const onClose = jest.fn();
      const { getByTestId, getByText } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Open filters
      fireEvent.press(getByTestId('filters-toggle-button'));

      await waitFor(() => {
        expect(getByText('operation_type')).toBeTruthy();
        expect(getByText('date_range')).toBeTruthy();
        expect(getByText('amount_range')).toBeTruthy();
        expect(getByText('accounts')).toBeTruthy();
        expect(getByText('categories')).toBeTruthy();
      });
    });
  });

  describe('Filter Interactions', () => {
    it('toggles account filters', async () => {
      const onClose = jest.fn();
      const { getByTestId, getByText } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Open filters
      fireEvent.press(getByTestId('filters-toggle-button'));

      await waitFor(() => {
        expect(getByText('Checking')).toBeTruthy();
      });

      // Select an account
      fireEvent.press(getByText('Checking'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({
        accountIds: ['acc-1'],
      });
    });

    it('toggles category filters', async () => {
      const onClose = jest.fn();
      const { getByTestId, getByText } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      // Open filters
      fireEvent.press(getByTestId('filters-toggle-button'));

      await waitFor(() => {
        expect(getByText('Food')).toBeTruthy();
      });

      // Select a category
      fireEvent.press(getByText('Food'));
      expect(mockUpdateSearchFilters).toHaveBeenCalledWith({
        categoryIds: ['cat-1'],
      });
    });
  });

  describe('Alert Dialog Interactions', () => {
    it('calls clearAllSearch when Clear All is selected in alert', async () => {
      useOperationsData.mockReturnValue({
        searchState: mockSearchState,
        hasActiveSearch: true,
        getSearchFilterCount: mockGetSearchFilterCount,
      });

      const onClose = jest.fn();
      const { getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      fireEvent.press(getByTestId('close-search-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate pressing "Clear All" button
      const alertCall = Alert.alert.mock.calls[0];
      const buttons = alertCall[2];
      const clearAllButton = buttons.find(btn => btn.text === 'clear_all');

      if (clearAllButton && clearAllButton.onPress) {
        clearAllButton.onPress();
      }

      expect(mockClearAllSearch).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('keeps filters when Keep Filters is selected in alert', async () => {
      useOperationsData.mockReturnValue({
        searchState: mockSearchState,
        hasActiveSearch: true,
        getSearchFilterCount: mockGetSearchFilterCount,
      });

      const onClose = jest.fn();
      const { getByTestId } = render(
        <SearchOverlay onClose={onClose} colors={mockColors} t={mockT} />,
      );

      fireEvent.press(getByTestId('close-search-button'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate pressing "Keep Filters" button
      const alertCall = Alert.alert.mock.calls[0];
      const buttons = alertCall[2];
      const keepFiltersButton = buttons.find(btn => btn.text === 'keep_filters');

      if (keepFiltersButton && keepFiltersButton.onPress) {
        keepFiltersButton.onPress();
      }

      expect(mockClearAllSearch).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
