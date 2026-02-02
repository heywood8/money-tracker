/**
 * Tests for BalanceHistoryCard component
 * Ensures balance history chart rendering, data formatting, and user interactions work correctly
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BalanceHistoryCard from '../../app/components/graphs/BalanceHistoryCard';

// Mock LineChart from react-native-chart-kit
jest.mock('react-native-chart-kit', () => ({
  LineChart: 'LineChart',
}));

// Mock SimplePicker
jest.mock('../../app/components/SimplePicker', () => 'SimplePicker');

// Mock currencies
jest.mock('../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2 },
  EUR: { decimal_digits: 2 },
  JPY: { decimal_digits: 0 },
  BTC: { decimal_digits: 8 },
}));

const mockColors = {
  primary: '#6200ee',
  text: '#000',
  mutedText: '#666',
  altRow: '#f5f5f5',
  border: '#e0e0e0',
  surface: '#fff',
};

const mockT = (key) => {
  const translations = {
    balance: 'Balance',
    actual: 'Actual',
    burndown: 'Burndown',
    forecast: 'Forecast',
    prev_month: 'Prev Month',
    no_balance_history: 'No balance history available for this month',
    plain_avg: 'Plain avg',
    max: 'Max',
    current: 'Current',
    end: 'End',
    daily_avg: 'Daily Avg',
    days_elapsed: 'Days Elapsed',
  };
  return translations[key] || key;
};

const mockAccounts = [
  { id: 'acc1', name: 'Checking', currency: 'USD', balance: '1000.00' },
  { id: 'acc2', name: 'Savings', currency: 'EUR', balance: '5000.00' },
  { id: 'acc3', name: 'Bitcoin', currency: 'BTC', balance: '0.12345678' },
];

const mockAccountItems = mockAccounts.map(acc => ({
  label: acc.name,
  value: acc.id,
}));

describe('BalanceHistoryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('renders without crashing', () => {
      const { root } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('displays balance title', () => {
      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(getByText('Balance')).toBeTruthy();
    });

    it('renders account picker with correct props', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const simplePicker = UNSAFE_getByType('SimplePicker');
      expect(simplePicker.props.value).toBe('acc1');
      expect(simplePicker.props.items).toEqual(mockAccountItems);
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when loading', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={true}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const activityIndicator = UNSAFE_getByType('ActivityIndicator');
      expect(activityIndicator).toBeTruthy();
      expect(activityIndicator.props.color).toBe(mockColors.primary);
    });

    it('does not show chart when loading', () => {
      const { UNSAFE_queryByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={true}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(UNSAFE_queryByType('LineChart')).toBeNull();
    });
  });

  describe('No Data State', () => {
    it('shows no data message when no balance history', () => {
      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(getByText('No balance history available for this month')).toBeTruthy();
    });

    it('shows no data when actual array is empty', () => {
      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [1, 2, 3],
            actual: [],
            actualForChart: [],
            burndown: [{ x: 1, y: 100 }],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(getByText('No balance history available for this month')).toBeTruthy();
    });

    it('does not show chart when no data', () => {
      const { UNSAFE_queryByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(UNSAFE_queryByType('LineChart')).toBeNull();
    });
  });

  describe('Chart Rendering with Data', () => {
    const mockBalanceHistoryData = {
      labels: [1, 5, 10, 15, 20, 25, 28],
      actual: [
        { x: 1, y: 1000 },
        { x: 5, y: 1050 },
        { x: 10, y: 980 },
        { x: 15, y: 1100 },
        { x: 20, y: 1080 },
        { x: 25, y: 1150 },
        { x: 28, y: 1200 },
      ],
      actualForChart: [1000, 1050, 980, 1100, 1080, 1150, 1200],
      burndown: [
        { x: 1, y: 1000 },
        { x: 28, y: 800 },
      ],
      prevMonth: [950, undefined, undefined, undefined, 920, undefined, undefined],
    };

    it('renders chart when data is available', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(UNSAFE_getByType('LineChart')).toBeTruthy();
    });

    it('configures chart with correct data including plain avg line', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      expect(lineChart.props.data.labels).toEqual(['1', '5', '10', '15', '20', '25', '28']);
      // Should have 3 datasets: actual + plain avg + prevMonth (no forecast when not current month)
      expect(lineChart.props.data.datasets).toHaveLength(3);
    });

    it('includes actual dataset with correct styling', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      expect(actualDataset.data).toEqual(mockBalanceHistoryData.actualForChart);
      expect(actualDataset.strokeWidth).toBe(3);
    });

    it('includes plain avg dataset as second dataset', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const plainAvgDataset = lineChart.props.data.datasets[1];
      expect(plainAvgDataset.withDots).toBe(false);
      expect(plainAvgDataset.strokeWidth).toBe(2);
      // Plain avg should be gray color
      expect(plainAvgDataset.color()).toBe('rgba(128, 128, 128, 0.4)');
    });

    it('combines actual and forecast data when isCurrentMonth with spendingPrediction', () => {
      const mockSpendingPrediction = {
        dailyAverage: 100,
        daysInMonth: 31,
        daysElapsed: 15,
        currentSpending: 1500,
        predictedTotal: 3100,
        predictedRemaining: 1600,
        percentElapsed: 48,
      };

      // Mock current date to be mid-month
      const mockDate = new Date(2024, 0, 16);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={mockSpendingPrediction}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      // Should have 3 datasets: combined actual+forecast + plain avg + prevMonth
      expect(lineChart.props.data.datasets).toHaveLength(3);

      global.Date.mockRestore();
    });

    it('includes prevMonth dataset when available', () => {
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      // Should have 3 datasets: actual + plain avg + prevMonth (no forecast)
      expect(lineChart.props.data.datasets).toHaveLength(3);
      const prevMonthDataset = lineChart.props.data.datasets[2];
      expect(prevMonthDataset.withDots).toBe(false);
    });

    it('excludes prevMonth dataset when not available', () => {
      const dataWithoutPrevMonth = {
        ...mockBalanceHistoryData,
        prevMonth: [],
      };

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithoutPrevMonth}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      // Should have 2 datasets: actual + plain avg (no prevMonth)
      expect(lineChart.props.data.datasets).toHaveLength(2);
    });

    it('excludes prevMonth dataset when all values are undefined', () => {
      const dataWithUndefinedPrevMonth = {
        ...mockBalanceHistoryData,
        prevMonth: [undefined, undefined, undefined],
      };

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithUndefinedPrevMonth}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      // Should have 2 datasets: actual + plain avg (no prevMonth since all undefined)
      expect(lineChart.props.data.datasets).toHaveLength(2);
    });

    it('accepts onChartPress prop', () => {
      const mockOnChartPress = jest.fn();
      const { root } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={mockOnChartPress}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      // Verify component renders with the onChartPress prop
      expect(root).toBeTruthy();
    });
  });

  describe('Legend Table Rendering', () => {
    const mockBalanceHistoryData = {
      labels: [1, 5, 10, 15, 20, 25, 28],
      actual: [
        { x: 1, y: 1000 },
        { x: 28, y: 1200 },
      ],
      actualForChart: [1000, 1200],
      burndown: [
        { x: 1, y: 1000 },
        { x: 28, y: 800 },
      ],
      prevMonth: [950, undefined, undefined, undefined, undefined, undefined, 920],
    };

    it('displays legend table headers', () => {
      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      expect(getByText('Max')).toBeTruthy();
      expect(getByText('Current')).toBeTruthy();
      expect(getByText('Daily Avg')).toBeTruthy();
      expect(getByText('End')).toBeTruthy();
    });

    it('displays legend row labels', () => {
      const { getByText, queryByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      expect(getByText('Actual')).toBeTruthy();
      expect(getByText('Plain avg')).toBeTruthy();
      // Forecast only shows when isCurrentMonth and spendingPrediction are provided
      expect(queryByText('Forecast')).toBeNull();
      expect(getByText('Prev Month')).toBeTruthy();
    });

    it('displays legend with combined actual+forecast when isCurrentMonth with spendingPrediction', () => {
      const mockSpendingPrediction = {
        dailyAverage: 100,
        daysInMonth: 31,
        daysElapsed: 15,
        currentSpending: 1500,
        predictedTotal: 3100,
        predictedRemaining: 1600,
        percentElapsed: 48,
      };

      // Mock current date to be mid-month
      const mockDate = new Date(2024, 0, 16);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={mockSpendingPrediction}
        />,
      );

      // Actual row now includes forecast data (combined line)
      expect(getByText('Actual')).toBeTruthy();
      expect(getByText('Plain avg')).toBeTruthy();
      // Forecast is now combined with Actual, no separate row

      global.Date.mockRestore();
    });

    it('hides prev month legend row when no prev month data', () => {
      const dataWithoutPrevMonth = {
        ...mockBalanceHistoryData,
        prevMonth: [],
      };

      const { queryByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithoutPrevMonth}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      expect(queryByText('Prev Month')).toBeNull();
    });
  });

  describe('Account Selection', () => {
    it('calls onAccountChange when account is changed', () => {
      const mockOnAccountChange = jest.fn();
      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={mockOnAccountChange}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const simplePicker = UNSAFE_getByType('SimplePicker');
      simplePicker.props.onValueChange('acc2');

      expect(mockOnAccountChange).toHaveBeenCalledWith('acc2');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined selected account gracefully', () => {
      const { root } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount={undefined}
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles empty account items array', () => {
      const { root } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={[]}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [],
            actual: [],
            actualForChart: [],
            burndown: [],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles missing account currency gracefully', () => {
      const accountsWithoutCurrency = [
        { id: 'acc1', name: 'Checking', balance: '1000.00' },
      ];

      const mockDate = new Date(2024, 0, 31);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [1],
            actual: [{ x: 1, y: 1000 }],
            actualForChart: [1000],
            burndown: [{ x: 1, y: 1000 }],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2023}
          selectedMonth={11}
          accounts={accountsWithoutCurrency}
        />,
      );

      // Should default to USD - verify legend renders
      expect(getByText('Actual')).toBeTruthy();

      global.Date.mockRestore();
    });

    it('handles current month display correctly', () => {
      const mockDate = new Date(2024, 5, 15); // June 15, 2024
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [1, 5, 10, 15, 20, 25, 30],
            actual: [
              { x: 1, y: 1000 },
              { x: 15, y: 1100 },
            ],
            actualForChart: [1000, 1100],
            burndown: [{ x: 1, y: 1000 }],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={5}
          accounts={mockAccounts}
        />,
      );

      // For current month, should display value at current day (15)
      expect(getByText('Actual')).toBeTruthy();

      global.Date.mockRestore();
    });

    it('handles large values in chart correctly', () => {
      const largeValueData = {
        labels: [1, 2],
        actual: [{ x: 1, y: 1500000 }],
        actualForChart: [1500000],
        burndown: [{ x: 1, y: 1500000 }],
        prevMonth: [],
      };

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={largeValueData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      expect(lineChart).toBeTruthy();
      // Verify formatYLabel function formats large numbers correctly
      const formattedValue = lineChart.props.formatYLabel('1500000');
      expect(formattedValue).toBe('2M'); // Should format as millions
    });
  });

  describe('Regression Tests', () => {
    it('filters undefined values from actualForChart', () => {
      const dataWithUndefined = {
        labels: [1, 2, 3],
        actual: [{ x: 1, y: 1000 }, { x: 3, y: 1200 }],
        actualForChart: [1000, undefined, 1200],
        burndown: [{ x: 1, y: 1000 }],
        prevMonth: [],
      };

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithUndefined}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      expect(actualDataset.data).toEqual([1000, 1200]); // undefined should be filtered
    });

    it('handles zero max value in scale calculation', () => {
      const zeroValueData = {
        labels: [1],
        actual: [{ x: 1, y: 0 }],
        actualForChart: [0],
        burndown: [{ x: 1, y: 0 }],
        prevMonth: [],
      };

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={zeroValueData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      expect(lineChart).toBeTruthy();
      // Should handle zero values without crashing
    });

    it('handles missing currency info gracefully', () => {
      const accountsWithUnknownCurrency = [
        { id: 'acc1', name: 'Checking', currency: 'XYZ', balance: '1000.00' },
      ];

      const mockDate = new Date(2024, 0, 31);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [1],
            actual: [{ x: 1, y: 1000 }],
            actualForChart: [1000],
            burndown: [{ x: 1, y: 1000 }],
            prevMonth: [],
          }}
          onChartPress={jest.fn()}
          selectedYear={2023}
          selectedMonth={11}
          accounts={accountsWithUnknownCurrency}
        />,
      );

      // Should default to 2 decimal places - verify legend renders
      expect(getByText('Actual')).toBeTruthy();

      global.Date.mockRestore();
    });
  });

  describe('Date-sensitive actual data rendering', () => {
    const fullMonthData = {
      labels: [1, 5, 10, 15, 20, 25, 31],
      actual: [
        { x: 1, y: 500 },
        { x: 5, y: 600 },
        { x: 10, y: 700 },
        { x: 15, y: 800 },
        { x: 20, y: 750 },
        { x: 25, y: 900 },
        { x: 31, y: 1000 },
      ],
      actualForChart: [500, 600, 700, 800, 750, 900, 1000],
      burndown: [],
      prevMonth: [],
    };

    afterEach(() => {
      if (global.Date.mockRestore) {
        global.Date.mockRestore();
      }
    });

    it('shows all actual data for a past month regardless of current date (day 2)', () => {
      const mockDate = new Date(2026, 1, 2); // Feb 2
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2025}
          selectedMonth={11}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      expect(actualDataset.data).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('shows all actual data for a past month regardless of current date (day 15)', () => {
      const mockDate = new Date(2026, 1, 15); // Feb 15
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2025}
          selectedMonth={5}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      expect(actualDataset.data).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('shows all actual data for a past month regardless of current date (day 28)', () => {
      const mockDate = new Date(2026, 1, 28); // Feb 28
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2025}
          selectedMonth={10}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      expect(actualDataset.data).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('shows only data up to current day for the current month (day 10)', () => {
      const mockDate = new Date(2024, 0, 10); // Jan 10
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      // Labels are [1, 5, 10, 15, 20, 25, 31] — days 1, 5, 10 are <= 10
      expect(actualDataset.data).toEqual([500, 600, 700]);
    });

    it('shows only first data point for current month when date is early (day 3)', () => {
      const mockDate = new Date(2024, 0, 3); // Jan 3
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      // Labels are [1, 5, 10, ...] — only day 1 is <= 3
      expect(actualDataset.data).toEqual([500]);
    });

    it('shows all data points for current month at end of month (day 31)', () => {
      const mockDate = new Date(2024, 0, 31); // Jan 31
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      // All labels [1, 5, 10, 15, 20, 25, 31] are <= 31
      expect(actualDataset.data).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('includes forecast data after current day for current month', () => {
      const mockDate = new Date(2024, 0, 16); // Jan 16
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const mockSpendingPrediction = {
        dailyAverage: 50,
        daysInMonth: 31,
        daysElapsed: 16,
        currentSpending: 800,
        predictedTotal: 1550,
        predictedRemaining: 750,
        percentElapsed: 52,
      };

      const { UNSAFE_getByType } = render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          onChartPress={jest.fn()}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={mockSpendingPrediction}
        />,
      );

      const lineChart = UNSAFE_getByType('LineChart');
      const actualDataset = lineChart.props.data.datasets[0];
      // Days 1, 5, 10, 15 are <= 16 (actual data), days 20, 25, 31 get forecast values
      // Actual: [500, 600, 700, 800] + forecast for days 20, 25, 31
      expect(actualDataset.data.length).toBeGreaterThan(4);
      // First 4 values should be the actual data
      expect(actualDataset.data.slice(0, 4)).toEqual([500, 600, 700, 800]);
    });
  });
});
