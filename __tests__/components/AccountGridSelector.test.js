import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AccountGridSelector from '../../app/components/AccountGridSelector';

const mockDisplaySettings = { hideBalances: false };
jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => mockDisplaySettings,
}));

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', decimal_digits: 2 },
  AMD: { symbol: '֏', decimal_digits: 2 },
}));

const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
  primary: '#6200ee', surface: '#fff', inputBackground: '#f0f0f0',
};
const t = (k) => k;

// Deliberately interleaved currencies: the grid has to group them without
// reordering the accounts themselves.
const ACCOUNTS = [
  { id: 'a1', name: 'T-bank card', balance: '100', currency: 'AMD' },
  { id: 'a2', name: 'Cash usd', balance: '50', currency: 'USD' },
  { id: 'a3', name: 'Ameria card', balance: '200', currency: 'AMD' },
];

describe('AccountGridSelector', () => {
  beforeEach(() => {
    mockDisplaySettings.hideBalances = false;
  });

  it('shows an empty message when there is nothing to pick', async () => {
    const { getByTestId } = await render(
      <AccountGridSelector accounts={[]} onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(getByTestId('account-grid-empty')).toHaveTextContent('no_accounts');
  });

  it('renders every account with its balance', async () => {
    const { getByTestId, getByText } = await render(
      <AccountGridSelector accounts={ACCOUNTS} onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(getByTestId('account-grid-a1')).toBeTruthy();
    expect(getByText('$50.00')).toBeTruthy();
    expect(getByText('֏100.00')).toBeTruthy();
  });

  it('reports the tapped account', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      <AccountGridSelector accounts={ACCOUNTS} onSelect={onSelect} colors={colors} t={t} />,
    );
    await press(getByTestId('account-grid-a3'));
    expect(onSelect).toHaveBeenCalledWith('a3');
  });

  it('marks the current selection', async () => {
    const { getByTestId } = await render(
      <AccountGridSelector accounts={ACCOUNTS} selectedAccountId="a2" onSelect={jest.fn()} colors={colors} t={t} />,
    );
    expect(getByTestId('account-grid-a2').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('account-grid-a1').props.accessibilityState.selected).toBe(false);
  });

  describe('Currency grouping', () => {
    it('heads one group per currency, in the order the accounts introduce them', async () => {
      const { getByTestId } = await render(
        <AccountGridSelector accounts={ACCOUNTS} onSelect={jest.fn()} colors={colors} t={t} />,
      );
      expect(getByTestId('account-grid-group-AMD')).toHaveTextContent('AMD');
      expect(getByTestId('account-grid-group-USD')).toHaveTextContent('USD');
    });

    it('drops the headers when every account shares a currency', async () => {
      const sameCurrency = ACCOUNTS.filter((a) => a.currency === 'AMD');
      const { queryByTestId, getByTestId } = await render(
        <AccountGridSelector accounts={sameCurrency} onSelect={jest.fn()} colors={colors} t={t} />,
      );
      // One header over everything says nothing.
      expect(queryByTestId('account-grid-group-AMD')).toBeNull();
      expect(getByTestId('account-grid-a1')).toBeTruthy();
    });

    it('drops a group that the search emptied', async () => {
      const { getByTestId, queryByTestId } = await render(
        <AccountGridSelector accounts={ACCOUNTS} onSelect={jest.fn()} colors={colors} t={t} query="cash" />,
      );
      expect(getByTestId('account-grid-a2')).toBeTruthy();
      expect(queryByTestId('account-grid-a1')).toBeNull();
      // Only USD survived, so its header stops earning its space too.
      expect(queryByTestId('account-grid-group-USD')).toBeNull();
    });
  });

  describe('Search', () => {
    it('says nothing was found rather than showing an empty grid', async () => {
      const { getByTestId } = await render(
        <AccountGridSelector accounts={ACCOUNTS} onSelect={jest.fn()} colors={colors} t={t} query="zzz" />,
      );
      expect(getByTestId('account-grid-empty')).toHaveTextContent('no_results');
    });
  });

  describe('Hidden balances', () => {
    it('honours the app-wide setting instead of spelling the balance out', async () => {
      mockDisplaySettings.hideBalances = true;
      const { queryByText, getByTestId } = await render(
        <AccountGridSelector accounts={ACCOUNTS} onSelect={jest.fn()} colors={colors} t={t} />,
      );
      expect(queryByText('$50.00')).toBeNull();
      expect(getByTestId('account-grid-a2')).toBeTruthy();
    });
  });
});
