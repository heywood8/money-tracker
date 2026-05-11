# Graph Pie Chart — Donut + Side Legend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked pie-chart-above-legend layout in the expense and income expanded panels with a side-by-side donut chart (left) and legend list (right), where category icons appear on their respective arc segments.

**Architecture:** A new `DonutChart` component draws SVG arc segments via `react-native-svg` (already installed) and overlays absolutely-positioned `MaterialCommunityIcons` at each segment's midpoint. `ExpensePieChart` and `IncomePieChart` drop the chart-kit `PieChart` import and switch to a `flexDirection: 'row'` container holding `DonutChart` + `CustomLegend`.

**Tech Stack:** React Native, `react-native-svg` (Svg, Circle), `@expo/vector-icons` MaterialCommunityIcons, Jest + React Native Testing Library.

---

## File Map

| File | Action |
|------|--------|
| `app/components/graphs/DonutChart.js` | **Create** — SVG donut renderer + icon overlay + exported `computeSegments` |
| `__tests__/components/graphs/DonutChart.test.js` | **Create** — unit tests for `computeSegments` + component rendering |
| `app/components/graphs/ExpensePieChart.js` | **Modify** — swap PieChart → DonutChart, row layout |
| `__tests__/components/graphs/ExpensePieChart.test.js` | **Create** — rendering tests for updated component |
| `app/components/graphs/IncomePieChart.js` | **Modify** — same changes as ExpensePieChart |
| `__tests__/components/graphs/IncomePieChart.test.js` | **Create** — rendering tests for updated component |

`CustomLegend.js` is unchanged — it already uses `flex: 1` and adapts to its container width.

---

## Task 1: Create DonutChart with computeSegments

**Files:**
- Create: `app/components/graphs/DonutChart.js`
- Create: `__tests__/components/graphs/DonutChart.test.js`

### Geometry constants

```
SVG_SIZE = 140          width & height of the SVG canvas
RADIUS   = 48           center of the stroke ring
STROKE_WIDTH = 26       ring thickness (inner r=35, outer r=61)
CENTER   = 70           SVG center point (SVG_SIZE / 2)
CIRCUMFERENCE = 2π×48 ≈ 301.59
ICON_THRESHOLD = 0.10   minimum fraction to show icon on arc
ICON_SIZE = 14          icon px size (fits in 26px stroke width)
```

### Segment math

For each item (given cumulative arc length `C` consumed so far):
```
fraction  = item.amount / total
arcLength = fraction × CIRCUMFERENCE
midAngle  = (C + arcLength/2) / RADIUS   // radians clockwise from top
iconX     = CENTER + RADIUS × sin(midAngle)
iconY     = CENTER − RADIUS × cos(midAngle)
dashOffset = −C
```
Icon is shown when `fraction >= ICON_THRESHOLD && item.icon` is truthy.

---

- [ ] **Step 1.1: Write failing tests for `computeSegments`**

Create `__tests__/components/graphs/DonutChart.test.js`:

```js
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

  it('icon at top (midAngle≈0) maps to x≈CENTER, y≈CENTER−RADIUS', () => {
    // Two equal halves; first segment mid is at CIRCUMFERENCE/4 / RADIUS = π/2 from top
    // For a near-zero starting segment: use very large first half so second starts near top
    // Easier: verify via explicit formula. midAngle for a segment from 0% to 100%
    // is (0 + CIRCUMFERENCE/2) / RADIUS = π → bottom position
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
    const { queryByTestId } = render(<DonutChart data={mockData} />);
    expect(queryByTestId('icon-food')).not.toBeNull();
    expect(queryByTestId('icon-car')).not.toBeNull();
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
    const { queryByTestId } = render(<DonutChart data={data} />);
    expect(queryByTestId('icon-food')).not.toBeNull();
  });
});
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
npm test -- --silent __tests__/components/graphs/DonutChart.test.js
```

Expected: FAIL — `Cannot find module '../../../app/components/graphs/DonutChart'`

- [ ] **Step 1.3: Create DonutChart.js**

Create `app/components/graphs/DonutChart.js`:

