import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import CurrencySheet from '../../app/components/CurrencySheet';

jest.mock('../../app/components/ModalBlurOverlay', () => () => null);

jest.mock('../../assets/currencies.json', () => ({
  USD: { symbol: '$', name: 'US Dollar' },
  AMD: { symbol: '֏', name: 'Armenian Dram' },
  // Symbol-less on purpose: the catalogue has entries whose "symbol" is just the
  // code, and the sheet must not print it twice.
  CHF: { symbol: 'CHF', name: 'Swiss Franc' },
}));

const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee',
  card: '#fff', scrim: 'rgba(0,0,0,0.32)', glassSurfaceStrong: 'rgba(0,0,0,0.06)',
};
const t = (k) => k;

const CODES = ['AMD', 'USD', 'CHF'];

const setup = async (props = {}) => render(
  <CurrencySheet
    visible
    codes={CODES}
    selectedCurrency="AMD"
    onSelect={jest.fn()}
    onClose={jest.fn()}
    colors={colors}
    t={t}
    {...props}
  />,
);

describe('CurrencySheet', () => {
  it('renders nothing while closed', async () => {
    const { queryByTestId } = await setup({ visible: false });
    expect(queryByTestId('currency-sheet-option-USD')).toBeNull();
  });

  it('lists a row per currency with its symbol, code and name', async () => {
    const { getByTestId } = await setup();
    const usd = within(getByTestId('currency-sheet-option-USD'));
    expect(usd.getByText('$')).toBeTruthy();
    expect(usd.getByText('USD')).toBeTruthy();
    expect(usd.getByText('US Dollar')).toBeTruthy();
    expect(within(getByTestId('currency-sheet-option-AMD')).getByText('֏')).toBeTruthy();
  });

  it('marks the current currency as selected', async () => {
    const { getByTestId } = await setup();
    expect(getByTestId('currency-sheet-option-AMD').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('currency-sheet-option-USD').props.accessibilityState.selected).toBe(false);
  });

  it('reports the pick and closes itself', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = await setup({ onSelect, onClose });

    await press(getByTestId('currency-sheet-option-USD'));

    expect(onSelect).toHaveBeenCalledWith('USD');
    // A pick is also a dismissal: leaving the sheet up after it would hide the
    // very figures it was opened to re-denominate.
    expect(onClose).toHaveBeenCalled();
  });

  it('still names a currency the catalogue does not know, without doubling it', async () => {
    const { getByTestId } = await setup({ codes: ['XYZ'], selectedCurrency: 'XYZ' });
    const row = within(getByTestId('currency-sheet-option-XYZ'));
    expect(row.getByText('XYZ')).toBeTruthy();
    // The mark falls back to the generic currency glyph rather than printing the
    // code a second time next to itself.
    expect(row.queryAllByText('XYZ')).toHaveLength(1);
    expect(row.getByTestId('icon-currency-sign')).toBeTruthy();
  });

  it('uses the generic glyph where the catalogue lists the code as the symbol', async () => {
    const { getByTestId } = await setup({ codes: ['CHF'] });
    const row = within(getByTestId('currency-sheet-option-CHF'));
    expect(row.queryAllByText('CHF')).toHaveLength(1);
    expect(row.getByTestId('icon-currency-sign')).toBeTruthy();
  });

  it('takes a title from its host', async () => {
    const { getByText } = await setup({ title: 'currency' });
    expect(getByText('currency')).toBeTruthy();
  });

  it('defaults its title to the shared select_currency label', async () => {
    const { getByText } = await setup();
    expect(getByText('select_currency')).toBeTruthy();
  });

  describe('Convert-all row', () => {
    it('stays out of the sheet when the host has no handler for it', async () => {
      const { queryByTestId } = await setup();
      expect(queryByTestId('currency-sheet-convert')).toBeNull();
    });

    it('reports its own state and reports a flip without dismissing', async () => {
      const onToggleConvert = jest.fn();
      const onClose = jest.fn();
      const { getByTestId } = await setup({ convertAll: true, onToggleConvert, onClose });

      const row = getByTestId('currency-sheet-convert');
      expect(row.props.accessibilityState.checked).toBe(true);

      await press(row);

      expect(onToggleConvert).toHaveBeenCalledTimes(1);
      // The row is a setting on the choice above it, not a choice of its own.
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
