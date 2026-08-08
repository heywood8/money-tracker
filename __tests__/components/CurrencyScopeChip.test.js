import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import CurrencyScopeChip from '../../app/components/CurrencyScopeChip';

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc' },
}));

const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee',
};

const setup = async (props = {}) => render(
  <CurrencyScopeChip
    code="USD"
    onPress={jest.fn()}
    accessibilityLabel="currency: USD"
    colors={colors}
    testID="scope-chip"
    {...props}
  />,
);

describe('CurrencyScopeChip', () => {
  it('shows the code with its symbol', async () => {
    const { getByTestId } = await setup();

    const chip = getByTestId('scope-chip');
    expect(within(chip).getByText('USD')).toBeTruthy();
    expect(within(chip).getByText('$')).toBeTruthy();
  });

  // The catalogue lists the code itself as the symbol for several currencies;
  // printing both would render "CHF CHF".
  it('drops the symbol when it is the code', async () => {
    const { getByTestId } = await setup({ code: 'CHF' });

    const chip = getByTestId('scope-chip');
    expect(within(chip).getByText('CHF')).toBeTruthy();
    expect(within(chip).queryAllByText('CHF')).toHaveLength(1);
  });

  it('goes tonal while active', async () => {
    const { getByTestId } = await setup({ active: true });

    const style = StyleSheet.flatten(getByTestId('scope-chip').props.style);
    expect(style.borderColor).toBe(colors.primary);
    expect(style.backgroundColor).toBe(`${colors.primary}1F`);
  });

  it('reports the tap', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await setup({ onPress });

    await press(getByTestId('scope-chip'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