```js
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';

export const SVG_SIZE = 140;
export const RADIUS = 48;
export const STROKE_WIDTH = 26;
export const CENTER = SVG_SIZE / 2;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
export const ICON_THRESHOLD = 0.10;
export const ICON_SIZE = 14;

export const computeSegments = (data) => {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return data.map((item) => {
    const fraction = item.amount / total;
    const arcLength = fraction * CIRCUMFERENCE;
    const midAngle = (cumulative + arcLength / 2) / RADIUS;
    const seg = {
      color: item.color,
      icon: item.icon,
      arcLength,
      dashOffset: -cumulative,
      showIcon: fraction >= ICON_THRESHOLD && !!item.icon,
      iconX: CENTER + RADIUS * Math.sin(midAngle),
      iconY: CENTER - RADIUS * Math.cos(midAngle),
    };
    cumulative += arcLength;
    return seg;
  });
};

const DonutChart = ({ data }) => {
  const segments = useMemo(() => computeSegments(data), [data]);

  return (
    <View testID="donut-chart" style={styles.container}>
      <Svg width={SVG_SIZE} height={SVG_SIZE}>
        {segments.map((seg, i) => (
          <Circle
            key={i}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${seg.arcLength} ${CIRCUMFERENCE - seg.arcLength}`}
            strokeDashoffset={seg.dashOffset}
            rotation={-90}
            origin={`${CENTER}, ${CENTER}`}
          />
        ))}
      </Svg>
      {segments
        .filter((seg) => seg.showIcon)
        .map((seg, i) => (
          <View
            key={i}
            style={[
              styles.iconWrapper,
              {
                left: seg.iconX - ICON_SIZE / 2,
                top: seg.iconY - ICON_SIZE / 2,
              },
            ]}
          >
            <Icon name={seg.icon} size={ICON_SIZE} color="#fff" />
          </View>
        ))}
    </View>
  );
};

DonutChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      amount: PropTypes.number.isRequired,
      color: PropTypes.string.isRequired,
      icon: PropTypes.string,
    }),
  ).isRequired,
};

const styles = StyleSheet.create({
  container: {
    height: SVG_SIZE,
    width: SVG_SIZE,
  },
  iconWrapper: {
    position: 'absolute',
  },
});

export default DonutChart;
```

- [ ] **Step 1.4: Run tests — verify they pass**

```bash
npm test -- --silent __tests__/components/graphs/DonutChart.test.js
```

Expected: PASS — all tests green, 0 failed.

- [ ] **Step 1.5: Commit**

```bash
git add app/components/graphs/DonutChart.js __tests__/components/graphs/DonutChart.test.js
git commit -m "feat(graphs): add DonutChart SVG component with arc icon overlay"
```

---

## Task 2: Update ExpensePieChart

**Files:**
- Modify: `app/components/graphs/ExpensePieChart.js`
- Create: `__tests__/components/graphs/ExpensePieChart.test.js`

- [ ] **Step 2.1: Write failing tests**

Create `__tests__/components/graphs/ExpensePieChart.test.js`:

```js
import React from 'react';
import { render } from '@testing-library/react-native';
import ExpensePieChart from '../../../app/components/graphs/ExpensePieChart';

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
}));

const mockColors = {
  primary: '#007AFF',
  text: '#111111',
  mutedText: '#666666',
  border: '#e6e6e6',
};

const mockData = [
  { name: 'Food', amount: 560, color: '#7c83fd', icon: 'food', categoryId: '1', hasChildren: false },
  { name: 'Transport', amount: 280, color: '#fd7c7c', icon: 'car', categoryId: '2', hasChildren: false },
  { name: 'Other', amount: 40, color: '#aaa', icon: 'dots-horizontal', categoryId: '3', hasChildren: false },
];

const defaultProps = {
  colors: mockColors,
  t: (key) => key,
  loading: false,
  chartData: mockData,
  selectedCurrency: 'USD',
  onLegendItemPress: jest.fn(),
  selectedCategory: 'all',
};

beforeEach(() => jest.clearAllMocks());

