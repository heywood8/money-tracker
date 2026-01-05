# React Native Best Practices - Top 3 Improvements

## Overview
Analysis of the Penny Finance Tracker codebase identified numerous violations of React Native best practices. This plan focuses on the **top 3 most impactful improvements** that will significantly enhance performance, maintainability, and code quality.

---

## 🔴 #1 - Component Size (CRITICAL)

### Problem
Multiple screen components violate the single responsibility principle and are extremely difficult to maintain:

- **GraphsScreen.js**: 2,091 lines
- **OperationsScreen.js**: 1,284 lines
- **OperationModal.js**: 1,167 lines

### Impact
- **Maintainability**: Difficult to understand, modify, and debug
- **Performance**: Entire component re-renders even for small changes
- **Testability**: Nearly impossible to write focused unit tests
- **Code reuse**: Logic is locked inside massive components
- **Team collaboration**: High merge conflict potential

### Solution
Break down each massive component into focused, single-purpose components:

**GraphsScreen.js → 5-6 components:**
- `BalanceHistoryCard` (chart + data table)
- `ExpensePieChart` (pie chart + category breakdown)
- `IncomePieChart` (pie chart + category breakdown)
- `SpendingPredictionCard` (prediction progress + stats)
- `ExpenseSummaryCard` (monthly summary)
- `IncomeSummaryCard` (monthly summary)

**OperationsScreen.js → 4-5 components:**
- `QuickAddForm` (quick entry form at top)
- `OperationsList` (FlatList with filters)
- `OperationListItem` (single operation row)
- `DateSeparator` (date header between groups)
- Keep main screen for coordination

**OperationModal.js → 3-4 components:**
- `OperationForm` (main form fields)
- `CategoryPicker` (modal for category selection)
- `MultiCurrencyFields` (exchange rate fields)
- Keep modal wrapper for orchestration

### Files to Modify
- `app/screens/GraphsScreen.js`
- `app/screens/OperationsScreen.js`
- `app/modals/OperationModal.js`

### Files to Create
- `app/components/graphs/BalanceHistoryCard.js`
- `app/components/graphs/ExpensePieChart.js`
- `app/components/graphs/IncomePieChart.js`
- `app/components/graphs/SpendingPredictionCard.js`
- `app/components/graphs/ExpenseSummaryCard.js`
- `app/components/graphs/IncomeSummaryCard.js`
- `app/components/operations/QuickAddForm.js`
- `app/components/operations/OperationsList.js`
- `app/components/operations/OperationListItem.js`
- `app/components/operations/DateSeparator.js`
- `app/components/operations/CategoryPicker.js`
- `app/components/operations/MultiCurrencyFields.js`

---

## 🟡 #2 - Performance: Anonymous Functions in JSX (HIGH)

### Problem
Components create new function instances on every render by using anonymous functions in JSX, causing child components to re-render unnecessarily.

**Examples:**

**OperationsScreen.js (Lines 67-73):**
```javascript
onPress={() => setQuickAddValues(v => ({
  ...v,
  type: type.key,
  categoryId: type.key === 'transfer' ? '' : v.categoryId,
  toAccountId: '',
}))}
```

**GraphsScreen.js (Lines 1154-1165):**
```javascript
formatXLabel={(value, index) => {
  // ... formatting logic
}}
chartConfig={{
  color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
  labelColor: (opacity = 1) => colors.text,
}}
```

**OperationModal.js (Lines 834-886):**
```javascript
onPress={() => {
  // 50+ lines of async logic
}}
```

### Impact
- **Performance**: Every render creates new function instances
- **Re-renders**: Child components receiving these functions as props re-render unnecessarily
- **Memory**: Increased garbage collection pressure
- **React DevTools**: Shows components updating when they shouldn't

### Solution
Use `useCallback` to memoize event handlers:

```javascript
// Before
onPress={() => handleAction(item.id)}

// After
const handlePress = useCallback(() => {
  handleAction(item.id);
}, [item.id]);
// ...
onPress={handlePress}
```

For inline formatting functions, extract to memoized helpers:
```javascript
const formatXLabel = useCallback((value, index) => {
  // formatting logic
}, [dependencies]);
```

### Files to Modify
- `app/screens/OperationsScreen.js` (Lines 67-73, 111, 151, 829-897)
- `app/screens/GraphsScreen.js` (Lines 1154-1165)
- `app/modals/OperationModal.js` (Lines 77-82, 834-886)
- `app/screens/AccountsScreen.js` (optimize item.id dependency)

---

## 🟠 #3 - Context Over-use Causing Re-renders (HIGH)

### Problem
Context providers expose large objects with 10-15 properties. Every time any property changes, ALL consumers re-render, even if they only use a subset of the data.

**Examples:**

**OperationsContext.js (Lines 370-410):**
```javascript
const value = {
  operations,           // Changes frequently
  loading,             // Changes during load
  error,
  addOperation,
  updateOperation,
  deleteOperation,
  restoreDeletedOperation,
  refreshOperations,
  getOperationById,
  categoryNavigation,  // Changes during navigation
  // ... 15+ properties total
};
```

**Impact:**
- Component using only `loading` re-renders when `operations` changes
- Component using only `addOperation` re-renders on every operation change
- Unnecessary work across the entire component tree
- Poor performance, especially with large operation lists

**AccountsContext.js (Lines 314-332):**
- Similar issue with 12 properties
- `currencies` array included unnecessarily (static data from JSON)

**ThemeContext.js (Lines 61-99):**
- Entire context value recreated on theme change
- All consumers re-render even if they only need `colors`

### Solution

**Option 1: Split Contexts (Recommended)**
```javascript
// OperationsDataContext - Data only
<OperationsDataContext.Provider value={{ operations, loading, error }}>

// OperationsActionsContext - Functions only (never change)
<OperationsActionsContext.Provider value={{ addOperation, updateOperation, ... }}>

// OperationsNavContext - Navigation state
<OperationsNavContext.Provider value={{ categoryNavigation, ... }}>
```

**Option 2: Use Selectors with useMemo**
```javascript
const { operations } = useOperations();
const filteredOps = useMemo(
  () => operations.filter(/* ... */),
  [operations]
);
```

**Option 3: Smaller context objects**
Split large contexts into focused contexts by feature area.

### Files to Modify
- `app/contexts/OperationsContext.js` - Split into 3 contexts
- `app/contexts/AccountsContext.js` - Split into data + actions
- `app/contexts/ThemeContext.js` - Split theme vs colors
- All consumer files (screens/modals) - Update to use split contexts

### Files to Create
- `app/contexts/OperationsDataContext.js`
- `app/contexts/OperationsActionsContext.js`
- `app/contexts/OperationsNavContext.js`

---

## Priority Recommendation

**Start with #1 (Component Size)** - This provides the foundation for all other improvements:
- Makes #2 easier (smaller components = easier to spot anonymous functions)
- Makes #3 easier (smaller components = clearer context dependencies)
- Immediate improvement in maintainability
- Enables better testing

Then tackle #2 (Anonymous Functions) and #3 (Context Over-use) in parallel since they're independent.

---

## Additional Context

**Other Issues Found (Lower Priority):**
- FlatList missing `getItemLayout` optimization
- Inline styles instead of StyleSheet
- Missing accessibility labels
- Non-responsive layouts (hardcoded Dimensions)
- Duplicate style definitions across files

These should be addressed after the top 3 are resolved.

**Testing Strategy:**
- After each refactor, verify existing functionality still works
- Add unit tests for newly extracted components
- Monitor performance improvements with React DevTools Profiler
- Ensure no regression in user experience
