import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Animated, Dimensions, Keyboard } from 'react-native';
import ModalShell from '../../app/components/ModalShell';

jest.mock('../../app/components/ModalBlurOverlay', () => () => null);

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      text: '#000', mutedText: '#888', border: '#ddd', primary: '#6200ee',
      card: '#fff', delete: '#f00',
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));

const SCREEN_HEIGHT = Dimensions.get('window').height;
const CARD_HEIGHT = 400;

const setup = async (props = {}) => render(
  <ModalShell
    visible
    title="Title"
    onDismiss={jest.fn()}
    onCancel={jest.fn()}
    {...props}
  >
    <></>
  </ModalShell>,
);

const layoutCard = async (getByTestId, height = CARD_HEIGHT) => {
  await act(async () => {
    fireEvent(getByTestId('modal-shell-card'), 'layout', {
      nativeEvent: { layout: { height, width: 300, x: 0, y: 0 } },
    });
  });
};

// The spring that takes the sheet away is the one aimed at the bottom of the screen;
// the open/snap-back springs target 0.
const lastExitSpringConfig = (spy) => {
  const exits = spy.mock.calls.filter(([, config]) => config.toValue === SCREEN_HEIGHT);
  return exits[exits.length - 1]?.[1];
};

describe('ModalShell exit animation', () => {
  let springSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    springSpy = jest.spyOn(Animated, 'spring');
  });

  afterEach(() => {
    springSpy.mockRestore();
  });

  // Regression: the exit spring used to rest on `restSpeedThreshold: 100`, which a
  // spring crossing a screen height only reaches ~0.47s in — long after the card
  // itself is out of sight (~0.2s). Everything in between was a blurred, empty
  // screen, because the app-wide blur is released by the dismissal this animation
  // completes into.
  it('ends the slide out as soon as the card has cleared the bottom edge', async () => {
    const { getByText, getByTestId } = await setup();
    await layoutCard(getByTestId);

    await act(async () => { fireEvent.press(getByText('cancel')); });

    const config = lastExitSpringConfig(springSpy);
    expect(config).toBeDefined();
    // Distance still left to travel at the moment the card's top edge passes the
    // bottom of the screen (plus a few px of clearance).
    expect(config.restDisplacementThreshold).toBe(SCREEN_HEIGHT - CARD_HEIGHT - 8);
    // Velocity says nothing about whether the card can still be seen, so it must
    // not be what holds the animation open.
    expect(config.restSpeedThreshold).toBeGreaterThan(10000);
  });

  it('accounts for the keyboard lifting the card off the bottom edge', async () => {
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener');
    try {
      const { getByText, getByTestId } = await setup();
      await layoutCard(getByTestId);

      const onShow = addListenerSpy.mock.calls.find(([event]) => event === 'keyboardDidShow')[1];
      await act(async () => { onShow({ endCoordinates: { height: 300 }, duration: 10 }); });
      // Let the (10ms) lift finish so the card is actually sitting 300px up.
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80); }); });

      await act(async () => { fireEvent.press(getByText('cancel')); });

      expect(lastExitSpringConfig(springSpy).restDisplacementThreshold)
        .toBe(SCREEN_HEIGHT - CARD_HEIGHT - 300 - 8);
    } finally {
      addListenerSpy.mockRestore();
    }
  });

  it('keeps a conservative threshold while the card has not been measured', async () => {
    const { getByText } = await setup();

    await act(async () => { fireEvent.press(getByText('cancel')); });

    const config = lastExitSpringConfig(springSpy);
    expect(config.restDisplacementThreshold).toBe(40);
    expect(config.restSpeedThreshold).toBe(100);
  });

  it('dismisses only once the sheet has finished leaving', async () => {
    const onCancel = jest.fn();
    const { getByText, getByTestId } = await setup({ onCancel });
    await layoutCard(getByTestId);

    await act(async () => { fireEvent.press(getByText('cancel')); });
    expect(onCancel).not.toHaveBeenCalled();

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });
});
