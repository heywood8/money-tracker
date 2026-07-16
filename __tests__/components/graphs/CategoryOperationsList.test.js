import React from 'react';
import { render } from '@testing-library/react-native';
import CategoryOperationsList from '../../../app/components/graphs/CategoryOperationsList';
import { useDisplaySettings } from '../../../app/contexts/DisplaySettingsContext';

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
  JPY: { decimal_digits: 0, symbol: '¥' },
}));

const colors = { text: '#000000', mutedText: '#888888', border: '#dddddd', primary: '#0000ff' };

describe('CategoryOperationsList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDisplaySettings.mockReturnValue({ hideBalances: false });
  });

  it('renders a spinner while loading', async () => {
    const { getByTestId } = await render(
      <CategoryOperationsList operations={[]} loading currency="USD" colors={colors} language="en" />,
    );
    expect(getByTestId('category-operations-loading')).toBeTruthy();
  });

  it('renders the empty text when there are no operations', async () => {
    const { getByText } = await render(
      <CategoryOperationsList operations={[]} currency="USD" colors={colors} language="en" emptyText="nothing here" />,
    );
    expect(getByText('nothing here')).toBeTruthy();
  });

  it('shows the label as primary text and the date as secondary text', async () => {
    const ops = [{ id: '1', amount: '12.50', date: '2024-03-05', description: 'Coffee' }];
    const { getByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
    );
    expect(getByText('Coffee')).toBeTruthy();
    expect(getByText('March 5')).toBeTruthy();
    expect(getByText('$12.50')).toBeTruthy();
  });

  it('shows the converted amount in the target currency and the original beside it', async () => {
    const ops = [{ id: '1', amount: '4000', date: '2024-03-05', description: 'Rent', accountCurrency: 'AMD', convertedAmount: '10.00' }];
    const { getByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
    );
    expect(getByText('$10.00')).toBeTruthy();   // converted, selected currency
    expect(getByText('֏4000')).toBeTruthy();    // original, account currency (AMD: 0 decimals)
  });

  it('does not show a separate original for a same-currency (convertedAmount null) op', async () => {
    const ops = [{ id: '1', amount: '12.50', date: '2024-03-05', description: 'Coffee', accountCurrency: 'USD', convertedAmount: null }];
    const { getByText, queryAllByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
    );
    expect(getByText('$12.50')).toBeTruthy();
    expect(queryAllByText('$12.50')).toHaveLength(1); // not duplicated as an "original"
  });

  it('formats the date in the genitive month form for Russian', async () => {
    const ops = [{ id: '1', amount: '12.50', date: '2024-07-05', description: 'Кофе' }];
    const { getByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="ru" />,
    );
    // Genitive "июля", not the standalone nominative "Июль".
    expect(getByText('5 июля')).toBeTruthy();
  });

  it('falls back to the date as primary text when the operation has no label', async () => {
    const ops = [{ id: '2', amount: '100', date: '2024-03-05', description: '' }];
    const { getByText } = await render(
      <CategoryOperationsList operations={ops} currency="JPY" colors={colors} language="en" />,
    );
    expect(getByText('March 5')).toBeTruthy();
    expect(getByText('¥100')).toBeTruthy();
  });

  it('masks amounts when hideBalances is true', async () => {
    useDisplaySettings.mockReturnValue({ hideBalances: true });
    const ops = [{ id: '3', amount: '12.50', date: '2024-03-05', description: 'Coffee' }];
    const { getByText, queryByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
    );
    expect(getByText('••••')).toBeTruthy();
    expect(queryByText('$12.50')).toBeNull();
  });

  it('renders every operation in the list', async () => {
    const ops = [
      { id: '1', amount: '10.00', date: '2024-03-05', description: 'A' },
      { id: '2', amount: '20.00', date: '2024-03-06', description: 'B' },
      { id: '3', amount: '30.00', date: '2024-03-07', description: 'C' },
    ];
    const { getByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
    );
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
    expect(getByText('C')).toBeTruthy();
  });
});
