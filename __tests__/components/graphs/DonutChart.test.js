import React from 'react';
import { render } from '@testing-library/react-native';
import DonutChart, {
  computeSegments,
  CIRCUMFERENCE,
  CENTER,
  RADIUS,
  ICON_THRESHOLD,
} from '../../../app/components/graphs/DonutChart';

describe('computeSegments', () => {
  it('returns empty array for empty data', () => {
    expect(computeSegments([])).toEqual([]);
  });

  it('returns empty array when all amounts are zero', () => {
    expect(computeSegments([{ amount: 0, color: '#f00', icon: 'food' }])).toEqual([]);
  });

  it('arc lengths sum to CIRCUMFERENCE', () => {
    const data = [
      { amount: 450, color: '#f00', icon: 'food' },
      { amount: 300, color: '#0f0', icon: 'car' },
      { amount: 250, color: '#00f', icon: 'shopping' },
    ];
    const segs = computeSegments(data);
    const total = segs.reduce((s, seg) => s + seg.arcLength, 0);
    expect(total).toBeCloseTo(CIRCUMFERENCE, 5);
  });

  it('first segment has dashOffset of 0', () => {
    const data = [
      { amount: 500, color: '#f00', icon: 'food' },
      { amount: 500, color: '#0f0', icon: 'car' },
    ];
    expect(computeSegments(data)[0].dashOffset).toBe(0);
  });

  it('each subsequent segment dashOffset equals negative sum of prior arcLengths', () => {
    const data = [
      { amount: 400, color: '#f00', icon: 'food' },
      { amount: 300, color: '#0f0', icon: 'car' },
      { amount: 300, color: '#00f', icon: 'shopping' },
    ];
    const segs = computeSegments(data);
    expect(segs[1].dashOffset).toBeCloseTo(-segs[0].arcLength, 5);
    expect(segs[2].dashOffset).toBeCloseTo(-(segs[0].arcLength + segs[1].arcLength), 5);
  });

  it('shows icon for segment exactly at ICON_THRESHOLD', () => {
    const pct = ICON_THRESHOLD; // 10%
    const data = [
      { amount: 1 - pct, color: '#f00', icon: 'food' },
      { amount: pct,     color: '#0f0', icon: 'car' },
    ];
    const segs = computeSegments(data);
    expect(segs[1].showIcon).toBe(true);
  });

  it('hides icon for segment just below ICON_THRESHOLD', () => {
    const data = [
      { amount: 0.91, color: '#f00', icon: 'food' },
      { amount: 0.09, color: '#0f0', icon: 'car' }, // 9%
    ];
    expect(computeSegments(data)[1].showIcon).toBe(false);
  });

  it('hides icon when item.icon is falsy', () => {
    const data = [{ amount: 1000, color: '#f00', icon: null }];
    expect(computeSegments(data)[0].showIcon).toBe(false);
  });

  it('single segment spans full circumference', () => {
    const segs = computeSegments([{ amount: 100, color: '#f00', icon: 'food' }]);
    expect(segs[0].arcLength).toBeCloseTo(CIRCUMFERENCE, 5);
    expect(segs[0].dashOffset).toBe(0);
  });

  it('icon position math: full-circle segment midAngle=π maps to bottom (x≈CENTER, y≈CENTER+RADIUS)', () => {
    const segs = computeSegments([{ amount: 1, color: '#f00', icon: 'food' }]);
    // midAngle = (0 + CIRCUMFERENCE/2) / RADIUS = π
    expect(segs[0].iconX).toBeCloseTo(CENTER, 1);         // sin(π) ≈ 0
    expect(segs[0].iconY).toBeCloseTo(CENTER + RADIUS, 1); // −cos(π) = 1
  });

  it('preserves color and icon from input', () => {
    const segs = computeSegments([{ amount: 100, color: '#abc123', icon: 'pizza' }]);
    expect(segs[0].color).toBe('#abc123');
    expect(segs[0].icon).toBe('pizza');
  });
});

describe('DonutChart', () => {
  const mockData = [
    { amount: 560, color: '#7c83fd', icon: 'food' },   // 60.9% — above threshold
    { amount: 280, color: '#fd7c7c', icon: 'car' },    // 30.4% — above threshold
    { amount: 80,  color: '#7ce8fd', icon: 'heart' },  //  8.7% — below threshold
  ];

  it('renders without crashing', () => {
    expect(() => render(<DonutChart data={mockData} />)).not.toThrow();
  });

  it('renders icons for segments at or above threshold', () => {
    const { queryAllByTestId } = render(<DonutChart data={mockData} />);
    expect(queryAllByTestId('icon-food').length).toBeGreaterThan(0);
    expect(queryAllByTestId('icon-car').length).toBeGreaterThan(0);
  });

  it('does not render icon for segment below threshold', () => {
    const { queryByTestId } = render(<DonutChart data={mockData} />);
    expect(queryByTestId('icon-heart')).toBeNull();
  });

  it('renders no icons when data is empty', () => {
    const { queryAllByTestId } = render(<DonutChart data={[]} />);
    expect(queryAllByTestId(/^icon-/).length).toBe(0);
  });

  it('renders no icons when items have no icon property', () => {
    const data = [{ amount: 1000, color: '#f00', icon: null }];
    const { queryAllByTestId } = render(<DonutChart data={data} />);
    expect(queryAllByTestId(/^icon-/).length).toBe(0);
  });

  it('renders a single icon for a single above-threshold item', () => {
    const data = [{ amount: 100, color: '#7c83fd', icon: 'food' }];
    const { queryAllByTestId } = render(<DonutChart data={data} />);
    expect(queryAllByTestId('icon-food').length).toBeGreaterThan(0);
  });
});
