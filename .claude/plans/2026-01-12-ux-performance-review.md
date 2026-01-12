# Penny React Native App - Comprehensive UX & Performance Review

## PART 1: CHECKLIST SUMMARY

**Component Structure & Patterns**: ⚠️ NEEDS ATTENTION - Deep provider nesting (11 levels), large modal components (734-772 lines), split context pattern implemented but heavy re-render risk remains

**Render Optimization**: ❌ CRITICAL ISSUES - Multiple FlatList implementations missing critical optimization props, Calculator timer cleanup has race conditions, FilterModal has expensive recursive operations

**Navigation Patterns**: ✅ GOOD - Custom swipe navigation well-implemented with react-native-reanimated, proper gesture handling, smooth transitions

**Mobile-Specific UX**: ⚠️ NEEDS ATTENTION - Touch targets adequate, accessibility labels present but inconsistent, ErrorBoundary uses hard-coded theme colors breaking dark mode

**Code Quality**: ⚠️ NEEDS ATTENTION - Some memory leak risks in Calculator, complex component sizes, event listener patterns generally good but budget recalculation on every operation could be optimized

---

## PART 2: DETAILED FINDINGS (Top 10 Issues)

## 1. [CRITICAL] Calculator Long-Press Timer Race Condition

**Category**: Code Quality / Memory Management

**Description**:
The Calculator component's long-press repeat logic has a race condition that can cause memory leaks and interval orphaning. When `onPressOut` fires while an interval is active, the code sets `stopRequestedRef.current = true` but doesn't guarantee the interval will be cleared. If the interval callback doesn't execute before component unmounts, the interval continues running indefinitely. Additionally, the safety counter (maxTicks = 200) is a band-aid solution that indicates the core cleanup logic is unreliable.

**Code Example**:
```javascript
// ❌ Current implementation (app/components/Calculator.js:27-48)
const clearTimers = useCallback(() => {
  // If interval is active, request stop instead of clearing directly
  if (intervalActiveRef.current) {
    stopRequestedRef.current = true;
    return; // PROBLEM: Exits without clearing interval
  }

  // Normal release (for short presses)
  isPressedRef.current = false;

  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  if (intervalRef.current) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
}, []);

// ✅ Recommended implementation
const clearTimers = useCallback(() => {
  isPressedRef.current = false;
  stopRequestedRef.current = true;

  // Always clear timers immediately, don't rely on flags
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  if (intervalRef.current) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  intervalActiveRef.current = false;
}, []);
```

**Recommendation**:
1. Remove the conditional early return in `clearTimers` - always clear intervals immediately
2. Remove the `stopRequestedRef` flag - it adds complexity without solving the root issue
3. Remove the safety counter (maxTicks) - proper cleanup makes it unnecessary
4. Simplify the logic: set flags, clear timers, done
5. Test by rapidly pressing/releasing calculator buttons while watching for console warnings about "Can't perform a React state update on an unmounted component"

---

## 2. [CRITICAL] Missing FlatList Optimization Props

**Category**: Render Optimization

**Description**:
Multiple FlatList implementations across the app are missing critical performance optimization props. This causes unnecessary re-renders, especially problematic in OperationsList and CategoriesScreen where lists can be long. The operations list uses lazy-loading but without proper optimization, scrolling performance degrades as more items load. Missing `getItemLayout`, `removeClippedSubviews`, `maxToRenderPerBatch`, and `windowSize` props force React Native to calculate layout for all items on every render.

**Code Example**:
```javascript
// ❌ Current implementation (app/components/operations/OperationsList.js:182+)
<FlatList
  ref={ref}
  data={groupedOperations}
  renderItem={renderItem}
  keyExtractor={keyExtractor}
  onEndReached={handleEndReached}
  onEndReachedThreshold={0.5}
  ListFooterComponent={renderFooter}
  // Missing critical optimization props!
/>

// ✅ Recommended implementation
<FlatList
  ref={ref}
  data={groupedOperations}
  renderItem={renderItem}
  keyExtractor={keyExtractor}
  onEndReached={handleEndReached}
  onEndReachedThreshold={0.5}
  ListFooterComponent={renderFooter}
  // Performance optimizations
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={10}
  initialNumToRender={20}
  updateCellsBatchingPeriod={50}
  // Only if items have consistent height:
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
/>
```

