import React from 'react';
import { render } from '@testing-library/react-native';
import ExpensePieChart from '../../../app/components/graphs/ExpensePieChart';

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
  it('renders loading state when loading is true', () => {
    const { getByText } = render(<ExpensePieChart {...defaultProps} loading={true} />);
    expect(getByText('loading_operations')).toBeTruthy();
  });

  it('does not render donut chart when loading', () => {
    const { queryByTestId } = render(<ExpensePieChart {...defaultProps} loading={true} />);
    expect(queryByTestId('donut-chart')).toBeNull();
  });

  it('renders empty state text when chartData is empty', () => {
    const { getByText } = render(<ExpensePieChart {...defaultProps} chartData={[]} />);
    expect(getByText('no_expense_data')).toBeTruthy();
  });

  it('renders DonutChart when data is present', () => {
    const { getByTestId } = render(<ExpensePieChart {...defaultProps} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
  });

  it('renders legend category names', () => {
    const { getByText } = render(<ExpensePieChart {...defaultProps} />);
    expect(getByText('Food')).toBeTruthy();
    expect(getByText('Transport')).toBeTruthy();
  });

  it('renders arc icons for above-threshold segments', () => {
    // Food 63.6%, Transport 31.8% — both above 10%
    const { queryAllByTestId } = render(<ExpensePieChart {...defaultProps} />);
    expect(queryAllByTestId('icon-food').length).toBeGreaterThan(0);
    expect(queryAllByTestId('icon-car').length).toBeGreaterThan(0);
  });

  it('does not render arc icon for below-threshold segment', () => {
    // Other 4.5% — below 10%
    const { queryAllByTestId } = render(<ExpensePieChart {...defaultProps} />);
    expect(queryAllByTestId('icon-dots-horizontal').length).toBe(0);
  });
});
