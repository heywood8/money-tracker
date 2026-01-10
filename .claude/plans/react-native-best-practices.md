# React Native Best Practices - Top 3 Improvements

## Overview
Analysis of the Penny Finance Tracker codebase identified numerous violations of React Native best practices. This plan focuses on the **top 3 most impactful improvements** that will significantly enhance performance, maintainability, and code quality.

---

## 🔴 #1 - Component Size (CRITICAL) - ⚠️ PARTIALLY COMPLETE

### Original Problem
Three massively oversized screen components violated the single responsibility principle:

- **GraphsScreen.js**: 2,091 lines
- **OperationsScreen.js**: 1,284 lines
- **OperationModal.js**: 1,167 lines

### Impact
- **Maintainability**: Difficult to understand, modify, and debug
- **Performance**: Entire component re-renders even for small changes
- **Testability**: Nearly impossible to write focused unit tests
- **Code reuse**: Logic is locked inside massive components
- **Team collaboration**: High merge conflict potential

---

### ✅ Phase 1: Component Extraction (COMPLETED)

**GraphsScreen.js: 2,091 → 1,423 lines (-668 lines, -32%)**
- ✅ `BalanceHistoryCard.js` - Balance history chart with data table
- ✅ `CustomLegend.js` - Reusable chart legend component
- ✅ `ExpensePieChart.js` - Expense category pie chart
- ✅ `ExpenseSummaryCard.js` - Monthly expense summary
- ✅ `IncomePieChart.js` - Income category pie chart
- ✅ `IncomeSummaryCard.js` - Monthly income summary
- ✅ `SpendingPredictionCard.js` - Spending prediction with progress

**OperationsScreen.js: 1,284 → 1,011 lines (-273 lines, -21%)**
- ✅ `DateSeparator.js` - Date header between operation groups
- ✅ `OperationFormFields.js` (12KB) - Reusable form fields for operations
- ✅ `OperationListItem.js` - Single operation row
- ✅ `OperationsList.js` - FlatList with filters
- ✅ `QuickAddForm.js` - Quick entry form

**OperationModal.js: 1,167 → 1,074 lines (-93 lines, -8%)**
- ✅ `OperationFormFields.js` - Shared form fields (reused with OperationsScreen)

**Progress**: 13 components extracted, **1,034 lines removed** total.

---

### ⚠️ Current Status

While component extraction goals were met, **all three files remain over 1,000 lines**, which is still quite large. Ideally, screen components should be **under 500-600 lines** for optimal maintainability.

| File | Original | Current | Reduction | Target | Remaining Work |
|------|----------|---------|-----------|--------|----------------|
| **GraphsScreen.js** | 2,091 | 1,423 | -32% | <600 | ~800 lines |
| **OperationsScreen.js** | 1,284 | 1,011 | -21% | <600 | ~400 lines |
| **OperationModal.js** | 1,167 | 1,074 | -8% | <600 | ~450 lines |

---

### 🎯 Phase 2: Custom Hooks & Additional Extraction (REMAINING)

**GraphsScreen.js → Target: <600 lines**

Extract stateful logic into custom hooks:
- [ ] `app/hooks/useExpenseData.js` (~200 lines) - loadExpenseData logic + state
- [ ] `app/hooks/useIncomeData.js` (~140 lines) - loadIncomeData logic + state
- [ ] `app/hooks/useBalanceHistory.js` (~180 lines) - loadBalanceHistory + calculations

Extract remaining modals:
- [ ] `app/components/graphs/ChartModal.js` (~100 lines) - Expense/Income chart modal
- [ ] `app/components/graphs/BalanceHistoryModal.js` (~110 lines) - Balance edit table modal

**Expected reduction**: 1,423 → ~400 lines

---

**OperationsScreen.js → Target: <600 lines**

Extract stateful logic into custom hooks:
- [ ] `app/hooks/useOperationPicker.js` (~150 lines) - Picker state + category navigation
- [ ] `app/hooks/useMultiCurrencyTransfer.js` (~100 lines) - Multi-currency logic + calculations
- [ ] `app/hooks/useQuickAddForm.js` (~120 lines) - Quick add state + handlers

Extract modal:
- [ ] `app/components/operations/PickerModal.js` (~130 lines) - Unified picker with breadcrumb

**Expected reduction**: 1,011 → ~500 lines

---

**OperationModal.js → Target: <600 lines**

Extract stateful logic into custom hooks:
- [ ] `app/hooks/useOperationForm.js` (~150 lines) - Form state + validation + save logic
- [ ] Reuse `app/hooks/useMultiCurrencyTransfer.js` from OperationsScreen
- [ ] `app/hooks/useCategoryNavigation.js` (~80 lines) - Category folder navigation

Extract modal:
- [ ] Reuse `app/components/operations/PickerModal.js` from OperationsScreen

**Expected reduction**: 1,074 → ~550 lines

---

### Files Modified (Phase 1)
- ✅ `app/screens/GraphsScreen.js`
- ✅ `app/screens/OperationsScreen.js`
- ✅ `app/modals/OperationModal.js`

### Files Created (Phase 1)
- ✅ `app/components/graphs/BalanceHistoryCard.js`
- ✅ `app/components/graphs/CustomLegend.js`
- ✅ `app/components/graphs/ExpensePieChart.js`
- ✅ `app/components/graphs/ExpenseSummaryCard.js`
- ✅ `app/components/graphs/IncomePieChart.js`
- ✅ `app/components/graphs/IncomeSummaryCard.js`
- ✅ `app/components/graphs/SpendingPredictionCard.js`
- ✅ `app/components/operations/DateSeparator.js`
- ✅ `app/components/operations/OperationFormFields.js`
- ✅ `app/components/operations/OperationListItem.js`
- ✅ `app/components/operations/OperationsList.js`
- ✅ `app/components/operations/QuickAddForm.js`

### Files to Create (Phase 2)
- [ ] `app/hooks/useExpenseData.js`
- [ ] `app/hooks/useIncomeData.js`
- [ ] `app/hooks/useBalanceHistory.js`
- [ ] `app/hooks/useOperationPicker.js`
- [ ] `app/hooks/useMultiCurrencyTransfer.js`
- [ ] `app/hooks/useQuickAddForm.js`
- [ ] `app/hooks/useOperationForm.js`
- [ ] `app/hooks/useCategoryNavigation.js`
- [ ] `app/components/graphs/ChartModal.js`
- [ ] `app/components/graphs/BalanceHistoryModal.js`
- [ ] `app/components/operations/PickerModal.js`

### Benefits of Phase 2
1. **Custom Hooks** - Extract complex stateful logic (data loading, form management, calculations)
2. **Modal Components** - Separate picker/table modals for better reusability
3. **Better Testing** - Hooks and modals can be tested independently
4. **Code Reuse** - `useMultiCurrencyTransfer` and `PickerModal` shared across screens
5. **Easier Debugging** - Smaller, focused components with single responsibilities

**Estimated total reduction**: 3,508 → ~1,550 lines (**~2,000 lines removed, 57% reduction**)

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
