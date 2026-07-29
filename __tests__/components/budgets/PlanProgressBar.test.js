import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import PlanProgressBar, { overspendFraction } from '../../../app/components/budgets/PlanProgressBar';

const COLORS = {
  track: '#aaaaaa26',
  fill: '#aaaaaa99',
  overspend: '#FF6B6B',
};

const renderBar = async (props = {}) => render(
  <PlanProgressBar
    ratio={0.5}
    trackColor={COLORS.track}
    fillColor={COLORS.fill}
    overspendColor={COLORS.overspend}
    testID="bar"
    {...props}
  />,
);

const styleOf = (node) => StyleSheet.flatten(node.props.style);

describe('PlanProgressBar', () => {
  // The whole reason this component replaced a background wash: the wash clamped
  // its fraction to 1, so a row 1% over target and a row 248% over target drew
  // the same full-width block — and on a real month-end plan most rows are over.
  describe('overspendFraction', () => {
    it('maps the unbounded overspend range into the zone without ever filling it', () => {
      expect(overspendFraction(2)).toBeCloseTo(0.5, 5);
      expect(overspendFraction(3.5)).toBeCloseTo(0.714, 3);
      expect(overspendFraction(10)).toBeCloseTo(0.9, 5);
      expect(overspendFraction(1000)).toBeLessThan(1);
    });

    it('keeps barely-over and wildly-over visibly apart', () => {
      // 101% is a sliver; 348% is most of the zone. The old wash gave both the
      // same full bar.
      const barelyOver = overspendFraction(1.01);
      const wildlyOver = overspendFraction(3.48);
      expect(barelyOver).toBeLessThan(0.02);
      expect(wildlyOver).toBeGreaterThan(0.7);
    });

    it('is monotonic — more spending is always more bar', () => {
      const ratios = [1.05, 1.5, 2, 4, 8, 20];
      const fractions = ratios.map(overspendFraction);
      for (let i = 1; i < fractions.length; i += 1) {
        expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
      }
    });

    it('starts at zero when the target is exactly met', () => {
      expect(overspendFraction(1)).toBe(0);
    });
  });

  describe('Segments', () => {
    it('draws only the plan segment for a line inside its target', async () => {
      const { getByTestId, queryByTestId } = await renderBar({ ratio: 0.4 });
      expect(getByTestId('bar-plan')).toBeTruthy();
      expect(queryByTestId('bar-over')).toBeNull();
    });

    it('adds the overspend segment once the target is passed', async () => {
      const { getByTestId } = await renderBar({ ratio: 1.4 });
      expect(getByTestId('bar-over')).toBeTruthy();
      expect(styleOf(getByTestId('bar-over')).backgroundColor).toBe(COLORS.overspend);
    });

    it('draws no overspend segment at exactly the target', async () => {
      const { queryByTestId } = await renderBar({ ratio: 1 });
      expect(queryByTestId('bar-over')).toBeNull();
    });

    it('keeps the plan segment neutral — the only signal colour is the overspend', async () => {
      const { getByTestId } = await renderBar({ ratio: 1.8 });
      expect(styleOf(getByTestId('bar-plan')).backgroundColor).toBe(COLORS.fill);
      expect(styleOf(getByTestId('bar-plan')).backgroundColor).not.toBe(COLORS.overspend);
    });

    it('survives a status that has no usable ratio', async () => {
      // A line whose target is zero divides by zero upstream; the bar must draw
      // an empty track rather than a NaN transform.
      const { getByTestId, queryByTestId } = await renderBar({ ratio: Number.NaN });
      expect(getByTestId('bar')).toBeTruthy();
      expect(queryByTestId('bar-over')).toBeNull();
    });
  });

  // The target boundary used to be nothing but the step in brightness between
  // the two track zones — which the fill covers on any row at or past its
  // target, i.e. on most rows of a month-end plan, leaving nothing on the strip
  // to read the target off.
  describe('Target boundary', () => {
    it('leaves a gap between the two zones, so the target is marked on an empty track', async () => {
      const { getByTestId } = await renderBar({ ratio: 0.4 });
      expect(styleOf(getByTestId('bar-plan-zone')).width).toBe('72%');
      expect(styleOf(getByTestId('bar-over-zone')).left).toBe('72.8%');
    });

    it('keeps the gap when the fill has covered the whole plan zone', async () => {
      // The case the old brightness step could not survive: solid fill up to the
      // target, solid overspend past it, and nothing in between to read.
      const { getByTestId } = await renderBar({ ratio: 1.8 });
      expect(styleOf(getByTestId('bar-plan')).width).toBe('72%');
      expect(styleOf(getByTestId('bar-over')).left).toBe('72.8%');
    });

    it('starts the overspend segment where its zone starts, not at the target', async () => {
      // Both zone and fill move together; an overspend segment still anchored to
      // 72% would paint over the gap the moment a row went over.
      const { getByTestId } = await renderBar({ ratio: 2 });
      expect(styleOf(getByTestId('bar-over')).left)
        .toBe(styleOf(getByTestId('bar-over-zone')).left);
      expect(styleOf(getByTestId('bar-over')).width).toBe('27.2%');
    });

    it('leaves the gap as the only vertical on the strip', async () => {
      // The bar used to carry a second mark for the month's pace, and a reader
      // looking for the target read whichever vertical was there as the target.
      // Nothing but the two zones and their fills is drawn now.
      const { getByTestId, queryByTestId } = await renderBar({ ratio: 1.8 });
      expect(queryByTestId('bar-pace')).toBeNull();
      expect(styleOf(getByTestId('bar-over-zone')).left).toBe('72.8%');
    });
  });
});