**Recommendation**:
1. Add `removeClippedSubviews={true}` to all FlatList instances - this unmounts off-screen items
2. Set `maxToRenderPerBatch={10}` and `windowSize={10}` for operations list (reduce for shorter lists)
3. If ListCard items have consistent heights, implement `getItemLayout` for major performance boost
4. Add `updateCellsBatchingPeriod={50}` to reduce layout thrashing during fast scrolls
5. Test scroll performance on a low-end Android device with 1000+ operations
6. Apply same optimizations to: AccountsScreen (line ~345), CategoriesScreen (line ~198), CategoryModal, BudgetModal pickers

---

## 3. [HIGH] FilterModal Recursive Category Logic Performance

**Category**: Render Optimization

**Description**:
FilterModal's `getAllDescendantIds` function (line 94) performs recursive traversal of the category tree on every checkbox interaction. With deep category hierarchies (3-4 levels), this creates O(n²) complexity as it filters the entire categories array multiple times per recursion level. The `areAllDescendantsSelected` and `areSomeDescendantsSelected` functions call this expensive operation repeatedly. For a tree with 50 categories and 4 levels, a single checkbox toggle can trigger hundreds of array filters.

**Code Example**:
```javascript
// ❌ Current implementation (app/components/FilterModal.js:93-108)
const getAllDescendantIds = (categoryId) => {
  const descendants = [];
  const children = visibleCategories.filter(cat => cat.parentId === categoryId); // O(n) filter

  children.forEach(child => {
    if (child.type !== 'folder') {
      descendants.push(child.id);
    }
    descendants.push(...getAllDescendantIds(child.id)); // Recursive - more O(n) filters
  });

  return descendants;
};

// ✅ Recommended implementation (memoized lookup)
// Build parent-child map once when categories change
const categoryChildrenMap = useMemo(() => {
  const map = new Map();
  visibleCategories.forEach(cat => {
    if (cat.parentId) {
      if (!map.has(cat.parentId)) {
        map.set(cat.parentId, []);
      }
      map.get(cat.parentId).push(cat);
    }
  });
  return map;
}, [visibleCategories]);

const getAllDescendantIds = useCallback((categoryId) => {
  const descendants = [];
  const children = categoryChildrenMap.get(categoryId) || []; // O(1) lookup

  children.forEach(child => {
    if (child.type !== 'folder') {
      descendants.push(child.id);
    }
    const childDescendants = getAllDescendantIds(child.id);
    descendants.push(...childDescendants);
  });

  return descendants;
}, [categoryChildrenMap]);
```

**Recommendation**:
1. Build a parent→children Map once when categories change using `useMemo`
2. Replace array.filter() lookups with Map.get() for O(1) access
3. Memoize `getAllDescendantIds` with `useCallback` to prevent recreation
4. Consider caching descendant lists in a Map to avoid recalculating for same category
5. Profile with React DevTools Profiler to confirm improvement
6. Apply same optimization to CategoriesScreen which has similar recursive logic

---

## 4. [HIGH] Deep Provider Nesting Causes Render Cascades

**Category**: Component Structure & Patterns

**Description**:
App.js nests 11 context providers (lines 77-99), creating a deep render tree where changes in parent contexts cascade through all children even when using the split data/actions pattern. Every time ThemeColorsContext updates (theme switch), it triggers re-renders in all 10 nested providers below it. While the split-context pattern helps (OperationsDataContext + OperationsActionsContext), the deep nesting amplifies the issue. This is especially problematic for theme changes, which should only re-render components actually using theme colors.