describe('ExpensePieChart', () => {
  it('renders loading state when loading is true', () => {
    const { getByText } = render(<ExpensePieChart {...defaultProps} loading={true} />);
    expect(getByText('loading_operations')).toBeTruthy();
  });

  it('does not render donut chart when loading', () => {
    const { queryByTestId } = render(<ExpensePieChart {...defaultProps} loading={true} />);
    expect(queryByTestId('donut-chart')).toBeNull();
  });

  it('renders empty state text when chartData is empty', () => {
    const { getByText } = render(<ExpensePieChart {...defaultProps} chartData={[]} />);
    expect(getByText('no_expense_data')).toBeTruthy();
  });

  it('renders DonutChart when data is present', () => {
    const { getByTestId } = render(<ExpensePieChart {...defaultProps} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
  });

  it('renders legend category names', () => {
    const { getByText } = render(<ExpensePieChart {...defaultProps} />);
    expect(getByText('Food')).toBeTruthy();
    expect(getByText('Transport')).toBeTruthy();
  });

  it('renders arc icons for above-threshold segments', () => {
    // Food 63.6%, Transport 31.8% — both above 10%
    const { queryByTestId } = render(<ExpensePieChart {...defaultProps} />);
    expect(queryByTestId('icon-food')).not.toBeNull();
    expect(queryByTestId('icon-car')).not.toBeNull();
  });

  it('does not render arc icon for below-threshold segment', () => {
    // Other 4.5% — below 10%
    const { queryByTestId } = render(<ExpensePieChart {...defaultProps} />);
    expect(queryByTestId('icon-dots-horizontal')).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
npm test -- --silent __tests__/components/graphs/ExpensePieChart.test.js
```

Expected: FAIL — several tests fail because the component still uses the old chart-kit layout.

- [ ] **Step 2.3: Rewrite ExpensePieChart.js**

Replace the entire contents of `app/components/graphs/ExpensePieChart.js`:

```js
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import DonutChart from './DonutChart';
import CustomLegend from './CustomLegend';

const ExpensePieChart = ({
  colors,
  t,
  loading,
  chartData,
  selectedCurrency,
  onLegendItemPress,
  selectedCategory,
}) => {
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_operations')}
        </Text>
      </View>
    );
  }

  if (chartData.length === 0) {
    return (
      <Text style={[styles.noData, { color: colors.mutedText }]}>
        {t('no_expense_data')}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <DonutChart data={chartData} />
      <CustomLegend
        data={chartData}
        currency={selectedCurrency}
        colors={colors}
        onItemPress={onLegendItemPress}
        isClickable={selectedCategory === 'all'}
      />
    </View>
  );
};

ExpensePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  chartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  selectedCategory: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  noData: {
    fontSize: 14,
    paddingVertical: 32,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
});

export default ExpensePieChart;
```

- [ ] **Step 2.4: Run tests — verify they pass**

```bash
npm test -- --silent __tests__/components/graphs/ExpensePieChart.test.js
```

Expected: PASS — all tests green, 0 failed.

- [ ] **Step 2.5: Commit**

```bash
git add app/components/graphs/ExpensePieChart.js __tests__/components/graphs/ExpensePieChart.test.js
git commit -m "feat(graphs): refactor ExpensePieChart to donut + side legend layout"
```

---

## Task 3: Update IncomePieChart

**Files:**
- Modify: `app/components/graphs/IncomePieChart.js`
- Create: `__tests__/components/graphs/IncomePieChart.test.js`

- [ ] **Step 3.1: Write failing tests**

Create `__tests__/components/graphs/IncomePieChart.test.js`:

```js
import React from 'react';
import { render } from '@testing-library/react-native';
import IncomePieChart from '../../../app/components/graphs/IncomePieChart';

jest.mock('../../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: jest.fn(() => ({ hideBalances: false })),
}));

jest.mock('../../../assets/currencies.json', () => ({
  USD: { decimal_digits: 2, symbol: '$' },
}));

const mockColors = {
  primary: '#007AFF',
  text: '#111111',
  mutedText: '#666666',
  border: '#e6e6e6',
};

const mockData = [
  { name: 'Salary', amount: 3000, color: '#7c83fd', icon: 'briefcase', categoryId: '1', hasChildren: false },
  { name: 'Freelance', amount: 800, color: '#7cfd9e', icon: 'laptop', categoryId: '2', hasChildren: false },
  { name: 'Other', amount: 60, color: '#aaa', icon: 'dots-horizontal', categoryId: '3', hasChildren: false },
];

const defaultProps = {
  colors: mockColors,
  t: (key) => key,
  loadingIncome: false,
  incomeChartData: mockData,
  selectedCurrency: 'USD',
  onLegendItemPress: jest.fn(),
  selectedIncomeCategory: 'all',
};

beforeEach(() => jest.clearAllMocks());

describe('IncomePieChart', () => {
  it('renders loading state when loadingIncome is true', () => {
    const { getByText } = render(<IncomePieChart {...defaultProps} loadingIncome={true} />);
    expect(getByText('loading_operations')).toBeTruthy();
  });

  it('does not render donut chart when loading', () => {
    const { queryByTestId } = render(<IncomePieChart {...defaultProps} loadingIncome={true} />);
    expect(queryByTestId('donut-chart')).toBeNull();
  });

  it('renders empty state text when incomeChartData is empty', () => {
    const { getByText } = render(<IncomePieChart {...defaultProps} incomeChartData={[]} />);
    expect(getByText('no_income_data')).toBeTruthy();
  });

  it('renders DonutChart when data is present', () => {
    const { getByTestId } = render(<IncomePieChart {...defaultProps} />);
    expect(getByTestId('donut-chart')).toBeTruthy();
  });

  it('renders legend category names', () => {
    const { getByText } = render(<IncomePieChart {...defaultProps} />);
    expect(getByText('Salary')).toBeTruthy();
    expect(getByText('Freelance')).toBeTruthy();
  });

  it('renders arc icons for above-threshold segments', () => {
    // Salary 77.9%, Freelance 20.8% — both above 10%
    const { queryByTestId } = render(<IncomePieChart {...defaultProps} />);
    expect(queryByTestId('icon-briefcase')).not.toBeNull();
    expect(queryByTestId('icon-laptop')).not.toBeNull();
  });

  it('does not render arc icon for below-threshold segment', () => {
    // Other 1.6% — below 10%
    const { queryByTestId } = render(<IncomePieChart {...defaultProps} />);
    expect(queryByTestId('icon-dots-horizontal')).toBeNull();
  });
});
```

- [ ] **Step 3.2: Run tests — verify they fail**

```bash
npm test -- --silent __tests__/components/graphs/IncomePieChart.test.js
```

Expected: FAIL — component still uses old layout.

- [ ] **Step 3.3: Rewrite IncomePieChart.js**

Replace the entire contents of `app/components/graphs/IncomePieChart.js`:

```js
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import PropTypes from 'prop-types';
import DonutChart from './DonutChart';
import CustomLegend from './CustomLegend';

const IncomePieChart = ({
  colors,
  t,
  loadingIncome,
  incomeChartData,
  selectedCurrency,
  onLegendItemPress,
  selectedIncomeCategory,
}) => {
  if (loadingIncome) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedText }]}>
          {t('loading_operations')}
        </Text>
      </View>
    );
  }

  if (incomeChartData.length === 0) {
    return (
      <Text style={[styles.noData, { color: colors.mutedText }]}>
        {t('no_income_data')}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <DonutChart data={incomeChartData} />
      <CustomLegend
        data={incomeChartData}
        currency={selectedCurrency}
        colors={colors}
        onItemPress={onLegendItemPress}
        isClickable={selectedIncomeCategory === 'all'}
      />
    </View>
  );
};

IncomePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  incomeChartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  selectedIncomeCategory: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
  },
  noData: {
    fontSize: 14,
    paddingVertical: 32,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
});

export default IncomePieChart;
```

- [ ] **Step 3.4: Run tests — verify they pass**

```bash
npm test -- --silent __tests__/components/graphs/IncomePieChart.test.js
```

Expected: PASS — all tests green, 0 failed.

- [ ] **Step 3.5: Commit**

```bash
git add app/components/graphs/IncomePieChart.js __tests__/components/graphs/IncomePieChart.test.js
git commit -m "feat(graphs): refactor IncomePieChart to donut + side legend layout"
```

---

## Task 4: Full suite verification and PR

- [ ] **Step 4.1: Run the full test suite**

```bash
npm test -- --silent
```

Expected: 0 failed. If any graph tests fail, check for import issues (`PieChart` still referenced, `Dimensions` import leftover, etc.) and fix before proceeding.

- [ ] **Step 4.2: Open PR**

```bash
gh pr create --title "feat(graphs): donut chart with arc icons and side legend" --body "Replaces solid pie chart stacked above legend with a donut chart (left) and legend list (right) in both expense and income expanded panels. Category icons appear on their respective arc segments for segments >= 10% of total. Uses react-native-svg directly (already installed) — no new dependencies."
```
