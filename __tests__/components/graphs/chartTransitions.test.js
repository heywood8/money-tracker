/**
 * chartTransitions Tests
 *
 * The income/expense panel holds both charts stacked on top of each other, so a
 * transition is defined by how the incoming chart arrives and how the outgoing
 * one leaves. Opening and closing the panel is vertical movement; switching
 * between the two tabs is a fade through — the outgoing chart is completely gone
 * before the incoming one starts, so the two are never on screen together.
 */

import {
  chartTransition,
  CHART_DROP,
  OPEN_DURATION,
  CLOSE_DURATION,
  FADE_ENTER_SCALE,
  FADE_EXIT_SCALE,
  FADE_ENTER_DURATION,
  FADE_EXIT_DURATION,
  FADE_ENTER_DELAY,
} from '../../../app/components/graphs/chartTransitions';

describe('chartTransitions', () => {
  describe('opening from collapsed', () => {
    it('drops the chart down and moves nothing out', () => {
      expect(chartTransition(null, 'income')).toEqual({
        enter: { y: CHART_DROP, scale: 1, delay: 0, duration: OPEN_DURATION },
        exit: null,
      });
    });

    it('treats both tabs the same way', () => {
      expect(chartTransition(null, 'expense'))
        .toEqual(chartTransition(null, 'income'));
    });

    it('does not scale — the panel height is already animating', () => {
      expect(chartTransition(null, 'income').enter.scale).toBe(1);
    });

    it('starts immediately, since nothing has to clear the screen first', () => {
      expect(chartTransition(null, 'income').enter.delay).toBe(0);
    });
  });

  describe('collapsing', () => {
    it('sinks the open chart back down without scaling it', () => {
      expect(chartTransition('expense', null)).toEqual({
        enter: null,
        exit: { y: CHART_DROP, scale: 1, duration: CLOSE_DURATION },
      });
    });

    it('moves nothing when there was no open tab', () => {
      expect(chartTransition(null, null)).toEqual({ enter: null, exit: null });
    });
  });

  describe('switching tabs', () => {
    it('fades the old chart out and grows the new one in', () => {
      expect(chartTransition('income', 'expense')).toEqual({
        enter: {
          y: 0,
          scale: FADE_ENTER_SCALE,
          delay: FADE_ENTER_DELAY,
          duration: FADE_ENTER_DURATION,
        },
        exit: { y: 0, scale: FADE_EXIT_SCALE, duration: FADE_EXIT_DURATION },
      });
    });

    // The slide this replaced was directional; a fade through is not. Both
    // directions must produce the identical transition, or the panel would read
    // as a pager again.
    it('is the same transition whichever way you go', () => {
      expect(chartTransition('expense', 'income'))
        .toEqual(chartTransition('income', 'expense'));
    });

    it('never mixes vertical movement into a switch', () => {
      const { enter, exit } = chartTransition('income', 'expense');

      expect(enter.y).toBe(0);
      expect(exit.y).toBe(0);
    });

    it('grows the incoming chart from below full size', () => {
      const { enter } = chartTransition('income', 'expense');

      expect(enter.scale).toBeGreaterThan(0);
      expect(enter.scale).toBeLessThan(1);
    });

    it('shrinks the outgoing chart, but only barely', () => {
      const { exit } = chartTransition('income', 'expense');

      expect(exit.scale).toBeLessThan(1);
      expect(exit.scale).toBeGreaterThan(FADE_ENTER_SCALE);
    });

    // This is the definition of a fade through, as opposed to a cross-fade.
    it('does not start the incoming chart before the outgoing one has gone', () => {
      const { enter, exit } = chartTransition('income', 'expense');

      expect(enter.delay).toBeGreaterThanOrEqual(exit.duration);
      expect(FADE_ENTER_DELAY).toBeGreaterThanOrEqual(FADE_EXIT_DURATION);
    });
  });

  describe('re-opening the tab that is already open', () => {
    // The screen turns this into a collapse before calling in, but the helper
    // should still describe a sane transition rather than a fade to itself.
    it('falls back to the vertical drop', () => {
      expect(chartTransition('income', 'income')).toEqual({
        enter: { y: CHART_DROP, scale: 1, delay: 0, duration: OPEN_DURATION },
        exit: null,
      });
    });
  });
});
