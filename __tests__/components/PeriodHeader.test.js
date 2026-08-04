import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import PeriodHeader from '../../app/components/PeriodHeader';

// Presses go through act, as they do in the other component suites here: a
// bare fireEvent lands outside the act scope render() opened, and the
// overlapping scopes leave later renders in this file rendering nothing.
const press = async (element) => {
  await act(async () => {
    fireEvent.press(element);
  });
};

const colors = {
  background: '#fff', text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee',
};

const setup = async (props = {}) => render(
  <PeriodHeader
    label="July 2026"
    onPrev={jest.fn()}
    onNext={jest.fn()}
    prevLabel="previous"
    nextLabel="next"
    onPressTitle={jest.fn()}
    titleLabel="select: July 2026"
    currencies={['USD', 'EUR']}
    selectedCurrency="USD"
    onPressCurrency={jest.fn()}
    currencyLabel="currency: USD"
    colors={colors}
    testIDPrefix="scope"
    {...props}
  />,
);

describe('PeriodHeader', () => {
  it('names the period and steps it in both directions', async () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();
    const { getByTestId } = await setup({ onPrev, onNext });

    expect(getByTestId('scope-label')).toHaveTextContent('July 2026');

    await press(getByTestId('scope-prev'));
    await press(getByTestId('scope-next'));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('opens the host period picker from the title', async () => {
    const onPressTitle = jest.fn();
    const { getByTestId } = await setup({ onPressTitle });

    await press(getByTestId('scope-picker'));

    expect(onPressTitle).toHaveBeenCalledTimes(1);
  });

  describe('jump to current', () => {
    it('is absent while the host is on the current period', async () => {
      const { queryByTestId } = await setup({ showJumpToCurrent: false });
      expect(queryByTestId('scope-jump-current')).toBeNull();
    });

    it('reports the tap when the host is off it', async () => {
      const onJumpToCurrent = jest.fn();
      const { getByTestId } = await setup({ showJumpToCurrent: true, onJumpToCurrent, jumpLabel: 'today' });

      await press(getByTestId('scope-jump-current'));

      expect(onJumpToCurrent).toHaveBeenCalledTimes(1);
    });
  });

  describe('currency chip', () => {
    // Nothing to choose between with one account currency, and a chip that
    // cannot change anything is furniture over the content.
    it('is absent with a single account currency', async () => {
      const { queryByTestId } = await setup({ currencies: ['USD'] });
      expect(queryByTestId('scope-currency-chip')).toBeNull();
    });

    it('shows the code with its symbol and opens the host sheet', async () => {
      const onPressCurrency = jest.fn();
      const { getByTestId } = await setup({ onPressCurrency });

      const chip = getByTestId('scope-currency-chip');
      expect(within(chip).getByText('USD')).toBeTruthy();
      expect(within(chip).getByText('$')).toBeTruthy();

      await press(chip);
      expect(onPressCurrency).toHaveBeenCalledTimes(1);
    });

    // The catalogue lists the code itself as the symbol for several currencies;
    // printing both would render "CHF CHF".
    it('drops the symbol when it is the code', async () => {
      const { getByTestId } = await setup({ currencies: ['CHF', 'EUR'], selectedCurrency: 'CHF' });

      const chip = getByTestId('scope-currency-chip');
      expect(within(chip).getByText('CHF')).toBeTruthy();
      expect(within(chip).queryAllByText('CHF')).toHaveLength(1);
    });
  });

  it('renders host content under its own two rows', async () => {
    const { getByTestId, getByText } = await setup({
      children: <Text testID="scope-hero">remainder</Text>,
    });

    expect(getByText('remainder')).toBeTruthy();
    expect(within(getByTestId('scope-header')).getByTestId('scope-hero')).toBeTruthy();
  });

  // Both screens address the same header through their own prefix, so every id
  // it emits has to carry that prefix rather than a name of its own.
  it('prefixes every testID it emits', async () => {
    const { getByTestId } = await setup({ showJumpToCurrent: true });

    ['scope-header', 'scope-prev', 'scope-next', 'scope-picker', 'scope-label',
      'scope-jump-current', 'scope-currency-chip'].forEach(id => {
      expect(getByTestId(id)).toBeTruthy();
    });
  });
});
