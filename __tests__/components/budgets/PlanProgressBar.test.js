import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import PlanProgressBar, { overspendFraction } from '../../../app/components/budgets/PlanProgressBar';

const COLORS = {
  track: '#aaaaaa26',
  fill: '#aaaaaa99',
  overspend: '#FF6B6B',
  pace: '#ffffff59',
};

const renderBar = async (props = {}) => render(
  <PlanProgressBar
    ratio={0.5}
    trackColor={COLORS.track}
    fillColor={COLORS.fill}
    overspendColor={COLORS.overspend}
    paceColor={COLORS.pace}
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

  describe('Pace marker', () => {
    it('is absent when the month has no pace to speak of', async () => {
      const { queryByTestId } = await renderBar({ pace: null });
      expect(queryByTestId('bar-pace')).toBeNull();
    });

    it('sits inside the plan zone, proportionally to the month', async () => {
      // The plan occupies 72% of the track, so half the month is at 36% — the
      // mark has to land where the fill would be at that point, not at half the
      // whole track.
      const { getByTestId } = await renderBar({ pace: 0.5 });
      expect(styleOf(getByTestId('bar-pace')).left).toBe('36%');
    });

    it('lands on the target boundary at the end of the month', async () => {
      const { getByTestId } = await renderBar({ pace: 1 });
      expect(styleOf(getByTestId('bar-pace')).left).toBe('72%');
    });

    it('clamps a pace outside the month rather than drawing off the track', async () => {
      const { getByTestId } = await renderBar({ pace: 1.4 });
      expect(styleOf(getByTestId('bar-pace')).left).toBe('72%');
    });
  });
});
