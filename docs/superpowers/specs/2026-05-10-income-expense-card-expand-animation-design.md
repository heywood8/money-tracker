# Income/Expense Card Expansion Animation Redesign

**Date:** 2026-05-10  
**Branch:** feat/income-expence-chart-ui-improvements  
**Scope:** `GraphsScreen.js` only — summary card components unchanged

---

## Problem

The current expand behavior is abrupt:

- The non-selected card **instantly disappears** via conditional render
- The selected card grows **vertically only** via `LayoutAnimation`
- No width transition — the expanded card snaps to full width

The desired feel is a **corner-drag resize**: both width and height animate simultaneously, while the other card fades and collapses out of the way.

---

## Design

### Approach: Fade + Full Collapse (Approach C)

When one card is tapped to expand:

1. The **other card** fades out (`opacity: 1 → 0`) while its width collapses to `0`
2. The **selected card** simultaneously grows in width (half-row → full row) and height (header-only → header + chart)
3. On tap again to collapse, the animation **reverses** — selected card shrinks, other card fades back in

Both cards remain **always mounted**. No conditional render during or after animation.

---

## Animation Values

A single `animValue` (`Animated.Value`, 0=collapsed, 1=expanded) drives all four properties in one `Animated.parallel`:

| Property | Collapsed (0) | Expanded (1) |
|---|---|---|
| Selected card `width` | `(rowWidth - GAP) / 2` | `rowWidth` |
| Selected card `height` | `56` | `56 + CHART_HEIGHT` |
| Other card `width` | `(rowWidth - GAP) / 2` | `0` |
| Other card `opacity` | `1` | `0` |

- `rowWidth` = `windowWidth - HORIZONTAL_PADDING * 2` (from `useWindowDimensions`, calculated once at render)
- `GAP` = `8` (matches `summaryCardsRow` gap)
- `CHART_HEIGHT` = `300` (fixed — pie charts are a consistent size; user can tune after seeing it)
- `HORIZONTAL_PADDING` = value of `TOP_CONTENT_SPACING` used in `styles.content`

All four properties use `useNativeDriver: false` (required for layout properties).

### Timing and Easing

| Direction | Duration | Easing |
|---|---|---|
| Expand | 300ms | `Easing.out(Easing.cubic)` |
| Collapse | 220ms | `Easing.in(Easing.quad)` |

### Chart Content (secondary animation)

The chart content (pie chart + nav row inside the expanded card) gets its own `Animated.Value` (`chartContentAnim`) for `opacity` and `translateY`. This runs on **native driver** (`useNativeDriver: true`), decoupled from the layout animation.

- Fade in: `opacity: 0 → 1`, `translateY: 16 → 0`, duration 260ms, `Easing.out(Easing.cubic)`
- Fade out: `opacity: 1 → 0`, duration 150ms, `Easing.in(Easing.quad)` — kicked off at collapse start, before width shrinks

To achieve visual stagger without a `delay` node (which breaks `useNativeDriver`): use asymmetric durations inside `Animated.parallel`. Chart content fade-in runs at 260ms while layout runs at 300ms — content appears to trail slightly behind the resize.

---

## State Changes in GraphsScreen.js

### Before

```js
const [incomeChartExpanded, setIncomeChartExpanded] = useState(false);
const [expenseChartExpanded, setExpenseChartExpanded] = useState(false);
const incomeChartAnim = useRef(new Animated.Value(0)).current;
const expenseChartAnim = useRef(new Animated.Value(0)).current;
```

Two booleans, two anim values, two toggle handlers, two `useEffect`s for triggering animation, conditional render for each card.

### After

```js
const [expandedCard, setExpandedCard] = useState(null); // null | 'income' | 'expense'
const animValue = useRef(new Animated.Value(0)).current;
const chartContentAnim = useRef(new Animated.Value(0)).current;
```

One state value, two anim values (layout + content), one toggle handler, no conditional render.

### Toggle Handler

```js
const toggleCard = useCallback((card) => {
  const isExpanding = expandedCard !== card;

  if (isExpanding) {
    // Fade out chart content if switching cards (edge case: shouldn't happen with mutual exclusion)
    chartContentAnim.setValue(0);
    setExpandedCard(card);
    Animated.parallel([
      Animated.timing(animValue, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(chartContentAnim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  } else {
    Animated.parallel([
      Animated.timing(chartContentAnim, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: false }),
    ]).start(() => setExpandedCard(null));
  }
}, [expandedCard, animValue, chartContentAnim]);
```

### Interpolated Styles

```js
const { width: windowWidth } = useWindowDimensions();
const rowWidth = windowWidth - TOP_CONTENT_SPACING * 2;
const halfWidth = (rowWidth - 8) / 2;
const CHART_HEIGHT = 300;
const HEADER_HEIGHT = 56;

// For the income card when income is expanded:
const incomeCardStyle = {
  width: expandedCard === 'expense'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, 0] })
    : expandedCard === 'income'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, rowWidth] })
    : halfWidth,
  height: expandedCard === 'income'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [HEADER_HEIGHT, HEADER_HEIGHT + CHART_HEIGHT] })
    : HEADER_HEIGHT,
  opacity: expandedCard === 'expense'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
    : 1,
};
// Mirror for expense card
```

---

## Layout Changes

- `summaryCardContainer` loses `flex: 1` — width is now driven by `Animated.Value`
- `summaryCardsRow` keeps `flexDirection: 'row'` and `gap: 8` — but gap only applies when both cards have non-zero width
- Both card wrappers become `Animated.View` instead of `View`
- Chart content stays inside the same card wrapper, always rendered, visibility controlled by `chartContentAnim`

---

## What Doesn't Change

- `ExpenseSummaryCard.js` — no changes
- `IncomeSummaryCard.js` — no changes
- Chart components (`IncomePieChart`, `ExpensePieChart`) — no changes
- Category nav row (back arrow + picker) — same JSX, just wrapped differently
- All filter/picker logic — untouched

---

## Edge Cases

- **Switching directly from one expanded card to the other**: collapse animValue to 0 first (150ms), then expand. Keep it simple — don't try to animate the switch in one move.
- **Window resize / orientation change**: `useWindowDimensions` re-triggers a render with updated `rowWidth`. If a card is expanded, reset `animValue` to 0 and `expandedCard` to null on dimension change to avoid stale width interpolations.
- **hideBalances**: no impact on animation
