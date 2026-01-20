import React from 'react';
import { render } from '@testing-library/react-native';
import SpendingPredictionCard from '../../../app/components/graphs/SpendingPredictionCard';

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'Icon',
}));

// Mock currencies
jest.mock('../../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  EUR: { symbol: '€', decimal_digits: 2 },
  JPY: { symbol: '¥', decimal_digits: 0 },
}));

describe('SpendingPredictionCard', () => {
  const defaultColors = {
    text: '#000000',
    mutedText: '#888888',
    primary: '#4CAF50',
    border: '#CCCCCC',
    altRow: '#F5F5F5',
    expense: '#FF4444',
  };

  const defaultT = (key) => key;

  const defaultPrediction = {
    currentSpending: 500.5,
    predictedRemaining: 1200.75,
    percentElapsed: 45,
    daysElapsed: 14,
    daysInMonth: 31,
    dailyAverage: 35.75,
  };

  describe('Rendering', () => {
    it('renders null when spendingPrediction is null', () => {
      const { toJSON } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={null}
          selectedCurrency="USD"
        />,
      );
      expect(toJSON()).toBeNull();
    });

    it('renders null when spendingPrediction is undefined', () => {
      const { toJSON } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={undefined}
          selectedCurrency="USD"
        />,
      );
      expect(toJSON()).toBeNull();
    });

    it('renders prediction card with data', () => {
      const { getByText } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={defaultPrediction}
          selectedCurrency="USD"
        />,
      );

      expect(getByText('spending_prediction')).toBeTruthy();
      expect(getByText('current_spending')).toBeTruthy();
      expect(getByText('predicted_spending')).toBeTruthy();
    });

    it('displays formatted currency amounts', () => {
      const { getByText } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={defaultPrediction}
          selectedCurrency="USD"
        />,
      );

      expect(getByText('500.50 USD')).toBeTruthy();
      expect(getByText('1200.75 USD')).toBeTruthy();
      expect(getByText('35.75 USD')).toBeTruthy();
    });

    it('displays days elapsed information', () => {
      const { getByText } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={defaultPrediction}
          selectedCurrency="USD"
        />,
      );

      // Look for text containing days info
      expect(getByText(/14 \/ 31/)).toBeTruthy();
    });
  });

  describe('Currency Formatting', () => {
    it('formats JPY with 0 decimal places', () => {
      const { getByText } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={{
            ...defaultPrediction,
            currentSpending: 5000,
          }}
          selectedCurrency="JPY"
        />,
      );

      expect(getByText('5000 JPY')).toBeTruthy();
    });

    it('formats EUR with 2 decimal places', () => {
      const { getByText } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={{
            ...defaultPrediction,
            currentSpending: 100.99,
          }}
          selectedCurrency="EUR"
        />,
      );

      expect(getByText('100.99 EUR')).toBeTruthy();
    });

    it('handles unknown currency with default 2 decimal places', () => {
      const { getByText } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={{
            ...defaultPrediction,
            currentSpending: 250.5,
          }}
          selectedCurrency="XYZ"
        />,
      );

      expect(getByText('250.50 XYZ')).toBeTruthy();
    });
  });

  describe('Progress Bar', () => {
    it('caps progress at 100%', () => {
      const { UNSAFE_getAllByType } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={{
            ...defaultPrediction,
            percentElapsed: 150, // Over 100%
          }}
          selectedCurrency="USD"
        />,
      );

      // Component should still render (progress bar capped at 100%)
      // We just verify the component renders without error
      expect(UNSAFE_getAllByType('View').length).toBeGreaterThan(0);
    });

    it('handles 0% progress', () => {
      const { UNSAFE_getAllByType } = render(
        <SpendingPredictionCard
          colors={defaultColors}
          t={defaultT}
          spendingPrediction={{
            ...defaultPrediction,
            percentElapsed: 0,
          }}
          selectedCurrency="USD"
        />,
      );

      expect(UNSAFE_getAllByType('View').length).toBeGreaterThan(0);
    });
  });

  describe('Styling', () => {
    it('applies theme colors', () => {
      const customColors = {
        text: '#111111',
        mutedText: '#666666',
        primary: '#0000FF',
        border: '#AAAAAA',
        altRow: '#EEEEEE',
        expense: '#FF0000',
      };

      const { getByText } = render(
        <SpendingPredictionCard
          colors={customColors}
          t={defaultT}
          spendingPrediction={defaultPrediction}
          selectedCurrency="USD"
        />,
      );

      const title = getByText('spending_prediction');
      expect(title.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: '#111111' }),
        ]),
      );
    });

    it('uses default expense color when not provided', () => {
      const colorsWithoutExpense = {
        text: '#000000',
        mutedText: '#888888',
        primary: '#4CAF50',
        border: '#CCCCCC',
        altRow: '#F5F5F5',
        // expense not provided
      };

      const { getByText } = render(
        <SpendingPredictionCard
          colors={colorsWithoutExpense}
          t={defaultT}
          spendingPrediction={defaultPrediction}
          selectedCurrency="USD"
        />,
      );

      // Should render with default #ff4444 color
      const currentSpending = getByText('500.50 USD');
      expect(currentSpending.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ color: '#ff4444' }),
        ]),
      );
    });
  });
});
