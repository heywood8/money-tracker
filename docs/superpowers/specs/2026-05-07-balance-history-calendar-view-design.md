# Balance History Calendar View Design

**Date:** 2026-05-07
**Status:** Approved

## Problem

The balance history details modal (`BalanceHistoryModal`) is a plain CRUD table (Date | Balance | Edit/Delete). It opens as a full modal overlay, which is disruptive. The goal is to replace it with a calendar grid that appears inline inside the balance history card — no modal.

## Design Decisions

- **Layout:** Calendar grid replaces the chart inline, toggled via an icon button in the card header. Card dimensions are unaffected.
- **Toggle mechanism:** A small icon button (chart-line ↔ calendar-month) sits in the card header row, next to the account picker. One tap flips the view.
- **Edit UX:** Tapping a day in the calendar shows an inline edit row directly below the grid (within the card). No separate modal or overlay.
- **Modal removal:** `BalanceHistoryModal` is deleted entirely. Its handlers are forwarded to the card instead.

## Architecture

### State

`BalanceHistoryCard` gains a local `showCalendar` boolean (default `false`). The toggle icon button in the header flips it. `BalanceHistoryCalendarView` manages its own `selectedDay` state locally.

### Component breakdown

| Component | Responsibility |
|---|---|
| `BalanceHistoryCard` | Owns `showCalendar` toggle state; conditionally renders chart view or calendar view; receives edit props from GraphsScreen |
| `BalanceHistoryCalendarView` | Calendar grid + inline edit row; owns `selectedDay` state; calls edit/save/delete handlers passed via props |

### Props added to `BalanceHistoryCard`

```js
balanceHistoryTableData: PropTypes.array.isRequired
editingBalanceRow: PropTypes.string
editingBalanceValue: PropTypes.string.isRequired
onEditingBalanceValueChange: PropTypes.func.isRequired
onEditBalance: PropTypes.func.isRequired
onCancelEdit: PropTypes.func.isRequired
onSaveBalance: PropTypes.func.isRequired
onDeleteBalance: PropTypes.func.isRequired
```

These are forwarded directly to `BalanceHistoryCalendarView`.

## Calendar View Layout

### Grid

- Day-of-week header row: M T W T F S S
- Grid of day cells for the full month
- Each cell shows: day number (top) + compact balance (bottom, e.g. "532K") if an entry exists
- Days with entries: tinted background using `colors.primary` at low opacity
- Today (current month only): cell border in `colors.primary`
- Empty days: subtly muted, still tappable to add an entry

### Inline edit row

Appears below the grid when a day is selected. Contains:
- Date label ("May 20")
- Balance `TextInput` pre-filled if entry exists, empty if adding new
- Save button
- Delete icon (only visible if entry already exists)
- Cancel (✕) to deselect day

On save: calls `onSaveBalance(date, value)`
On delete: calls `onDeleteBalance(date)`
On cancel: clears `selectedDay`

### Size budget

| Element | Height |
|---|---|
| Day header row | ~20px |
| 6 grid rows × 32px | ~192px |
| Inline edit row | ~48px |
| **Total** | **~260px** |

This fits within the space previously used by chart (220px) + legend table (~100px). Card height may vary slightly depending on month length (4 vs 6 grid rows) but will generally be equal or smaller than the chart view.

## Files Changed

| File | Change |
|---|---|
| `app/components/graphs/BalanceHistoryCard.js` | Add `showCalendar` state, toggle icon button in header, forward edit props to calendar view; remove `onChartPress` prop and the `TouchableOpacity` wrapper around the chart |
| `app/components/graphs/BalanceHistoryCalendarView.js` | New file: calendar grid + inline edit row |
| `app/screens/GraphsScreen.js` | Remove `balanceHistoryModalVisible`, `closeBalanceHistoryModal`, `handleBalanceHistoryPress`; pass edit props to `BalanceHistoryCard` |
| `app/components/graphs/BalanceHistoryModal.js` | Delete |
| `__tests__/modals/` | Remove or update any tests for `BalanceHistoryModal` |

## What Is Not Changing

- `useBalanceHistory` hook — no changes needed; all edit handlers and `balanceHistoryTableData` already exist
- Card header layout (BALANCE label, balance amount, day/total display)
- Account picker
- Chart view (when `showCalendar = false`) — fully unchanged
- Legend table — fully unchanged when in chart view
