# Income/Expense Card Expansion Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the instant-disappear card expand behavior with a simultaneous width+height "corner-drag" animation, where the non-selected card fades and collapses to zero width while the selected card grows to fill the row.

**Architecture:** All changes are confined to `GraphsScreen.js`. Both summary cards are always mounted (no conditional render). A single `animValue` (0→1) drives width, height, and opacity interpolations via the JS thread (required for layout properties). A second `chartContentAnim` drives the chart content fade-in on the native thread. A dedicated spacer `Animated.View` between the two cards collapses from 8→0 to keep row width consistent as one card expands.

**Tech Stack:** React Native `Animated` API, `useWindowDimensions`, `Easing` — all already imported in `GraphsScreen.js`. No new dependencies.

---

## Constants

These values are used throughout. Define them at the top of the module (outside the component):

```js
const CARD_HEADER_HEIGHT = 56; // height of summary card header row (icon + amount + chevron)
const CHART_HEIGHT = 300;      // height of expanded chart area (tune after visual review)
const CARD_GAP = 8;            // gap between the two cards (matches summaryCardsRow gap)
```

## Row width calculation

Inside the component, after `useWindowDimensions`:

```js
const { width: windowWidth } = useWindowDimensions();
// TOP_CONTENT_SPACING = 8 (from designTokens), applied as padding on both sides
const rowWidth = windowWidth - TOP_CONTENT_SPACING * 2;
const halfWidth = (rowWidth - CARD_GAP) / 2;
```

The spacer between cards animates `CARD_GAP → 0`, the selected card animates `halfWidth → rowWidth - CARD_GAP`, and the other card animates `halfWidth → 0`. At all `animValue` values: `w1 + spacer + w2 = rowWidth`.

---

## Files

- **Modify:** `app/screens/GraphsScreen.js` — all animation logic changes
- **Modify:** `__tests__/screens/GraphsScreen.test.js` — add behavioral regression tests

---

## Task 1: Write failing regression tests

**Files:**
- Modify: `__tests__/screens/GraphsScreen.test.js`

The current code conditionally renders each card when the other is expanded (`{!incomeChartExpanded && ...}`). These tests assert the new always-mounted behavior — they will fail against the current code.

- [ ] **Step 1.1: Add the `Card Expansion` describe block to the existing test file**

Open `__tests__/screens/GraphsScreen.test.js`. Find the closing `});` of the outermost `describe('GraphsScreen', ...)` block. Insert this block just before it:

```js
describe('Card Expansion', () => {
  it('renders both summary cards on mount', () => {
    const GraphsScreen = require('../../app/screens/GraphsScreen').default;
    const { getByTestId } = render(<GraphsScreen />);

    expect(getByTestId('income-summary-card')).toBeTruthy();
    expect(getByTestId('expense-summary-card')).toBeTruthy();
  });

  it('keeps expense card in tree after pressing income card', () => {
    const GraphsScreen = require('../../app/screens/GraphsScreen').default;
    const { getByTestId } = render(<GraphsScreen />);

    fireEvent.press(getByTestId('income-summary-card'));

    // With the new always-mounted design, the expense card must still be in the tree
    expect(getByTestId('expense-summary-card')).toBeTruthy();
    expect(getByTestId('income-summary-card')).toBeTruthy();
  });

  it('keeps income card in tree after pressing expense card', () => {
    const GraphsScreen = require('../../app/screens/GraphsScreen').default;
    const { getByTestId } = render(<GraphsScreen />);

    fireEvent.press(getByTestId('expense-summary-card'));

    expect(getByTestId('income-summary-card')).toBeTruthy();
    expect(getByTestId('expense-summary-card')).toBeTruthy();
  });

  it('collapses back when pressing the expanded income card again', () => {
    const GraphsScreen = require('../../app/screens/GraphsScreen').default;
    const { getByTestId } = render(<GraphsScreen />);

    fireEvent.press(getByTestId('income-summary-card')); // expand
    fireEvent.press(getByTestId('income-summary-card')); // collapse

    // Both cards still present after collapse too
    expect(getByTestId('income-summary-card')).toBeTruthy();
    expect(getByTestId('expense-summary-card')).toBeTruthy();
  });
});
```

Also add `fireEvent` to the import at the top of the test file (it's already imported — confirm it's in the destructure of `@testing-library/react-native`).

- [ ] **Step 1.2: Run the new tests to confirm they fail**

