import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import CurrencyChipRow from '../../app/components/CurrencyChipRow';

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar' },
  AMD: { symbol: '֏', name: 'Armenian Dram' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc' },
}));

const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = { text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee' };

const setup = async (props = {}) => render(
  <CurrencyChipRow
    codes={['AMD', 'USD']}
    selectedCode="AMD"
    onSelect={jest.fn()}
    colors={colors}
    testIDPrefix="line-currency"
    {...props}
  />,
);

describe('CurrencyChipRow', () => {
  it('renders a chip per currency under the host prefix', async () => {
    const { getByTestId } = await setup();
    expect(within(getByTestId('line-currency-AMD')).getByText('AMD')).toBeTruthy();
    expect(within(getByTestId('line-currency-USD')).getByText('USD')).toBeTruthy();
  });

  it('draws the check on the selected chip only', async () => {
    const { getByTestId } = await setup();
    expect(within(getByTestId('line-currency-AMD')).getByTestId('icon-check')).toBeTruthy();
    expect(within(getByTestId('line-currency-USD')).queryByTestId('icon-check')).toBeNull();
  });

  it('marks only the selected chip', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('line-currency-AMD').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('line-currency-USD').props.accessibilityState.selected).toBe(false);
  });

  it('reports the tapped code', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await setup({ onSelect });
    await press(getByTestId('line-currency-USD'));
    expect(onSelect).toHaveBeenCalledWith('USD');
  });

  it('prefixes the symbol only when asked, and never repeats the code', async () => {
    const { getByTestId } = await setup({ codes: ['USD', 'CHF'], showSymbol: true });
    expect(within(getByTestId('line-currency-USD')).getByText('$ USD')).toBeTruthy();
    // The catalogue lists CHF's symbol as "CHF"; "CHF CHF" is not a chip.
    expect(within(getByTestId('line-currency-CHF')).getByText('CHF')).toBeTruthy();
  });
});
