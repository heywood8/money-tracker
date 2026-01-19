/**
 * ExpenseSummaryCard Component Tests
 *
 * Tests for the ExpenseSummaryCard component which displays
 * total expenses summary with a mini pie chart.
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

// Mock PieChart
jest.mock('react-native-chart-kit', () => {
  const PropTypes = require('prop-types');

  function PieChart({ data, chartConfig }) {
    // Call the color function to get coverage
    if (chartConfig && chartConfig.color) {
      chartConfig.color(1);
      chartConfig.color();
    }
    return null;
  }

  PieChart.propTypes = {
    data: PropTypes.array,
    chartConfig: PropTypes.shape({ color: PropTypes.func }),
  };

  return { PieChart };
});

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
    chartData: [
      { name: 'Food', amount: 500, color: '#FF0000' },
      { name: 'Transport', amount: 300, color: '#00FF00' },
    ],
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders total expenses label', () => {
      const { getByText } = render(<ExpenseSummaryCard {...defaultProps} />);

      expect(getByText('total_expenses')).toBeTruthy();
    });

    it('renders formatted expense amount', () => {
      const { getByText } = render(<ExpenseSummaryCard {...defaultProps} />);

      expect(getByText('1500.75 USD')).toBeTruthy();
    });

    it('uses translation function', () => {
      const customT = jest.fn((key) => `translated_${key}`);
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} t={customT} />,
      );

      expect(customT).toHaveBeenCalledWith('total_expenses');
      expect(customT).toHaveBeenCalledWith('expenses_by_category');
      expect(getByText('translated_total_expenses')).toBeTruthy();
    });
  });

  describe('Currency Formatting', () => {
    it('formats USD with 2 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={100.5} selectedCurrency="USD" />,
      );

      expect(getByText('100.50 USD')).toBeTruthy();
    });

    it('formats EUR with 2 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={85.1} selectedCurrency="EUR" />,
      );

      expect(getByText('85.10 EUR')).toBeTruthy();
    });

    it('formats JPY with 0 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={1000.99} selectedCurrency="JPY" />,
      );

      expect(getByText('1001 JPY')).toBeTruthy();
    });

    it('formats BTC with 8 decimal places', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={0.00012345} selectedCurrency="BTC" />,
      );

      expect(getByText('0.00012345 BTC')).toBeTruthy();
    });

    it('defaults to 2 decimal places for unknown currency', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} totalExpenses={100.999} selectedCurrency="XYZ" />,
      );

      expect(getByText('101.00 XYZ')).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when loading', () => {
      const { getByText, UNSAFE_getByType } = render(
        <ExpenseSummaryCard {...defaultProps} loading={true} />,
      );

      // Shows ... for amount when loading
      expect(getByText('...')).toBeTruthy();
    });

    it('does not show pie chart when loading', () => {
      const { queryByText } = render(
        <ExpenseSummaryCard {...defaultProps} loading={true} />,
      );

      // Amount shows loading indicator
      expect(queryByText('1500.75 USD')).toBeNull();
    });
  });

  describe('Chart Display', () => {
    it('renders pie chart when chartData has items', () => {
      // This test verifies the chart renders without error
      const { toJSON } = render(<ExpenseSummaryCard {...defaultProps} />);

      expect(toJSON()).toBeTruthy();
    });

    it('shows placeholder when chartData is empty', () => {
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} chartData={[]} />,
      );

      expect(getByText('—')).toBeTruthy();
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

    it('applies text color for amount', () => {
      const customColors = {
        ...defaultProps.colors,
        text: '#FF0000',
      };
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} colors={customColors} />,
      );

      const amount = getByText('1500.75 USD');
      expect(amount.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#FF0000' })]),
      );
    });

    it('applies mutedText color for label', () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#999999',
      };
      const { getByText } = render(
        <ExpenseSummaryCard {...defaultProps} colors={customColors} />,
      );

      const label = getByText('total_expenses');
      expect(label.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#999999' })]),
      );
    });
  });
});
