# Graph Pie Chart — Donut + Side Legend Layout

**Date:** 2026-05-11  
**Scope:** `ExpensePieChart`, `IncomePieChart`, `CustomLegend` components

---

## What We're Changing

The expanded income and expense panels in `GraphsScreen` currently show a solid pie chart stacked above a full-width legend list. This refactor changes both panels to:

1. **Donut chart** on the left (~140×140px) drawn with `react-native-svg`
2. **Legend list** on the right (flex: 1), same rows as today
3. **Category icons on arc segments** — the icon for each category rendered at the visual midpoint of its slice; segments too small to fit an icon (threshold: ~10% of total) are skipped

---

## Architecture

### Donut chart renderer

Replace `react-native-chart-kit`'s `PieChart` in both `ExpensePieChart.js` and `IncomePieChart.js` with a custom SVG component using `react-native-svg` (already installed as a transitive dependency of chart-kit).

Each segment is a `<Circle>` element with `stroke` set to the segment color and `strokeDasharray` computed from the segment's percentage:

```
arcLength = percentage * 2 * π * RADIUS
gap       = circumference - arcLength
strokeDashoffset = -(sum of previous arcLengths)
```

The circle is rotated −90° so segments start at the top.

**Constants:**
- `SVG_SIZE = 140`
- `RADIUS = 48`
- `STROKE_WIDTH = 26`
- `ICON_THRESHOLD = 0.10` (segments below 10% get no icon)

### Icon overlay

Icons are rendered as absolute-positioned `<Text>` React Native elements layered over the SVG inside a `position: relative` `View`. Each icon's `(left, top)` is computed from the segment midpoint angle:

```
midAngle = startAngle + (segmentAngle / 2)   // clockwise from top, radians
x = cx + RADIUS * sin(midAngle)
y = cy - RADIUS * cos(midAngle)
```

Icon is centered at `(x, y)` via `transform: translate(-50%, -50%)` (or equivalent RN `marginLeft`/`marginTop` offsets). A drop shadow is applied for legibility.

### Layout change

Both `ExpensePieChart` and `IncomePieChart` switch from a vertical stack to:

```
<View style={{ flexDirection: 'row', alignItems: 'center', height: CHART_CONTENT_HEIGHT }}>
  <DonutChart ... />          {/* fixed 140px width */}
  <CustomLegend ... />        {/* flex: 1 */}
</View>
```

`CHART_CONTENT_HEIGHT` stays at 300px (the existing `CHART_HEIGHT` constant in `GraphsScreen`).

### CustomLegend

No structural changes. The component already uses `flex: 1` and `flexDirection: 'row'` internally per row, so it adapts to the narrower column naturally. Row padding may need a minor reduction (`paddingHorizontal: 4 → 2`) to avoid overflow on very narrow devices.

---

## Files Changed

| File | Change |
|------|--------|
| `app/components/graphs/ExpensePieChart.js` | Replace `PieChart` import with new `DonutChart`, change layout to `flexDirection: row` |
| `app/components/graphs/IncomePieChart.js` | Same as above |
| `app/components/graphs/DonutChart.js` | **New file** — SVG donut renderer with icon overlay |
| `app/components/graphs/CustomLegend.js` | Minor: reduce `paddingHorizontal` if needed |

`react-native-chart-kit`'s `PieChart` is no longer imported in these two files. The library itself stays (used elsewhere or transitively) — no package removal needed.

---

## Icon threshold logic

```js
const MIN_FRACTION = 0.10;
const total = data.reduce((s, d) => s + d.amount, 0);
const showIcon = (item) => item.icon && (item.amount / total) >= MIN_FRACTION;
```

Segments below threshold still render their arc color normally — they just have no icon.

---

## Edge cases

- **Single category:** One full circle rendered as a ring with one icon.
- **No data:** Existing empty state (`no_expense_data` / `no_income_data` text) unchanged.
- **Category has no icon:** Icon overlay skipped regardless of size.
- **Very many categories:** Legend `ScrollView` already exists in the card's `chartScrollView` — rows scroll vertically as before.

---

## What is NOT changing

- Card expansion animation in `GraphsScreen` (width/height Reanimated sequence)
- `CustomLegend` row structure (dot, icon, name, amount, divider, percentage)
- `CHART_HEIGHT = 300` constant
- The `chartNavRow` (back arrow + category picker) above the chart when drilling into a subcategory
