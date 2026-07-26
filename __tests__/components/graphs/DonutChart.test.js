import React from 'react';
import { render } from '@testing-library/react-native';
import DonutChart, {
  mapPieData,
  computeIconMarkers,
  computeSliceGradient,
  CENTER,
  ICON_RADIUS,
  ICON_THRESHOLD,
} from '../../../app/components/graphs/DonutChart';

describe('mapPieData', () => {
  it('maps amount/color onto Victory Native value/color keys', async () => {
    const data = [
      { amount: 450, color: '#f00', icon: 'food' },
      { amount: 300, color: '#0f0', icon: 'car' },
    ];
    expect(mapPieData(data)).toEqual([
      { label: 'food-0', value: 450, color: '#f00' },
      { label: 'car-1', value: 300, color: '#0f0' },
    ]);
  });

  it('produces a unique label even when icons repeat or are missing', async () => {
    const data = [
      { amount: 10, color: '#f00', icon: 'dots-horizontal' },
      { amount: 10, color: '#0f0', icon: 'dots-horizontal' },
      { amount: 10, color: '#00f', icon: null },
    ];
    const labels = mapPieData(data).map((d) => d.label);
    expect(new Set(labels).size).toBe(3);
    expect(labels).toEqual(['dots-horizontal-0', 'dots-horizontal-1', 'slice-2']);
  });

  it('returns an empty array for empty data', async () => {
    expect(mapPieData([])).toEqual([]);
  });
});

describe('computeIconMarkers', () => {
  it('returns empty array for empty data', async () => {
    expect(computeIconMarkers([])).toEqual([]);
  });

  it('returns empty array when all amounts are zero', async () => {
    expect(computeIconMarkers([{ amount: 0, color: '#f00', icon: 'food' }])).toEqual([]);
  });

  it('returns one marker per slice', async () => {
    const data = [
      { amount: 450, color: '#f00', icon: 'food' },
      { amount: 300, color: '#0f0', icon: 'car' },
      { amount: 250, color: '#00f', icon: 'shopping' },
    ];
    expect(computeIconMarkers(data)).toHaveLength(3);
  });

  it('shows icon for segment exactly at ICON_THRESHOLD', async () => {
    const pct = ICON_THRESHOLD; // 10%
    const data = [
      { amount: 1 - pct, color: '#f00', icon: 'food' },
      { amount: pct, color: '#0f0', icon: 'car' },
    ];
    expect(computeIconMarkers(data)[1].showIcon).toBe(true);
  });

  it('hides icon for segment just below ICON_THRESHOLD', async () => {
    const data = [
      { amount: 0.91, color: '#f00', icon: 'food' },
      { amount: 0.09, color: '#0f0', icon: 'car' }, // 9%
    ];
    expect(computeIconMarkers(data)[1].showIcon).toBe(false);
  });

  it('hides icon when item.icon is falsy', async () => {
    const data = [{ amount: 1000, color: '#f00', icon: null }];
    expect(computeIconMarkers(data)[0].showIcon).toBe(false);
  });

  it('single full-circle slice midAngle=π maps to the bottom of the ring', async () => {
    const markers = computeIconMarkers([{ amount: 1, color: '#f00', icon: 'food' }]);
    // midAngle = (0 + 0.5) * 2π = π
    expect(markers[0].x).toBeCloseTo(CENTER, 1); // sin(π) ≈ 0
    expect(markers[0].y).toBeCloseTo(CENTER + ICON_RADIUS, 1); // −cos(π) = 1
  });

  it('a half-and-half split places markers on opposite sides (top vs bottom)', async () => {
    const markers = computeIconMarkers([
      { amount: 1, color: '#f00', icon: 'food' }, // midAngle = π/2 → right
      { amount: 1, color: '#0f0', icon: 'car' }, //  midAngle = 3π/2 → left
    ]);
    expect(markers[0].x).toBeCloseTo(CENTER + ICON_RADIUS, 1); // sin(π/2) = 1
    expect(markers[0].y).toBeCloseTo(CENTER, 1); // −cos(π/2) ≈ 0
    expect(markers[1].x).toBeCloseTo(CENTER - ICON_RADIUS, 1); // sin(3π/2) = −1
    expect(markers[1].y).toBeCloseTo(CENTER, 1); // −cos(3π/2) ≈ 0
  });

  it('preserves color and icon from input', async () => {
    const markers = computeIconMarkers([{ amount: 100, color: '#abc123', icon: 'pizza' }]);
    expect(markers[0].color).toBe('#abc123');
    expect(markers[0].icon).toBe('pizza');
  });
});

