import React from 'react';
import { render } from '@testing-library/react-native';
import IncomePieChart from '../../../app/components/graphs/IncomePieChart';

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
  { name: 'Salary', amount: 3000, color: '#7c83fd', icon: 'briefcase', categoryId: '1', hasChildren: false },
  { name: 'Freelance', amount: 800, color: '#7cfd9e', icon: 'laptop', categoryId: '2', hasChildren: false },
  { name: 'Other', amount: 60, color: '#aaa', icon: 'dots-horizontal', categoryId: '3', hasChildren: false },
];

const defaultProps = {
  colors: mockColors,
  t: (key) => key,
  loadingIncome: false,
  incomeChartData: mockData,
  selectedCurrency: 'USD',
  onLegendItemPress: jest.fn(),
  selectedIncomeCategory: 'all',
};

beforeEach(() => jest.clearAllMocks());

describe('IncomePieChart', () => {
  it('renders loading state when loadingIncome is true', async () => {
    const { getByText } = await render(<IncomePieChart {...defaultProps} loadingIncome={true} />);
    expect(getByText('loading_operations')).toBeTruthy();
  });

  it('does not render donut chart when loading', async () => {
    const { queryByTestId } = await render(<IncomePieChart {...defaultProps} loadingIncome={true} />);
    expect(queryByTestId('donut-chart')).toBeNull();
  });

  it('renders empty state text when incomeChartData is empty', async () => {
    const { getByText } = await render(<IncomePieChart {...defaultProps} incomeChartData={[]} />);
    expect(getByText('no_income_data')).toBeTruthy();
  });

  it('renders DonutChart when data is present', async () => {
    const { getByTestId } = await render(<IncomePieChart {...defaultProps} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
  });

  it('renders legend category names', async () => {
    const { getByText } = await render(<IncomePieChart {...defaultProps} />);
    expect(getByText('Salary')).toBeTruthy();
    expect(getByText('Freelance')).toBeTruthy();
  });

  it('renders arc icons for above-threshold segments', async () => {
    // Salary 77.9%, Freelance 20.8% — both above 10%
    const { queryAllByTestId } = await render(<IncomePieChart {...defaultProps} />);
    expect(queryAllByTestId('icon-briefcase').length).toBeGreaterThan(0);
    expect(queryAllByTestId('icon-laptop').length).toBeGreaterThan(0);
  });

  it('does not render arc icon for below-threshold segment', async () => {
    // Other 1.6% — below 10%
    const { queryAllByTestId } = await render(<IncomePieChart {...defaultProps} />);
    expect(queryAllByTestId('icon-dots-horizontal').length).toBe(0);
  });
});
