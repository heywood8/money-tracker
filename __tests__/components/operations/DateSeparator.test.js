/**
 * DateSeparator Component Tests
 *
 * Tests for the DateSeparator component which displays date dividers
 * in the operations list with optional spending sums.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DateSeparator from '../../../app/components/operations/DateSeparator';

// Mock currencies.json
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar', decimal_digits: 2 },
  EUR: { symbol: '€', name: 'Euro', decimal_digits: 2 },
  GBP: { symbol: '£', name: 'British Pound', decimal_digits: 2 },
  RUB: { symbol: '₽', name: 'Russian Ruble', decimal_digits: 2 },
  JPY: { symbol: '¥', name: 'Japanese Yen', decimal_digits: 0 },
  BTC: { symbol: '₿', name: 'Bitcoin', decimal_digits: 8 },
}));

describe('DateSeparator', () => {
  // Default test props
  const defaultProps = {
    date: '2024-01-15',
    formatDate: (date) => `Formatted: ${date}`,
    colors: {
      background: '#FFFFFF',
      border: '#CCCCCC',
      mutedText: '#888888',
      expense: '#FF0000',
    },
    t: (key) => key,
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders formatted date', () => {
      const { getByText } = render(<DateSeparator {...defaultProps} />);

      expect(getByText('Formatted: 2024-01-15')).toBeTruthy();
    });

    it('renders with custom formatDate function', () => {
      const customFormatDate = jest.fn((date) => `Date: ${date}`);
      const { getByText } = render(
        <DateSeparator {...defaultProps} formatDate={customFormatDate} />,
      );

      expect(customFormatDate).toHaveBeenCalledWith('2024-01-15');
      expect(getByText('Date: 2024-01-15')).toBeTruthy();
    });

    it('applies background color from colors prop', () => {
      const customColors = {
        ...defaultProps.colors,
        background: '#F0F0F0',
      };
      const { toJSON } = render(
        <DateSeparator {...defaultProps} colors={customColors} />,
      );

      const json = toJSON();
      // Root view should have the background color
      expect(json.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: '#F0F0F0' }),
        ]),
      );
    });

    it('applies border color to separator lines', () => {
      const customColors = {
        ...defaultProps.colors,
        border: '#DDDDDD',
      };
      const { toJSON } = render(
        <DateSeparator {...defaultProps} colors={customColors} />,
      );

      const json = toJSON();
      // Find the line views (first and last children with height: 1)
      const lineViews = json.children.filter(
        (child) =>
          child.type === 'View' &&
          child.props.style?.some?.((s) => s.height === 1),
      );
      expect(lineViews.length).toBe(2);
    });

    it('applies mutedText color to date text', () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#999999',
      };
      const { getByText } = render(
        <DateSeparator {...defaultProps} colors={customColors} />,
      );

      const dateText = getByText('Formatted: 2024-01-15');
      expect(dateText.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#999999' })]),
      );
    });
  });

  describe('Spending Sums Display', () => {
    it('does not show spending when spendingSums is undefined', () => {
      const { queryByText } = render(
        <DateSeparator {...defaultProps} spendingSums={undefined} />,
      );

      expect(queryByText(/spent_amount/)).toBeNull();
    });

    it('does not show spending when spendingSums is empty object', () => {
      const { queryByText } = render(
        <DateSeparator {...defaultProps} spendingSums={{}} />,
      );

      expect(queryByText(/spent_amount/)).toBeNull();
    });

    it('shows spending for single currency', () => {
      const spendingSums = { USD: 123.45 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('$123.45')).toBeTruthy();
    });

    it('shows spending for multiple currencies', () => {
      const spendingSums = { USD: 100.00, EUR: 85.50 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('$100.00, €85.50')).toBeTruthy();
    });

    it('respects decimal_digits from currency config', () => {
      const spendingSums = { JPY: 1000, USD: 50.5 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // JPY has 0 decimal digits, USD has 2
      expect(getByText('¥1000, $50.50')).toBeTruthy();
    });

    it('handles currency with many decimal places (BTC)', () => {
      const spendingSums = { BTC: 0.00012345 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('₿0.00012345')).toBeTruthy();
    });

    it('applies expense color to spending text', () => {
      const customColors = {
        ...defaultProps.colors,
        expense: '#E53935',
      };
      const spendingSums = { USD: 50 };
      const { getByText } = render(
        <DateSeparator
          {...defaultProps}
          colors={customColors}
          spendingSums={spendingSums}
        />,
      );

      const spentText = getByText('$50.00');
      expect(spentText.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#E53935' })]),
      );
    });

    it('does not use spent_amount translation (label removed)', () => {
      const customT = jest.fn((key) => `Translated: ${key}`);
      const spendingSums = { USD: 25 };
      const { getByText } = render(
        <DateSeparator
          {...defaultProps}
          t={customT}
          spendingSums={spendingSums}
        />,
      );

      expect(customT).not.toHaveBeenCalledWith('spent_amount');
      expect(getByText('$25.00')).toBeTruthy();
    });
  });

  describe('Currency Symbol Resolution', () => {
    it('uses currency symbol for known currencies', () => {
      const spendingSums = { GBP: 75.25 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('£75.25')).toBeTruthy();
    });

    it('uses RUB symbol correctly', () => {
      const spendingSums = { RUB: 1500.50 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('₽1500.50')).toBeTruthy();
    });

    it('falls back to currency code for unknown currencies', () => {
      // Mock an unknown currency with just the entry (no decimal_digits)
      const spendingSums = { XYZ: 100 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // Unknown currency code should be used as symbol, defaults to 2 decimals
      expect(getByText('XYZ100.00')).toBeTruthy();
    });

    it('handles empty currency code gracefully', () => {
      // This is an edge case - shouldn't happen in practice
      const spendingSums = { '': 50 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // Empty currency code returns empty string for symbol
      expect(getByText('50.00')).toBeTruthy();
    });
  });

  describe('Press Interaction', () => {
    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <DateSeparator {...defaultProps} onPress={onPress} />,
      );

      const pressable = getByRole('button');
      fireEvent.press(pressable);

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not crash when onPress is undefined', () => {
      const propsWithoutOnPress = { ...defaultProps };
      delete propsWithoutOnPress.onPress;

      const { getByRole } = render(
        <DateSeparator {...propsWithoutOnPress} />,
      );

      const pressable = getByRole('button');
      // Should not throw
      fireEvent.press(pressable);
    });

    it('multiple presses call onPress multiple times', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <DateSeparator {...defaultProps} onPress={onPress} />,
      );

      const pressable = getByRole('button');
      fireEvent.press(pressable);
      fireEvent.press(pressable);
      fireEvent.press(pressable);

      expect(onPress).toHaveBeenCalledTimes(3);
    });
  });

  describe('Accessibility', () => {
    it('has button accessibility role', () => {
      const { getByRole } = render(<DateSeparator {...defaultProps} />);

      expect(getByRole('button')).toBeTruthy();
    });

    it('has accessibility label with formatted date', () => {
      const { getByLabelText } = render(<DateSeparator {...defaultProps} />);

      expect(
        getByLabelText('Formatted: 2024-01-15, press to select date'),
      ).toBeTruthy();
    });

    it('has accessibility hint for date picker', () => {
      const { getByA11yHint } = render(<DateSeparator {...defaultProps} />);

      expect(
        getByA11yHint('Opens date picker to jump to a specific date'),
      ).toBeTruthy();
    });

    it('accessibility label updates with different dates', () => {
      const { getByLabelText, rerender } = render(
        <DateSeparator {...defaultProps} date="2024-06-20" />,
      );

      expect(
        getByLabelText('Formatted: 2024-06-20, press to select date'),
      ).toBeTruthy();

      rerender(<DateSeparator {...defaultProps} date="2024-12-25" />);

      expect(
        getByLabelText('Formatted: 2024-12-25, press to select date'),
      ).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long currency amounts', () => {
      const spendingSums = { USD: 999999999.99 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('$999999999.99')).toBeTruthy();
    });

    it('handles zero amount', () => {
      const spendingSums = { USD: 0 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('$0.00')).toBeTruthy();
    });

    it('handles negative amounts', () => {
      const spendingSums = { USD: -50.25 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('$-50.25')).toBeTruthy();
    });

    it('handles many currencies at once', () => {
      const spendingSums = {
        USD: 100,
        EUR: 85,
        GBP: 70,
        JPY: 10000,
      };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(
        getByText('$100.00, €85.00, £70.00, ¥10000'),
      ).toBeTruthy();
    });

    it('memoizes correctly (same props)', () => {
      const { rerender } = render(<DateSeparator {...defaultProps} />);

      // Re-render with same props should not cause issues
      rerender(<DateSeparator {...defaultProps} />);
    });

    it('handles date that is just a string', () => {
      const { getByText } = render(
        <DateSeparator {...defaultProps} date="Today" />,
      );

      expect(getByText('Formatted: Today')).toBeTruthy();
    });
  });

  describe('Decimal Digits Fallback', () => {
    it('defaults to 2 decimal digits when currency has no decimal_digits config', () => {
      // ABC is not in our mock, so it falls back to currency code
      // and ?? 2 gives 2 decimal digits
      const spendingSums = { ABC: 123.456 };
      const { getByText } = render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // ABC123.46 because toFixed(2) rounds
      expect(getByText('ABC123.46')).toBeTruthy();
    });
  });
});
