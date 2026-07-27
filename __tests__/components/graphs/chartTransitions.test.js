/**
 * chartTransitions Tests
 *
 * The income/expense panel holds both charts stacked on top of each other, so a
 * transition is defined by where the incoming chart comes from and where the
 * outgoing one goes. These offsets are what makes a tab switch read as sideways
 * movement and an open/close read as vertical movement.
 */

import {
  chartTransitionOffsets,
  CHART_DROP,
  CHART_SLIDE,
} from '../../../app/components/graphs/chartTransitions';

describe('chartTransitions', () => {
  describe('opening from collapsed', () => {
    it('drops the chart down and moves nothing out', () => {
      expect(chartTransitionOffsets(null, 'income')).toEqual({
        enter: { x: 0, y: CHART_DROP },
        exit: null,
      });
    });

    it('treats both tabs the same way', () => {
      expect(chartTransitionOffsets(null, 'expense'))
        .toEqual(chartTransitionOffsets(null, 'income'));
    });
  });

  describe('collapsing', () => {
    it('sinks the open chart back down', () => {
      expect(chartTransitionOffsets('expense', null)).toEqual({
        enter: null,
        exit: { x: 0, y: CHART_DROP },
      });
    });

    it('moves nothing when there was no open tab', () => {
      expect(chartTransitionOffsets(null, null)).toEqual({ enter: null, exit: null });
    });
  });

  describe('switching tabs', () => {
    // Income is the left tab: moving to expense is travel to the right, so the
    // new chart arrives from the right edge and the old one exits left.
    it('moves rightwards from income to expense', () => {
      expect(chartTransitionOffsets('income', 'expense')).toEqual({
        enter: { x: CHART_SLIDE, y: 0 },
        exit: { x: -CHART_SLIDE, y: 0 },
      });
    });

    it('mirrors the direction going back', () => {
      expect(chartTransitionOffsets('expense', 'income')).toEqual({
        enter: { x: -CHART_SLIDE, y: 0 },
        exit: { x: CHART_SLIDE, y: 0 },
      });
    });

    it('never mixes vertical movement into a sideways switch', () => {
      const { enter, exit } = chartTransitionOffsets('income', 'expense');

      expect(enter.y).toBe(0);
      expect(exit.y).toBe(0);
    });

    it('sends the two charts in opposite directions so they do not overlap mid-flight', () => {
      const { enter, exit } = chartTransitionOffsets('expense', 'income');

      expect(Math.sign(enter.x)).toBe(-Math.sign(exit.x));
    });
  });

  describe('re-opening the tab that is already open', () => {
    // The screen turns this into a collapse before calling in, but the helper
    // should still describe a sane transition rather than a sideways slide.
    it('falls back to the vertical drop', () => {
      expect(chartTransitionOffsets('income', 'income')).toEqual({
        enter: { x: 0, y: CHART_DROP },
        exit: null,
      });
    });
  });
});
