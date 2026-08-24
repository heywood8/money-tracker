import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import CategoryOperationsList, { INITIAL_ROW_LIMIT } from '../../../app/components/graphs/CategoryOperationsList';
import { useDisplaySettings } from '../../../app/contexts/DisplaySettingsContext';

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
  JPY: { decimal_digits: 0, symbol: '¥' },
  AMD: { decimal_digits: 0, symbol: '֏' },
}));

const colors = {
  text: '#000000', mutedText: '#888888', border: '#dddddd', primary: '#0000ff',
  altRow: '#f4f4f4', income: '#00aa00', expense: '#cc0000',
};

const STRINGS = {
  sort_by_date: 'By date',
  sort_by_amount: 'By amount',
  show_all_operations: 'Show all ({count})',
};
const t = (key) => STRINGS[key] ?? key;

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
  describe('sorting', () => {
    const ops = [
      { id: '1', amount: '10.00', date: '2024-03-07', description: 'Small' },
      { id: '2', amount: '90.00', date: '2024-03-06', description: 'Large' },
      { id: '3', amount: '50.00', date: '2024-03-05', description: 'Middle' },
    ];

    it('offers no sort control for a single operation', async () => {
      const { queryByTestId } = await render(
        <CategoryOperationsList operations={[ops[0]]} currency="USD" colors={colors} language="en" t={t} />,
      );
      expect(queryByTestId('category-operations-sort')).toBeNull();
    });

    it('starts in date order, as the query returned it', async () => {
      const { getByText, getAllByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(getByText('By date')).toBeTruthy();
      const rendered = getAllByText(/^(Small|Large|Middle)$/).map(node => node.props.children);
      expect(rendered).toEqual(['Small', 'Large', 'Middle']);
    });

    it('reorders the rows by amount, largest first, when toggled', async () => {
      const { getByTestId, getByText, getAllByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} />,
      );

      await fireEvent.press(getByTestId('category-operations-sort'));

      expect(getByText('By amount')).toBeTruthy();
      const rendered = getAllByText(/^(Small|Large|Middle)$/).map(node => node.props.children);
      expect(rendered).toEqual(['Large', 'Middle', 'Small']);
    });

    // Sorted by amount there are no runs of same-day rows left to collapse, so
    // suppressing a repeated date would strand rows with no date at all.
    it('dates every row once sorted by amount', async () => {
      const sameDay = [
        { id: '1', amount: '10.00', date: '2024-03-05', description: 'A' },
        { id: '2', amount: '90.00', date: '2024-03-05', description: 'B' },
      ];
      const { getByTestId, queryAllByText } = await render(
        <CategoryOperationsList operations={sameDay} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(queryAllByText('March 5')).toHaveLength(1);
      await fireEvent.press(getByTestId('category-operations-sort'));
      expect(queryAllByText('March 5')).toHaveLength(2);
    });

    it('sorts on the converted amount, which is what the rows show', async () => {
      const foreign = [
        // Larger original, smaller converted: sorting on `amount` would invert these.
        { id: '1', amount: '4000', date: '2024-03-05', description: 'Foreign', accountCurrency: 'AMD', convertedAmount: '10.00' },
        { id: '2', amount: '50.00', date: '2024-03-04', description: 'Local', accountCurrency: 'USD', convertedAmount: null },
      ];
      const { getByTestId, getAllByText } = await render(
        <CategoryOperationsList operations={foreign} currency="USD" colors={colors} language="en" t={t} />,
      );

      await fireEvent.press(getByTestId('category-operations-sort'));
      const rendered = getAllByText(/^(Foreign|Local)$/).map(node => node.props.children);
      expect(rendered).toEqual(['Local', 'Foreign']);
    });
  });

  describe('row limit', () => {
    const many = (count) => Array.from({ length: count }, (_, i) => ({
      id: String(i),
      amount: String(i + 1),
      date: '2024-03-05',
      description: `Op ${i}`,
    }));

    it('renders everything and offers no button below the limit', async () => {
      const { queryByTestId, getByText } = await render(
        <CategoryOperationsList operations={many(INITIAL_ROW_LIMIT)} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(getByText(`Op ${INITIAL_ROW_LIMIT - 1}`)).toBeTruthy();
      expect(queryByTestId('category-operations-show-all')).toBeNull();
    });

    it('holds back the tail and names how many there are in total', async () => {
      const { getByText, queryByText } = await render(
        <CategoryOperationsList operations={many(30)} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(queryByText(`Op ${INITIAL_ROW_LIMIT}`)).toBeNull();
      expect(getByText('Show all (30)')).toBeTruthy();
    });

    it('reveals the tail when the button is pressed', async () => {
      const { getByTestId, queryByTestId, getByText } = await render(
        <CategoryOperationsList operations={many(30)} currency="USD" colors={colors} language="en" t={t} />,
      );

      await fireEvent.press(getByTestId('category-operations-show-all'));

      expect(getByText('Op 29')).toBeTruthy();
      expect(queryByTestId('category-operations-show-all')).toBeNull();
    });

    // Widening the period keeps the same category (the chart subtree is keyed on
    // it), so without this the year's operations would all mount at once.
    it('takes the limit back when the category holds a different number of operations', async () => {
      const { getByTestId, queryByTestId, rerender } = await render(
        <CategoryOperationsList operations={many(30)} currency="USD" colors={colors} language="en" t={t} />,
      );

      await fireEvent.press(getByTestId('category-operations-show-all'));
      expect(queryByTestId('category-operations-show-all')).toBeNull();

      await rerender(
        <CategoryOperationsList operations={many(40)} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(getByTestId('category-operations-show-all')).toBeTruthy();
    });

    // A reload after an edit hands back a fresh array of the same operations;
    // folding the list back up there would punish editing from the drill-down.
    it('keeps the tail revealed when the same operations are reloaded', async () => {
      const { getByTestId, queryByTestId, rerender } = await render(
        <CategoryOperationsList operations={many(30)} currency="USD" colors={colors} language="en" t={t} />,
      );

      await fireEvent.press(getByTestId('category-operations-show-all'));

      await rerender(
        <CategoryOperationsList operations={many(30)} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(queryByTestId('category-operations-show-all')).toBeNull();
    });

    // The header total names the category, not the slice of it on screen.
    it('totals every operation, not just the rendered ones', async () => {
      const chip = <Text testID="chip">Groceries</Text>;
      const { getByText } = await render(
        <CategoryOperationsList operations={many(30)} currency="USD" colors={colors} language="en" t={t} headerChip={chip} />,
      );

      // 1 + 2 + ... + 30
      expect(getByText('$465.00')).toBeTruthy();
    });
  });

  describe('account name', () => {
    const getAccountName = (id) => ({ a: 'Cash', b: 'Card' })[id] ?? '';

    it('stands in as the row text when the operation has no labels', async () => {
      const ops = [{ id: '1', accountId: 'a', amount: '10.00', date: '2024-03-05', description: '' }];
      const { getByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} getAccountName={getAccountName} />,
      );

      expect(getByText('Cash')).toBeTruthy();
    });

    // One account name repeated down every row carries no information.
    it('is not repeated on labelled rows when every operation shares an account', async () => {
      const ops = [
        { id: '1', accountId: 'a', amount: '10.00', date: '2024-03-05', description: 'A' },
        { id: '2', accountId: 'a', amount: '20.00', date: '2024-03-04', description: 'B' },
      ];
      const { queryByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} getAccountName={getAccountName} />,
      );

      expect(queryByText('Cash')).toBeNull();
    });

    it('is shown on every row once the list spans more than one account', async () => {
      const ops = [
        { id: '1', accountId: 'a', amount: '10.00', date: '2024-03-05', description: 'A' },
        { id: '2', accountId: 'b', amount: '20.00', date: '2024-03-04', description: 'B' },
      ];
      const { getByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} getAccountName={getAccountName} />,
      );

      expect(getByText('Cash')).toBeTruthy();
      expect(getByText('Card')).toBeTruthy();
    });
  });

  describe('magnitude bars', () => {
    const ops = [
      { id: '1', amount: '100.00', date: '2024-03-05', description: 'A' },
      { id: '2', amount: '25.00', date: '2024-03-04', description: 'B' },
    ];

    it('scales each bar against the largest operation in the category', async () => {
      const { getByTestId } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(getByTestId('category-operation-bar-1')).toHaveStyle({ width: '100%' });
      expect(getByTestId('category-operation-bar-2')).toHaveStyle({ width: '25%' });
    });

    it('draws no bar for a lone operation, which has nothing to compare to', async () => {
      const { queryByTestId } = await render(
        <CategoryOperationsList operations={[ops[0]]} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(queryByTestId('category-operation-bar-1')).toBeNull();
    });

    // A bar is a readable amount: leaving them on would defeat the masking.
    it('draws no bars while balances are hidden', async () => {
      useDisplaySettings.mockReturnValue({ hideBalances: true });
      const { queryByTestId } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(queryByTestId('category-operation-bar-1')).toBeNull();
    });

    // Revealing the tail must not rescale the bars already on screen, so the
    // scale comes from the whole category rather than the rendered slice.
    it('keeps the scale fixed when the hidden tail is revealed', async () => {
      const many = Array.from({ length: 30 }, (_, i) => ({
        id: String(i), amount: String(i + 1), date: '2024-03-05', description: `Op ${i}`,
      }));
      const { getByTestId } = await render(
        <CategoryOperationsList operations={many} currency="USD" colors={colors} language="en" t={t} />,
      );

      // Largest is 30, which is in the hidden tail: the visible 25 is 83%.
      expect(getByTestId('category-operation-bar-24')).toHaveStyle({ width: '83%' });
      await fireEvent.press(getByTestId('category-operations-show-all'));
      expect(getByTestId('category-operation-bar-24')).toHaveStyle({ width: '83%' });
    });
  });

  describe('opening an operation', () => {
    const ops = [{ id: '7', amount: '10.00', date: '2024-03-05', description: 'Coffee' }];

    it('hands the whole operation to the caller when a row is pressed', async () => {
      const onOperationPress = jest.fn();
      const { getByTestId } = await render(
        <CategoryOperationsList
          operations={ops}
          currency="USD"
          colors={colors}
          language="en"
          t={t}
          onOperationPress={onOperationPress}
        />,
      );

      await fireEvent.press(getByTestId('category-operation-7'));

      expect(onOperationPress).toHaveBeenCalledWith(ops[0]);
    });

    it('presses the operation the reader sees, not the one at that index before sorting', async () => {
      const onOperationPress = jest.fn();
      const two = [
        { id: '1', amount: '10.00', date: '2024-03-06', description: 'Small' },
        { id: '2', amount: '90.00', date: '2024-03-05', description: 'Large' },
      ];
      const { getByTestId } = await render(
        <CategoryOperationsList
          operations={two}
          currency="USD"
          colors={colors}
          language="en"
          t={t}
          onOperationPress={onOperationPress}
        />,
      );

      await fireEvent.press(getByTestId('category-operations-sort'));
      await fireEvent.press(getByTestId('category-operation-2'));

      expect(onOperationPress).toHaveBeenCalledWith(two[1]);
    });

    it('stays read-only when no handler is given', async () => {
      const { queryByTestId, getByText } = await render(
        <CategoryOperationsList operations={ops} currency="USD" colors={colors} language="en" t={t} />,
      );

      expect(queryByTestId('category-operation-7')).toBeNull();
      expect(getByText('Coffee')).toBeTruthy();
    });
  });
});
