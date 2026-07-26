/**
 * Tests for DonutChart — the Victory Native XL pie/donut used by the expense and
 * income cards. Slice rendering happens inside the Skia canvas (and is stubbed by
 * the global victory-native mock), so the geometry helpers are tested directly.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import DonutChart, {
  CENTER,
  ICON_THRESHOLD,
  computeIconMarkers,
  computeSliceGradient,
  mapPieData,
} from '../../app/components/graphs/DonutChart';

describe('DonutChart', () => {
  describe('mapPieData', () => {
    it('maps slices onto the keys Victory expects', () => {
      const result = mapPieData([
        { amount: 10, color: '#f00', icon: 'food' },
        { amount: 20, color: '#0f0' },
      ]);

      expect(result).toEqual([
        { label: 'food-0', value: 10, color: '#f00' },
        { label: 'slice-1', value: 20, color: '#0f0' },
      ]);
    });

    it('handles an empty dataset', () => {
      expect(mapPieData([])).toEqual([]);
    });
  });

  describe('computeIconMarkers', () => {
    it('returns no markers when the total is zero', () => {
      expect(computeIconMarkers([{ amount: 0, color: '#f00', icon: 'food' }])).toEqual([]);
    });

    it('hides icons for slices below the visibility threshold', () => {
      const markers = computeIconMarkers([
        { amount: 99, color: '#f00', icon: 'food' },
        { amount: 1, color: '#0f0', icon: 'car' },
      ]);

      expect(markers[0].showIcon).toBe(true);
      expect(markers[1].showIcon).toBe(false);
      expect(1 / 100).toBeLessThan(ICON_THRESHOLD);
    });

    it('places a single full slice marker at 12 oclock, above the centre', () => {
      const [marker] = computeIconMarkers([{ amount: 50, color: '#f00', icon: 'food' }]);

      // A lone slice spans the whole circle, so its midpoint sits at the bottom.
      expect(marker.x).toBeCloseTo(CENTER, 5);
      expect(marker.y).toBeGreaterThan(CENTER);
    });
  });

  describe('computeSliceGradient', () => {
    const slice = {
      radius: 100,
      startAngle: 0,
      endAngle: 90,
      center: { x: 0, y: 0 },
      color: '#f00',
    };

    it('starts halfway out along the leading edge', () => {
      const { start } = computeSliceGradient(slice);

      expect(start.x).toBeCloseTo(50, 5);
      expect(start.y).toBeCloseTo(0, 5);
    });

    it('ends on the rim along the slice midline', () => {
      const { end } = computeSliceGradient(slice);

      // Midline of a 0..90 slice is 45deg → both components are r/sqrt(2).
      expect(end.x).toBeCloseTo(70.71, 1);
      expect(end.y).toBeCloseTo(70.71, 1);
    });

    it('offsets by the slice centre', () => {
      const { start, end } = computeSliceGradient({ ...slice, center: { x: 10, y: 20 } });

      expect(start.x).toBeCloseTo(60, 5);
      expect(start.y).toBeCloseTo(20, 5);
      expect(end.x).toBeCloseTo(80.71, 1);
      expect(end.y).toBeCloseTo(90.71, 1);
    });
  });

  describe('Rendering', () => {
    const data = [
      { amount: 60, color: '#f00', icon: 'food' },
      { amount: 40, color: '#0f0', icon: 'car' },
    ];

    it('renders the donut container', () => {
      const { getByTestId } = render(<DonutChart data={data} />);

      expect(getByTestId('donut-chart')).toBeTruthy();
    });

    it('renders an icon overlay for slices above the threshold', () => {
      const { getByTestId } = render(<DonutChart data={data} />);

      expect(getByTestId('icon-food')).toBeTruthy();
      expect(getByTestId('icon-car')).toBeTruthy();
    });

    it('renders with an inset colour', () => {
      const { getByTestId } = render(<DonutChart data={data} insetColor="#fff" />);

      expect(getByTestId('donut-chart')).toBeTruthy();
    });
  });
});
