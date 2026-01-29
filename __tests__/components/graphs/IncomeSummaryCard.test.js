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
    it('renders income categories label with abbreviated amount', () => {
      const { getByText } = render(<IncomeSummaryCard {...defaultProps} />);

      expect(getByText(/\+.*\$3\.5K/)).toBeTruthy();
    });

    it('uses translation function for accessibility', () => {
      const customT = jest.fn((key) => `translated_${key}`);
      render(
        <IncomeSummaryCard {...defaultProps} t={customT} />,
      );

      expect(customT).toHaveBeenCalledWith('income_by_category');
    });
  });

  describe('Currency Formatting', () => {
    it('formats small amounts with full decimals', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={500.5} selectedCurrency="USD" />,
      );

      expect(getByText(/\$500\.50/)).toBeTruthy();
    });

    it('abbreviates thousands with K', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={2500.5} selectedCurrency="USD" />,
      );

      expect(getByText(/\$2\.5K/)).toBeTruthy();
    });

    it('abbreviates millions with M', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={1200000} selectedCurrency="EUR" />,
      );

      expect(getByText(/€1\.2M/)).toBeTruthy();
    });

    it('formats JPY thousands with K', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={150000.99} selectedCurrency="JPY" />,
      );

      expect(getByText(/¥150\.0K/)).toBeTruthy();
    });

    it('formats BTC with full decimals when small', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={0.12345678} selectedCurrency="BTC" />,
      );

      expect(getByText(/₿0\.12345678/)).toBeTruthy();
    });

    it('defaults to currency code for unknown currency', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} totalIncome={999.999} selectedCurrency="XYZ" />,
      );

      expect(getByText(/XYZ1000\.00/)).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when loading', () => {
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} loadingIncome={true} />,
      );

      expect(getByText(/\.\.\./)).toBeTruthy();
    });

    it('does not show amount when loading', () => {
      const { queryByText } = render(
        <IncomeSummaryCard {...defaultProps} loadingIncome={true} />,
      );

      expect(queryByText(/\$3\.5K/)).toBeNull();
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
    it('applies text color', () => {
      const customColors = {
        ...defaultProps.colors,
        text: '#00FF00',
      };
      const { getByText } = render(
        <IncomeSummaryCard {...defaultProps} colors={customColors} />,
      );

      const text = getByText(/\+.*\$3\.5K/);
      expect(text.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#00FF00' })]),
      );
    });
  });
});
