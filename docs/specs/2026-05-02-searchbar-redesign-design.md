# SearchBar Redesign - Design Specification

**Date:** 2026-05-02  
**Status:** Approved  
**Components:** SearchBar, SearchOverlay

## Overview

Redesign the SearchBar component to improve visual design and usability. The current implementation is functional but has poor UX: the search input is too narrow, buttons are too small for comfortable tapping, and there's a visible gap between the search bar and the expanded filters panel.

## Current Problems

1. **Search input too narrow** - Constrained to ~250px max-width, wastes horizontal space
2. **Visual clutter** - Gray bordered rectangle looks dated and busy
3. **Small touch targets** - Filter and close buttons use 8px padding, making them hard to tap accurately
4. **Layout gap** - Filters panel positioned with `top: 56` creates visible gap between search bar and filters
5. **Inconsistent spacing** - Small gaps between elements, cramped feel

## Design Goals

- **Maximize search input width** - Use 70-80% of available horizontal space
- **Minimal visual treatment** - Clean underline style instead of bordered box
- **Proper touch targets** - 44x44px minimum for all interactive elements (iOS/Android HIG)
- **Seamless filters integration** - No gap between search bar and expanded filters
- **Clean, modern aesthetic** - Focus on content, not chrome

## Architecture

The search feature spans three components in OperationsScreen:

```
OperationsScreen
├─ Header (when searchMode === 'closed')
│  └─ Search icon button → opens search
│
├─ SearchBar (when searchMode === 'open')
│  ├─ Search input (flex: 1, full width)
│  ├─ Filter toggle button (44x44px)
│  └─ Close button (44x44px)
│
├─ SearchOverlay (when searchMode === 'open')
│  └─ FilterPanel (conditional, animated)
│     ├─ Account filter
│     ├─ Category filter
│     └─ Date range filter
│
└─ QuickAddForm
   └─ Animated (hidden when search open)
```

**State flow:**
- `searchMode: 'closed'` → Header visible, QuickAddForm visible
- `searchMode: 'open'` → SearchBar visible, QuickAddForm hidden, FilterPanel collapsed
- Filter button tapped → FilterPanel expands below SearchBar

## Component Changes

### 1. SearchBar.js

**Layout changes:**

Remove width constraint on search input:
```javascript
// REMOVE
searchInputContainer: {
  maxWidth: 250,
  // ...
}

// CHANGE TO
searchInputContainer: {
  flex: 1,  // Takes remaining space after buttons
  // ...
}
```

**Visual changes:**

Switch from bordered box to minimal underline:
```javascript
// REMOVE
searchInputContainer: {
  backgroundColor: colors.secondary,
  borderColor: colors.inputBorder,
  borderWidth: 1,
  borderRadius: 8,
  paddingHorizontal: 12,
  // ...
}

// CHANGE TO
searchInputContainer: {
  borderBottomWidth: 1,
  borderBottomColor: colors.inputBorder,
  paddingVertical: 8,
  paddingHorizontal: 4,
  gap: 12,
  // ...
}
```

**Touch target improvements:**

Increase button sizes from 8px padding to 44x44px:
```javascript
// REMOVE
iconButton: {
  padding: 8,
}

// CHANGE TO
iconButton: {
  width: 44,
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
}
```

**Filter button active state:**

Add subtle background when filters active:
```javascript
// In render, conditionally apply background
<TouchableOpacity
  style={[
    styles.iconButton,
    filterCount > 0 && { backgroundColor: `${colors.primary}15` }
  ]}
>
```

**Icon size adjustments:**
- Search icon: 18px (down from 20px, less prominent)
- Filter/close icons: 22px (up from 24px for visual balance with larger touch targets)

**Gap between elements:**
Change from 8px to 12px for better breathing room:
```javascript
container: {
  gap: 12,  // was implicitly 8px
  // ...
}
```

**PropTypes updates:**