```bash
npm test -- --silent --testPathPattern="GraphsScreen"
```

Expected: the two "keeps X card in tree after pressing Y card" tests fail with "Unable to find an element with testId: expense-summary-card" (or income). The "renders both" test may pass already. The "collapses back" test may pass or fail. Document the actual failures — all four should pass after implementation.

---

## Task 2: Replace state and animation refs

**Files:**
- Modify: `app/screens/GraphsScreen.js:50-53` (current state declarations)

- [ ] **Step 2.1: Replace the two boolean states and two Animated.Values with the new unified state**

Find this block (lines ~50-53):

```js
// Inline chart expansion state
const [incomeChartExpanded, setIncomeChartExpanded] = useState(false);
const [expenseChartExpanded, setExpenseChartExpanded] = useState(false);
const incomeChartAnim = useRef(new Animated.Value(0)).current;
const expenseChartAnim = useRef(new Animated.Value(0)).current;
```

Replace with:

```js
// Inline chart expansion state
// null = neither expanded, 'income' | 'expense' = that card is expanded/expanding
const [expandedCard, setExpandedCard] = useState(null);
// animValue: 0 = collapsed, 1 = expanded (drives width, height, opacity on JS thread)
const animValue = useRef(new Animated.Value(0)).current;
// chartContentAnim: 0 = hidden, 1 = visible (drives chart content on native thread)
const chartContentAnim = useRef(new Animated.Value(0)).current;
```

- [ ] **Step 2.2: Add `useWindowDimensions` to the React import and the hook call**

Find the import line at the top:
```js
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
```
Add `useWindowDimensions` after `useRef`:
```js
import React, { useState, useEffect, useCallback, useMemo, useRef, useWindowDimensions } from 'react';
```

Then, near the top of the component body (right after the context hooks, before the `selectedPeriod` state), add:

```js
const { width: windowWidth } = useWindowDimensions();
const rowWidth = windowWidth - TOP_CONTENT_SPACING * 2;
const halfWidth = (rowWidth - CARD_GAP) / 2;
```

- [ ] **Step 2.3: Add the three constants above the component function**

Just before `const GraphsScreen = () => {`, add:

```js
const CARD_HEADER_HEIGHT = 56;
const CHART_HEIGHT = 300;
const CARD_GAP = 8;
```

---

## Task 3: Implement the `toggleCard` handler

**Files:**
- Modify: `app/screens/GraphsScreen.js` — replace `toggleIncomeChart` and `toggleExpenseChart`

- [ ] **Step 3.1: Remove the four old handlers and their trigger useEffects**

Delete these functions and their associated `useEffect`s entirely:
- `toggleIncomeChart` (the `useCallback` block)
- `useEffect` that watches `incomeChartExpanded` to start `incomeChartAnim`
- `handleBackToIncomeParent` — KEEP THIS (it's independent of the animation)
- `toggleExpenseChart` (the `useCallback` block)
- `useEffect` that watches `expenseChartExpanded` to start `expenseChartAnim`
- `handleBackToExpenseParent` — KEEP THIS

The handlers to keep unchanged:
```js
const handleBackToIncomeParent = useCallback(() => {
  setSelectedIncomeCategory(prev => getParentCategoryId(prev));
}, [getParentCategoryId]);

const handleBackToExpenseParent = useCallback(() => {
  setSelectedCategory(prev => getParentCategoryId(prev));
}, [getParentCategoryId]);
```

- [ ] **Step 3.2: Add the unified `toggleCard` handler and its trigger `useEffect`**

Add after `handleBackToExpenseParent`:

```js
const toggleCard = useCallback((card) => {
  if (expandedCard === card) {
    // Collapse: fade chart content first (native thread), then shrink layout (JS thread)
    Animated.parallel([
      Animated.timing(chartContentAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(animValue, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(() => setExpandedCard(null));
  } else {
    // Expand: reset anim values, set the new expanded card, let useEffect trigger animation
    animValue.setValue(0);
    chartContentAnim.setValue(0);
    setExpandedCard(card);
  }
}, [expandedCard, animValue, chartContentAnim]);

// Trigger expand animation after expandedCard state and interpolations are in place
useEffect(() => {
  if (expandedCard !== null) {
    Animated.parallel([
      Animated.timing(animValue, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(chartContentAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }
}, [expandedCard]); // eslint-disable-line react-hooks/exhaustive-deps
```

Note: `animValue` and `chartContentAnim` are refs (stable references), so omitting them from the dep array is intentional and safe. The `eslint-disable` comment suppresses the exhaustive-deps warning.

---

## Task 4: Handle dimension change edge case

**Files:**
- Modify: `app/screens/GraphsScreen.js`

- [ ] **Step 4.1: Reset animation state when window dimensions change**

Add this `useEffect` after the toggle handler (after the expand animation `useEffect`):

```js
// Reset expansion if screen dimensions change (orientation change) to avoid stale widths
useEffect(() => {
  animValue.setValue(0);
  chartContentAnim.setValue(0);
  setExpandedCard(null);
}, [windowWidth]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

## Task 5: Replace card container JSX

**Files:**
- Modify: `app/screens/GraphsScreen.js:466-575` (the `summaryCardsRow` section)

This is the core visual change. Replace the entire `{/* Summary Cards Row */}` section.

- [ ] **Step 5.1: Compute the animated style values as local variables before the JSX return**

Add these just before the `return (` statement:

```js
// Animated style values for the two card containers
// These are computed each render; Animated.Value.interpolate() is cheap
const incomeCardAnimStyle = {
  width: expandedCard === 'expense'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, 0] })
    : expandedCard === 'income'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, rowWidth - CARD_GAP] })
    : halfWidth,
  height: expandedCard === 'income'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [CARD_HEADER_HEIGHT, CARD_HEADER_HEIGHT + CHART_HEIGHT] })
    : CARD_HEADER_HEIGHT,
  opacity: expandedCard === 'expense'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
    : 1,
};

