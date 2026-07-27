import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import CategoryOperationsList from '../../../app/components/graphs/CategoryOperationsList';
import { useDisplaySettings } from '../../../app/contexts/DisplaySettingsContext';

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
  JPY: { decimal_digits: 0, symbol: '¥' },
  AMD: { decimal_digits: 0, symbol: '֏' },
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

  it('shows the date, the label chip and the amount on one row', async () => {
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
    expect(getByText('֏4,000')).toBeTruthy();   // original, account currency (AMD: 0 decimals)
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

  it('still shows date and amount when the operation has no label', async () => {
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

  it('groups digits so a large amount stays readable', async () => {
    const ops = [{ id: '1', amount: '100000', date: '2024-03-05', description: '' }];
    const { getByText } = await render(
      <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
    );
    expect(getByText('$100,000.00')).toBeTruthy();
  });

  // Same-day operations read as one block: only the first of the day is dated.
  describe('date grouping', () => {
    const ops = [
      { id: '1', amount: '10.00', date: '2024-03-05', description: 'A' },
      { id: '2', amount: '20.00', date: '2024-03-05', description: 'B' },
      { id: '3', amount: '30.00', date: '2024-03-04', description: 'C' },
    ];

    it('prints a date once per day, not once per operation', async () => {
      const { queryAllByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
      );

      expect(queryAllByText('March 5')).toHaveLength(1);
      expect(queryAllByText('March 4')).toHaveLength(1);
    });
  });

  describe('header', () => {
    const ops = [
      { id: '1', amount: '10.00', date: '2024-03-05', description: 'A' },
      { id: '2', amount: '20.50', date: '2024-03-04', description: 'B' },
    ];
    const chip = <Text testID="chip">Groceries</Text>;

    it('is not rendered when no chip is passed', async () => {
      const { queryByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" />,
      );

      expect(queryByText('$30.50')).toBeNull();
    });

    it('pairs the chip with the total of the listed operations', async () => {
      const { getByTestId, getByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" headerChip={chip} />,
      );

      expect(getByTestId('chip')).toBeTruthy();
      expect(getByText('$30.50')).toBeTruthy();
    });

    // The rows show converted amounts, so the total has to agree with them —
    // otherwise it would not match the pie slice the drill-down came from.
    it('totals converted amounts, not the original foreign ones', async () => {
      const foreign = [
        { id: '1', amount: '4000', date: '2024-03-05', description: 'A', accountCurrency: 'AMD', convertedAmount: '10.00' },
        { id: '2', amount: '5.00', date: '2024-03-04', description: 'B', accountCurrency: 'USD', convertedAmount: null },
      ];
      const { getByText } = await render(
        <CategoryOperationsList operations={foreign} currency="USD" colors={colors} language="en" headerChip={chip} />,
      );

      expect(getByText('$15.00')).toBeTruthy();
    });

    it('masks the total when hideBalances is on', async () => {
      useDisplaySettings.mockReturnValue({ hideBalances: true });
      const { queryByText, getAllByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" headerChip={chip} />,
      );

      expect(queryByText('$30.50')).toBeNull();
      expect(getAllByText('••••').length).toBeGreaterThan(0);
    });

    // Losing the chip in these states would strand the user in the category:
    // it is the only way back to the parent.
    it('keeps the chip while loading', async () => {
      const { getByTestId } = await render(
        <CategoryOperationsList operations={[]} loading currency="USD" colors={colors} language="en" headerChip={chip} />,
      );

      expect(getByTestId('chip')).toBeTruthy();
      expect(getByTestId('category-operations-loading')).toBeTruthy();
    });

    it('keeps the chip when the category has no operations', async () => {
      const { getByTestId, getByText } = await render(
        <CategoryOperationsList operations={[]} currency="USD" colors={colors} language="en" emptyText="nothing here" headerChip={chip} />,
      );

      expect(getByTestId('chip')).toBeTruthy();
      expect(getByText('nothing here')).toBeTruthy();
    });
  });
});