Remove `secondary` from required colors (no longer used for input background):
```javascript
colors: PropTypes.shape({
  surface: PropTypes.string.isRequired,
  border: PropTypes.string.isRequired,
  inputBorder: PropTypes.string.isRequired,  // Used for underline
  text: PropTypes.string.isRequired,
  mutedText: PropTypes.string.isRequired,
  primary: PropTypes.string.isRequired,
}).isRequired,
```

Note: `secondary` was previously used for `searchInputContainer` background but is removed since we no longer render a background fill.

### 2. SearchOverlay.js

**Critical change - Remove absolute positioning:**

Current implementation positions overlay with `top: 56`, creating gap. Change to relative positioning so it flows naturally below SearchBar:

```javascript
// REMOVE
overlay: {
  position: 'absolute',
  top: 56,  // Header height - causes gap
  left: 0,
  right: 0,
  // ...
}

// CHANGE TO
overlay: {
  // No positioning - flows in normal document flow
  backgroundColor: colors.surface,
  zIndex: 10,  // Ensure it layers above content below
}
```

**Animation adjustment:**

FilterPanel should slide down from SearchBar, not from absolute position:
```javascript
// Height animation remains the same
const animatedStyle = useAnimatedStyle(() => ({
  maxHeight: filterHeight.value,
  opacity: filterOpacity.value,
  overflow: 'hidden',
}));
```

### 3. OperationsScreen.js

**Layout restructure:**

SearchBar and SearchOverlay must be adjacent in the component tree to eliminate gap:

```javascript
// Current structure (causes gap):
<View>
  {searchMode === 'open' && <SearchBar />}
  {/* Other content */}
  {searchMode === 'open' && <SearchOverlay />}
</View>

// New structure (seamless):
<View>
  {searchMode === 'open' && (
    <View>
      <SearchBar />
      <SearchOverlay />
    </View>
  )}
  {/* Other content */}
</View>
```

No other changes needed - QuickAddForm animation already works correctly with maxHeight approach.

## Visual Design Specifications

### Layout

- **Search input container**: `flex: 1` (takes remaining width after buttons)
- **Filter button**: 44x44px minimum touch target
- **Close button**: 44x44px minimum touch target  
- **Element gap**: 12px between search input and buttons
- **Container padding**: 16px horizontal (HORIZONTAL_PADDING constant)

### Search Input Style