const expenseCardAnimStyle = {
  width: expandedCard === 'income'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, 0] })
    : expandedCard === 'expense'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [halfWidth, rowWidth - CARD_GAP] })
    : halfWidth,
  height: expandedCard === 'expense'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [CARD_HEADER_HEIGHT, CARD_HEADER_HEIGHT + CHART_HEIGHT] })
    : CARD_HEADER_HEIGHT,
  opacity: expandedCard === 'income'
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
    : 1,
};

const spacerAnimStyle = {
  width: expandedCard !== null
    ? animValue.interpolate({ inputRange: [0, 1], outputRange: [CARD_GAP, 0] })
    : CARD_GAP,
};

const chartContentAnimStyle = {
  opacity: chartContentAnim,
  transform: [{ translateY: chartContentAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
};
```

- [ ] **Step 5.2: Replace the summaryCardsRow JSX**

Find the `{/* Summary Cards Row — one or both cards; expanded card goes full-width */}` comment and replace everything from that comment to the closing `</View>` of `summaryCardsRow` with:

```jsx
{/* Summary Cards Row — always-mounted, width/height driven by Animated */}
<View style={styles.summaryCardsRow}>
  {/* Income card */}
  <Animated.View
    style={[
      styles.summaryCardBase,
      incomeCardAnimStyle,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ]}
  >
    <IncomeSummaryCard
      colors={colors}
      t={t}
      loadingIncome={loadingIncome}
      totalIncome={totalIncome}
      selectedCurrency={selectedCurrency}
      onPress={() => toggleCard('income')}
      expanded={expandedCard === 'income'}
    />
    <Animated.View
      testID="income-chart-content"
      style={[styles.chartContent, chartContentAnimStyle]}
    >
      {selectedIncomeCategory !== 'all' && (
        <View style={styles.chartNavRow}>
          <TouchableOpacity
            onPress={handleBackToIncomeParent}
            style={styles.chartNavBack}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Icon name="arrow-left" size={20} color={colors.primary} />
          </TouchableOpacity>
          <View style={[styles.chartNavPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <SimplePicker
              value={selectedIncomeCategory}
              onValueChange={setSelectedIncomeCategory}
              items={incomeCategoryItems}
              colors={colors}
            />
          </View>
        </View>
      )}
      <IncomePieChart
        colors={colors}
        t={t}
        loadingIncome={loadingIncome}
        incomeChartData={incomeChartData}
        selectedCurrency={selectedCurrency}
        onLegendItemPress={handleIncomeLegendItemPress}
        selectedIncomeCategory={selectedIncomeCategory}
      />
    </Animated.View>
  </Animated.View>

  {/* Spacer that collapses as one card expands */}
  <Animated.View style={spacerAnimStyle} />

  {/* Expense card */}
  <Animated.View
    style={[
      styles.summaryCardBase,
      expenseCardAnimStyle,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ]}
  >
    <ExpenseSummaryCard
      colors={colors}
      t={t}
      loading={loading}
      totalExpenses={totalExpenses}
      selectedCurrency={selectedCurrency}
      onPress={() => toggleCard('expense')}
      expanded={expandedCard === 'expense'}
    />
    <Animated.View
      testID="expense-chart-content"
      style={[styles.chartContent, chartContentAnimStyle]}
    >
      {selectedCategory !== 'all' && (
        <View style={styles.chartNavRow}>
          <TouchableOpacity
            onPress={handleBackToExpenseParent}
            style={styles.chartNavBack}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Icon name="arrow-left" size={20} color={colors.primary} />
          </TouchableOpacity>
          <View style={[styles.chartNavPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <SimplePicker
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              items={categoryItems}
              colors={colors}
            />
          </View>
        </View>
      )}
      <ExpensePieChart
        colors={colors}
        t={t}
        loading={loading}
        chartData={chartData}
        selectedCurrency={selectedCurrency}
        onLegendItemPress={handleExpenseLegendItemPress}
        selectedCategory={selectedCategory}
      />
    </Animated.View>
  </Animated.View>
</View>
```

---

## Task 6: Update StyleSheet

**Files:**
- Modify: `app/screens/GraphsScreen.js` — the `StyleSheet.create` block

- [ ] **Step 6.1: Replace `summaryCardContainer` with `summaryCardBase` and update `summaryCardsRow`**

In `StyleSheet.create`, find and replace:

```js
summaryCardContainer: {
  borderRadius: 14,
  borderWidth: 1,
  flex: 1,
  overflow: 'hidden',
},
summaryCardsRow: {
  flexDirection: 'row',
  gap: 8,
  marginBottom: 16,
},
```

With:

```js
summaryCardBase: {
  borderRadius: 14,
  borderWidth: 1,
  overflow: 'hidden',
  // width and height are driven by Animated.Value — no flex: 1
},
summaryCardsRow: {
  flexDirection: 'row',
  marginBottom: 16,
  // gap removed — spacing handled by the animated spacer View between cards
},
```

---

## Task 7: Run tests and verify

- [ ] **Step 7.1: Run the full test suite silently**

```bash
npm test -- --silent
```

Expected: all tests pass including the four new `Card Expansion` tests. If any test fails:
- "Unable to find an element with testId" — check that the `Animated.View` has the correct `testID` prop
- Animation-related errors — check that `useNativeDriver: false` is set on width/height animations
- "expandedCard is not defined" — check the state declaration replaced correctly in Task 2

- [ ] **Step 7.2: Run just the GraphsScreen tests to verify the new suite**

```bash
npm test -- --silent --testPathPattern="GraphsScreen"
```

Expected output: `Tests: 4 passed` (the new Card Expansion tests) plus all pre-existing tests passing.

---

## Task 8: Commit

- [ ] **Step 8.1: Stage and commit**

```bash
git add app/screens/GraphsScreen.js __tests__/screens/GraphsScreen.test.js
git commit -m "feat(graphs): animate income/expense card expand with corner-drag effect"
```

---

## Self-Review Notes

- `incomeChartAnim` and `expenseChartAnim` are fully removed — replaced by `animValue` and `chartContentAnim`
- `LayoutAnimation` import removed from the `import` line (`LayoutAnimation` and `UIManager` should be removed if no longer used elsewhere in the file — check for other usages before removing)
- `toggleIncomeChart`, `toggleExpenseChart`, and their `useEffect` triggers are removed
- `incomeChartExpanded`, `expenseChartExpanded` are removed everywhere including the JSX conditionals
- `expanded={expandedCard === 'income'}` / `expanded={expandedCard === 'expense'}` replace the old boolean props
- The `income` and `expense` chart content `Animated.View`s share the same `chartContentAnim` — this is intentional since only one can be open at a time. Both always render but only the open one is visible (the other is clipped by parent `overflow: 'hidden'` and has opacity 0 from `chartContentAnim` being at 0 when `expandedCard` is not set for that card... wait — this is actually a bug: when income is expanded and expense is not, `chartContentAnim` is at 1, which means BOTH chart content views have opacity 1. But the expense chart content is clipped by the expense card's height being `CARD_HEADER_HEIGHT`, so it's invisible. This is correct behavior — `overflow: 'hidden'` on the parent clips the chart content when height is at `CARD_HEADER_HEIGHT`.)
