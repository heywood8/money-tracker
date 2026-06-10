/**
 * DateSeparator Component Tests
 *
 * Tests for the DateSeparator component which displays date headers
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
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders formatted date uppercased', async () => {
      const { getByText } = await render(<DateSeparator {...defaultProps} />);

      expect(getByText('FORMATTED: 2024-01-15')).toBeTruthy();
    });

    it('renders with custom formatDate function', async () => {
      const customFormatDate = jest.fn((date) => `Date: ${date}`);
      const { getByText } = await render(
        <DateSeparator {...defaultProps} formatDate={customFormatDate} />,
      );

      expect(customFormatDate).toHaveBeenCalledWith('2024-01-15');
      expect(getByText('DATE: 2024-01-15')).toBeTruthy();
    });

    it('applies mutedText color to date text', async () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#999999',
      };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} colors={customColors} />,
      );

      const dateText = getByText('FORMATTED: 2024-01-15');
      expect(dateText.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#999999' })]),
      );
    });
  });

  describe('Spending Sums Display', () => {
    it('does not show spending when spendingSums is undefined', async () => {
      const { queryByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={undefined} />,
      );

      expect(queryByText(/spent_amount/)).toBeNull();
    });

    it('does not show spending when spendingSums is empty object', async () => {
      const { queryByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={{}} />,
      );

      expect(queryByText(/spent_amount/)).toBeNull();
    });

    it('shows spending for single currency with minus prefix', async () => {
      const spendingSums = { USD: 123.45 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-$123.45')).toBeTruthy();
    });

    it('shows spending for multiple currencies each with minus prefix', async () => {
      const spendingSums = { USD: 100.00, EUR: 85.50 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-$100.00, -€85.50')).toBeTruthy();
    });

    it('respects decimal_digits from currency config', async () => {
      const spendingSums = { JPY: 1000, USD: 50.5 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // JPY has 0 decimal digits, USD has 2
      expect(getByText('-¥1000, -$50.50')).toBeTruthy();
    });

    it('handles currency with many decimal places (BTC)', async () => {
      const spendingSums = { BTC: 0.00012345 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-₿0.00012345')).toBeTruthy();
    });

    it('applies mutedText color to spending text', async () => {
      const customColors = {
        ...defaultProps.colors,
        mutedText: '#777777',
      };
      const spendingSums = { USD: 50 };
      const { getByText } = await render(
        <DateSeparator
          {...defaultProps}
          colors={customColors}
          spendingSums={spendingSums}
        />,
      );

      const spentText = getByText('-$50.00');
      expect(spentText.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: '#777777' })]),
      );
    });
  });

  describe('Currency Symbol Resolution', () => {
    it('uses currency symbol for known currencies', async () => {
      const spendingSums = { GBP: 75.25 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-£75.25')).toBeTruthy();
    });

    it('uses RUB symbol correctly', async () => {
      const spendingSums = { RUB: 1500.50 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-₽1500.50')).toBeTruthy();
    });

    it('falls back to currency code for unknown currencies', async () => {
      // Mock an unknown currency with just the entry (no decimal_digits)
      const spendingSums = { XYZ: 100 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // Unknown currency code should be used as symbol, defaults to 2 decimals
      expect(getByText('-XYZ100.00')).toBeTruthy();
    });

    it('handles empty currency code gracefully', async () => {
      // This is an edge case - shouldn't happen in practice
      const spendingSums = { '': 50 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // Empty currency code returns empty string for symbol
      expect(getByText('-50.00')).toBeTruthy();
    });
  });

  describe('Press Interaction', () => {
    it('calls onPress when pressed', async () => {
      const onPress = jest.fn();
      const { getByRole } = await render(
        <DateSeparator {...defaultProps} onPress={onPress} />,
      );

      const pressable = getByRole('button');
      await fireEvent.press(pressable);

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not crash when onPress is undefined', async () => {
      const propsWithoutOnPress = { ...defaultProps };
      delete propsWithoutOnPress.onPress;

      const { getByRole } = await render(
        <DateSeparator {...propsWithoutOnPress} />,
      );

      const pressable = getByRole('button');
      // Should not throw
      await fireEvent.press(pressable);
    });

    it('multiple presses call onPress multiple times', async () => {
      const onPress = jest.fn();
      const { getByRole } = await render(
        <DateSeparator {...defaultProps} onPress={onPress} />,
      );

      const pressable = getByRole('button');
      await fireEvent.press(pressable);
      await fireEvent.press(pressable);
      await fireEvent.press(pressable);

      expect(onPress).toHaveBeenCalledTimes(3);
    });
  });

  describe('Accessibility', () => {
    it('has button accessibility role', async () => {
      const { getByRole } = await render(<DateSeparator {...defaultProps} />);

      expect(getByRole('button')).toBeTruthy();
    });

    it('has accessibility label with formatted date (non-uppercased in label)', async () => {
      const { getByLabelText } = await render(<DateSeparator {...defaultProps} />);

      expect(
        getByLabelText('Formatted: 2024-01-15, press to select date'),
      ).toBeTruthy();
    });

    it('has accessibility hint for date picker', async () => {
      const { getByA11yHint } = await render(<DateSeparator {...defaultProps} />);

      expect(
        getByA11yHint('Opens date picker to jump to a specific date'),
      ).toBeTruthy();
    });

    it('accessibility label updates with different dates', async () => {
      const { getByLabelText, rerender } = await render(
        <DateSeparator {...defaultProps} date="2024-06-20" />,
      );

      expect(
        getByLabelText('Formatted: 2024-06-20, press to select date'),
      ).toBeTruthy();

      await rerender(<DateSeparator {...defaultProps} date="2024-12-25" />);

      expect(
        getByLabelText('Formatted: 2024-12-25, press to select date'),
      ).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long currency amounts', async () => {
      const spendingSums = { USD: 999999999.99 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-$999999999.99')).toBeTruthy();
    });

    it('handles zero amount', async () => {
      const spendingSums = { USD: 0 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(getByText('-$0.00')).toBeTruthy();
    });

    it('handles many currencies at once', async () => {
      const spendingSums = {
        USD: 100,
        EUR: 85,
        GBP: 70,
        JPY: 10000,
      };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      expect(
        getByText('-$100.00, -€85.00, -£70.00, -¥10000'),
      ).toBeTruthy();
    });

    it('memoizes correctly (same props)', async () => {
      const { rerender } = await render(<DateSeparator {...defaultProps} />);

      // Re-render with same props should not cause issues
      await rerender(<DateSeparator {...defaultProps} />);
    });

    it('handles date that is just a string', async () => {
      const { getByText } = await render(
        <DateSeparator {...defaultProps} date="Today" />,
      );

      expect(getByText('FORMATTED: TODAY')).toBeTruthy();
    });
  });

  describe('Decimal Digits Fallback', () => {
    it('defaults to 2 decimal digits when currency has no decimal_digits config', async () => {
      // ABC is not in our mock, so it falls back to currency code
      // and ?? 2 gives 2 decimal digits
      const spendingSums = { ABC: 123.456 };
      const { getByText } = await render(
        <DateSeparator {...defaultProps} spendingSums={spendingSums} />,
      );

      // -ABC123.46 because toFixed(2) rounds
      expect(getByText('-ABC123.46')).toBeTruthy();
    });
  });
});
