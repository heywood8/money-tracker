import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExpandableFilters from '../../../app/components/search/ExpandableFilters';

describe('ExpandableFilters', () => {
  const mockColors = {
    background: '#FFFFFF',
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

  const defaultProps = {
    filters: defaultFilters,
    onFilterChange: jest.fn(),
    accounts: mockAccounts,
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

  it('renders clear all button', () => {
    const { getByTestId } = render(<ExpandableFilters {...defaultProps} />);
    expect(getByTestId('clear-all-button')).toBeTruthy();
  });

  it('calls onFilterChange with all groups reset when clear all is pressed', () => {
    const { getByTestId } = render(<ExpandableFilters {...defaultProps} />);
    fireEvent.press(getByTestId('clear-all-button'));
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      types: [],
      accountIds: [],
      categoryIds: [],
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    });
  });

  describe('Amount range input', () => {
    it('preserves decimal point mid-typing without calling onFilterChange', () => {
      const { getByPlaceholderText } = render(<ExpandableFilters {...defaultProps} />);
      const minInput = getByPlaceholderText('min_amount');

      fireEvent.changeText(minInput, '1.');

      // onFilterChange should NOT be called while still typing
      expect(defaultProps.onFilterChange).not.toHaveBeenCalled();
      // Input should still show '1.'
      expect(minInput.props.value).toBe('1.');
    });

    it('calls onFilterChange with parsed float on blur', () => {
      const { getByPlaceholderText } = render(<ExpandableFilters {...defaultProps} />);
      const minInput = getByPlaceholderText('min_amount');

      fireEvent.changeText(minInput, '1.5');
      fireEvent(minInput, 'blur');

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
        amountRange: { min: 1.5, max: null },
      });
    });

    it('calls onFilterChange with null on blur when input cleared', () => {
      const { getByPlaceholderText } = render(
        <ExpandableFilters {...defaultProps} filters={{ ...defaultFilters, amountRange: { min: 5, max: null } }} />,
      );
      const minInput = getByPlaceholderText('min_amount');

      fireEvent.changeText(minInput, '');
      fireEvent(minInput, 'blur');

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
        amountRange: { min: null, max: null },
      });
    });
  });
});
