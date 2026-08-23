/**
 * Tests for ColdStartScreen — the screen shown while the first database reads
 * of a launch are in flight.
 *
 * The sequence is handed to the UI thread as one set of delayed animations, so
 * there is no JS-side clock to advance and the globally mocked Reanimated
 * (jest.setup.js) collapses every animation to its target value. These tests
 * therefore check two things: what the component *schedules* (the delays and
 * durations that make up the timeline), and `planWindDown`, the pure function
 * that decides what happens when the data lands mid-sequence — which is where
 * the subtle behaviour lives.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { useReducedMotion, withDelay, withTiming } from 'react-native-reanimated';
import ColdStartScreen, {
  hasColdStartPlayed,
  planWindDown,
} from '../../app/components/startup/ColdStartScreen';
import { useLocalization } from '../../app/contexts/LocalizationContext';
import { useAccountsData } from '../../app/contexts/AccountsDataContext';
import { useCategories } from '../../app/contexts/CategoriesContext';
import { useOperationsData } from '../../app/contexts/OperationsDataContext';
import { useThemeConfig } from '../../app/contexts/ThemeConfigContext';
import { COLD_START } from '../../app/styles/designTokens';

jest.mock('../../app/contexts/LocalizationContext', () => ({ useLocalization: jest.fn() }));
jest.mock('../../app/contexts/AccountsDataContext', () => ({ useAccountsData: jest.fn() }));
jest.mock('../../app/contexts/CategoriesContext', () => ({ useCategories: jest.fn() }));
jest.mock('../../app/contexts/OperationsDataContext', () => ({ useOperationsData: jest.fn() }));
jest.mock('../../app/contexts/ThemeConfigContext', () => ({ useThemeConfig: jest.fn() }));

const T = COLD_START;
const COIN_RISE = 52; // mirrors the component's geometry

const setLoading = (loading) => {
  useLocalization.mockReturnValue({ t: (key) => key, isLoading: loading });
  useAccountsData.mockReturnValue({ loading });
  useCategories.mockReturnValue({ loading });
  useOperationsData.mockReturnValue({ loading });
};

const advance = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

const delaysUsed = () => withDelay.mock.calls.map(([delay]) => delay);

describe('ColdStartScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useThemeConfig.mockReturnValue({ colorScheme: 'dark', isThemeLoaded: true });
    setLoading(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('shows the brand surface while the first reads are pending', async () => {
      const onFinish = jest.fn();
      const { getByTestId } = await render(<ColdStartScreen onFinish={onFinish} />);

      expect(getByTestId('cold-start-screen')).toBeTruthy();
      await advance(T.captionThreshold);
      expect(onFinish).not.toHaveBeenCalled();
    });

    // Module state on purpose — the flag belongs to the launch, so it stays set
    // for every later mount in this file once the first test has rendered.
    it('marks the sequence as played for the rest of the launch', async () => {
      await render(<ColdStartScreen onFinish={jest.fn()} />);
      expect(hasColdStartPlayed()).toBe(true);
    });
  });

  describe('The sequence is handed to the UI thread', () => {
    it('starts the turn after the hold, and turns exactly once', async () => {
      await render(<ColdStartScreen onFinish={jest.fn()} />);

      expect(withTiming).toHaveBeenCalledWith(360, expect.objectContaining({ duration: T.spin }));
      expect(delaysUsed()).toContain(T.hold);
    });

    it('schedules the three coins staggered, all after the turn has begun', async () => {
      await render(<ColdStartScreen onFinish={jest.fn()} />);

      const expected = [0, 1, 2].map((i) => T.firstCoin + i * T.coinStagger);
      expected.forEach((at) => {
        expect(delaysUsed()).toContain(at);
        expect(at).toBeGreaterThan(T.hold);
      });
      expect(withTiming).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ duration: T.coinFall }),
      );
    });

    it('schedules the slow-path caption rather than showing it straight away', async () => {
      await render(<ColdStartScreen onFinish={jest.fn()} />);

      expect(delaysUsed()).toContain(T.captionThreshold);
      expect(withTiming).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ duration: T.captionFade }),
      );
    });

    it('needs no JS clock to run the sequence', async () => {
      await render(<ColdStartScreen onFinish={jest.fn()} />);
      const scheduledAtMount = withTiming.mock.calls.length;

      await advance(T.captionThreshold * 2);

      // Nothing new was asked for as JS time passed: the whole timeline was
      // handed over at mount, so a blocked JS thread — which is exactly what
      // this screen covers for — cannot stall it.
      expect(withTiming.mock.calls.length).toBe(scheduledAtMount);
    });
  });

  describe('Handing back to the app', () => {
    it('cross-fades and calls back once the reads land', async () => {
      const onFinish = jest.fn();
      const { rerender } = await render(<ColdStartScreen onFinish={onFinish} />);

      setLoading(false);
      await act(async () => { await rerender(<ColdStartScreen onFinish={onFinish} />); });

      expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: T.dissolve }));
      expect(onFinish).not.toHaveBeenCalled();
      await advance(T.dissolve);
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('gives the cross-fade longer when the app is in the light theme', async () => {
      useThemeConfig.mockReturnValue({ colorScheme: 'light', isThemeLoaded: true });
      setLoading(false);
      const onFinish = jest.fn();
      await render(<ColdStartScreen onFinish={onFinish} />);

      await advance(T.dissolve);
      expect(onFinish).not.toHaveBeenCalled();
      await advance(T.dissolveToLight - T.dissolve);
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('takes the longer cross-fade while the stored theme is still unknown', async () => {
      // `colorScheme` is only the OS scheme until the preference is read, so a
      // dark-looking device is not yet proof of a dark app.
      useThemeConfig.mockReturnValue({ colorScheme: 'dark', isThemeLoaded: false });
      setLoading(false);
      const onFinish = jest.fn();
      await render(<ColdStartScreen onFinish={onFinish} />);

      await advance(T.dissolve);
      expect(onFinish).not.toHaveBeenCalled();
      await advance(T.dissolveToLight - T.dissolve);
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('stops swallowing taps once the surface starts fading', async () => {
      setLoading(false);
      const { getByTestId } = await render(<ColdStartScreen onFinish={jest.fn()} />);

      expect(getByTestId('cold-start-screen').props.pointerEvents).toBe('none');
    });

    it('drops its pending timer when unmounted mid-sequence', async () => {
      const onFinish = jest.fn();
      const { unmount } = await render(<ColdStartScreen onFinish={onFinish} />);

      await act(async () => { await unmount(); });
      await advance(T.captionThreshold * 2);

      expect(onFinish).not.toHaveBeenCalled();
    });
  });
});

describe('ColdStartScreen with reduced motion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useReducedMotion.mockReturnValue(true);
    useThemeConfig.mockReturnValue({ colorScheme: 'dark', isThemeLoaded: true });
    setLoading(true);
  });

  afterEach(() => {
    useReducedMotion.mockReturnValue(false);
    jest.useRealTimers();
  });

  it('never schedules a turn or a fall', async () => {
    await render(<ColdStartScreen onFinish={jest.fn()} />);

    expect(withTiming).not.toHaveBeenCalledWith(360, expect.anything());
    expect(withTiming).not.toHaveBeenCalledWith(
      0,
      expect.objectContaining({ duration: T.coinFall }),
    );
  });

  it('still schedules the slow-path caption — the wait is no shorter', async () => {
    await render(<ColdStartScreen onFinish={jest.fn()} />);

    expect(delaysUsed()).toContain(T.captionThreshold);
  });

  it('cross-fades into the app once the reads land', async () => {
    const onFinish = jest.fn();
    const { rerender } = await render(<ColdStartScreen onFinish={onFinish} />);

    setLoading(false);
    await act(async () => { await rerender(<ColdStartScreen onFinish={onFinish} />); });

    expect(onFinish).not.toHaveBeenCalled();
    await advance(T.dissolve);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('planWindDown', () => {
  const still = { opacity: 0, y: -COIN_RISE };
  const landed = { opacity: 1, y: 0 };
  const falling = (fraction) => ({ opacity: 1, y: -COIN_RISE * fraction });

  it('leaves everything alone and asks for no wait when nothing has moved', () => {
    const { spinTarget, hidden, tail } = planWindDown(0, [still, still, still]);

    expect(spinTarget).toBeNull();
    expect(hidden).toEqual([true, true, true]);
    expect(tail).toBe(0);
  });

  it('finishes the half-turn the mark is in', () => {
    expect(planWindDown(30, [still, still, still]).spinTarget).toBe(180);
    expect(planWindDown(179, [still, still, still]).spinTarget).toBe(180);
    expect(planWindDown(181, [still, still, still]).spinTarget).toBe(360);
    expect(planWindDown(359, [still, still, still]).spinTarget).toBe(360);
  });

  it('never cuts the turn shorter than the floor', () => {
    // 359° is one degree from home, which would be an invisible flick.
    expect(planWindDown(359, [still, still, still]).tail).toBe(T.minHalfTurn);
  });

  it('leaves a mark that has already come to rest alone', () => {
    expect(planWindDown(360, [landed, landed, landed]).spinTarget).toBeNull();
  });

  it('hides only the coins that never appeared', () => {
    const { hidden } = planWindDown(360, [landed, falling(0.5), still]);

    expect(hidden).toEqual([false, false, true]);
  });

  it('waits for a coin still in the air, in proportion to how far it has left', () => {
    const halfway = planWindDown(360, [landed, falling(0.5), still]).tail;
    const nearlyDown = planWindDown(360, [landed, falling(0.1), still]).tail;

    expect(halfway).toBeCloseTo(T.coinFall * 0.5 + T.coinSquash * 2);
    expect(nearlyDown).toBeLessThan(halfway);
  });

  it('waits for whichever of the mark and the coins takes longest', () => {
    // A fresh coin needs the whole fall; a mark one degree short needs the floor.
    const { tail } = planWindDown(359, [falling(1), landed, landed]);

    expect(tail).toBe(T.coinFall + T.coinSquash * 2);
    expect(tail).toBeGreaterThan(T.minHalfTurn);
  });

  it('asks for no wait once every coin has landed and the mark has stopped', () => {
    expect(planWindDown(360, [landed, landed, landed]).tail).toBe(0);
  });
});
