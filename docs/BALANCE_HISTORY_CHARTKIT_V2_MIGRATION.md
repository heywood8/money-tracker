# Balance History → react-native-chart-kit v2 (modern) migration guide

Status: **planned / not yet applied to the live chart.**

This repo now depends on `react-native-chart-kit@^7.0.1` (bumped from v6). v7 keeps
the **legacy root import** (`import { LineChart } from 'react-native-chart-kit'`)
fully backward-compatible, so `BalanceHistoryCard.js` still renders unchanged on
v7. This document describes how to move that one chart to the **modern v2**
`LineChart` (`react-native-chart-kit/v2`) to gain a built-in crosshair, tooltips,
and accessibility — and what does **not** map cleanly.

> Why this is a guide and not a finished swap: the v2 `LineChart` is a ground-up
> redesign (generic, data-accessor API). The balance-history chart is the app's
> most complex (4 overlaid series, a bespoke nice-scale Y axis, a hand-drawn
> "today" marker, hidden-balance mode). Two of those features have **no clean v2
> equivalent** (see *Trade-offs*), so the swap needs to be tuned against a live
> render on a device/emulator. Apply the steps below where you can actually see
> the chart.

---

## 1. Prerequisite (done)

`package.json` → `"react-native-chart-kit": "^7.0.1"`. Peer ranges that v7
requires are already satisfied: `react >=19.1` (app: 19.2.3),
`react-native >=0.81` (0.85.3), `react-native-svg >=15.12.1 <16` (15.15.4).

Run `npm install` after pulling so the `react-native-chart-kit/v2` subpath
resolves.

## 2. Import change

```diff
- import { LineChart } from 'react-native-chart-kit';
+ import { LineChart, getLineChartAccessibilitySummary } from 'react-native-chart-kit/v2';
```

The legacy `Line`, `Text as SvgText`, `G` imports from `react-native-svg` used by
the old `decorator` can be removed (see *Trade-offs → today marker*).

## 3. Data model change

v6 took parallel arrays (`{ labels, datasets: [{ data }] }`). v2 takes an
**array of records** plus a per-series accessor config:

```js
// Build once from the existing `chartComputed` memo — all the data prep is reused.
const chartData = balanceHistoryData.labels.map((day, i) => {
  const isForecastDay = isCurrentMonth && chartComputed.hasForecast && day > chartComputed.currentDay;
  return {
    day: String(day),
    // Split the old combined line into actual (solid) vs forecast (dashed) so the
    // "today" boundary is shown by the data itself — no manual vertical line needed.
    actual:   isForecastDay ? null : (chartComputed.combinedActualForecast[i] ?? null),
    forecast: isForecastDay ? (chartComputed.combinedActualForecast[i] ?? null) : null,
    plainAvg: chartComputed.plainAvgData[i] ?? null,
    prevMonth: balanceHistoryData.prevMonth?.[i] ?? null,
    zero: 0,
  };
});
// Bridge actual→forecast: also set forecast at the boundary day = actual value,
// so the two segments visually touch at "today".
```

```js
const series = [
  { yKey: 'actual',   color: colors.primary, strokeWidth: 3, curve: 'monotone',
    dot: { radius: 2 } },
  { yKey: 'forecast', color: colors.primary, strokeWidth: 3, curve: 'monotone',
    strokeDasharray: [5, 5], dot: false },
  { yKey: 'plainAvg', color: 'rgba(128,128,128,0.4)', strokeWidth: 2, dot: false },
  // prevMonth series added conditionally (same guard as today)
  ...(chartComputed.hasPrevMonthData
    ? [{ yKey: 'prevMonth', color: 'rgba(156,39,176,0.5)', strokeWidth: 2, dot: false }]
    : []),
  { yKey: 'zero', color: 'rgba(128,128,128,0.5)', strokeWidth: 1, dot: false },
];
```

## 4. Prop mapping (v6 → v2)

| v6 prop | v2 equivalent | Notes |
|---|---|---|
| `data={{ labels, datasets }}` | `data={chartData}` + `xKey="day"` + `series={series}` | array-of-records model |
| per-dataset `color` / `strokeWidth` | `series[].color` / `series[].strokeWidth` | static string, not a fn |
| per-dataset `withDots: false` | `series[].dot: false` | or `dot: { radius }` |
| `propsForDots={{ r: '2' }}` | `series[].dot: { radius: 2 }` | per-series now |
| `bezier` | `series[].curve: 'monotone'` (or top-level `curve`) | `LineCurve = 'linear'\|'monotone'\|'step'` |
| `fromZero` + `segments={4}` + `yAxisInterval` | `yDomain={[0, niceMax]}` | **no segment count** — see Trade-offs |
| `formatYLabel={(s) => …}` | `formatYLabel={(n) => …}` | value is now a **number** (drop `parseFloat`) |
| `formatXLabel={(s) => …}` | `formatXLabel={(value, index) => …}` | value is `ChartXValue` |
| `withVerticalLines={false}` | `showVerticalGridLines={false}` | |
| `withHorizontalLines` / `withInnerLines` | `showHorizontalGridLines` | |
| `withLegend={false}` | `legend={false}` | keep the custom legend table below the chart |
| `chartConfig={{ backgroundColor, color, labelColor, … }}` | `theme={chartTheme}` | see *Theming* |
| `decorator={() => <Line …/>}` (today marker) | removed | see *Trade-offs* |
| `width` / `height` | `width` / `height` | unchanged |