**Code Example**:
```javascript
// ❌ Current implementation (App.js:72-103)
export default Sentry.wrap(function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <LocalizationProvider>
            <ThemeConfigProvider>
              <ThemeColorsProvider>
                <DialogProvider>
                  <ImportProgressProvider>
                    <AccountsDataProvider>
                      <AccountsActionsProvider>
                        <CategoriesProvider>
                          <OperationsDataProvider>
                            <OperationsActionsProvider>
                              <BudgetsProvider>
                                <AppContent />
                              </BudgetsProvider>
                            </OperationsActionsProvider>
                          </OperationsDataProvider>
                        </CategoriesProvider>
                      </AccountsActionsProvider>
                    </AccountsDataProvider>
                  </ImportProgressProvider>
                </DialogProvider>
              </ThemeColorsProvider>
            </ThemeConfigProvider>
          </LocalizationProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
});

// ✅ Recommended implementation - Combine related providers
const CoreProviders = React.memo(({ children }) => (
  <LocalizationProvider>
    <ThemeConfigProvider>
      <ThemeColorsProvider>
        <DialogProvider>
          {children}
        </DialogProvider>
      </ThemeColorsProvider>
    </ThemeConfigProvider>
  </LocalizationProvider>
));

const DataProviders = React.memo(({ children }) => (
  <AccountsDataProvider>
    <AccountsActionsProvider>
      <CategoriesProvider>
        <OperationsDataProvider>
          <OperationsActionsProvider>
            <BudgetsProvider>
              {children}
            </BudgetsProvider>
          </OperationsActionsProvider>
        </OperationsDataProvider>
      </CategoriesProvider>
    </AccountsActionsProvider>
  </AccountsDataProvider>
));

export default Sentry.wrap(function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <CoreProviders>
            <ImportProgressProvider>
              <DataProviders>
                <AppContent />
              </DataProviders>
            </ImportProgressProvider>
          </CoreProviders>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
});
```

**Recommendation**:
1. Group related providers into memoized wrapper components (CoreProviders, DataProviders)
2. This reduces nesting depth from 11 to ~4 levels
3. Memoize wrapper components to prevent unnecessary re-renders when props don't change
4. Consider using a provider composition utility function to flatten the tree
5. Profile with React DevTools to measure render time improvement on theme switches
6. Document provider dependencies (e.g., OperationsActionsProvider depends on AccountsActionsProvider)

---

## 5. [HIGH] ErrorBoundary Hard-Coded Colors Break Dark Mode

**Category**: Mobile-Specific UX / Code Quality

**Description**:
ErrorBoundary component (app/components/ErrorBoundary.js) uses hard-coded colors in its styles (white background, dark text), making it completely unusable in dark mode. When an error occurs in dark mode, users see white-on-white or dark-on-white text that's unreadable. This is a critical accessibility and UX failure since error states should be maximally clear. The component is a class component that doesn't have access to ThemeColorsContext, but it must handle errors gracefully regardless of theme.

**Code Example**:
```javascript
// ❌ Current implementation (app/components/ErrorBoundary.js:49-86)
const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF', // Hard-coded blue
    // ...
  },
  buttonText: {
    color: '#fff', // Hard-coded white
    // ...
  },
  container: {
    backgroundColor: '#fff', // Hard-coded white background
    // ...
  },
  error: {
    color: '#ff0000', // Hard-coded red
    // ...
  },
  message: {
    color: '#666', // Hard-coded gray
    // ...
  },
  title: {
    color: '#111', // Hard-coded near-black
    // ...
  },
});

// ✅ Recommended implementation
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { Appearance } from 'react-native';

function ErrorBoundaryFallback({ error, resetError }) {
  const { colors } = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.mutedText }]}>
        {"We're sorry for the inconvenience. Please try restarting the app."}
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={resetError}
      >
        <Text style={[styles.buttonText, { color: colors.text }]}>Try Again</Text>
      </TouchableOpacity>
      {__DEV__ && error && (
        <Text style={[styles.error, { color: colors.error || '#ff6b6b' }]}>
          {error.toString()}
        </Text>
      )}
    </View>
  );
}

class ErrorBoundary extends React.Component {
  // ... existing state logic

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          resetError={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}
```

**Recommendation**:
1. Extract error UI into a functional component that can use ThemeColorsContext
2. Pass error and resetError as props to the functional component
3. Use dynamic colors from theme context throughout
4. Add fallback colors that work in both light/dark if context is unavailable
5. Test by throwing an error in both light and dark modes
6. Consider using Appearance.getColorScheme() as final fallback if context fails

