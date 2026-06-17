import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExpandableFilters from '../../app/components/search/ExpandableFilters';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const PropTypes = require('prop-types');
  function MockIcon({ name }) {
    return React.createElement(Text, { testID: `icon-${name}` }, name);
  }
  MockIcon.propTypes = { name: PropTypes.string, size: PropTypes.number, color: PropTypes.string };
  return { MaterialCommunityIcons: MockIcon };
});

jest.mock('../../app/styles/layout', () => ({ HORIZONTAL_PADDING: 16 }));

jest.mock('../../app/services/BalanceHistoryDB', () => ({
  formatDate: (date) => date.toISOString().split('T')[0],
}));

const colors = {
  background: '#fff',
  border: '#ccc',
  text: '#000',
  mutedText: '#999',
  primary: '#007AFF',
  inputBackground: '#f5f5f5',
  inputBorder: '#ddd',
};

const defaultFilters = {
  text: '',
  types: [],
  accountIds: [],
  categoryIds: [],
  dateRange: { startDate: null, endDate: null },
  amountRange: { min: null, max: null },
};

const defaultProps = {
  filters: defaultFilters,
  onFilterChange: jest.fn(),
  accounts: [],
  colors,
  t: (key) => key,
  isExpanded: true,
};

describe('ExpandableFilters', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('isExpanded', () => {
    it('renders null when not expanded', async () => {
      const { queryByTestId } = await render(
        <ExpandableFilters {...defaultProps} isExpanded={false} />,
      );
      expect(queryByTestId('expandable-filters')).toBeNull();
    });

    it('renders content when expanded', async () => {
      const { getByTestId } = await render(<ExpandableFilters {...defaultProps} />);
      expect(getByTestId('expandable-filters')).toBeTruthy();
    });
  });

  describe('Type filter chips', () => {
    it('renders expense, income, transfer chips', async () => {
      const { getByText } = await render(<ExpandableFilters {...defaultProps} />);
      expect(getByText('expense')).toBeTruthy();
      expect(getByText('income')).toBeTruthy();
      expect(getByText('transfer')).toBeTruthy();
    });

    it('adds type when unselected chip is pressed', async () => {
      const onFilterChange = jest.fn();
      const { getByText } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      await fireEvent.press(getByText('expense'));
      expect(onFilterChange).toHaveBeenCalledWith({ types: ['expense'] });
    });

    it('removes type when selected chip is pressed', async () => {
      const onFilterChange = jest.fn();
      const { getByText } = await render(
        <ExpandableFilters
          {...defaultProps}
          filters={{ ...defaultFilters, types: ['expense', 'income'] }}
          onFilterChange={onFilterChange}
        />,
      );
      await fireEvent.press(getByText('expense'));
      expect(onFilterChange).toHaveBeenCalledWith({ types: ['income'] });
    });
  });

  describe('Account filter chips', () => {
    it('renders account chips', async () => {
      const accounts = [{ id: 'acc-1', name: 'Cash' }, { id: 'acc-2', name: 'Card' }];
      const { getByText } = await render(
        <ExpandableFilters {...defaultProps} accounts={accounts} />,
      );
      expect(getByText('Cash')).toBeTruthy();
      expect(getByText('Card')).toBeTruthy();
    });

    it('adds account when unselected chip is pressed', async () => {
      const onFilterChange = jest.fn();
      const accounts = [{ id: 'acc-1', name: 'Cash' }];
      const { getByText } = await render(
        <ExpandableFilters {...defaultProps} accounts={accounts} onFilterChange={onFilterChange} />,
      );
      await fireEvent.press(getByText('Cash'));
      expect(onFilterChange).toHaveBeenCalledWith({ accountIds: ['acc-1'] });
    });

    it('removes account when selected chip is pressed', async () => {
      const onFilterChange = jest.fn();
      const accounts = [{ id: 'acc-1', name: 'Cash' }];
      const { getByText } = await render(
        <ExpandableFilters
          {...defaultProps}
          accounts={accounts}
          filters={{ ...defaultFilters, accountIds: ['acc-1'] }}
          onFilterChange={onFilterChange}
        />,
      );
      await fireEvent.press(getByText('Cash'));
      expect(onFilterChange).toHaveBeenCalledWith({ accountIds: [] });
    });
  });

  describe('Date range', () => {
    it('does not show clear date button when no dates set', async () => {
      const { queryByText } = await render(<ExpandableFilters {...defaultProps} />);
      expect(queryByText('clear')).toBeNull();
    });

    it('shows clear date button when startDate is set', async () => {
      const { getByText } = await render(
        <ExpandableFilters
          {...defaultProps}
          filters={{ ...defaultFilters, dateRange: { startDate: '2024-01-01', endDate: null } }}
        />,
      );
      expect(getByText('clear')).toBeTruthy();
    });

    it('shows clear date button when endDate is set', async () => {
      const { getByText } = await render(
        <ExpandableFilters
          {...defaultProps}
          filters={{ ...defaultFilters, dateRange: { startDate: null, endDate: '2024-12-31' } }}
        />,
      );
      expect(getByText('clear')).toBeTruthy();
    });

    it('clears both dates when clear button is pressed', async () => {
      const onFilterChange = jest.fn();
      const { getByText } = await render(
        <ExpandableFilters
          {...defaultProps}
          filters={{ ...defaultFilters, dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' } }}
          onFilterChange={onFilterChange}
        />,
      );
      await fireEvent.press(getByText('clear'));
      expect(onFilterChange).toHaveBeenCalledWith({
        dateRange: { startDate: null, endDate: null },
      });
    });
  });

  describe('Amount range inputs', () => {
    it('calls onFilterChange with parsed min on blur', async () => {
      const onFilterChange = jest.fn();
      const { getByPlaceholderText } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      const minInput = getByPlaceholderText('min_amount');
      await fireEvent.changeText(minInput, '100');
      fireEvent(minInput, 'blur');
      expect(onFilterChange).toHaveBeenCalledWith({ amountRange: { min: 100, max: null } });
    });

    it('calls onFilterChange with null min when input is cleared', async () => {
      const onFilterChange = jest.fn();
      const { getByPlaceholderText } = await render(
        <ExpandableFilters
          {...defaultProps}
          filters={{ ...defaultFilters, amountRange: { min: 50, max: null } }}
          onFilterChange={onFilterChange}
        />,
      );
      const minInput = getByPlaceholderText('min_amount');
      await fireEvent.changeText(minInput, '');
      fireEvent(minInput, 'blur');
      expect(onFilterChange).toHaveBeenCalledWith({ amountRange: { min: null, max: null } });
    });

    it('calls onFilterChange with null for negative value', async () => {
      const onFilterChange = jest.fn();
      const { getByPlaceholderText } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      const minInput = getByPlaceholderText('min_amount');
      await fireEvent.changeText(minInput, '-5');
      fireEvent(minInput, 'blur');
      expect(onFilterChange).toHaveBeenCalledWith({ amountRange: { min: null, max: null } });
    });

    it('accepts comma as decimal separator', async () => {
      const onFilterChange = jest.fn();
      const { getByPlaceholderText } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      const maxInput = getByPlaceholderText('max_amount');
      await fireEvent.changeText(maxInput, '1,5');
      fireEvent(maxInput, 'blur');
      expect(onFilterChange).toHaveBeenCalledWith({ amountRange: { min: null, max: 1.5 } });
    });

    it('calls onFilterChange with null for standalone dash', async () => {
      const onFilterChange = jest.fn();
      const { getByPlaceholderText } = await render(
        <ExpandableFilters {...defaultProps} onFilterChange={onFilterChange} />,
      );
      const minInput = getByPlaceholderText('min_amount');
      await fireEvent.changeText(minInput, '-');
      fireEvent(minInput, 'blur');
      expect(onFilterChange).toHaveBeenCalledWith({ amountRange: { min: null, max: null } });
    });
  });

  describe('Clear All', () => {
    it('resets all filters', async () => {
      const onFilterChange = jest.fn();
      const { getByTestId } = await render(
        <ExpandableFilters
          {...defaultProps}
          filters={{
            text: 'foo',
            types: ['expense'],
            accountIds: ['acc-1'],
            categoryIds: ['cat-1'],
            dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' },
            amountRange: { min: 10, max: 200 },
          }}
          onFilterChange={onFilterChange}
        />,
      );
      await fireEvent.press(getByTestId('clear-all-button'));
      expect(onFilterChange).toHaveBeenCalledWith({
        text: '',
        types: [],
        accountIds: [],
        categoryIds: [],
        labels: [],
        dateRange: { startDate: null, endDate: null },
        amountRange: { min: null, max: null },
      });
    });
  });
});
