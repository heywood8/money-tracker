/**
 * IncomeSummaryCard Component Tests
 *
 * Tests for the IncomeSummaryCard component which displays
 * total income summary.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import IncomeSummaryCard from '../../../app/components/graphs/IncomeSummaryCard';

// Mock currencies.json
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar', decimal_digits: 2 },
  EUR: { symbol: '€', name: 'Euro', decimal_digits: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimal_digits: 0 },
  BTC: { symbol: '₿', name: 'Bitcoin', decimal_digits: 8 },
}));

describe('IncomeSummaryCard', () => {
  const defaultProps = {
    colors: {
      altRow: '#FAFAFA',
      border: '#CCCCCC',
      mutedText: '#888888',
      text: '#000000',
      primary: '#2196F3',
    },
    t: (key) => key,
    loadingIncome: false,
    totalIncome: 3500.50,
    selectedCurrency: 'USD',
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders total income label', () => {
      const { getByText } = render(<IncomeSummaryCard {...defaultProps} />);

      expect(getByText('total_income')).toBeTruthy();
    });

    it('renders formatted income amount', () => {
      const { getByText } = render(<IncomeSummaryCard {...defaultProps} />);

      expect(getByText('3500.50 USD')).toBeTruthy();
    });

    it('uses translation function', () => {
      const customT = jest.fn((key) => `translated_${key}`);
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} t={customT} />,
      );

      expect(customT).toHaveBeenCalledWith('total_income');
      expect(customT).toHaveBeenCalledWith('income_by_category');
      expect(getByText('translated_total_income')).toBeTruthy();
    });
  });

  describe('Currency Formatting', () => {
    it('formats USD with 2 decimal places', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={2500.5} selectedCurrency="USD" />,
      );

      expect(getByText('2500.50 USD')).toBeTruthy();
    });

    it('formats EUR with 2 decimal places', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={1200.1} selectedCurrency="EUR" />,
      );

      expect(getByText('1200.10 EUR')).toBeTruthy();
    });

    it('formats JPY with 0 decimal places', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={150000.99} selectedCurrency="JPY" />,
      );

      expect(getByText('150001 JPY')).toBeTruthy();
    });

    it('formats BTC with 8 decimal places', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={0.12345678} selectedCurrency="BTC" />,
      );

      expect(getByText('0.12345678 BTC')).toBeTruthy();
    });

    it('defaults to 2 decimal places for unknown currency', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={999.999} selectedCurrency="XYZ" />,
      );

      expect(getByText('1000.00 XYZ')).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when loading', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} loadingIncome={true} />,
      );

      // Shows ... for amount when loading
      expect(getByText('...')).toBeTruthy();
    });

    it('does not show amount when loading', () => {
      const { queryByText } = render(
        <IncomeSummaryCard {...defaultProps} loadingIncome={true} />,
      );

      // Amount shows loading indicator
      expect(queryByText('3500.50 USD')).toBeNull();
    });
  });

  describe('Press Interaction', () => {
    it('calls onPress when card is pressed', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <IncomeSummaryCard {...defaultProps} onPress={onPress} />,
      );

      const button = getByRole('button');
      fireEvent.press(button);

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has button accessibility role', () => {
      const { getByRole } = render(<IncomeSummaryCard {...defaultProps} />);

      expect(getByRole('button')).toBeTruthy();
    });

    it('has accessibility label', () => {
      const { getByLabelText } = render(<IncomeSummaryCard {...defaultProps} />);

      expect(getByLabelText('income_by_category')).toBeTruthy();
    });
  });

  describe('Theming', () => {
    it('applies text color for amount', () => {
      const customColors = {
        ...defaultProps.colors,
        text: '#00FF00',
      };
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} colors={customColors} />,
      );

      const amount = getByText('3500.50 USD');
      expect(amount.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#00FF00' })]),
      );
    });

    it('applies mutedText color for label', () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#777777',
      };
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} colors={customColors} />,
      );

      const label = getByText('total_income');
      expect(label.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#777777' })]),
      );
    });
  });
});
