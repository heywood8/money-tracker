import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExpandableFilters from '../../../app/components/search/ExpandableFilters';

describe('ExpandableFilters', () => {
  const mockColors = {
    surface: '#FFFFFF',
    text: '#000000',
    mutedText: '#999999',
    border: '#E0E0E0',
    primary: '#007AFF',
    inputBackground: '#F5F5F5',
    inputBorder: '#DDDDDD',
  };

  const mockT = (key) => key;

  const defaultFilters = {
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  };

  const mockAccounts = [
    { id: 'acc-1', name: 'Checking Account' },
    { id: 'acc-2', name: 'Savings Account' },
  ];

  const mockCategories = [
    { id: 'cat-1', name: 'Food', type: 'entry', icon: 'food' },
    { id: 'cat-2', name: 'Transport', type: 'entry', icon: 'car' },
  ];

  const defaultProps = {
    filters: defaultFilters,
    onFilterChange: jest.fn(),
    accounts: mockAccounts,
    categories: mockCategories,
    colors: mockColors,
    t: mockT,
    isExpanded: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when isExpanded is false', () => {
    const { queryByTestId } = render(
      <ExpandableFilters {...defaultProps} isExpanded={false} />,
    );
    expect(queryByTestId('expandable-filters')).toBeNull();
  });

  it('renders when isExpanded is true', () => {
    const { getByTestId } = render(<ExpandableFilters {...defaultProps} />);
    expect(getByTestId('expandable-filters')).toBeTruthy();
  });

  it('renders type filter chips', () => {
    const { getByText } = render(<ExpandableFilters {...defaultProps} />);
    expect(getByText('expense')).toBeTruthy();
    expect(getByText('income')).toBeTruthy();
    expect(getByText('transfer')).toBeTruthy();
  });

  it('calls onFilterChange when type chip is pressed', () => {
    const { getByText } = render(<ExpandableFilters {...defaultProps} />);

    fireEvent.press(getByText('expense'));

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      types: ['expense'],
    });
  });

  it('renders account checkboxes', () => {
    const { getByText } = render(<ExpandableFilters {...defaultProps} />);
    expect(getByText('Checking Account')).toBeTruthy();
    expect(getByText('Savings Account')).toBeTruthy();
  });

  it('calls onFilterChange when account checkbox is pressed', () => {
    const { getByText } = render(<ExpandableFilters {...defaultProps} />);

    fireEvent.press(getByText('Checking Account'));

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      accountIds: ['acc-1'],
    });
  });
});
