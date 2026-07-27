import React from 'react';
import { Text } from 'react-native';
import { render, within } from '@testing-library/react-native';
import ExpensePieChart from '../../../app/components/graphs/ExpensePieChart';
import { CHART_SIZE } from '../../../app/components/graphs/DonutChart';

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
}));

const mockColors = {
  primary: '#007AFF',
  text: '#111111',
  mutedText: '#666666',
  border: '#e6e6e6',
};

const mockData = [
  { name: 'Food', amount: 560, color: '#7c83fd', icon: 'food', categoryId: '1', hasChildren: false },
  { name: 'Transport', amount: 280, color: '#fd7c7c', icon: 'car', categoryId: '2', hasChildren: false },
  { name: 'Other', amount: 40, color: '#aaa', icon: 'dots-horizontal', categoryId: '3', hasChildren: false },
];

const defaultProps = {
  colors: mockColors,
  t: (key) => key,
  loading: false,
  chartData: mockData,
  selectedCurrency: 'USD',
  onLegendItemPress: jest.fn(),
  selectedCategory: 'all',
};

beforeEach(() => jest.clearAllMocks());

describe('ExpensePieChart', () => {
  it('renders loading state when loading is true', async () => {
    const { getByText } = await render(<ExpensePieChart {...defaultProps} loading={true} />);
    expect(getByText('loading_operations')).toBeTruthy();
  });

  it('does not render donut chart when loading', async () => {
    const { queryByTestId } = await render(<ExpensePieChart {...defaultProps} loading={true} />);
    expect(queryByTestId('donut-chart')).toBeNull();
  });

  it('renders empty state text when chartData is empty', async () => {
    const { getByText } = await render(<ExpensePieChart {...defaultProps} chartData={[]} />);
    expect(getByText('no_expense_data')).toBeTruthy();
  });

  it('renders DonutChart when data is present', async () => {
    const { getByTestId } = await render(<ExpensePieChart {...defaultProps} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
  });

  // Regression: the row used to centre its children, so the donut's vertical
  // offset followed the legend's height and it jumped whenever the category
  // count changed — most visibly when switching between the income and expense
  // tabs of the same panel.
  it('anchors the donut to the top of the row so it does not move with the legend', async () => {
    const { getByTestId } = await render(<ExpensePieChart {...defaultProps} />);

    // donut → its own column (which also holds the drill-down chip) → the row
    const row = getByTestId('donut-chart').parent.parent;
    const rowStyle = Object.assign({}, ...[].concat(row.props.style));

    expect(rowStyle.alignItems).toBe('flex-start');
  });

  it('renders legend category names', async () => {
    const { getByText } = await render(<ExpensePieChart {...defaultProps} />);
    expect(getByText('Food')).toBeTruthy();
    expect(getByText('Transport')).toBeTruthy();
  });

  it('renders arc icons for above-threshold segments', async () => {
    // Food 63.6%, Transport 31.8% — both above 10%
    const { queryAllByTestId } = await render(<ExpensePieChart {...defaultProps} />);
    expect(queryAllByTestId('icon-food').length).toBeGreaterThan(0);
    expect(queryAllByTestId('icon-car').length).toBeGreaterThan(0);
  });

  it('does not render arc icon for below-threshold segment', async () => {
    // Other 4.5% — below 10%
    const { queryAllByTestId } = await render(<ExpensePieChart {...defaultProps} />);
    expect(queryAllByTestId('icon-dots-horizontal').length).toBe(0);
  });

  // The drill-down chip used to be an overlay on the tab strip, where it covered
  // the tab's own title. It now travels with the chart body.
  describe('drill-down chip', () => {
    const chip = <Text testID="category-chip">Food</Text>;

    it('places the chip under the donut rather than beside the legend', async () => {
      const { getByTestId } = await render(
        <ExpensePieChart {...defaultProps} categoryChip={chip} />,
      );

      const column = getByTestId('donut-chart').parent;
      const columnStyle = Object.assign({}, ...[].concat(column.props.style));

      // Same column as the donut, capped at the donut's width, and after it
      expect(within(column).getByTestId('category-chip')).toBeTruthy();
      expect(columnStyle.width).toBe(CHART_SIZE);
      expect(column.children.indexOf(getByTestId('donut-chart'))).toBe(0);
    });

    it('keeps the chip reachable when the drill-down bottoms out in a list', async () => {
      const { getByTestId } = await render(
        <ExpensePieChart {...defaultProps} isLeafCategory={true} operations={[]} categoryChip={chip} />,
      );

      expect(getByTestId('category-chip')).toBeTruthy();
    });

    it('keeps the chip reachable while the category loads', async () => {
      const { getByTestId } = await render(
        <ExpensePieChart {...defaultProps} loading={true} categoryChip={chip} />,
      );

      expect(getByTestId('category-chip')).toBeTruthy();
    });

    it('keeps the chip reachable when the category has no data', async () => {
      const { getByTestId } = await render(
        <ExpensePieChart {...defaultProps} chartData={[]} categoryChip={chip} />,
      );

      expect(getByTestId('category-chip')).toBeTruthy();
    });
  });

  describe('leaf category (operations list)', () => {
    const operations = [
      { id: '1', amount: '12.50', date: '2024-01-15', description: 'Coffee', type: 'expense' },
    ];

    it('renders the operations list instead of the donut', async () => {
      const { getByText, queryByTestId } = await render(
        <ExpensePieChart {...defaultProps} isLeafCategory={true} operations={operations} />,
      );
      expect(queryByTestId('donut-chart')).toBeNull();
      expect(getByText('Coffee')).toBeTruthy();
      expect(getByText('$12.50')).toBeTruthy();
    });

    it('shows the empty state when the leaf has no operations', async () => {
      const { getByText, queryByTestId } = await render(
        <ExpensePieChart {...defaultProps} isLeafCategory={true} operations={[]} />,
      );
      expect(queryByTestId('donut-chart')).toBeNull();
      expect(getByText('no_expense_data')).toBeTruthy();
    });

    it('shows a spinner while the leaf operations load', async () => {
      const { getByTestId, queryByTestId } = await render(
        <ExpensePieChart {...defaultProps} isLeafCategory={true} loadingOperations={true} operations={[]} />,
      );
      expect(queryByTestId('donut-chart')).toBeNull();
      expect(getByTestId('category-operations-loading')).toBeTruthy();
    });
  });
});
