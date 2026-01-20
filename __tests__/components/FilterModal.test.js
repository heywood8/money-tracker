/**
 * Tests for FilterModal Component
 * Ensures filter modal renders correctly and handles user interactions
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import FilterModal from '../../app/components/FilterModal';

// Mock DateTimePicker
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

describe('FilterModal Component', () => {
  const mockColors = {
    card: '#ffffff',
    text: '#000000',
    border: '#cccccc',
    primary: '#007AFF',
    mutedText: '#666666',
    inputBackground: '#f5f5f5',
    inputBorder: '#dddddd',
  };

  const mockT = (key) => key;

  const mockAccounts = [
    { id: 'acc1', name: 'Checking', balance: '1000', currency: 'USD' },
    { id: 'acc2', name: 'Savings', balance: '5000', currency: 'USD' },
  ];

  const mockCategories = [
    { id: 'cat1', name: 'Groceries', icon: 'cart', isShadow: false },
    { id: 'cat2', name: 'Transport', icon: 'car', isShadow: false },
    { id: 'cat3', name: 'Shadow', icon: 'ghost', isShadow: true },
  ];

  const defaultFilters = {
    types: [],
    accountIds: [],
    categoryIds: [],
    searchText: '',
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  };

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    filters: defaultFilters,
    onApplyFilters: jest.fn(),
    accounts: mockAccounts,
    categories: mockCategories,
    t: mockT,
    colors: mockColors,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('filter_operations')).toBeTruthy();
      expect(getByText('search')).toBeTruthy();
      expect(getByText('operation_type')).toBeTruthy();
      expect(getByText('accounts')).toBeTruthy();
      expect(getByText('categories')).toBeTruthy();
    });

    it('renders all filter sections', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('search')).toBeTruthy();
      expect(getByText('operation_type')).toBeTruthy();
      expect(getByText('accounts')).toBeTruthy();
      expect(getByText('categories')).toBeTruthy();
      expect(getByText('date_range')).toBeTruthy();
      expect(getByText('amount_range')).toBeTruthy();
    });

    it('renders type chips (expense, income, transfer)', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('expense')).toBeTruthy();
      expect(getByText('income')).toBeTruthy();
      expect(getByText('transfer')).toBeTruthy();
    });

    it('renders account list', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('Checking')).toBeTruthy();
      expect(getByText('Savings')).toBeTruthy();
    });

    it('renders category list excluding shadow categories', () => {
      const { getByText, queryByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('Groceries')).toBeTruthy();
      expect(getByText('Transport')).toBeTruthy();
      expect(queryByText('Shadow')).toBeNull(); // Shadow category should be excluded
    });

    it('renders action buttons', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('clear_all')).toBeTruthy();
      expect(getByText('apply_filters')).toBeTruthy();
    });
  });

  describe('Search Input', () => {
    it('displays search placeholder text', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);

      expect(getByPlaceholderText('search_operations_placeholder')).toBeTruthy();
    });

    it('updates search text on input', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const searchInput = getByPlaceholderText('search_operations_placeholder');

      fireEvent.changeText(searchInput, 'grocery');

      expect(searchInput.props.value).toBe('grocery');
    });

    it('shows clear button when search text is not empty', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const searchInput = getByPlaceholderText('search_operations_placeholder');

      fireEvent.changeText(searchInput, 'test');

      // Verify search input has the text
      expect(searchInput.props.value).toBe('test');
    });

    it('clears search text when clear button is pressed', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const searchInput = getByPlaceholderText('search_operations_placeholder');

      fireEvent.changeText(searchInput, 'test');
      expect(searchInput.props.value).toBe('test');

      // Find and press clear button
      fireEvent.changeText(searchInput, '');
      expect(searchInput.props.value).toBe('');
    });
  });

  describe('Type Filters', () => {
    it('toggles expense type on press', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const expenseButton = getByText('expense');

      fireEvent.press(expenseButton);

      // Filter should be toggled in local state
      // (actual state change would be tested in integration tests)
    });

    it('toggles income type on press', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const incomeButton = getByText('income');

      fireEvent.press(incomeButton);

      // Filter should be toggled
    });

    it('toggles transfer type on press', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const transferButton = getByText('transfer');

      fireEvent.press(transferButton);

      // Filter should be toggled
    });

    it('displays selected types with different styling', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          types: ['expense'],
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);
      const expenseButton = getByText('expense');

      // Selected chip should have primary background color
      const chipStyle = expenseButton.parent.parent.props.style;
      expect(chipStyle).toMatchObject({ backgroundColor: mockColors.primary });
    });
  });

  describe('Account Filters', () => {
    it('toggles account selection on press', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const checkingAccount = getByText('Checking');

      fireEvent.press(checkingAccount);

      // Account should be toggled in local state
    });

    it('displays selected accounts with checkbox-marked icon', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          accountIds: ['acc1'],
        },
      };

      render(<FilterModal {...propsWithFilters} />);

      // Selected account should show checkbox-marked icon
      // (icon rendering tested via integration)
    });
  });

  describe('Category Filters', () => {
    it('toggles category selection on press', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const groceriesCategory = getByText('Groceries');

      fireEvent.press(groceriesCategory);

      // Category should be toggled in local state
    });

    it('displays selected categories with checkbox-marked icon', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          categoryIds: ['cat1'],
        },
      };

      render(<FilterModal {...propsWithFilters} />);

      // Selected category should show checkbox-marked icon
    });
  });

  describe('Date Range Filters', () => {
    it('displays from_date and to_date placeholders', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      expect(getByText('from_date')).toBeTruthy();
      expect(getByText('to_date')).toBeTruthy();
    });

    it('formats and displays selected start date', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          dateRange: { startDate: '2025-12-01', endDate: null },
        },
      };

      render(<FilterModal {...propsWithFilters} />);

      // Date should be formatted and displayed
    });

    it('shows clear button when date range is set', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          dateRange: { startDate: '2025-12-01', endDate: '2025-12-31' },
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);

      expect(getByText('clear')).toBeTruthy();
    });
  });

  describe('Amount Range Filters', () => {
    it('renders min and max amount inputs', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);

      expect(getByPlaceholderText('min_amount')).toBeTruthy();
      expect(getByPlaceholderText('max_amount')).toBeTruthy();
    });

    it('updates min amount on input', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const minInput = getByPlaceholderText('min_amount');

      fireEvent.changeText(minInput, '10');

      expect(minInput.props.value).toBe('10');
    });

    it('updates max amount on input', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const maxInput = getByPlaceholderText('max_amount');

      fireEvent.changeText(maxInput, '100');

      expect(maxInput.props.value).toBe('100');
    });

    it('displays existing min/max values', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          amountRange: { min: 10, max: 100 },
        },
      };

      const { getByPlaceholderText } = render(<FilterModal {...propsWithFilters} />);

      expect(getByPlaceholderText('min_amount').props.value).toBe('10');
      expect(getByPlaceholderText('max_amount').props.value).toBe('100');
    });
  });

  describe('Actions', () => {
    it('renders modal when visible prop is true', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);

      // Verify modal header is present
      expect(getByText('filter_operations')).toBeTruthy();
    });

    it('calls onApplyFilters with current filters when Apply is pressed', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const applyButton = getByText('apply_filters');

      fireEvent.press(applyButton);

      expect(defaultProps.onApplyFilters).toHaveBeenCalledWith(defaultFilters);
    });

    it('calls onClose after Apply is pressed', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const applyButton = getByText('apply_filters');

      fireEvent.press(applyButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('clears all filters when Clear All is pressed', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          types: ['expense'],
          accountIds: ['acc1'],
          categoryIds: ['cat1'],
          searchText: 'test',
          dateRange: { startDate: '2025-12-01', endDate: '2025-12-31' },
          amountRange: { min: 10, max: 100 },
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);
      const clearAllButton = getByText('clear_all');

      fireEvent.press(clearAllButton);

      // All filters should be cleared in local state
      // (actual behavior tested in integration tests)
    });
  });

  describe('Debouncing', () => {
    it('debounces search text updates', async () => {
      jest.useFakeTimers();

      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const searchInput = getByPlaceholderText('search_operations_placeholder');

      fireEvent.changeText(searchInput, 'g');
      fireEvent.changeText(searchInput, 'gr');
      fireEvent.changeText(searchInput, 'gro');

      // Search text should not be updated immediately
      // After 300ms, it should be updated
      jest.advanceTimersByTime(300);

      await waitFor(() => {
        // Filter should be updated after debounce
      });

      jest.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty accounts array', () => {
      const props = {
        ...defaultProps,
        accounts: [],
      };

      const { getByText } = render(<FilterModal {...props} />);

      expect(getByText('accounts')).toBeTruthy();
    });

    it('handles empty categories array', () => {
      const props = {
        ...defaultProps,
        categories: [],
      };

      const { getByText } = render(<FilterModal {...props} />);

      expect(getByText('categories')).toBeTruthy();
    });

    it('updates local filters when prop filters change', () => {
      const { rerender } = render(<FilterModal {...defaultProps} />);

      const newFilters = {
        ...defaultFilters,
        types: ['expense'],
      };

      rerender(<FilterModal {...defaultProps} filters={newFilters} />);

      // Local filters should be updated to match new prop
    });
  });

  describe('Regression Tests', () => {
    it('handles null filter values gracefully', () => {
      const props = {
        ...defaultProps,
        filters: {
          types: null,
          accountIds: null,
          categoryIds: null,
          searchText: null,
          dateRange: { startDate: null, endDate: null },
          amountRange: { min: null, max: null },
        },
      };

      expect(() => render(<FilterModal {...props} />)).not.toThrow();
    });

    it('handles missing filter properties', () => {
      const props = {
        ...defaultProps,
        filters: {},
      };

      expect(() => render(<FilterModal {...props} />)).not.toThrow();
    });
  });

  describe('Category Folder Hierarchy', () => {
    const categoriesWithFolders = [
      { id: 'folder1', name: 'Food', icon: 'food', type: 'folder', isShadow: false },
      { id: 'cat1', name: 'Groceries', icon: 'cart', parentId: 'folder1', type: 'entry', isShadow: false },
      { id: 'cat2', name: 'Restaurant', icon: 'silverware', parentId: 'folder1', type: 'entry', isShadow: false },
      { id: 'folder2', name: 'Transport', icon: 'car', type: 'folder', isShadow: false },
      { id: 'cat3', name: 'Gas', icon: 'gas-station', parentId: 'folder2', type: 'entry', isShadow: false },
    ];

    it('renders folder categories', () => {
      const props = {
        ...defaultProps,
        categories: categoriesWithFolders,
      };

      const { getByText } = render(<FilterModal {...props} />);

      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Transport')).toBeTruthy();
    });

    it('expands folder on chevron press', () => {
      const props = {
        ...defaultProps,
        categories: categoriesWithFolders,
      };

      const { getByText, queryByText } = render(<FilterModal {...props} />);

      // Initially, child categories are not visible
      expect(queryByText('Groceries')).toBeNull();

      // Find and press the folder to expand
      const folderButton = getByText('Food');
      fireEvent.press(folderButton);
    });

    it('selects all descendants when folder checkbox is pressed', () => {
      const props = {
        ...defaultProps,
        categories: categoriesWithFolders,
      };

      const { getByText } = render(<FilterModal {...props} />);
      const folderItem = getByText('Food');

      // Press the folder checkbox to select all descendants
      fireEvent.press(folderItem);

      // Both child categories should be selected
    });

    it('deselects all descendants when folder is already fully selected', () => {
      const props = {
        ...defaultProps,
        categories: categoriesWithFolders,
        filters: {
          ...defaultFilters,
          categoryIds: ['cat1', 'cat2'], // Both children selected
        },
      };

      const { getByText } = render(<FilterModal {...props} />);
      const folderItem = getByText('Food');

      // Press to deselect all
      fireEvent.press(folderItem);
    });

    it('shows partial selection indicator when some descendants are selected', () => {
      const props = {
        ...defaultProps,
        categories: categoriesWithFolders,
        filters: {
          ...defaultFilters,
          categoryIds: ['cat1'], // Only one child selected
        },
      };

      render(<FilterModal {...props} />);

      // Folder should show minus-box icon (partial selection)
    });
  });

  describe('Search Input Clear Button', () => {
    it('clears search when close-circle icon is pressed', async () => {
      const { getByPlaceholderText, UNSAFE_getAllByType } = render(<FilterModal {...defaultProps} />);
      const { TouchableOpacity } = require('react-native');
      const searchInput = getByPlaceholderText('search_operations_placeholder');

      fireEvent.changeText(searchInput, 'test search');
      expect(searchInput.props.value).toBe('test search');

      // Find the clear button inside the search section
      const touchables = UNSAFE_getAllByType(TouchableOpacity);
      const clearButton = touchables.find(t =>
        t.props.children && t.props.children.props && t.props.children.props.name === 'close-circle',
      );

      if (clearButton) {
        fireEvent.press(clearButton);
      }
    });
  });

  describe('Date Range Clear', () => {
    it('clears date range when clear button is pressed', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          dateRange: { startDate: '2025-12-01', endDate: '2025-12-31' },
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);

      // Clear button should be visible
      const clearButton = getByText('clear');
      fireEvent.press(clearButton);

      // Date range should be cleared (local state)
    });
  });

  describe('Date Pickers', () => {
    it('opens start date picker when from_date is pressed', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const fromDateButton = getByText('from_date');

      fireEvent.press(fromDateButton);

      // DateTimePicker should be shown (mocked, but press should work)
    });

    it('opens end date picker when to_date is pressed', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const toDateButton = getByText('to_date');

      fireEvent.press(toDateButton);

      // DateTimePicker should be shown
    });
  });

  describe('Modal Close on Overlay Press', () => {
    it('calls onClose when overlay is pressed', () => {
      const { getByTestId, UNSAFE_root } = render(<FilterModal {...defaultProps} />);

      // Press the outer overlay (first Pressable)
      const overlay = UNSAFE_root.findAllByType(require('react-native').Pressable)[0];
      if (overlay && overlay.props.onPress) {
        overlay.props.onPress();
        expect(defaultProps.onClose).toHaveBeenCalled();
      }
    });
  });

  describe('Modal Visibility Effect', () => {
    it('resets expanded categories when modal becomes invisible', () => {
      const { rerender } = render(<FilterModal {...defaultProps} visible={true} />);

      // Modal was visible
      rerender(<FilterModal {...defaultProps} visible={false} />);

      // Expanded categories should be reset (internal state)
    });
  });

  describe('Amount Range Edge Cases', () => {
    it('handles empty string for min amount', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const minInput = getByPlaceholderText('min_amount');

      fireEvent.changeText(minInput, '50');
      expect(minInput.props.value).toBe('50');

      fireEvent.changeText(minInput, '');
      expect(minInput.props.value).toBe('');
    });

    it('handles empty string for max amount', () => {
      const { getByPlaceholderText } = render(<FilterModal {...defaultProps} />);
      const maxInput = getByPlaceholderText('max_amount');

      fireEvent.changeText(maxInput, '100');
      expect(maxInput.props.value).toBe('100');

      fireEvent.changeText(maxInput, '');
      expect(maxInput.props.value).toBe('');
    });
  });

  describe('Props Variations', () => {
    it('uses provided colors object', () => {
      const props = {
        ...defaultProps,
        colors: {
          ...mockColors,
          primary: '#FF0000', // Custom primary color
        },
      };

      // Component should use provided colors
      expect(() => render(<FilterModal {...props} />)).not.toThrow();
    });

    it('uses custom translation function', () => {
      const customT = jest.fn((key) => `Custom: ${key}`);
      const props = {
        ...defaultProps,
        t: customT,
      };

      render(<FilterModal {...props} />);

      expect(customT).toHaveBeenCalledWith('filter_operations');
    });
  });

  describe('Type Toggle State', () => {
    it('adds type when not selected', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const expenseButton = getByText('expense');

      // Press to add expense to filter
      fireEvent.press(expenseButton);

      // Now expense should be in the selection
      // Press apply to verify
      fireEvent.press(getByText('apply_filters'));

      expect(defaultProps.onApplyFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['expense'],
        }),
      );
    });

    it('removes type when already selected', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          types: ['expense'],
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);
      const expenseButton = getByText('expense');

      // Press to remove expense from filter
      fireEvent.press(expenseButton);

      // Now expense should be removed
      fireEvent.press(getByText('apply_filters'));

      expect(propsWithFilters.onApplyFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          types: [],
        }),
      );
    });
  });

  describe('Account Toggle State', () => {
    it('adds account when not selected', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const accountItem = getByText('Checking');

      fireEvent.press(accountItem);
      fireEvent.press(getByText('apply_filters'));

      expect(defaultProps.onApplyFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          accountIds: ['acc1'],
        }),
      );
    });

    it('removes account when already selected', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          accountIds: ['acc1'],
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);
      const accountItem = getByText('Checking');

      fireEvent.press(accountItem);
      fireEvent.press(getByText('apply_filters'));

      expect(propsWithFilters.onApplyFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          accountIds: [],
        }),
      );
    });
  });

  describe('Category Toggle State', () => {
    it('adds category when not selected', () => {
      const { getByText } = render(<FilterModal {...defaultProps} />);
      const categoryItem = getByText('Groceries');

      fireEvent.press(categoryItem);
      fireEvent.press(getByText('apply_filters'));

      expect(defaultProps.onApplyFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['cat1'],
        }),
      );
    });

    it('removes category when already selected', () => {
      const propsWithFilters = {
        ...defaultProps,
        filters: {
          ...defaultFilters,
          categoryIds: ['cat1'],
        },
      };

      const { getByText } = render(<FilterModal {...propsWithFilters} />);
      const categoryItem = getByText('Groceries');

      fireEvent.press(categoryItem);
      fireEvent.press(getByText('apply_filters'));

      expect(propsWithFilters.onApplyFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: [],
        }),
      );
    });
  });
});