---

## 6. [HIGH] Budget Status Recalculation on Every Operation

**Category**: Render Optimization / Code Quality

**Description**:
BudgetsContext (line 70-76) listens to OPERATION_CHANGED events and recalculates ALL budget statuses on every operation add/edit/delete. The `calculateAllBudgetStatuses` function queries the database for every active budget's spending, which could mean 10-20 database queries for users with multiple budgets. This happens synchronously after every operation, blocking the UI and making quick-add operations feel sluggish. The recalculation isn't debounced or batched, so adding 5 operations in quick succession triggers 5 full recalculations.

**Code Example**:
```javascript
// ❌ Current implementation (app/contexts/BudgetsContext.js:67-76)
useEffect(() => {
  const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, () => {
    console.log('Operation changed, refreshing budget statuses...');
    refreshBudgetStatuses(); // Immediate, synchronous, unoptimized
  });

  return unsubscribe;
}, [refreshBudgetStatuses]);

// ✅ Recommended implementation
useEffect(() => {
  let timeoutId = null;

  const handleOperationChange = () => {
    // Debounce: wait 300ms after last operation before recalculating
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      console.log('Operation changed (debounced), refreshing budget statuses...');
      refreshBudgetStatuses();
      timeoutId = null;
    }, 300);
  };

  const unsubscribe = appEvents.on(EVENTS.OPERATION_CHANGED, handleOperationChange);

  return () => {
    unsubscribe();
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}, [refreshBudgetStatuses]);
```

**Recommendation**:
1. Debounce budget status recalculation by 300ms to batch rapid operation changes
2. Consider marking affected budgets as "stale" and recalculating only when user views CategoriesScreen
3. Move calculation to InteractionManager.runAfterInteractions() to avoid blocking UI
4. Profile database query time for calculateAllBudgetStatuses - may need query optimization
5. Consider caching budget calculations with invalidation only for affected categories
6. Add a loading state to BudgetProgressBar so users know recalculation is in progress

---

## 7. [MEDIUM] Large Modal Components Reduce Maintainability

**Category**: Component Structure & Patterns

**Description**:
FilterModal (734 lines) and OperationModal (772 lines) are monolithic components that handle multiple concerns: state management, UI rendering, form logic, picker navigation, and validation. This violates Single Responsibility Principle and makes these components difficult to test, debug, and maintain. Changes to one section (e.g., amount input logic) require touching a massive file with complex interdependencies. The components mix UI logic, business logic, and state management in ways that prevent effective code splitting.

**Code Example**:
```javascript
// ❌ Current implementation (FilterModal.js - 734 lines with mixed concerns)
const FilterModal = ({ visible, onClose, filters, ... }) => {
  // State management (40 lines)
  const [localFilters, setLocalFilters] = useState(safeFilters);
  const [expandedIds, setExpandedIds] = useState(new Set());
  // ... more state

  // Business logic (100+ lines)
  const getAllDescendantIds = (categoryId) => { ... };
  const areAllDescendantsSelected = (categoryId) => { ... };
  const toggleCategory = (categoryId, isFolder) => { ... };
  // ... more logic

  // UI rendering (500+ lines)
  return (
    <Modal ...>
      <View>
        <ScrollView>
          {/* Search Section */}
          {/* Date Range Section */}
          {/* Amount Range Section */}
          {/* Type Section */}
          {/* Accounts Section */}
          {/* Categories Section - complex nested rendering */}
        </ScrollView>
      </View>
    </Modal>
  );
};

// ✅ Recommended implementation (split into focused components)
// FilterModal.js (main orchestrator - 200 lines)
// components/filters/SearchFilter.js (50 lines)
// components/filters/DateRangeFilter.js (80 lines)
// components/filters/AmountRangeFilter.js (60 lines)
// components/filters/TypeFilter.js (50 lines)
// components/filters/AccountsFilter.js (80 lines)
// components/filters/CategoriesFilter.js (150 lines)
// hooks/useFilterCategories.js (business logic - 120 lines)

const FilterModal = ({ visible, onClose, filters, onApplyFilters, accounts, categories, t, colors }) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const categoryLogic = useFilterCategories(categories, localFilters);

  return (
    <Modal visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContent}>
        <ScrollView>
          <SearchFilter filters={localFilters} onChange={setLocalFilters} colors={colors} t={t} />
          <DateRangeFilter filters={localFilters} onChange={setLocalFilters} colors={colors} t={t} />
          <AmountRangeFilter filters={localFilters} onChange={setLocalFilters} colors={colors} t={t} />
          <TypeFilter filters={localFilters} onChange={setLocalFilters} colors={colors} t={t} />
          <AccountsFilter
            filters={localFilters}
            onChange={setLocalFilters}
            accounts={accounts}
            colors={colors}
            t={t}
          />
          <CategoriesFilter
            filters={localFilters}
            onChange={setLocalFilters}
            categoryLogic={categoryLogic}
            colors={colors}
            t={t}
          />
        </ScrollView>
        <FilterActions onClear={handleClearAll} onApply={handleApply} />
      </View>
    </Modal>
  );
};
```

