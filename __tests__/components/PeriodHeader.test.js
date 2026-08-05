import React from 'react';
import { StyleSheet } from 'react-native';
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
  background: '#ffffff', text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee',
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

  // The header is glass over the screen's own list, the way the floating tab
  // bar is glass over its other end — not a band the content begins below.
  describe('glass overlay', () => {
    it('sits over the content rather than in the flow', async () => {
      const { getByTestId } = await setup();

      const overlay = StyleSheet.flatten(getByTestId('scope-header').props.style);
      expect(overlay.position).toBe('absolute');
      expect(overlay.top).toBe(0);
    });

    it('tints toward the theme background at partial opacity', async () => {
      const { getByTestId } = await setup();

      const surface = StyleSheet.flatten(getByTestId('scope-surface').props.style);
      // #rrggbbaa on the theme's own background, and not fully opaque — that is
      // what lets the list show through and what makes it read as a lightening
      // on the light theme and a darkening on the dark one.
      expect(surface.backgroundColor).toMatch(/^#ffffff[0-9a-f]{2}$/);
      expect(surface.backgroundColor).not.toMatch(/ff$/);
    });

    it('dissolves into the content instead of ending on a hard edge', async () => {
      const { getByTestId } = await setup();

      const fade = getByTestId('scope-fade');
      // Purely visual: it extends past the controls and must not swallow taps
      // meant for the content under it.
      expect(fade.props.pointerEvents).toBe('none');
      expect(fade.props.children.length).toBeGreaterThan(1);
    });

    // The host cannot pad its scroll content correctly without this: the header
    // is a row taller with the currency chip up, and taller again at a large
    // font scale.
    it('reports its measured height to the host', async () => {
      const onHeightChange = jest.fn();
      const { getByTestId } = await setup({ onHeightChange });

      await act(async () => {
        fireEvent(getByTestId('scope-surface'), 'layout', {
          nativeEvent: { layout: { height: 96 } },
        });
      });

      expect(onHeightChange).toHaveBeenCalledWith(96);
    });
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
