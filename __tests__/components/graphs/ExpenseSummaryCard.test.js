/**
 * ExpenseSummaryCard Component Tests
 *
 * Tests for the ExpenseSummaryCard component which displays
 * total expenses summary.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExpenseSummaryCard from '../../../app/components/graphs/ExpenseSummaryCard';

// Mock currencies.json
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar', decimal_digits: 2 },
  EUR: { symbol: '€', name: 'Euro', decimal_digits: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimal_digits: 0 },
  BTC: { symbol: '₿', name: 'Bitcoin', decimal_digits: 8 },
}));

describe('ExpenseSummaryCard', () => {
  const defaultProps = {
    colors: {
      altRow: '#FAFAFA',
      border: '#CCCCCC',
      mutedText: '#888888',
      text: '#000000',
      primary: '#2196F3',
    },
    t: (key) => key,
    loading: false,
    totalExpenses: 1500.75,
    selectedCurrency: 'USD',
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders expense categories label with amount', () => {
      const { getByText } = render(<ExpenseSummaryCard {...defaultProps} />);

      expect(getByText(/expense_categories.*\$1500\.75/)).toBeTruthy();
    });

    it('uses translation function', () => {
      const customT = jest.fn((key) => `translated_${key}`);
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} t={customT} />,
      );

      expect(customT).toHaveBeenCalledWith('expense_categories');
      expect(customT).toHaveBeenCalledWith('expenses_by_category');
      expect(getByText(/translated_expense_categories/)).toBeTruthy();
    });
  });

  describe('Currency Formatting', () => {
    it('formats USD with symbol and 2 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={100.5} selectedCurrency="USD" />,
      );

      expect(getByText(/\$100\.50/)).toBeTruthy();
    });

    it('formats EUR with symbol and 2 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={85.1} selectedCurrency="EUR" />,
      );

      expect(getByText(/€85\.10/)).toBeTruthy();
    });

    it('formats JPY with symbol and 0 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={1000.99} selectedCurrency="JPY" />,
      );

      expect(getByText(/¥1001/)).toBeTruthy();
    });

    it('formats BTC with symbol and 8 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={0.00012345} selectedCurrency="BTC" />,
      );

      expect(getByText(/₿0\.00012345/)).toBeTruthy();
    });

    it('defaults to currency code for unknown currency', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={100.999} selectedCurrency="XYZ" />,
      );

      expect(getByText(/XYZ101\.00/)).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when loading', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} loading={true} />,
      );

      expect(getByText(/\.\.\./)).toBeTruthy();
    });

    it('does not show amount when loading', () => {
      const { queryByText } = render(
        <ExpenseSummaryCard {...defaultProps} loading={true} />,
      );

      expect(queryByText(/\$1500\.75/)).toBeNull();
    });
  });

  describe('Press Interaction', () => {
    it('calls onPress when card is pressed', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <ExpenseSummaryCard {...defaultProps} onPress={onPress} />,
      );

      const button = getByRole('button');
      fireEvent.press(button);

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has button accessibility role', () => {
      const { getByRole } = render(<ExpenseSummaryCard {...defaultProps} />);

      expect(getByRole('button')).toBeTruthy();
    });

    it('has accessibility label', () => {
      const { getByLabelText } = render(<ExpenseSummaryCard {...defaultProps} />);

      expect(getByLabelText('expenses_by_category')).toBeTruthy();
    });
  });

  describe('Theming', () => {
    it('applies background color from colors prop', () => {
      const customColors = {
        ...defaultProps.colors,
        altRow: '#F0F0F0',
      };
      const { toJSON } = render(
        <ExpenseSummaryCard {...defaultProps} colors={customColors} />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('applies border color from colors prop', () => {
      const customColors = {
        ...defaultProps.colors,
        border: '#DDDDDD',
      };
      const { toJSON } = render(
        <ExpenseSummaryCard {...defaultProps} colors={customColors} />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('applies text color', () => {
      const customColors = {
        ...defaultProps.colors,
        text: '#FF0000',
      };
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} colors={customColors} />,
      );

      const text = getByText(/expense_categories.*\$1500\.75/);
      expect(text.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#FF0000' })]),
      );
    });
  });
});
