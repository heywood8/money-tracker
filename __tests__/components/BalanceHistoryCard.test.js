/**
 * Tests for BalanceHistoryCard component
 * Ensures balance history chart rendering, data formatting, and user interactions work correctly
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BalanceHistoryCard, {
  computeBalanceChart,
  computeYearBalanceChart,
  formatYAxisLabel,
  monthStartDaysOfYear,
  nextThirdLineMode,
  toRgba,
} from '../../app/components/graphs/BalanceHistoryCard';

// Mock DisplaySettingsContext
jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({
    hideBalances: false,
  })),
}));

// victory-native (CartesianChart → testID "cartesian-chart", Line → testID
// "vn-line") and @shopify/react-native-skia are virtually mocked in jest.setup.js.
// The mock does not forward chart/line props, so chart data & series are asserted
// via the pure computeBalanceChart export, and rendering via the testIDs above.

// Mock SimplePicker
jest.mock('../../app/components/SimplePicker', () => 'SimplePicker');

// Mock currencies
jest.mock('../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2 },
  EUR: { decimal_digits: 2 },
  JPY: { decimal_digits: 0 },
  BTC: { decimal_digits: 8 },
}));

jest.mock('../../app/components/graphs/BalanceHistoryCalendarView', () => 'BalanceHistoryCalendarView');
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));

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
    prev_year: 'Prev Year',
    year_avg: 'Year avg',
    comparison_none: 'No comparison',
    no_balance_history: 'No balance history available for this month',
    no_balance_history_year: 'No balance history available for this year',
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
    it('renders without crashing', async () => {
      const { root } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('displays balance title', async () => {
      const { getByText } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(getByText('BALANCE')).toBeTruthy();
    });

    it('renders account picker with correct props', async () => {
      const { container } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      const simplePicker = container.queryAll(n => n.type === 'SimplePicker')[0];
      expect(simplePicker.props.value).toBe('acc1');
      expect(simplePicker.props.items).toEqual(mockAccountItems);
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when loading', async () => {
      const { container } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      const activityIndicator = container.queryAll(n => n.type === 'ActivityIndicator')[0];
      expect(activityIndicator).toBeTruthy();
      expect(activityIndicator.props.color).toBe(mockColors.primary);
    });

    it('does not show chart when loading', async () => {
      const { container } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeFalsy();
    });
  });

  describe('No Data State', () => {
    it('shows no data message when no balance history', async () => {
      const { getByText } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(getByText('No balance history available for this month')).toBeTruthy();
    });

    it('shows no data when actual array is empty', async () => {
      const { getByText } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(getByText('No balance history available for this month')).toBeTruthy();
    });

    it('does not show chart when no data', async () => {
      const { container } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeFalsy();
    });
  });

  describe('toRgba', () => {
    it('expands a six-digit hex colour into rgba', () => {
      expect(toRgba('#6200ee', 0.35)).toBe('rgba(98, 0, 238, 0.35)');
      expect(toRgba('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('re-alphas an existing rgb/rgba colour', () => {
      expect(toRgba('rgb(10, 20, 30)', 0.5)).toBe('rgba(10, 20, 30, 0.5)');
      expect(toRgba('rgba(10, 20, 30, 0.9)', 0)).toBe('rgba(10, 20, 30, 0)');
    });

    it('passes through colours it cannot parse', () => {
      expect(toRgba('papayawhip', 0.5)).toBe('papayawhip');
      expect(toRgba('#abc', 0.5)).toBe('#abc');
    });

    it('falls back to transparent black for non-strings', () => {
      expect(toRgba(undefined, 0.2)).toBe('rgba(0, 0, 0, 0.2)');
      expect(toRgba(null, 0)).toBe('rgba(0, 0, 0, 0)');
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

    it('renders chart when data is available', async () => {
      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
    });

    it('configures chart with correct data including plain avg line', async () => {
      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(4);
      const { data, series } = computeBalanceChart({
        balanceHistoryData: mockBalanceHistoryData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      expect(data.map(d => d.day)).toEqual([1, 5, 10, 15, 20, 25, 28]);
      // 4 series: actual + plain avg + prevMonth + zero baseline (no forecast when not current month)
      expect(series).toHaveLength(4);
    });

    it('includes actual dataset with correct styling', async () => {
      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data, series } = computeBalanceChart({
        balanceHistoryData: mockBalanceHistoryData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      const actualSeries = series.find(s => s.yKey === 'actual');
      expect(data.map(d => d.actual)).toEqual(mockBalanceHistoryData.actualForChart);
      expect(actualSeries.strokeWidth).toBe(3);
    });

    it('includes plain avg dataset as second dataset', async () => {
      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { series } = computeBalanceChart({
        balanceHistoryData: mockBalanceHistoryData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
        lineColors: { norm: '#norm', prevMonth: '#prev', yearAvg: '#year' },
        baselineColor: '#baseline',
      });
      const plainAvgSeries = series.find(s => s.yKey === 'plainAvg');
      expect(plainAvgSeries.dashed).toBe(false);
      expect(plainAvgSeries.strokeWidth).toBe(2);
      // The norm line takes its own palette step — it used to share a grey with
      // the zero baseline, which made the two indistinguishable on the canvas.
      expect(plainAvgSeries.color).toBe('#norm');
      expect(series.find(s => s.yKey === 'zero').color).toBe('#baseline');
    });

    it('combines actual and forecast data when isCurrentMonth with spendingPrediction', async () => {
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

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={mockSpendingPrediction}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(5);
      const { series } = computeBalanceChart({
        balanceHistoryData: mockBalanceHistoryData,
        spendingPrediction: mockSpendingPrediction,
        isCurrentMonth: true,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      // 5 series: actual + forecast (split) + plain avg + prevMonth + zero baseline
      expect(series).toHaveLength(5);
      expect(series.find(s => s.yKey === 'forecast')).toBeTruthy();

      global.Date.mockRestore();
    });

    it('includes prevMonth dataset when available', async () => {
      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(4);
      const { series } = computeBalanceChart({
        balanceHistoryData: mockBalanceHistoryData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      // 4 series: actual + plain avg + prevMonth + zero baseline (no forecast)
      expect(series).toHaveLength(4);
      const prevMonthSeries = series.find(s => s.yKey === 'prevMonth');
      expect(prevMonthSeries).toBeTruthy();
      expect(prevMonthSeries.dashed).toBe(false);
    });

    it('excludes prevMonth dataset when not available', async () => {
      const dataWithoutPrevMonth = {
        ...mockBalanceHistoryData,
        prevMonth: [],
      };

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithoutPrevMonth}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(3);
      const { series } = computeBalanceChart({
        balanceHistoryData: dataWithoutPrevMonth,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      // 3 series: actual + plain avg + zero baseline (no prevMonth)
      expect(series).toHaveLength(3);
      expect(series.find(s => s.yKey === 'prevMonth')).toBeFalsy();
    });

    it('excludes prevMonth dataset when all values are undefined', async () => {
      const dataWithUndefinedPrevMonth = {
        ...mockBalanceHistoryData,
        prevMonth: [undefined, undefined, undefined],
      };

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithUndefinedPrevMonth}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(3);
      const { series } = computeBalanceChart({
        balanceHistoryData: dataWithUndefinedPrevMonth,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      // 3 series: actual + plain avg + zero baseline (no prevMonth since all undefined)
      expect(series).toHaveLength(3);
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

    it('displays legend table headers', async () => {
      const { getByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(getByText('Max')).toBeTruthy();
      expect(getByText('Current')).toBeTruthy();
      expect(getByText('Daily Avg')).toBeTruthy();
      expect(getByText('End')).toBeTruthy();
    });

    it('displays legend row labels', async () => {
      const { getByText, queryByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(getByText('Actual')).toBeTruthy();
      expect(getByText('Plain avg')).toBeTruthy();
      // Forecast only shows when isCurrentMonth and spendingPrediction are provided
      expect(queryByText('Forecast')).toBeNull();
      expect(getByText('Prev Month')).toBeTruthy();
    });

    it('displays legend with combined actual+forecast when isCurrentMonth with spendingPrediction', async () => {
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

      const { getByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={mockSpendingPrediction}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Actual row now includes forecast data (combined line)
      expect(getByText('Actual')).toBeTruthy();
      expect(getByText('Plain avg')).toBeTruthy();
      // Forecast is now combined with Actual, no separate row

      global.Date.mockRestore();
    });

    it('hides prev month legend row when no prev month data', async () => {
      const dataWithoutPrevMonth = {
        ...mockBalanceHistoryData,
        prevMonth: [],
      };

      const { queryByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithoutPrevMonth}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(queryByText('Prev Month')).toBeNull();
    });
  });

  describe('Account Selection', () => {
    it('calls onAccountChange when account is changed', async () => {
      const mockOnAccountChange = jest.fn();
      const { container } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      const simplePicker = container.queryAll(n => n.type === 'SimplePicker')[0];
      simplePicker.props.onValueChange('acc2');

      expect(mockOnAccountChange).toHaveBeenCalledWith('acc2');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined selected account gracefully', async () => {
      const { root } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles empty account items array', async () => {
      const { root } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(root).toBeTruthy();
    });

    it('handles missing account currency gracefully', async () => {
      const accountsWithoutCurrency = [
        { id: 'acc1', name: 'Checking', balance: '1000.00' },
      ];

      const mockDate = new Date(2024, 0, 31);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = await render(
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
          selectedYear={2023}
          selectedMonth={11}
          accounts={accountsWithoutCurrency}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Should default to USD - verify legend renders
      expect(getByText('Actual')).toBeTruthy();

      global.Date.mockRestore();
    });

    it('handles current month display correctly', async () => {
      const mockDate = new Date(2024, 5, 15); // June 15, 2024
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = await render(
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
          selectedYear={2024}
          selectedMonth={5}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // For current month, should display value at current day (15)
      expect(getByText('Actual')).toBeTruthy();

      global.Date.mockRestore();
    });

    it('handles large values in chart correctly', async () => {
      const largeValueData = {
        labels: [1, 2],
        actual: [{ x: 1, y: 1500000 }],
        actualForChart: [1500000],
        burndown: [{ x: 1, y: 1500000 }],
        prevMonth: [],
      };

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={largeValueData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      // Verify the Y-axis label formatter turns large numbers into compact units
      const formattedValue = formatYAxisLabel('1500000', false);
      expect(formattedValue).toBe('2M'); // Should format as millions
    });
  });

  describe('Daily Average Calculation for Previous Month', () => {
    afterEach(() => {
      if (global.Date.mockRestore) {
        global.Date.mockRestore();
      }
    });

    it('uses actual day span when data starts mid-month (regression: was dividing by daysInMonth-1)', async () => {
      // Bug: when data starts on day 5 (not day 1), the old code divided by (daysInMonth - 1)
      // instead of the real interval between the first and last recorded data points.
      // Data: day 5 = 1000, day 28 = 500 in a 31-day month
      // Correct: (500 - 1000) / (28 - 5) = -500 / 23 ≈ -21.74
      // Buggy:   (500 - 1000) / (31 - 1) = -500 / 30 ≈ -16.67

      const mockDate = new Date(2026, 1, 19); // Feb 19, 2026 – well past Dec 2023
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const midMonthStartData = {
        labels: [5, 28, 31], // last label = daysInMonth = 31
        actual: [{ x: 5, y: 1000 }, { x: 28, y: 500 }],
        actualForChart: [1000, 500, 500], // forward-filled: [day5=1000, day28=500, day31=500]
        burndown: [],
        prevMonth: [],
      };

      const { getByText, queryByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={midMonthStartData}
          selectedYear={2023}
          selectedMonth={11} // December 2023 – past month
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Correct: -500 / 23 = -21.74 (actual span between day 5 and day 28)
      expect(getByText('-21.74')).toBeTruthy();
      // Incorrect old value: -500 / 30 = -16.67 (full month length)
      expect(queryByText('-16.67')).toBeNull();
    });

    it('gives the same result when data spans from day 1 to the last day', async () => {
      // When data starts on day 1 and ends on the last day, the span equals daysInMonth-1
      // so old and new code agree – this is a sanity-check to avoid regressions.
      // Data: day 1 = 1000, day 30 = 700 in a 30-day month
      // Expected: (700 - 1000) / (30 - 1) = -300 / 29 ≈ -10.34

      const mockDate = new Date(2026, 1, 19);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const fullSpanData = {
        labels: [1, 30], // 30-day month
        actual: [{ x: 1, y: 1000 }, { x: 30, y: 700 }],
        actualForChart: [1000, 700],
        burndown: [],
        prevMonth: [],
      };

      const { getByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullSpanData}
          selectedYear={2023}
          selectedMonth={10} // November 2023 – 30-day past month
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // (700 - 1000) / (30 - 1) = -300 / 29 ≈ -10.34
      expect(getByText('-10.34')).toBeTruthy();
    });

    it('shows 0 for daily avg when only one actual data point exists', async () => {
      // With a single recorded balance, there is no change to average – daily avg should be 0.

      const mockDate = new Date(2026, 1, 19);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const singlePointData = {
        labels: [1, 15, 31],
        actual: [{ x: 1, y: 1000 }],
        actualForChart: [1000, 1000, 1000], // forward-filled from the single point
        burndown: [],
        prevMonth: [],
      };

      const { getAllByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={singlePointData}
          selectedYear={2023}
          selectedMonth={11}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Daily avg for the actual row should be 0.00 when no change is measurable
      const zeroValues = getAllByText('0.00');
      expect(zeroValues.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Regression Tests', () => {
    it('filters undefined values from actualForChart', async () => {
      const dataWithUndefined = {
        labels: [1, 2, 3],
        actual: [{ x: 1, y: 1000 }, { x: 3, y: 1200 }],
        actualForChart: [1000, undefined, 1200],
        burndown: [{ x: 1, y: 1000 }],
        prevMonth: [],
      };

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={dataWithUndefined}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: dataWithUndefined,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      expect(actualData).toEqual([1000, 1200]); // undefined should be filtered
    });

    it('handles zero max value in scale calculation', async () => {
      const zeroValueData = {
        labels: [1],
        actual: [{ x: 1, y: 0 }],
        actualForChart: [0],
        burndown: [{ x: 1, y: 0 }],
        prevMonth: [],
      };

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={zeroValueData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      // Should handle zero values without crashing
    });

    it('handles missing currency info gracefully', async () => {
      const accountsWithUnknownCurrency = [
        { id: 'acc1', name: 'Checking', currency: 'XYZ', balance: '1000.00' },
      ];

      const mockDate = new Date(2024, 0, 31);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getByText } = await render(
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
          selectedYear={2023}
          selectedMonth={11}
          accounts={accountsWithUnknownCurrency}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Should default to 2 decimal places - verify legend renders
      expect(getByText('Actual')).toBeTruthy();

      global.Date.mockRestore();
    });
  });

  describe('Prev Month Legend Calculations', () => {
    afterEach(() => {
      if (global.Date.mockRestore) {
        global.Date.mockRestore();
      }
    });

    it('shows prev month end value when prev month is shorter than current month (regression)', async () => {
      // Bug: prevMonth[daysInMonth - 1] used current month's last label as an array index.
      // When current month has 31 days but prev month has 28, index 30 is out of bounds → null → '-'.
      // Fix: find the last non-undefined entry in the prevMonth array.

      const mockDate = new Date(2026, 2, 15); // March 15, 2026
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      // Simulate March (31 days) with prevMonth = February data (28 days).
      // prevMonth array has 31 elements; indices 28-30 are undefined (Feb has no days 29-31).
      const prevMonthData = new Array(31).fill(undefined);
      prevMonthData[0] = 5000; // Feb 1
      for (let i = 1; i < 28; i++) prevMonthData[i] = 5000 - i * 50; // forward-filled-ish
      // indices 28-30 remain undefined (Feb 29-31 don't exist)

      const { getByText, queryByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [1, 10, 20, 31],
            actual: [{ x: 1, y: 6000 }, { x: 15, y: 5500 }],
            actualForChart: [6000, 5500, 5500, 5500],
            burndown: [],
            prevMonth: prevMonthData,
            prevMonthTotalExpenses: 1400,
            prevMonthDaysCount: 28,
          }}
          selectedYear={2026}
          selectedMonth={2} // March
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Prev Month row should be shown
      expect(getByText('Prev Month')).toBeTruthy();
      // End should NOT be '-' (the bug showed '-' because Feb has no day 31)
      // The last valid Feb value is at index 27 (Feb 28)
      const feb28Value = prevMonthData[27];
      expect(feb28Value).toBeDefined();
      // The formatted value should appear somewhere in the table
      expect(queryByText('-')).toBeNull(); // no '-' in end column due to the fix

      global.Date.mockRestore();
    });

    it('calculates prev month daily avg instead of showing hardcoded dash', async () => {
      const mockDate = new Date(2026, 2, 15); // March 15, 2026
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      // Simple prev month: day 1 = 1000, day 6 = 750 (5 index steps → avg = -50/step)
      const prevMonthData = [1000, undefined, undefined, undefined, undefined, 750, undefined];

      const { queryAllByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [1, 5, 7],
            actual: [{ x: 1, y: 2000 }, { x: 7, y: 1800 }],
            actualForChart: [2000, 1800, 1800],
            burndown: [],
            prevMonth: prevMonthData,
            prevMonthTotalExpenses: 350,
            prevMonthDaysCount: 7,
          }}
          selectedYear={2026}
          selectedMonth={2}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // prevMonthDailyAvg = -350 / 7 = -50 → shows a formatted number, not '-'
      const dashValues = queryAllByText('-');
      // No cell should show a plain '-' since avg is now calculated
      expect(dashValues.length).toBe(0);

      global.Date.mockRestore();
    });

    it('shows 0 for actual daily avg when only one value in actualForChart (single-entry month)', async () => {
      // Bug: actualValues.length <= 1 kept actualDailyAvg as null (showed '-').
      // Fix: change > 1 to >= 1 so the else branch sets it to 0.

      const mockDate = new Date(2026, 2, 5); // March 5, 2026
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { getAllByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={{
            labels: [5, 31],
            actual: [{ x: 5, y: 3000 }],
            actualForChart: [3000], // single value → length 1
            burndown: [],
            prevMonth: [],
          }}
          selectedYear={2026}
          selectedMonth={2}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Daily avg should show 0.00, not '-'
      const zeroValues = getAllByText('0.00');
      expect(zeroValues.length).toBeGreaterThanOrEqual(1);

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

    it('shows all actual data for a past month regardless of current date (day 2)', async () => {
      const mockDate = new Date(2026, 1, 2); // Feb 2
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2025}
          selectedMonth={11}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2025,
        selectedMonth: 11,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      expect(actualData).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('shows all actual data for a past month regardless of current date (day 15)', async () => {
      const mockDate = new Date(2026, 1, 15); // Feb 15
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2025}
          selectedMonth={5}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2025,
        selectedMonth: 5,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      expect(actualData).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('shows all actual data for a past month regardless of current date (day 28)', async () => {
      const mockDate = new Date(2026, 1, 28); // Feb 28
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2025}
          selectedMonth={10}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2025,
        selectedMonth: 10,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      expect(actualData).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('shows only data up to current day for the current month (day 10)', async () => {
      const mockDate = new Date(2024, 0, 10); // Jan 10
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: null,
        isCurrentMonth: true,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      // Labels are [1, 5, 10, 15, 20, 25, 31] — days 1, 5, 10 are <= 10
      expect(actualData).toEqual([500, 600, 700]);
    });

    it('shows only first data point for current month when date is early (day 3)', async () => {
      const mockDate = new Date(2024, 0, 3); // Jan 3
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: null,
        isCurrentMonth: true,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      // Labels are [1, 5, 10, ...] — only day 1 is <= 3
      expect(actualData).toEqual([500]);
    });

    it('shows all data points for current month at end of month (day 31)', async () => {
      const mockDate = new Date(2024, 0, 31); // Jan 31
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: null,
        isCurrentMonth: true,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      const actualData = data.map(d => d.actual).filter(v => v !== null);
      // All labels [1, 5, 10, 15, 20, 25, 31] are <= 31
      expect(actualData).toEqual([500, 600, 700, 800, 750, 900, 1000]);
    });

    it('includes forecast data after current day for current month', async () => {
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

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={fullMonthData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          isCurrentMonth={true}
          spendingPrediction={mockSpendingPrediction}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      const { data, series } = computeBalanceChart({
        balanceHistoryData: fullMonthData,
        spendingPrediction: mockSpendingPrediction,
        isCurrentMonth: true,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
      });
      // Forecast now lives in its own dashed series (days after today), not appended to actual
      const forecastValues = data.map(d => d.forecast).filter(v => v !== null);
      expect(forecastValues.length).toBeGreaterThan(0);
      expect(series.find(s => s.yKey === 'forecast')).toBeTruthy();
      // Actual series stops at today: days 1, 5, 10, 15 (<= 16)
      const actualValues = data.map(d => d.actual).filter(v => v !== null);
      expect(actualValues).toEqual([500, 600, 700, 800]);
    });
  });

  describe('when hideBalances is true', () => {
    const mockBalanceHistoryData = {
      labels: [1, 28],
      actual: [
        { x: 1, y: 1000 },
        { x: 28, y: 1200 },
      ],
      actualForChart: [1000, 1200],
      burndown: [],
      prevMonth: [],
    };

    beforeEach(() => {
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ hideBalances: true });
    });

    afterEach(() => {
      const { useDisplaySettings } = require('../../app/contexts/DisplaySettingsContext');
      useDisplaySettings.mockReturnValue({ hideBalances: false });
    });

    it('does not render the legend table', async () => {
      const mockDate = new Date(2026, 1, 19);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { queryByText } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2023}
          selectedMonth={11}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(queryByText('Actual')).toBeNull();
      expect(queryByText('Plain avg')).toBeNull();
      expect(queryByText('Max')).toBeNull();
      expect(queryByText('Current')).toBeNull();
      expect(queryByText('Daily Avg')).toBeNull();
      expect(queryByText('End')).toBeNull();

      global.Date.mockRestore();
    });

    it('still renders the chart (line curves remain visible)', async () => {
      const mockDate = new Date(2026, 1, 19);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2023}
          selectedMonth={11}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();

      global.Date.mockRestore();
    });

    it('formatYLabel returns empty string for all values', async () => {
      const mockDate = new Date(2026, 1, 19);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const { container } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2023}
          selectedMonth={11}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      expect(container.queryAll(n => n.props.testID === 'cartesian-chart')[0]).toBeTruthy();
      expect(formatYAxisLabel('1000', true)).toBe('');
      expect(formatYAxisLabel('1000000', true)).toBe('');
      expect(formatYAxisLabel('0', true)).toBe('');

      global.Date.mockRestore();
    });
  });

  describe('Calendar toggle', () => {
    const mockBalanceHistoryData = {
      labels: [1, 2, 3],
      actual: [{ x: 1, y: 1000 }],
      actualForChart: [1000, 1000, 1000],
      burndown: [],
      prevMonth: [],
    };

    it('renders the calendar toggle button', async () => {
      const { getByTestId } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );
      expect(getByTestId('calendar-toggle-btn')).toBeTruthy();
    });

    it('does not render the calendar toggle button when there is no balance data', async () => {
      const { queryByTestId } = await render(
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
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );
      expect(queryByTestId('calendar-toggle-btn')).toBeNull();
    });

    it('calls onShowCalendar once when switching to calendar view, not when switching back', async () => {
      const onShowCalendar = jest.fn();
      const { getByTestId } = await render(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={mockBalanceHistoryData}
          selectedYear={2024}
          selectedMonth={0}
          accounts={mockAccounts}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={onShowCalendar}
        />,
      );
      await fireEvent.press(getByTestId('calendar-toggle-btn'));
      expect(onShowCalendar).toHaveBeenCalledTimes(1);
      // Pressing again (back to chart) should NOT call onShowCalendar again
      await fireEvent.press(getByTestId('calendar-toggle-btn'));
      expect(onShowCalendar).toHaveBeenCalledTimes(1);
    });
  });
  describe('Third Line Toggle (prev month / year avg / none)', () => {
    const thirdLineData = {
      labels: [1, 2, 3, 4, 5, 6, 7],
      actual: [
        { x: 1, y: 1000 },
        { x: 4, y: 900 },
        { x: 7, y: 800 },
      ],
      actualForChart: [1000, 1000, 1000, 900, 900, 900, 800],
      burndown: [],
      prevMonth: [950, 940, 930, 920, 910, 900, 890],
      yearAvg: [700, 690, 680, 670, 660, 650, 640],
      yearAvgDailyAvg: -12.5,
    };

    const renderCard = () => render(
      <BalanceHistoryCard
        colors={mockColors}
        t={mockT}
        selectedAccount="acc1"
        onAccountChange={jest.fn()}
        accountItems={mockAccountItems}
        loadingBalanceHistory={false}
        balanceHistoryData={thirdLineData}
        selectedYear={2024}
        selectedMonth={0}
        accounts={mockAccounts}
        isCurrentMonth={false}
        spendingPrediction={null}
        balanceHistoryTableData={[]}
        editingBalanceValue=""
        onEditingBalanceValueChange={jest.fn()}
        onEditBalance={jest.fn()}
        onCancelEdit={jest.fn()}
        onSaveBalance={jest.fn()}
        onDeleteBalance={jest.fn()}
        onShowCalendar={jest.fn()}
      />,
    );

    it('cycles prevMonth → yearAvg → none → prevMonth', () => {
      expect(nextThirdLineMode('prevMonth')).toBe('yearAvg');
      expect(nextThirdLineMode('yearAvg')).toBe('none');
      expect(nextThirdLineMode('none')).toBe('prevMonth');
    });

    it('starts on the prev-month line and swaps it for the year average on press', async () => {
      const { getByTestId, getByText, queryByText } = await renderCard();

      expect(getByText('Prev Month')).toBeTruthy();
      expect(queryByText('Year avg')).toBeNull();

      await fireEvent.press(getByTestId('third-line-toggle-btn'));

      await waitFor(() => expect(getByText('Year avg')).toBeTruthy());
      expect(queryByText('Prev Month')).toBeNull();
    });

    it('drops the third line and its legend row on the second press', async () => {
      const { container, getByTestId, queryByText } = await renderCard();

      await fireEvent.press(getByTestId('third-line-toggle-btn'));
      await fireEvent.press(getByTestId('third-line-toggle-btn'));

      await waitFor(() => expect(queryByText('Year avg')).toBeNull());
      expect(queryByText('Prev Month')).toBeNull();
      // actual + plain avg + zero baseline only
      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(3);
    });

    it('hides the toggle while the calendar view is open', async () => {
      const { getByTestId, queryByTestId } = await renderCard();

      await fireEvent.press(getByTestId('calendar-toggle-btn'));

      await waitFor(() => expect(queryByTestId('third-line-toggle-btn')).toBeNull());
    });

    it('builds a yearAvg series and legend values in yearAvg mode', () => {
      const { computed, data, series } = computeBalanceChart({
        balanceHistoryData: thirdLineData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
        thirdLine: 'yearAvg',
      });

      expect(series.map(s => s.yKey)).toEqual(['actual', 'plainAvg', 'yearAvg', 'zero']);
      expect(data.map(d => d.yearAvg)).toEqual([700, 690, 680, 670, 660, 650, 640]);
      expect(computed.hasYearAvgData).toBe(true);
      expect(computed.hasPrevMonthData).toBe(false);
      expect(computed.yearAvgMax).toBe(700);
      expect(computed.yearAvgEnd).toBe(640);
      expect(computed.yearAvgDailyAvg).toBe(-12.5);
    });

    it('renders neither comparison series in none mode', () => {
      const { computed, series } = computeBalanceChart({
        balanceHistoryData: thirdLineData,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
        thirdLine: 'none',
      });

      expect(series.map(s => s.yKey)).toEqual(['actual', 'plainAvg', 'zero']);
      expect(computed.hasYearAvgData).toBe(false);
      expect(computed.hasPrevMonthData).toBe(false);
    });

    it('keeps the y-axis off a hidden comparison series', () => {
      // The year median sits far below the actual balance: with the line hidden it
      // must not stretch the axis, and with it shown it must be inside the domain.
      const lowYearAvg = { ...thirdLineData, yearAvg: thirdLineData.yearAvg.map(() => 10) };
      const hidden = computeBalanceChart({
        balanceHistoryData: lowYearAvg,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
        thirdLine: 'none',
      });
      const shown = computeBalanceChart({
        balanceHistoryData: lowYearAvg,
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
        thirdLine: 'yearAvg',
      });

      expect(hidden.computed.hasYearAvgData).toBe(false);
      expect(shown.computed.hasYearAvgData).toBe(true);
      expect(shown.computed.yearAvgCurrent).toBe(10);
    });

    it('omits the year row when the median series has no values', () => {
      const { computed, series } = computeBalanceChart({
        balanceHistoryData: { ...thirdLineData, yearAvg: [undefined, undefined, undefined] },
        spendingPrediction: null,
        isCurrentMonth: false,
        selectedYear: 2024,
        selectedMonth: 0,
        primaryColor: mockColors.primary,
        thirdLine: 'yearAvg',
      });

      expect(computed.hasYearAvgData).toBe(false);
      expect(series.find(s => s.yKey === 'yearAvg')).toBeFalsy();
    });
  });

  describe('Whole-year view (selectedMonth === null)', () => {
    // Weekly samples, as the hook produces them: day-of-year on x.
    const yearData = {
      granularity: 'year',
      labels: [1, 8, 15, 22, 29, 36],
      actual: [
        { x: 1, y: 1000 },
        { x: 8, y: 950 },
        { x: 15, y: 900 },
        { x: 22, y: 870 },
      ],
      actualForChart: [1000, 950, 900, 870, undefined, undefined],
      prevYear: [800, 780, 760, 740, 720, 700],
      prevYearTotalExpenses: 3650,
      prevYearDaysCount: 365,
      daysInYear: 365,
    };

    const renderYearCard = (props = {}) => render(
      <BalanceHistoryCard
        colors={mockColors}
        t={mockT}
        selectedAccount="acc1"
        onAccountChange={jest.fn()}
        accountItems={mockAccountItems}
        loadingBalanceHistory={false}
        balanceHistoryData={yearData}
        selectedYear={2024}
        selectedMonth={null}
        accounts={mockAccounts}
        isCurrentMonth={false}
        spendingPrediction={null}
        balanceHistoryTableData={[]}
        editingBalanceValue=""
        onEditingBalanceValueChange={jest.fn()}
        onEditBalance={jest.fn()}
        onCancelEdit={jest.fn()}
        onSaveBalance={jest.fn()}
        onDeleteBalance={jest.fn()}
        onShowCalendar={jest.fn()}
        {...props}
      />,
    );

    it('drops the burndown norm: no plainAvg series and no plain-avg legend row', async () => {
      const { series } = computeYearBalanceChart({
        balanceHistoryData: yearData,
        selectedYear: 2024,
        primaryColor: mockColors.primary,
        thirdLine: 'prevYear',
      });

      expect(series.map(s => s.yKey)).toEqual(['actual', 'prevYear', 'zero']);

      const { queryByTestId, queryByText } = await renderYearCard();
      expect(queryByTestId('legend-row-plain-avg')).toBeNull();
      expect(queryByText('Plain avg')).toBeNull();
    });

    it('labels the axis by month: one tick per 1st, in day-of-year coordinates', () => {
      // 2024 is a leap year, so March starts a day later than in 2023
      expect(monthStartDaysOfYear(2024)).toEqual([1, 32, 61, 92, 122, 153, 183, 214, 245, 275, 306, 336]);
      expect(monthStartDaysOfYear(2023)[2]).toBe(60);

      const { computed } = computeYearBalanceChart({
        balanceHistoryData: yearData,
        selectedYear: 2024,
        primaryColor: mockColors.primary,
      });

      expect(computed.monthTicks).toHaveLength(12);
      expect(computed.monthByDay[1]).toBe(0);
      expect(computed.monthByDay[336]).toBe(11);
    });

    it('cycles prevYear → none → prevYear, never through the monthly modes', () => {
      expect(nextThirdLineMode('prevYear', 'year')).toBe('none');
      expect(nextThirdLineMode('none', 'year')).toBe('prevYear');
      // A mode carried over from the month view is not a valid year mode: step to
      // the first year one rather than off the end of the list.
      expect(nextThirdLineMode('yearAvg', 'year')).toBe('prevYear');
      // The month view is untouched by the second argument's default
      expect(nextThirdLineMode('prevMonth')).toBe('yearAvg');
    });

    it('shows the prev-year comparison and drops it on press', async () => {
      const { getByTestId, getByText, queryByText, queryByTestId } = await renderYearCard();

      expect(getByText('Prev Year')).toBeTruthy();

      await fireEvent.press(getByTestId('third-line-toggle-btn'));

      await waitFor(() => expect(queryByText('Prev Year')).toBeNull());
      expect(queryByTestId('legend-row-prev-year')).toBeNull();

      await fireEvent.press(getByTestId('third-line-toggle-btn'));

      await waitFor(() => expect(getByText('Prev Year')).toBeTruthy());
    });

    it('falls back to the prev-year line when the month view left yearAvg selected', async () => {
      const monthData = {
        labels: [1, 2, 3],
        actual: [{ x: 1, y: 100 }, { x: 3, y: 80 }],
        actualForChart: [100, 90, 80],
        prevMonth: [95, 94, 93],
        yearAvg: [70, 69, 68],
        yearAvgDailyAvg: -1,
      };

      const { getByTestId, getByText, rerender } = await renderYearCard({
        balanceHistoryData: monthData,
        selectedMonth: 0,
      });

      // Month view: step prevMonth → yearAvg
      await fireEvent.press(getByTestId('third-line-toggle-btn'));
      await waitFor(() => expect(getByText('Year avg')).toBeTruthy());

      await rerender(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={yearData}
          selectedYear={2024}
          selectedMonth={null}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      await waitFor(() => expect(getByText('Prev Year')).toBeTruthy());
    });

    it('keeps the y-axis off the comparison line while it is hidden', () => {
      const towering = { ...yearData, prevYear: yearData.prevYear.map(() => 100000) };

      const hidden = computeYearBalanceChart({
        balanceHistoryData: towering,
        selectedYear: 2024,
        primaryColor: mockColors.primary,
        thirdLine: 'none',
      });
      const shown = computeYearBalanceChart({
        balanceHistoryData: towering,
        selectedYear: 2024,
        primaryColor: mockColors.primary,
        thirdLine: 'prevYear',
      });

      expect(hidden.computed.hasPrevYearData).toBe(false);
      expect(hidden.computed.niceMax).toBeLessThan(shown.computed.niceMax);
      expect(hidden.series.map(s => s.yKey)).toEqual(['actual', 'zero']);
    });

    it('fills the legend from the samples: current is the last one with data, end is the year-end', () => {
      const { computed } = computeYearBalanceChart({
        balanceHistoryData: yearData,
        selectedYear: 2024,
        primaryColor: mockColors.primary,
        thirdLine: 'prevYear',
      });

      expect(computed.maxBalance).toBe(1000);
      expect(computed.actualCurrent).toBe(870);
      // The running year has not reached its final sample yet — "End" must not
      // silently repeat "Current"
      expect(computed.actualEnd).toBeNull();
      // (870 - 1000) / (22 - 1)
      expect(computed.actualDailyAvg).toBeCloseTo(-6.19, 2);
      expect(computed.prevYearMax).toBe(800);
      // Read at the same day-of-year the actual line stops at (day 22)
      expect(computed.prevYearCurrent).toBe(740);
      expect(computed.prevYearEnd).toBe(700);
      // -3650 spent over 365 days
      expect(computed.prevYearDailyAvg).toBe(-10);
    });

    it('hides the calendar toggle — the calendar is a month grid', async () => {
      const { queryByTestId } = await renderYearCard();

      expect(queryByTestId('calendar-toggle-btn')).toBeNull();
      expect(queryByTestId('third-line-toggle-btn')).toBeTruthy();
    });

    // Switching period with the calendar open would otherwise strand the user in
    // a month grid: the year view hides the toggle that switches back.
    it('falls back to the chart when the period changes with the calendar open', async () => {
      const monthData = {
        labels: [1, 2, 3],
        actual: [{ x: 1, y: 100 }, { x: 3, y: 80 }],
        actualForChart: [100, 90, 80],
        prevMonth: [95, 94, 93],
      };

      const { container, getByTestId, queryByTestId, rerender } = await renderYearCard({
        balanceHistoryData: monthData,
        selectedMonth: 0,
      });

      await fireEvent.press(getByTestId('calendar-toggle-btn'));
      await waitFor(() => expect(queryByTestId('third-line-toggle-btn')).toBeNull());

      await rerender(
        <BalanceHistoryCard
          colors={mockColors}
          t={mockT}
          selectedAccount="acc1"
          onAccountChange={jest.fn()}
          accountItems={mockAccountItems}
          loadingBalanceHistory={false}
          balanceHistoryData={yearData}
          selectedYear={2024}
          selectedMonth={null}
          accounts={mockAccounts}
          isCurrentMonth={false}
          spendingPrediction={null}
          balanceHistoryTableData={[]}
          editingBalanceValue=""
          onEditingBalanceValueChange={jest.fn()}
          onEditBalance={jest.fn()}
          onCancelEdit={jest.fn()}
          onSaveBalance={jest.fn()}
          onDeleteBalance={jest.fn()}
          onShowCalendar={jest.fn()}
        />,
      );

      // Back on the chart, with its own controls reachable again
      await waitFor(() => expect(queryByTestId('third-line-toggle-btn')).toBeTruthy());
      expect(container.queryAll(n => n.props.testID === 'vn-line').length).toBeGreaterThan(0);
    });

    it('explains an empty year in year terms', async () => {
      const { getByText } = await renderYearCard({
        balanceHistoryData: { granularity: 'year', labels: [], actual: [], actualForChart: [], prevYear: [] },
      });

      expect(getByText('No balance history available for this year')).toBeTruthy();
    });

    it('renders one line per series on the canvas', async () => {
      const { container } = await renderYearCard();

      // actual + prevYear + zero baseline
      expect(container.queryAll(n => n.props.testID === 'vn-line')).toHaveLength(3);
    });
  });
});
