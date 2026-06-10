import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FilterChipStrip from '../../../app/components/search/FilterChipStrip';

describe('FilterChipStrip', () => {
  const mockColors = {
    background: '#1A1A1A',
    primary: '#007AFF',
    border: '#333333',
    text: '#FFFFFF',
  };
  const mockT = (key) => key;

  const emptySearchState = {
    text: '',
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  };

  const defaultProps = {
    searchState: emptySearchState,
    onClearGroup: jest.fn(),
    colors: mockColors,
    t: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no filter groups are active', async () => {
    const { toJSON } = await render(<FilterChipStrip {...defaultProps} />);
    expect(toJSON()).toBeNull();
  });

  it('renders a chip for active types (single type shows type name)', async () => {
    const { getByText } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, types: ['expense'] }}
      />,
    );
    expect(getByText('expense')).toBeTruthy();
  });

  it('renders "operation_type: N" for multiple active types', async () => {
    const { getByText } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, types: ['expense', 'income'] }}
      />,
    );
    expect(getByText('operation_type: 2')).toBeTruthy();
  });

  it('renders a chip for active date range (both dates)', async () => {
    const { getByTestId } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, dateRange: { startDate: '2024-04-01', endDate: '2024-04-30' } }}
      />,
    );
    expect(getByTestId('chip-dateRange')).toBeTruthy();
  });

  it('renders a chip for start date only', async () => {
    const { getByTestId } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, dateRange: { startDate: '2024-04-01', endDate: null } }}
      />,
    );
    expect(getByTestId('chip-dateRange')).toBeTruthy();
  });

  it('renders "accounts: N" chip for active accountIds', async () => {
    const { getByText } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, accountIds: ['a1', 'a2'] }}
      />,
    );
    expect(getByText('accounts: 2')).toBeTruthy();
  });

  it('renders "> min" label for min-only amount range', async () => {
    const { getByText } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, amountRange: { min: 50, max: null } }}
      />,
    );
    expect(getByText('> 50')).toBeTruthy();
  });

  it('renders "< max" label for max-only amount range', async () => {
    const { getByText } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, amountRange: { min: null, max: 200 } }}
      />,
    );
    expect(getByText('< 200')).toBeTruthy();
  });

  it('renders "min – max" label for both amount bounds', async () => {
    const { getByText } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, amountRange: { min: 50, max: 200 } }}
      />,
    );
    expect(getByText('50 – 200')).toBeTruthy();
  });

  it('calls onClearGroup with "types" when types chip ✕ is pressed', async () => {
    const { getByTestId } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, types: ['expense'] }}
      />,
    );
    await fireEvent.press(getByTestId('clear-chip-types'));
    expect(defaultProps.onClearGroup).toHaveBeenCalledWith('types');
  });

  it('calls onClearGroup with "accountIds" when accounts chip ✕ is pressed', async () => {
    const { getByTestId } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, accountIds: ['a1'] }}
      />,
    );
    await fireEvent.press(getByTestId('clear-chip-accountIds'));
    expect(defaultProps.onClearGroup).toHaveBeenCalledWith('accountIds');
  });

  it('renders multiple chips when multiple groups are active', async () => {
    const { getByTestId } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{
          ...emptySearchState,
          types: ['expense'],
          accountIds: ['a1'],
        }}
      />,
    );
    expect(getByTestId('chip-types')).toBeTruthy();
    expect(getByTestId('chip-accountIds')).toBeTruthy();
  });

  it('renders endDate-only date chip when only endDate is set', async () => {
    const { getByTestId } = await render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, dateRange: { startDate: null, endDate: '2024-04-30' } }}
      />,
    );
    expect(getByTestId('chip-dateRange')).toBeTruthy();
  });
});
