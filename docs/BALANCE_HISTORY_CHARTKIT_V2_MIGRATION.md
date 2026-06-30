# Balance History → react-native-chart-kit v2 (modern) migration

Status: **applied — pending on-device visual verification.**

`BalanceHistoryCard` now renders the modern **v2** `LineChart`
(`react-native-chart-kit/v2`, v7+) instead of the legacy chart. This unlocks a
built-in crosshair and tooltips and drops the fragile hand-drawn "today"
decorator. All 138 Jest suites pass, but the test suite **mocks** the chart, so
the rendered result still needs to be eyeballed on a device/emulator — see the
checklist at the bottom and the *Known tuning items*.

---

## What changed

- **Import:** `import { LineChart } from 'react-native-chart-kit/v2'` (was the
  legacy root import). The `react-native-svg` `Line`/`Text`/`G` imports used by
  the old decorator are gone.
- **Data model:** the legacy parallel `{ labels, datasets: [{ data }] }` shape is
  replaced by an **array of records** (`chartData`) + a per-series accessor
  config (`chartSeries`). All of the existing `chartComputed` data prep is reused
  unchanged; only the final shaping into records is new.
- **Actual vs forecast split:** the old single combined line + a hand-drawn
  vertical "today" line is replaced by two series — a solid `actual` series (up to
  today) and a dashed `forecast` series (today onward). The solid→dashed boundary
  *is* the "today" indicator, so the decorator (and its hardcoded `paddingRight`
  geometry) is deleted.
- **Theme:** app colors are mapped onto a `CartesianChartTheme` (`chartTheme`).
- **Built-ins enabled:** `crosshair`, `tooltip` (suppressed when `hideBalances`),
  `showHorizontalGridLines`, `legend={false}`, `curve="monotone"` (≈ the old
  `bezier`), `connectNulls`.

## Prop mapping (legacy → v2)

| legacy prop | v2 equivalent | Notes |
|---|---|---|
| `data={{ labels, datasets }}` | `data={chartData}` + `xKey="day"` + `series={chartSeries}` | array-of-records model |
| per-dataset `color` / `strokeWidth` (fns) | `series[].color` / `series[].strokeWidth` | static string, not a fn |
| per-dataset `withDots: false` | `series[].dot: false` | `dot: { radius: 2 }` to size dots |
| `bezier` | `curve="monotone"` | `LineCurve = 'linear' \| 'monotone' \| 'step'` |
| `fromZero` + `segments={4}` + `yAxisInterval` | `yDomain={[0, niceMax]}` (else `'auto'`) | **no segment-count control** — see tuning |
| `formatYLabel={(s)=>…}` | `formatYLabel={(n)=>…}` | value is a number now (`parseFloat` still tolerates both) |
| `formatXLabel={(s)=>…}` | `formatXLabel={(value,index)=>…}` | value is `ChartXValue` |
| `withVerticalLines={false}` | `showVerticalGridLines={false}` | |
| `withHorizontalLines`/`withInnerLines` | `showHorizontalGridLines` | |
| `withLegend={false}` | `legend={false}` | custom legend table kept below the chart |
| `chartConfig={{ … }}` | `theme={chartTheme}` | `CartesianChartTheme` |
| `decorator` (today line) | removed | replaced by the actual/forecast split |

## Known tuning items (verify/adjust on device)

1. **Today boundary when "today" isn't a labelled day.** The forecast series
   includes the boundary day only when `currentDay` is present in
   `balanceHistoryData.labels`. When it isn't, there can be a small visual gap
   between the last `actual` point and the first `forecast` point. If that reads
   poorly, extend `chartData` so the `forecast` series also carries the last
   actual value (seed it at the last actual index).
2. **Y-axis ladder.** v2 owns the axis model; `yDomain` pins the range but not the
   1/2/5 "nice" segment count the old chart drew via `segments={4}`. Confirm the
   gridlines/labels still read cleanly; adjust `yDomain` if needed.
3. **Crosshair/tooltip provider.** A single chart manages its own selection state,
   but if the crosshair/tooltip misbehave, wrap the chart in `ChartSelectionProvider`
   (exported from `react-native-chart-kit/v2`).
4. **Accessibility.** A static `accessibilityLabel` is used. The richer
   `getLineChartAccessibilitySummary` helper is **not** re-exported from the
   `/v2` barrel (only `LineChart` is), so it can't be imported from the public
   subpath — don't try to wire it without a deeper import.

## Test/mock notes

- The chart is mocked at `react-native-chart-kit/v2` in `jest.setup.js`,
  `__tests__/components/BalanceHistoryCard.test.js`, and
  `__tests__/screens/GraphsScreen.test.js`.
- Component-test assertions read `lineChart.props.data` (records) and
  `lineChart.props.series` (accessor config) instead of the old
  `data.labels` / `data.datasets`.

## Visual verification checklist (on device/emulator)

- [ ] Actual line solid; forecast continues dashed from today; segments meet (no jarring gap).
- [ ] Y-axis labels compact (`K`/`M`) and gridlines read cleanly.
- [ ] All series present with correct colors (primary / grey plain-avg / purple prev-month / grey zero baseline).
- [ ] `hideBalances` blanks Y labels **and** suppresses tooltip values.
- [ ] Sparse X labels (1, 5, 10, 15, 20, 25, last day) only.
- [ ] Crosshair + tooltip appear on touch.
- [ ] Light **and** dark themes.
- [ ] Past month (no forecast) vs current month (with forecast) both correct.

## References

- Props: `react-native-chart-kit/dist/v2/react-native/charts/line/types.d.ts`
  (`LineChartProps`, `LineChartSeries`, reference/tooltip/crosshair configs).
- Theme: `…/dist/v2/react-native/theme/presets.d.ts` (`CartesianChartTheme`).