New, opt-in (the upside of migrating):

```jsx
crosshair                                  // vertical inspector line on touch
tooltip                                    // value bubble on touch
defaultSelectedIndex={todayIndex}          // optional: open crosshair at "today" on mount
accessibilityLabel={getLineChartAccessibilitySummary({
  data: chartData, xKey: 'day', series, formatXLabel, formatYLabel,
})}
```

## 5. Trade-offs (the parts that need a human eye)

1. **Vertical "today" line.** v2 `referenceLines` are **horizontal (y-based) only** —
   there is no vertical-at-x primitive. Recommended replacement: the
   actual/forecast **series split** in §3 (solid up to today, dashed after) makes
   the boundary self-evident. If you want an explicit on-rest vertical marker,
   set `defaultSelectedIndex={todayIndex}` with `crosshair` enabled, or supply a
   custom `renderCrosshair`. Verify which reads best on device.

2. **Nice-scale Y axis.** v6 used `segments={4}` + `yAxisInterval` for the bespoke
   1/2/5 "nice" ladder. v2 owns the axis model; you can pin the **range** via
   `yDomain={[min, niceMax]}` but not the **segment count**. Gridline spacing will
   be whatever v2 picks — eyeball that the labels still read cleanly (`K`/`M`
   compaction via `formatYLabel` still applies).

## 6. Theming

`CartesianChartTheme` maps directly onto the app palette (all keys optional):

```js
const chartTheme = {
  background: colors.altRow,
  plotBackground: colors.altRow,
  grid: colors.border,
  axis: colors.mutedText,
  text: colors.mutedText,
  series: [colors.primary], // fallback ramp; explicit series colors win
  tooltip: {
    background: colors.surface,
    border: colors.border,
    text: colors.text,
    mutedText: colors.mutedText,
  },
};
```

Pass via `theme={chartTheme}`. (A `ChartKitProvider` wrapper also exists if you
later theme multiple charts together.)

## 7. Hidden-balance mode

Still handled in `formatYLabel`: `formatYLabel={hideBalances ? () => '' : formatFn}`.
The tooltip also surfaces values, so when `hideBalances` is on, also set
`tooltip={false}` (and skip `accessibilityLabel`'s numeric summary) to avoid
leaking amounts.

## 8. Test + mock changes (required to keep the suite green)

The current tests assert on the **v6 prop shape** and mock the **root** import.
Both must change:

- **`jest.setup.js`** — add a mock for the subpath (keep the existing root mock):
  ```js
  jest.mock('react-native-chart-kit/v2', () => ({
    LineChart: () => 'LineChart',
    getLineChartAccessibilitySummary: () => 'balance history chart',
  }));
  ```
- **`__tests__/components/BalanceHistoryCard.test.js`** — switch the local
  `jest.mock('react-native-chart-kit', …)` to `'react-native-chart-kit/v2'`, then
  rewrite the data-shape assertions:
  - `lineChart.props.data.labels` → the `day` field of `lineChart.props.data` records.
  - `lineChart.props.data.datasets` (length/`[i].data`/`.strokeWidth`/`.withDots`/`.color()`)
    → `lineChart.props.series` entries (`yKey`, `strokeWidth`, `dot`, `color` as a
    plain string) and the per-key values inside `lineChart.props.data`.
  - `formatYLabel('1500000')` → `formatYLabel(1500000)` (number arg) still returns `'2M'`.
  - The legend-table assertions (`getByText('Actual')`, daily-avg regression cases,
    etc.) are **unaffected** — they read the DOM, not chart props.
- **`__tests__/screens/GraphsScreen.test.js`** — add the same `/v2` mock since the
  screen renders `BalanceHistoryCard`.

## 9. Visual verification checklist (on device/emulator)

- [ ] Actual line solid; forecast continues dashed from **today**; segments meet.
- [ ] Y-axis labels still compact (`K`/`M`) and gridlines read cleanly.
- [ ] All series present with correct colors (primary / grey plain-avg / purple
      prev-month / grey zero baseline).
- [ ] `hideBalances` blanks Y labels **and** suppresses tooltip values.
- [ ] Sparse X labels (1, 5, 10, 15, 20, 25, last day) only.
- [ ] Crosshair + tooltip appear on touch; today marker reads correctly.
- [ ] Light **and** dark themes.
- [ ] Past month (no forecast) vs current month (with forecast) both correct.

## References

- Modern props: `react-native-chart-kit/dist/v2/react-native/charts/line/types.d.ts`
  (`LineChartProps`, `LineChartSeries`, reference/tooltip/crosshair configs).
- Theme: `…/dist/v2/react-native/theme/presets.d.ts` (`CartesianChartTheme`).
- Accessibility: `…/charts/line/accessibility.d.ts`
  (`getLineChartAccessibilitySummary`, `getLineChartDataTable`).