**Recommendation**:
1. Extract FilterModal into 6-7 focused sub-components (SearchFilter, DateRangeFilter, etc.)
2. Move category tree logic into custom hook `useFilterCategories`
3. Create `FilterActions` component for Clear/Apply buttons
4. Each sub-component should be < 100 lines and handle one filter type
5. Similar refactoring for OperationModal - extract form fields, pickers, validation
6. Benefits: easier testing, better code splitting, simpler debugging, clearer data flow
7. Start with FilterModal as it's more complex and has recursive logic

---

## 8. [MEDIUM] SimpleTabs Renders All Screens Simultaneously

**Category**: Render Optimization / Navigation Patterns

**Description**:
SimpleTabs (line 228-245) renders all 4 screens (Operations, Accounts, Categories, Graphs) simultaneously in a horizontal layout, even though only one is visible at a time. This means all 4 screens mount on app launch, load their data, and run their effects - a significant performance hit on app startup. GraphsScreen in particular may have expensive chart rendering that runs even when users are on OperationsScreen. The approach trades memory for smooth transitions, but the cost is too high for the benefit.

**Code Example**:
```javascript
// ❌ Current implementation (app/navigation/SimpleTabs.js:228-245)
const renderScreens = useCallback(() => {
  return (
    <>
      <View style={styles.screen}>
        <OperationsScreen /> {/* Always mounted */}
      </View>
      <View style={styles.screen}>
        <AccountsScreen /> {/* Always mounted */}
      </View>
      <View style={styles.screen}>
        <CategoriesScreen /> {/* Always mounted */}
      </View>
      <View style={styles.screen}>
        <GraphsScreen /> {/* Always mounted - expensive charts! */}
      </View>
    </>
  );
}, []);

// ✅ Recommended implementation (conditional rendering with transition)
const SCREENS = {
  Operations: OperationsScreen,
  Accounts: AccountsScreen,
  Categories: CategoriesScreen,
  Graphs: GraphsScreen,
};

const renderScreens = useCallback(() => {
  const CurrentScreen = SCREENS[active];
  const currentIndex = TABS.findIndex(tab => tab.key === active);

  // Render current + adjacent screens for smooth swipe
  return TABS.map((tab, index) => {
    const shouldRender = Math.abs(index - currentIndex) <= 1;
    const Screen = SCREENS[tab.key];

    return (
      <View key={tab.key} style={styles.screen}>
        {shouldRender ? <Screen /> : <View />}
      </View>
    );
  });
}, [active, TABS]);
```

**Recommendation**:
1. Render only the current screen + adjacent screens (for smooth swipe transitions)
2. Unmount screens that are 2+ positions away from current
3. This reduces initial mount from 4 screens to 2 screens (50% reduction)
4. Add transition buffer: keep previous screen mounted briefly after swipe (100ms) for smooth back-swipe
5. Test swipe smoothness - if janky, consider keeping all screens but deferring non-visible screen data loading
6. Alternative: Render all screens but add `enabled={isVisible}` prop to skip data loading when not active
7. Profile startup time with React Native Performance Monitor before/after

---

