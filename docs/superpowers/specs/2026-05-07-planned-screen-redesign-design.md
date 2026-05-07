# Planned Screen Redesign

**Date:** 2026-05-07
**Status:** Approved

## Overview

Redesign the Planned Operations screen to improve usability and visual style while matching the app's existing dark aesthetic. The core changes are: replacing the tab selector with a unified single list, adding a month summary strip, and replacing the icon execute button with swipe-to-execute.

## Design Decisions

### 1. Unified list (no tabs)

Remove the Recurring / One-time tab toggle. Instead, render a single `FlatList` with two always-expanded sections:

- **🔁 Recurring** — items where `isRecurring === 1`
- **1️⃣ One-time** — items where `isRecurring === 0`

Section headers use a horizontal rule style: label on the left, thin line filling remaining width, item count on the right (e.g. "4 items"). Within each section, un-executed items sort to the top and executed items sort to the bottom — this already matches the existing sort logic.

### 2. Summary strip

A card at the top of the screen (above the list, below the app header) showing three stats for the current month:

| Stat | Value | Color |
|---|---|---|
| Pending out | Sum of un-executed expense + transfer amounts | `colors.expense` (red) |
| Done this month | `X / Y` count | `colors.text` |
| Pending in | Sum of un-executed income amounts | `colors.income` (green) |

Below the three stats: a thin progress bar (track = `colors.border`, fill = gradient from `colors.primary` to `colors.income`) representing the fraction of items executed this month. Below the bar: small labels "X done" and "Y remaining".

The summary strip recomputes whenever `plannedOperations` or the executed state changes (already reactive via context).

### 3. Swipe-to-execute

Replace the `Pressable` execute button icon with a swipe gesture using `react-native-gesture-handler` (already a dependency via Expo). Swiping left on a row reveals a blue Execute panel on the right edge. Tapping the revealed panel calls `executePlannedOperation`.

- Swipe threshold: reveal at ~50px, snap to revealed at ~60px
- Reveal panel: 60px wide, `colors.primary` background, white ▶ icon + "Execute" label
- Only un-executed items are swipeable; executed items ignore the gesture
- Long press still opens the edit/delete dialog (existing behavior preserved)
- Tap (without swipe) opens edit modal (existing behavior preserved)

### 4. Executed item state

Executed items (where `isExecutedThisMonth(item)` is true) are visually distinguished by:

- **Opacity:** ~40% (`0.4`) — heavy dim so pending items dominate visually
- **Checkmark badge:** small green ✓ circle (13×13px) overlaid on the bottom-right corner of the category icon, with a 1.5px border matching `colors.background` to separate it from the icon
- **Amount color:** muted version of the type color (income: `colors.income + '60'`, expense: `colors.expense + '60'`, transfer: `colors.transfer + '60'`)
- **Name color:** `colors.mutedText`

### 5. Item row layout

Each row:

```
[ Icon (36×36, rounded 8px, tinted bg) ]  [ Name (bold 14px) ]        [ Amount (bold 12px, right-aligned) ]
                                            [ Account · Category (10px muted) ]
```

No frequency badge (frequency is not stored in the schema). The account + category meta line replaces the old badge slot.

## Interaction Model

| Gesture | Result |
|---|---|
| Tap | Open edit modal |
| Long press | Show action dialog (Edit / Delete / Cancel) |
| Swipe left (un-executed) | Reveal Execute panel |
| Tap Execute panel | Call `executePlannedOperation`, snap back, update summary |
| Swipe left (executed) | No-op |

## Components Affected

- `app/screens/PlannedOperationsScreen.js` — primary changes (list structure, summary strip, section headers, swipe integration)
- No schema changes required
- No new context required — existing `isExecutedThisMonth`, `executePlannedOperation`, `plannedOperations` from `PlannedOperationsContext` are sufficient

## Summary Strip Computation

```js
const summary = useMemo(() => {
  const pending = plannedOperations.filter(op => !isExecutedThisMonth(op));
  const pendingOut = pending
    .filter(op => op.type === 'expense' || op.type === 'transfer')
    .reduce((sum, op) => sum + parseFloat(op.amount), 0);
  const pendingIn = pending
    .filter(op => op.type === 'income')
    .reduce((sum, op) => sum + parseFloat(op.amount), 0);
  const doneCount = plannedOperations.filter(op => isExecutedThisMonth(op)).length;
  const total = plannedOperations.length;
  return { pendingOut, pendingIn, doneCount, total };
}, [plannedOperations, isExecutedThisMonth]);
```

## Out of Scope

- Frequency field (Monthly, Weekly, etc.) — not in the schema; adding it is a separate feature
- Collapsible sections — always expanded
- Drag-to-reorder — existing `displayOrder` field is unchanged; not surfaced in this redesign
