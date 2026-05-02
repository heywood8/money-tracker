# Search Filter Panel Redesign

**Date:** 2026-05-02
**Status:** Approved

## Problem

The filter dropdown panel is visually broken: it renders as a flat unstyled overlay below the search bar with large dead space at the bottom, checkboxes that look inconsistent with the type chips, heavy section titles, and no visual affordance for dismissal. It doesn't read as a foreground UI layer.

## Solution

Redesign the filter panel as a proper card-styled dropdown (top-anchored, drops down) and add a `FilterChipStrip` that shows active filters as removable chips between the search bar and the operations list.

## Design Decisions

- **Panel anchor:** top-anchored, drops down from below the search bar / chip strip. Not a bottom sheet.
- **Chip strip visibility:** only when `searchMode === 'open'` AND at least one filter group is active. Absent otherwise — no placeholder strip when idle.
- **Chip granularity:** one chip per filter group (not per item). Tapping ✕ on a chip clears that entire group.
- **Collapsed state:** unchanged — badge on the search icon when filters active, no chip strip.

## Components

### New: `app/components/search/FilterChipStrip.js`

A horizontally scrollable row of active-filter chips rendered in `Header.js` below `SearchBar` when search is open and filters are active.

**Props:**
```js
{
  searchState,        // from useOperationsData()
  onClearGroup,       // (groupKey) => void — clears one filter group
  colors,
  t,
}
```

**Chip labels per group:**

| Group | 1 active | 2+ active |
|---|---|---|
| types | type name (e.g. "Expense") | "Type: N" |
| dateRange | "Apr 1 – Apr 30" / "From Apr 1" / "Until Apr 30" | — |
| amountRange | "> 50" / "< 200" / "50 – 200" | — |
| accountIds | "Accounts: N" | — |
| categoryIds | "Categories: N" | — |

**Clear group behavior:**

| Group key | Clears |
|---|---|
| `types` | `types: []` |
| `dateRange` | `dateRange: { startDate: null, endDate: null }` |
| `amountRange` | `amountRange: { min: null, max: null }` |
| `accountIds` | `accountIds: []` |
| `categoryIds` | `categoryIds: []` |

### Modified: `app/components/search/ExpandableFilters.js`

**Changes:**
1. Replace account and category checkboxes with chips (matching the existing type chips style).
2. Reduce section title weight: replace `fontSize: 16, fontWeight: '600'` labels with compact uppercase labels (`fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.mutedText`).
3. Add a "Clear all" `TouchableOpacity` at the bottom of the scroll view that calls `onFilterChange` to reset all groups.
4. Fix amount input parsing: store min/max as local string state, call `onFilterChange` with `parseFloat` only `onBlur` (not `onChangeText`). Prevents "1." snapping to "1" mid-typing.

### Modified: `app/components/search/SearchOverlay.js`

**Changes:**
1. Add card styling to `filtersContainer`: `borderBottomLeftRadius: 14, borderBottomRightRadius: 14, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10`.
2. The existing backdrop (`overlayBackdrop`) already handles dimming — no change needed there.

### Modified: `app/components/search/SearchBar.js`

**Change:** Filter icon color: use `colors.primary` when `filterCount > 0`, else `colors.text`.

```js
// before
<Icon name="filter-variant" size={22} color={colors.text} />

// after
<Icon name="filter-variant" size={22} color={filterCount > 0 ? colors.primary : colors.text} />
```

### Modified: `app/components/Header.js`

**Change:** Render `FilterChipStrip` below `SearchBar` when `searchMode === 'open'` and `hasActiveSearch`.

```jsx
{searchMode === 'open' ? (
  <>
    <SearchBar ... />
    {hasActiveSearch && (
      <FilterChipStrip
        searchState={searchState}
        onClearGroup={handleClearFilterGroup}
        colors={colors}
        t={t}
      />
    )}
  </>
) : ( ... )}
```

`handleClearFilterGroup(groupKey)` calls `updateSearchFilters` (from `useOperationsActions`) with the reset value for that group.

## Bug Fixes Bundled

1. **Amount input decimal loss** — `ExpandableFilters` uses `parseFloat` on every keystroke, causing "1." to snap to "1". Fixed by local string state + parse on blur.
2. **Filter icon no active state** — `SearchBar` filter icon stays `colors.text` regardless of active filters. Fixed to use `colors.primary` when `filterCount > 0`.

## Out of Scope

- Category hierarchy in filter selection (the filter only matches exact `categoryId`, unlike text search which walks the hierarchy). Known inconsistency, separate issue.
- Amount range slider (text inputs kept, just bug-fixed).
- Any changes to `SearchContext`, `OperationsDataContext`, or `OperationsScreen`.

## Files Changed

| File | Change |
|---|---|
| `app/components/search/FilterChipStrip.js` | **CREATE** |
| `app/components/search/ExpandableFilters.js` | chips, compact labels, clear-all, fix amount parsing |
| `app/components/search/SearchOverlay.js` | card styling on filter panel |
| `app/components/search/SearchBar.js` | filter icon active color |
| `app/components/Header.js` | render FilterChipStrip |

## Tests Required

- `FilterChipStrip`: chip renders per active group, correct labels, ✕ clears correct group, absent when no filters active
- `ExpandableFilters`: amount input preserves decimal mid-type, clear-all resets all groups, accounts/categories render as chips
- `SearchBar`: filter icon color switches with filterCount
- Integration: chip strip visible/hidden based on search mode + filter state