## 9. [MEDIUM] OperationsScreen Scroll Logic Complexity

**Category**: Code Quality / UX

**Description**:
OperationsScreen's jump-to-date logic (lines 100-153) uses multiple state variables (`scrollToDateString`, `pendingScroll`), InteractionManager, and both `scrollToIndex` and `scrollToOffset` with try/catch fallback. The implementation is fragile - it relies on `handleContentSizeChange` firing after layout, which isn't guaranteed. If FlatList content size doesn't change (e.g., jumping to a date already in view), the scroll never happens and state is stuck. The `animated: false` workaround for distant dates indicates scrollToIndex isn't reliable.

**Code Example**:
```javascript
// ❌ Current implementation (app/screens/OperationsScreen.js:100-153)
useEffect(() => {
  if (scrollToDateString && !operationsLoading && groupedOperations.length > 0) {
    const separatorIndex = groupedOperations.findIndex(
      item => item.type === 'separator' && item.date === scrollToDateString,
    );

    if (separatorIndex !== -1) {
      setPendingScroll(true); // Sets flag, but scroll happens in different callback
    } else {
      setScrollToDateString(null);
      setPendingScroll(false);
    }
  }
}, [scrollToDateString, operationsLoading, groupedOperations]);

const handleContentSizeChange = useCallback((width, height) => {
  if (pendingScroll && scrollToDateString && !operationsLoading) {
    // Complex logic with InteractionManager, try/catch, fallback
    // ...
  }
}, [pendingScroll, scrollToDateString, operationsLoading, groupedOperations]);

// ✅ Recommended implementation (direct scroll with proper timing)
const scrollToDate = useCallback((dateString) => {
  if (operationsLoading || !groupedOperations.length) {
    // Retry after data loads
    setScrollToDateString(dateString);
    return;
  }

  const separatorIndex = groupedOperations.findIndex(
    item => item.type === 'separator' && item.date === dateString
  );

  if (separatorIndex === -1) {
    console.warn('Date not found in operations list:', dateString);
    setScrollToDateString(null);
    return;
  }

  // Wait for next frame to ensure layout is ready
  requestAnimationFrame(() => {
    try {
      flatListRef.current?.scrollToIndex({
        index: separatorIndex,
        animated: true,
        viewPosition: 0,
      });
    } catch (error) {
      // Fallback: estimate offset (item height = 75px approx)
      const offset = separatorIndex * 75;
      flatListRef.current?.scrollToOffset({
        offset,
        animated: true,
      });
    }
    setScrollToDateString(null);
  });
}, [operationsLoading, groupedOperations]);

// Retry scroll when data finishes loading
useEffect(() => {
  if (scrollToDateString && !operationsLoading) {
    scrollToDate(scrollToDateString);
  }
}, [scrollToDateString, operationsLoading, scrollToDate]);
```