- **Background**: None (transparent)
- **Border**: None on top/left/right
- **Underline**: 1px solid, `colors.inputBorder` (#555 in dark theme)
- **Padding**: 8px vertical, 4px horizontal
- **Icon size**: 18px (magnify icon)
- **Text color**: `colors.text` when active, `colors.mutedText` for placeholder
- **Font size**: 16px

### Filter Button

- **Size**: 44x44px (proper touch target)
- **Background idle**: Transparent
- **Background active**: `${colors.primary}15` (primary color at 15% opacity, subtle tint)
- **Border radius**: 6px
- **Icon**: filter-variant, 22px
- **Badge**: Positioned top-right corner (6px from edges), shows filter count when > 0

### Close Button

- **Size**: 44x44px
- **Background**: Transparent
- **Icon**: close, 22px
- **No special states** (always same appearance)

### Filters Panel

- **Background**: `colors.surface` (matches SearchBar container)
- **Border bottom**: 1px solid `colors.border`
- **Padding**: 16px all sides
- **Z-index**: 10 (layers above operation list)
- **Position**: Flows directly below SearchBar (no absolute positioning)

## Animation Behavior

### QuickAddForm Hide/Show

Already implemented correctly with maxHeight animation:

```javascript
// When searchMode === 'open':
quickAddMaxHeight: 0
quickAddOpacity: 0

// When searchMode === 'closed':
quickAddMaxHeight: 1000
quickAddOpacity: 1

// Duration: 300ms
```

### Filter Panel Expand/Collapse

Slide down animation when filter button tapped:

```javascript
// Collapsed (initial):
filterHeight: 0
filterOpacity: 0

// Expanded:
filterHeight: measuredHeight (via onLayout)
filterOpacity: 1

// Duration: 300ms with easing
```

**Key requirement**: No gap visible during animation. SearchOverlay must be positioned immediately below SearchBar at all times.

## Testing Strategy

### Manual Testing

1. **Visual regression**
   - Search input spans 70-80% of header width
   - Minimal underline visible (no background, no border)
   - Filter/close buttons are large and easy to tap
   - No gap between SearchBar and expanded filters

2. **Interaction testing**
   - Tap filter button → filters expand directly below search bar
   - Tap filter button again → filters collapse smoothly
   - Tap close button → search closes, QuickAddForm animates back in
   - Type in search input → text visible and debounced correctly

3. **Animation testing**
   - QuickAddForm slides out smoothly when search opens
   - No flicker or gap during transitions
   - Filter panel slides down from search bar (not from fixed position)

### Automated Testing

Update existing SearchBar tests:

```javascript
// __tests__/components/search/SearchBar.test.js

describe('SearchBar layout', () => {
  it('search input takes full width with flex: 1', () => {
    const { getByTestId } = render(<SearchBar {...props} />);
    const input = getByTestId('search-input-container');
    expect(input.props.style).toMatchObject({ flex: 1 });
  });

  it('filter button has proper touch target size', () => {
    const { getByTestId } = render(<SearchBar {...props} />);
    const button = getByTestId('filters-toggle-button');
    expect(button.props.style).toMatchObject({ width: 44, height: 44 });
  });

  it('applies active background when filters active', () => {
    const { getByTestId } = render(<SearchBar {...props} filterCount={2} />);
    const button = getByTestId('filters-toggle-button');
    expect(button.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: expect.stringMatching(/15$/) })
    );
  });
});
```

Add integration test for gap elimination:

```javascript
// __tests__/integration/SearchLayout.test.js

describe('SearchBar and SearchOverlay integration', () => {
  it('SearchOverlay positioned directly below SearchBar with no gap', () => {
    const { UNSAFE_getByType } = render(<OperationsScreen />);
    
    // Open search
    fireEvent.press(screen.getByTestId('open-search-button'));
    
    // Verify SearchOverlay has no absolute positioning
    const overlay = UNSAFE_getByType(SearchOverlay);
    expect(overlay.props.style).not.toMatchObject({ position: 'absolute' });
  });
});
```

## Success Criteria

- [ ] Search input spans at least 60% of header width (flex: 1 achieves this)
- [ ] Search input has minimal underline style (no border, no background)
- [ ] Filter and close buttons are 44x44px minimum
- [ ] Filter button shows subtle background tint when filters active
- [ ] No visible gap between SearchBar and expanded filters
- [ ] Animations smooth and gap-free (300ms duration)
- [ ] All existing tests pass
- [ ] New layout tests added and passing
- [ ] Manual testing confirms improved UX

## Implementation Notes

### Order of Changes

1. **SearchBar.js first** - Update layout and styling
2. **SearchOverlay.js second** - Remove absolute positioning
3. **OperationsScreen.js third** - Restructure component tree for adjacency
4. **Tests last** - Update and add tests

### Backwards Compatibility

No breaking changes to public API:
- Props remain the same
- Callbacks unchanged
- SearchContext API unchanged

Only internal styling and layout changes.

### Performance Considerations

- No performance impact expected
- Flex layout is performant in React Native
- Animation already optimized with Reanimated 2
- Touch target increase improves accessibility (no overhead)

### Theme Compatibility

Changes work with both light and dark themes:
- Uses theme color tokens (`colors.inputBorder`, `colors.primary`)
- No hardcoded colors
- Underline visible in both themes (tested: #555 on dark, adequate contrast)

## Open Questions

None - design approved and ready for implementation.
