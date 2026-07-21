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

  it('does not render when isExpanded is false', async () => {
    const { queryByTestId } = await render(
      <ExpandableFilters {...defaultProps} isExpanded={false} />,
    );
    expect(queryByTestId('expandable-filters')).toBeNull();
  });

  it('renders when isExpanded is true', async () => {
    const { getByTestId } = await render(<ExpandableFilters {...defaultProps} />);
    expect(getByTestId('expandable-filters')).toBeTruthy();
  });

  it('renders type filter chips', async () => {
    const { getByText } = await render(<ExpandableFilters {...defaultProps} />);
    expect(getByText('expense')).toBeTruthy();
    expect(getByText('income')).toBeTruthy();
    expect(getByText('transfer')).toBeTruthy();
  });

  it('calls onFilterChange when type chip is pressed', async () => {
    const { getByText } = await render(<ExpandableFilters {...defaultProps} />);

    await fireEvent.press(getByText('expense'));

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      types: ['expense'],
    });
  });

  it('renders account checkboxes', async () => {
    const { getByText } = await render(<ExpandableFilters {...defaultProps} />);
    expect(getByText('Checking Account')).toBeTruthy();
    expect(getByText('Savings Account')).toBeTruthy();
  });

  it('calls onFilterChange when account checkbox is pressed', async () => {
    const { getByText } = await render(<ExpandableFilters {...defaultProps} />);

    await fireEvent.press(getByText('Checking Account'));

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      accountIds: ['acc-1'],
    });
  });

  it('renders clear all button', async () => {
    const { getByTestId } = await render(<ExpandableFilters {...defaultProps} />);
    expect(getByTestId('clear-all-button')).toBeTruthy();
  });

  it('calls onFilterChange with all groups reset when clear all is pressed', async () => {
    const { getByTestId } = await render(<ExpandableFilters {...defaultProps} />);
    await fireEvent.press(getByTestId('clear-all-button'));
    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      text: '',
      types: [],
      accountIds: [],
      categoryIds: [],
      labels: [],
      dateRange: { startDate: null, endDate: null },
      amountRange: { min: null, max: null },
    });
  });

  describe('Amount range input', () => {
    it('preserves decimal point mid-typing without calling onFilterChange', async () => {
      const { getByPlaceholderText } = await render(<ExpandableFilters {...defaultProps} />);
      const minInput = getByPlaceholderText('min_amount');

      await fireEvent.changeText(minInput, '1.');

      // onFilterChange should NOT be called while still typing
      expect(defaultProps.onFilterChange).not.toHaveBeenCalled();
      // Input should still show '1.'
      expect(minInput.props.value).toBe('1.');
    });

    it('calls onFilterChange with parsed float on blur', async () => {
      const { getByPlaceholderText } = await render(<ExpandableFilters {...defaultProps} />);
      const minInput = getByPlaceholderText('min_amount');

      await fireEvent.changeText(minInput, '1.5');
      fireEvent(minInput, 'blur');

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
        amountRange: { min: 1.5, max: null },
      });
    });

    it('calls onFilterChange with null on blur when input cleared', async () => {
      const { getByPlaceholderText } = await render(
        <ExpandableFilters {...defaultProps} filters={{ ...defaultFilters, amountRange: { min: 5, max: null } }} />,
      );
      const minInput = getByPlaceholderText('min_amount');

      await fireEvent.changeText(minInput, '');
      fireEvent(minInput, 'blur');

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
        amountRange: { min: null, max: null },
      });
    });
  });

  describe('Date presets (QoL-8)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Wednesday, 2024-01-17 (2024-01-01 is a Monday).
      jest.setSystemTime(new Date(2024, 0, 17, 12, 0, 0));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('renders the date preset chips', async () => {
      const { getByTestId } = await render(<ExpandableFilters {...defaultProps} />);
      expect(getByTestId('date-preset-this_month')).toBeTruthy();
      expect(getByTestId('date-preset-last_7_days')).toBeTruthy();
      expect(getByTestId('date-preset-this_year')).toBeTruthy();
    });

    it('applies the This month range on press', async () => {
      const onFilterChange = jest.fn();
      const { getByTestId } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      fireEvent.press(getByTestId('date-preset-this_month'));
      expect(onFilterChange).toHaveBeenCalledWith({
        dateRange: { startDate: '2024-01-01', endDate: '2024-01-31' },
      });
    });

    it('applies the Last 7 days range on press', async () => {
      const onFilterChange = jest.fn();
      const { getByTestId } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      fireEvent.press(getByTestId('date-preset-last_7_days'));
      expect(onFilterChange).toHaveBeenCalledWith({
        dateRange: { startDate: '2024-01-11', endDate: '2024-01-17' },
      });
    });

    it('marks the preset active when the current range matches it', async () => {
      const props = {
        ...defaultProps,
        filters: { ...defaultFilters, dateRange: { startDate: '2024-01-01', endDate: '2024-01-31' } },
      };
      const { getByTestId } = await render(<ExpandableFilters {...props} />);
      expect(getByTestId('date-preset-this_month').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      );
      expect(getByTestId('date-preset-last_7_days').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false }),
      );
    });
  });
});