**Recommendation**:
1. Simplify to single `scrollToDate` function that handles all logic
2. Remove `pendingScroll` state - not needed with direct approach
3. Use `requestAnimationFrame` instead of `InteractionManager` for layout timing
4. Remove `handleContentSizeChange` callback - not reliable trigger
5. Keep try/catch fallback but make it the exception, not the pattern
6. If `getItemLayout` is added (from Issue #2), scrollToIndex becomes much more reliable
7. Add user feedback: show brief toast "Jumped to [date]" or "Date not found"

---

## 10. [MEDIUM] Inconsistent Accessibility Label Patterns

**Category**: Mobile-Specific UX / Accessibility

**Description**:
Accessibility implementation is inconsistent across components. Some use `accessibilityLabel` + `accessibilityHint` (best practice), others only use `accessibilityLabel`, and some use `accessibilityRole` without labels. CategoriesScreen (line 122-138) has comprehensive accessibility, but Calculator buttons (line 133-134) only have label without hint. OperationModal save button has label but date picker button doesn't (line 422). This inconsistency makes TalkBack experience unpredictable - users don't know what interactions will speak useful information.

**Code Example**:
```javascript
// ❌ Inconsistent patterns across codebase

// Good example (CategoriesScreen.js:133-139)
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={
    isExpanded
      ? `Collapse ${category.name}`
      : `Expand ${category.name}`
  }
  accessibilityHint="Shows or hides subcategories"
  accessibilityState={{ expanded: isExpanded }}
>

// Minimal example (Calculator.js:133-134)
<Pressable
  accessibilityRole="button"
  accessibilityLabel={value}
  // Missing: accessibilityHint
>

// Missing label (OperationModal.js:422 - date picker has testID but no accessibility)
<Pressable
  style={styles.pickerButton}
  onPress={handleOpenDatePicker}
  disabled={isShadowOperation}
  accessibilityRole="button"
  accessibilityLabel={t('select_date')} // Added in code, but inconsistent across modals
  testID="date-input"
>

// ✅ Recommended consistent pattern
// 1. Interactive element attributes
<Pressable
  // Always include these three for interactive elements:
  accessibilityRole="button" // or "switch", "text", etc.
  accessibilityLabel="Save operation" // What it is
  accessibilityHint="Saves the current operation and closes the modal" // What it does

  // Include state when relevant:
  accessibilityState={{
    disabled: isShadowOperation,
    selected: isSelected // for checkboxes/radio
  }}

  // Include value for controls with values:
  accessibilityValue={{
    text: formattedAmount // for amounts, dates, etc.
  }}
>
```

**Recommendation**:
1. Create accessibility guidelines document for the project
2. Standard pattern for all interactive elements:
   - `accessibilityRole` - always required
   - `accessibilityLabel` - always required (what it is)
   - `accessibilityHint` - required for non-obvious actions (what it does)
   - `accessibilityState` - when element has states (disabled, selected, expanded)
   - `accessibilityValue` - for inputs/controls with values
3. Apply to all Calculator buttons, modal buttons, pickers, form inputs
4. Test with TalkBack enabled on Android device
5. Create reusable wrapper components (AccessibleButton, AccessibleInput) with built-in patterns
6. Add ESLint rule to enforce accessibility props on interactive elements

---

## Additional Observations (Not in Top 10)

### Component Patterns (Positive)
- Split data/actions context pattern is well-implemented (Operations, Accounts)
- Good use of `useCallback` and `useMemo` throughout
- Custom hooks (useOperationForm, useOperationPicker, useMultiCurrencyTransfer) extract logic well

### Navigation (Positive)
- Custom SimpleTabs with reanimated is smooth and well-implemented
- Gesture handling properly uses activeOffset to avoid conflicts with scrolling
- Spring animations have good damping/stiffness values

### Areas for Future Improvement
- Consider migrating from PropTypes to TypeScript for better type safety
- EventEmitter pattern works but could be replaced with Context APIs for better React integration
- Consider lazy-loading GraphsScreen components (charts) only when tab is first accessed
- Add React.memo() to more list item components (OperationListItem, ListCard)
- AsyncStorage persistence could be replaced with faster alternatives (MMKV, SQLite)

---

## Testing Recommendations

1. **Performance Testing**:
   - Test with 1000+ operations to verify FlatList optimizations
   - Profile theme switching with React DevTools
   - Measure app startup time with Performance Monitor
   - Test Calculator rapid button presses for memory leaks

2. **Accessibility Testing**:
   - Enable TalkBack and navigate entire app
   - Verify all interactive elements speak useful information
   - Test error states in both light and dark mode

3. **Edge Cases**:
   - Deep category hierarchies (4-5 levels) in FilterModal
   - Rapid operation creation (5+ in quick succession)
   - Theme switching while modals are open
   - App backgrounding during Calculator long-press

---

## Priority Implementation Order

1. **Week 1 - Critical fixes**: Calculator timer race condition (#1), FlatList optimizations (#2)
2. **Week 2 - High impact**: FilterModal recursion (#3), ErrorBoundary dark mode (#5)
3. **Week 3 - Performance**: Provider nesting (#4), Budget recalculation (#6)
4. **Week 4 - Code quality**: Large modal refactoring (#7), SimpleTabs optimization (#8)
5. **Week 5 - Polish**: Scroll logic simplification (#9), Accessibility consistency (#10)

Total estimated effort: 5-6 weeks with 1 developer
