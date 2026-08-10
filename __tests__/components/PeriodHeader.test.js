import React from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
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
  // `PixelRatio.getFontScale()` falls back to the pixel density when the window
  // reports no fontScale, which is exactly what the test environment does — so
  // every render here would otherwise sit above the scale at which the header
  // drops the currency's mark. Pin it to the ordinary scale and let the one
  // test that cares about a large one say so.
  beforeEach(() => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    // It is navigation, so it belongs with the arrows rather than inside the
    // name it would otherwise push off centre.
    it('rides in the left slot beside the previous arrow', async () => {
      const { getByTestId } = await setup({ showJumpToCurrent: true, jumpLabel: 'today' });

      expect(within(getByTestId('scope-nav-start')).getByTestId('scope-jump-current')).toBeTruthy();
      expect(within(getByTestId('scope-scope')).queryByTestId('scope-jump-current')).toBeNull();
    });
  });

  describe('currency', () => {
    // Nothing to choose between with one account currency, and a control that
    // cannot change anything is furniture over the content.
    it('is absent with a single account currency', async () => {
      const { queryByTestId } = await setup({ currencies: ['USD'] });
      expect(queryByTestId('scope-currency-chip')).toBeNull();
      expect(queryByTestId('scope-divider')).toBeNull();
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

    // The first concession the row makes when the line runs out of width: the
    // code is what disambiguates, the mark is what a large scale can spare.
    it('drops the symbol at a large font scale, keeping the code', async () => {
      PixelRatio.getFontScale.mockReturnValue(1.3);
      const { getByTestId } = await setup();

      const chip = getByTestId('scope-currency-chip');
      expect(within(chip).getByText('USD')).toBeTruthy();
      expect(within(chip).queryByText('$')).toBeNull();
    });

    // Two tap targets on one line must not read as equals: the period is the
    // subject, the currency a qualifier on it.
    it('is set a rank below the period name', async () => {
      const { getByTestId } = await setup();

      const title = StyleSheet.flatten(getByTestId('scope-label').props.style);
      const code = StyleSheet.flatten(
        within(getByTestId('scope-currency-chip')).getByText('USD').props.style,
      );

      expect(title.fontSize).toBeGreaterThan(code.fontSize);
      expect(title.color).toBe(colors.text);
      expect(code.color).toBe(colors.mutedText);
      expect(getByTestId('scope-title-chevron').props.size)
        .toBeGreaterThan(getByTestId('scope-currency-chevron').props.size);
    });

    // Neither half is a button: no border, no fill, no ripple. The open sheet
    // is announced by colour alone.
    it('carries no button chrome', async () => {
      const { getByTestId } = await setup();

      const chip = getByTestId('scope-currency-chip');
      const chipStyle = StyleSheet.flatten(chip.props.style);
      expect(chipStyle.borderWidth).toBeUndefined();
      expect(chipStyle.backgroundColor).toBeUndefined();
      expect(chip.props.android_ripple).toBeUndefined();

      const picker = getByTestId('scope-picker');
      expect(StyleSheet.flatten(picker.props.style).borderWidth).toBeUndefined();
      expect(picker.props.android_ripple).toBeUndefined();
    });

    it('takes the text and the chevron into the accent while its sheet is open', async () => {
      const { getByTestId } = await setup({ currencyActive: true });

      const code = StyleSheet.flatten(
        within(getByTestId('scope-currency-chip')).getByText('USD').props.style,
      );
      expect(code.color).toBe(colors.primary);
      expect(getByTestId('scope-currency-chevron').props.color).toBe(colors.primary);
    });

    it('takes the period name and its chevron into the accent while the picker is open', async () => {
      const { getByTestId } = await setup({ titleActive: true });

      expect(StyleSheet.flatten(getByTestId('scope-label').props.style).color).toBe(colors.primary);
      expect(getByTestId('scope-title-chevron').props.color).toBe(colors.primary);
    });

    // A hairline, not a middot: it says "two facets of one scope", where a dot
    // would only say "two words in a row".
    it('is parted from the period by a hairline rule', async () => {
      const { getByTestId } = await setup();

      const divider = StyleSheet.flatten(getByTestId('scope-divider').props.style);
      expect(divider.width).toBe(StyleSheet.hairlineWidth);
      expect(divider.backgroundColor).toBe(colors.border);
    });
  });

  describe('one line, centred', () => {
    // The period and the currency are one pair on the pager's own line — the
    // header has no second row to grow into.
    it('keeps the currency on the pager row', async () => {
      const { getByTestId } = await setup();

      const scope = getByTestId('scope-scope');
      expect(within(scope).getByTestId('scope-label')).toBeTruthy();
      expect(within(scope).getByTestId('scope-currency-chip')).toBeTruthy();
    });

    // `flex: 1` is `flexBasis: 0` in RN, so the end slots stay equal whatever
    // they hold — which is why the jump button needs no mirror slot inside the
    // centred pair. Without this the pair drifts off the screen's centre line
    // the moment the jump button mounts.
    it('holds the pair on the centre line when the jump button mounts', async () => {
      const bare = await setup();
      const withJump = await setup({ showJumpToCurrent: true, jumpLabel: 'today' });

      [bare, withJump].forEach(({ getByTestId }) => {
        expect(StyleSheet.flatten(getByTestId('scope-nav-start').props.style).flex).toBe(1);
        expect(StyleSheet.flatten(getByTestId('scope-nav-end').props.style).flex).toBe(1);
        expect(StyleSheet.flatten(getByTestId('scope-scope').props.style).flex).toBeUndefined();
      });

      // No spacer appears in the pair to balance the glyph: the pair's own
      // composition does not change at all.
      expect(withJump.getByTestId('scope-scope').children.length)
        .toBe(bare.getByTestId('scope-scope').children.length);
    });

    // `flexBasis: 0` keeps the ends equal only while there is slack to share.
    // Yoga has no automatic minimum size, so once there is none a slot resolves
    // narrower than its own contents and the glyph draws over the period name
    // — hence a floor on each end. The floor is that end's *own* contents: the
    // right end must not reserve room for a glyph it does not hold, which is
    // the mirror slot this layout exists to be rid of. Under that much pressure
    // the pair drifts a few dp off centre, which is the cheaper loss.
    it('floors each end at its own contents and never mirrors the glyph', async () => {
      const floors = async (props) => {
        const { getByTestId } = await setup(props);
        return ['scope-nav-start', 'scope-nav-end']
          .map(id => StyleSheet.flatten(getByTestId(id).props.style).minWidth);
      };

      const [bareStart, bareEnd] = await floors();
      const [jumpStart, jumpEnd] = await floors({ showJumpToCurrent: true, jumpLabel: 'today' });

      expect(bareStart).toBe(bareEnd);
      expect(jumpStart).toBeGreaterThan(bareStart);
      expect(jumpEnd).toBe(bareEnd);
    });

    // The code is meaningless once it is clipped, so the period name is the
    // only thing allowed to give up characters.
    it('lets the period name shrink and never the currency code', async () => {
      const { getByTestId } = await setup();

      expect(StyleSheet.flatten(getByTestId('scope-label').props.style).flexShrink).toBe(1);
      expect(getByTestId('scope-label').props.numberOfLines).toBe(1);
      expect(StyleSheet.flatten(getByTestId('scope-currency-chip').props.style).flexShrink).toBe(0);
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
    // is taller at a large font scale.
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

    ['scope-header', 'scope-surface', 'scope-fade', 'scope-nav-start', 'scope-nav-end',
      'scope-prev', 'scope-next', 'scope-scope', 'scope-picker', 'scope-label',
      'scope-title-chevron', 'scope-jump-current', 'scope-divider',
      'scope-currency-chip', 'scope-currency-chevron'].forEach(id => {
      expect(getByTestId(id)).toBeTruthy();
    });
  });
});