// Slice gradients are built inside the Pie.Chart render function, which runs on
// the Skia canvas and is stubbed by the global victory-native mock — so the
// geometry is asserted directly.
describe('computeSliceGradient', () => {
  const slice = {
    radius: 100,
    startAngle: 0,
    endAngle: 90,
    center: { x: 0, y: 0 },
    color: '#f00',
  };

  it('starts halfway out along the leading edge', async () => {
    const { start } = computeSliceGradient(slice);
    expect(start.x).toBeCloseTo(50, 5);
    expect(start.y).toBeCloseTo(0, 5);
  });

  it('ends on the rim along the slice midline', async () => {
    const { end } = computeSliceGradient(slice);
    // Midline of a 0..90 slice is 45°, so both components are r/√2.
    expect(end.x).toBeCloseTo(70.71, 1);
    expect(end.y).toBeCloseTo(70.71, 1);
  });

  it('offsets both endpoints by the slice centre', async () => {
    const { start, end } = computeSliceGradient({ ...slice, center: { x: 10, y: 20 } });
    expect(start.x).toBeCloseTo(60, 5);
    expect(start.y).toBeCloseTo(20, 5);
    expect(end.x).toBeCloseTo(80.71, 1);
    expect(end.y).toBeCloseTo(90.71, 1);
  });
});

describe('DonutChart', () => {
  const mockData = [
    { amount: 560, color: '#7c83fd', icon: 'food' }, // 60.9% — above threshold
    { amount: 280, color: '#fd7c7c', icon: 'car' }, // 30.4% — above threshold
    { amount: 80, color: '#7ce8fd', icon: 'heart' }, //  8.7% — below threshold
  ];

  it('renders without crashing', async () => {
    await render(<DonutChart data={mockData} />);
  });

  it('renders the Victory Native polar/pie donut primitives', async () => {
    const { getByTestId } = await render(<DonutChart data={mockData} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
    expect(getByTestId('polar-chart')).toBeTruthy();
    expect(getByTestId('vn-pie')).toBeTruthy();
  });

  it('renders icons for segments at or above threshold', async () => {
    const { queryAllByTestId } = await render(<DonutChart data={mockData} />);
    expect(queryAllByTestId('icon-food').length).toBeGreaterThan(0);
    expect(queryAllByTestId('icon-car').length).toBeGreaterThan(0);
  });

  it('does not render icon for segment below threshold', async () => {
    const { queryByTestId } = await render(<DonutChart data={mockData} />);
    expect(queryByTestId('icon-heart')).toBeNull();
  });

  it('still renders the donut (and no icons) when data is empty', async () => {
    const { getByTestId, queryAllByTestId } = await render(<DonutChart data={[]} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
    expect(getByTestId('polar-chart')).toBeTruthy();
    expect(queryAllByTestId(/^icon-/).length).toBe(0);
  });

  it('renders no icons when items have no icon property', async () => {
    const data = [{ amount: 1000, color: '#f00', icon: null }];
    const { queryAllByTestId } = await render(<DonutChart data={data} />);
    expect(queryAllByTestId(/^icon-/).length).toBe(0);
  });

  it('renders a single icon for a single above-threshold item', async () => {
    const data = [{ amount: 100, color: '#7c83fd', icon: 'food' }];
    const { queryAllByTestId } = await render(<DonutChart data={data} />);
    expect(queryAllByTestId('icon-food').length).toBeGreaterThan(0);
  });

  it('renders the same tree with slice insets enabled', async () => {
    const { getByTestId } = await render(<DonutChart data={mockData} insetColor="#ffffff" />);
    expect(getByTestId('donut-chart')).toBeTruthy();
    expect(getByTestId('vn-pie')).toBeTruthy();
  });
});
