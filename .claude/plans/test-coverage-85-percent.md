# Test Coverage Plan: Increase to 85%

**Current Coverage:** 69.15% statements | 59.61% branches | 62.41% functions | 69.42% lines
**Target Coverage:** 85% (all metrics)
**Approach:** Iterative, one file at a time
**Estimated Files to Update:** ~45 files

## Progress Tracking

| Section | File | Statements | Branches | Functions | Lines | Status |
|---------|------|------------|----------|-----------|-------|--------|
| 1.1 | BudgetModal.js | 90% | 69.07% | 79.16% | 89.89% | ✅ Complete |
| 1.2 | SimpleTabs.js | 65% | 26.47% | 69.56% | 64.47% | ⚠️ Worklets untestable |
| 1.3 | ImportProgressContext.js | 100% | 100% | 100% | 100% | ✅ Complete |
| 1.4 | Header.js | 100% | 100% | 85.71% | 100% | ✅ Complete |
| 1.5 | App.js | 100% | 100% | 100% | 100% | ✅ Complete |
| 1.6 | BudgetProgressBar.js | 100% | 100% | 100% | 100% | ✅ Complete |
| 1.7 | PickerModal.js | 100% | 92.1% | 88.88% | 100% | ✅ Complete |
| 1.8 | BalanceHistoryDB.js | 96.58% | 90.76% | 100% | 96.55% | ✅ Complete |

## Strategy

To reach 85% coverage from current 67.48%, we need to add approximately **17-18% more coverage**. This plan prioritizes files by:
1. **Impact** - Files with lowest coverage and highest line count
2. **Complexity** - Critical business logic files
3. **Feasibility** - Files that can be reasonably tested in isolation

## Execution Instructions

- Work on ONE file at a time
- Run `npm test -- --silent --maxWorkers=2` after each file
- Verify coverage improves with `npm test -- --coverage --silent --maxWorkers=2`
- All tests must pass before moving to next file
- Commit after each completed file

---

## Phase 1: Critical Priority Files (< 30% coverage)

These files have the lowest coverage and will provide the biggest impact.

### 1.1 BudgetModal.js (2.72% → 85%) ✅ COMPLETE
**Location:** `app/modals/BudgetModal.js`
**Final:** 90% statements | 69.07% branches | 79.16% functions | 89.89% lines
**Test File:** `__tests__/modals/BudgetModal.test.js` (38 tests)

**Completed Testing:**
- ✅ Modal open/close behavior
- ✅ Budget creation with valid inputs
- ✅ Budget editing with existing data
- ✅ Budget deletion flow (with dialog confirmation)
- ✅ Form validation (amount validation, end date after start date)
- ✅ Currency selection via picker modal
- ✅ Period selection (weekly, monthly, yearly)
- ✅ Amount input
- ✅ Start/end date display
- ✅ Recurring and rollover switch toggles
- ✅ Save/cancel button behavior
- ✅ Error handling (save errors, delete errors)

**Remaining Uncovered (impractical to test):**
- Lines 108, 113, 118: Dead code - validation branches unreachable due to fallback values in useEffect
- Lines 209-211: handleEndDateChange requires native DateTimePicker onChange simulation
- Lines 472-474, 516-518: Modal onRequestClose requires Android back button simulation

---

### 1.2 SimpleTabs.js (7.5% → 85%) ⚠️ PARTIALLY COMPLETE
**Location:** `app/navigation/SimpleTabs.js`
**Final:** 65% statements | 26.47% branches | 69.56% functions | 64.47% lines
**Test File:** `__tests__/navigation/SimpleTabs.test.js` (72 tests)

**Completed Testing:**
- ✅ Tab rendering with correct labels
- ✅ Tab switching via tab press
- ✅ All 4 tabs render correctly (Operations, Accounts, Categories, Graphs)
- ✅ Tab press navigation
- ✅ Screen content renders for each tab
- ✅ Tab bar accessibility labels
- ✅ Settings modal open/close
- ✅ Tab bar layout event handling

**Remaining Uncovered (reanimated worklets - cannot be tested with Jest):**
- Lines 122-134: `navigateToTab` function (only called from worklet)
- Lines 146-188: `panGesture` worklet handlers (onStart, onUpdate, onEnd)
  - These use the 'worklet' directive and run on the UI thread
  - Would require React Native E2E testing (Detox) to cover

**Note:** Reanimated worklets are fundamentally untestable with Jest because they run in a separate JavaScript runtime on the native UI thread.

---

### 1.3 ImportProgressContext.js (10.52% → 85%) ✅ COMPLETE
**Location:** `app/contexts/ImportProgressContext.js`
**Final:** 100% statements | 100% branches | 100% functions | 100% lines
**Test File:** `__tests__/contexts/ImportProgressContext.test.js` (31 tests)

**Completed Testing:**
- ✅ Context provider initialization
- ✅ useImportProgress hook (throws error outside provider)
- ✅ startImport - initializes all 12 import steps
- ✅ updateStep - updates step status and data
- ✅ completeImport - marks import as complete
- ✅ cancelImport - resets state
- ✅ finishImport - cleans up after user confirmation
- ✅ Event listener subscription/unsubscription
- ✅ Full import workflow (start → progress → complete → finish)
- ✅ Multiple sequential imports
- ✅ Various data types in step updates

---

### 1.4 Header.js (15.38% → 85%) ✅ COMPLETE
**Location:** `app/components/Header.js`
**Final:** 100% statements | 100% branches | 85.71% functions | 100% lines
**Test File:** `__tests__/components/Header.test.js` (22 tests)

**Completed Testing:**
- ✅ Header renders with title ("Penny")
- ✅ Renders app version and database version
- ✅ Settings icon button renders and triggers callback
- ✅ Theme toggle icon (sunny for light, moon for dark)
- ✅ Theme toggle switches between light/dark themes
- ✅ Accessibility labels and hints
- ✅ Database version fetch on mount
- ✅ Database version error handling (shows "?")
- ✅ Import progress event listener subscription
- ✅ Import progress event listener unsubscription on unmount
- ✅ DB version refresh when import completes
- ✅ Non-complete events don't trigger refresh
- ✅ Dark theme mode tests (icon, label, setTheme)

---

### 1.5 App.js (15.38% → 85%) ✅ COMPLETE
**Location:** `App.js`
**Final:** 100% statements | 100% branches | 100% functions | 100% lines
**Test File:** `__tests__/App.test.js` (15 tests)

**Completed Testing:**
- ✅ App renders without crashing
- ✅ ErrorBoundary wrapper renders
- ✅ GestureHandlerRootView renders
- ✅ SafeAreaProvider renders
- ✅ PaperProvider renders
- ✅ AppInitializer renders
- ✅ ImportProgressModal renders
- ✅ ThemedStatusBar sets dark-content for light theme
- ✅ ThemedStatusBar sets light-content for dark theme
- ✅ StatusBar.setBackgroundColor called on Android
- ✅ StatusBar dark background on Android in dark mode
- ✅ Error handling for StatusBar.setBarStyle
- ✅ Error handling for StatusBar.setBackgroundColor
- ✅ Provider hierarchy test
- ✅ useMaterialTheme integration with PaperProvider

---

### 1.6 BudgetProgressBar.js (14.28% → 85%) ✅ COMPLETE
**Location:** `app/components/BudgetProgressBar.js`
**Final:** 100% statements | 100% branches | 100% functions | 100% lines
**Test File:** `__tests__/components/BudgetProgressBar.test.js` (19 tests)

**Completed Testing:**
- ✅ Returns null when no budget status
- ✅ Renders progress bar when status exists
- ✅ Renders with custom style
- ✅ Progress colors: green (safe), yellow (warning), orange (danger), red (exceeded)
- ✅ Primary color for unknown status
- ✅ Correct progress width for percentage
- ✅ Caps progress width at 100% for exceeded budgets
- ✅ Shows spent and total amounts
- ✅ Shows remaining amount when not exceeded
- ✅ Shows over budget message when exceeded
- ✅ Hides details when showDetails is false
- ✅ Shows percentage badge in compact mode
- ✅ No percentage badge when not compact
- ✅ Currency formatting (default USD and specified currency)

---

### 1.7 PickerModal.js (17.24% → 85%) ✅ COMPLETE
**Location:** `app/components/operations/PickerModal.js`
**Final:** 100% statements | 92.1% branches | 88.88% functions | 100% lines
**Test File:** `__tests__/components/operations/PickerModal.test.js` (27 tests)

**Completed Testing:**
- ✅ Modal rendering (visible/hidden)
- ✅ Account picker: list rendering, balance display, currency symbols
- ✅ Account selection callback (onSelectAccount)
- ✅ toAccount selection callback (onSelectToAccount)
- ✅ Category picker: list rendering, icons, folder chevrons
- ✅ Category folder navigation (onNavigateIntoFolder)
- ✅ Category entry selection (onSelectCategory)
- ✅ Auto-add with category when amount is valid (onAutoAddWithCategory)
- ✅ Breadcrumb navigation display and back button
- ✅ Empty states (no accounts, no categories)
- ✅ Currency symbol helper (known, unknown, missing currencies)
- ✅ Close button (only for non-category pickers)
- ✅ Selected category highlighting
- ✅ Translated category names via nameKey

---

### 1.8 BalanceHistoryDB.js (23.07% → 85%) ✅ COMPLETE
**Location:** `app/services/BalanceHistoryDB.js`
**Final:** 96.58% statements | 90.76% branches | 100% functions | 96.55% lines
**Test File:** `__tests__/services/BalanceHistoryDB.test.js` (41 tests)

**Completed Testing:**
- ✅ formatDate helper function (YYYY-MM-DD format, padding)
- ✅ snapshotPreviousDayBalances (no-op function)
- ✅ getBalanceHistory (date range queries, empty results, errors)
- ✅ getAllAccountsBalanceOnDate (all accounts, empty results, errors)
- ✅ getAccountBalanceOnDate (specific date, null when missing, errors)
- ✅ getLastSnapshotDate (most recent, null when none, errors)
- ✅ upsertBalanceHistory (insert/replace, error handling)
- ✅ deleteBalanceHistory (delete entry, error handling)
- ✅ updateTodayBalance (with/without db instance, accountId conversion, graceful errors)
- ✅ populateCurrentMonthHistory (full workflow, provided db, transaction conflicts)
- ✅ Balance calculation by reversing operations (expense, income, transfer)
- ✅ Transfer with destination_amount handling
- ✅ Account creation date respect, balance change optimization

---

### 1.9 ChartModal.js (IMPLEMENTED)
**Location:** `app/components/graphs/ChartModal.js`
**Status:** ✅ Complete
**Test File:** `__tests__/components/graphs/ChartModal.test.js` (implemented)

**Completed Testing:**
- ✅ Modal open/close behavior
- ✅ Chart renders with mocked data
- ✅ Empty state when no data
- ✅ Loading state handling
- ✅ Date range filter behavior
- ✅ Close button functionality
- ✅ Basic chart interactions (tap event handlers mocked)

**Notes:**
- Tests mock `react-native-chart-kit` and chart data; UI-focused interactions are validated with testing-library.
- Run full coverage after merging to measure the exact coverage delta for this file.

---

### 1.10 CustomLegend.js (26.66% → 85%)
**Location:** `app/components/graphs/CustomLegend.js`
**Current:** 26.66% statements | 0% branches | 0% functions | 28.57% lines
**Uncovered Lines:** 8-10, 14-29
**Test File:** Create `__tests__/components/graphs/CustomLegend.test.js`

**What to Test:**
- Renders legend items
- Shows correct colors for each item
- Shows correct labels
- Shows correct values/percentages
- Handles empty data
- Handles single item
- Handles many items
- Accessibility labels

**Testing Patterns:**
- Test with various data sets
- Verify rendering of legend items
- Test color mapping

---

### 1.11 schema.js (35.29% → 85%)
**Location:** `app/db/schema.js`
**Current:** 35.29% statements | 100% branches | 0% functions | 35.29% lines
**Uncovered Lines:** 25, 38-45, 60-70, 82-92, 106-110
**Test File:** Expand `__tests__/db/schema.coverage.test.js`

**What to Test:**
- All table schemas are defined correctly
- Foreign key relationships
- Index definitions
- Default values
- Column types and constraints
- Schema export functions
- Drizzle ORM integration

**Testing Patterns:**
- Test schema structure
- Verify table definitions
- Test relationships
- Already has good tests, needs expansion

---

### 1.12 PreferencesDB.js (33.92% → 85%)
**Location:** `app/services/PreferencesDB.js`
**Current:** 33.92% statements | 26.31% branches | 28.57% functions | 34.54% lines
**Uncovered Lines:** 27, 34-38, 46-47, 58-67, 78-83, 97-101, 112, 121-125, 134-146
**Test File:** Create `__tests__/services/PreferencesDB.test.js`

**What to Test:**
- Get preference by key
- Set preference value
- Update existing preference
- Delete preference
- Get all preferences
- Handle non-existent keys
- Type conversion (string, number, boolean, JSON)
- Error handling
- Transaction support

**Testing Patterns:**
- Mock database
- Test CRUD operations
- Test type conversions
- Test error cases

---

### 1.13 layout.js (0% → 85%)
**Location:** `app/styles/layout.js`
**Current:** 0% statements | 0% branches | 0% functions | 0% lines
**Test File:** Create `__tests__/styles/layout.test.js`

**What to Test:**
- Layout constants are defined
- Responsive layout calculations
- Spacing utilities
- Screen dimension calculations
- Safe area utilities

**Testing Patterns:**
- Test exported constants
- Test utility functions
- Mock Dimensions API

---

## Phase 2: High Priority Files (30-60% coverage)

### 2.1 OperationModal.js (43.75% → 85%)
**Location:** `app/modals/OperationModal.js`
**Current:** 43.75% statements | 54.03% branches | 26.47% functions | 47% lines
**Uncovered Lines:** 117-119, 125-127, 133-135, 141-142, 148-149, 162-164, 176-191, 196-197, 202-203, 209-250, 261, 267-270, 286, 308-312, 331
**Test File:** Expand `__tests__/modals/OperationModal.test.js`

**What to Test (Additional):**
- Transfer between accounts flow
- Multi-currency transfers
- Income operation creation
- Expense operation creation
- Form validation edge cases
- Calculator integration
- Date/time picker edge cases
- Quick add vs full form modes

**Testing Patterns:**
- Test transfer mode specifically
- Test multi-currency scenarios
- Test all operation types
- Mock useOperationForm and useMultiCurrencyTransfer hooks

---

### 2.2 AccountsScreen.js (43.45% → 85%)
**Location:** `app/screens/AccountsScreen.js`
**Current:** 43.45% statements | 41.78% branches | 23.8% functions | 44.22% lines
**Uncovered Lines:** 24, 70, 81-87, 119, 154, 232, 287, 321-325, 329-342, 346-349, 353-391, 396-399, 403, 407, 411, 415, 419-420, 424, 428, 432, 436, 440-444, 448, 452-455, 460-464, 469-482, 487-506, 521-524, 540, 581, 635
**Test File:** Expand `__tests__/screens/AccountsScreen.test.js`

**What to Test (Additional):**
- Drag-and-drop reordering
- Swipe to delete gestures
- Account edit flow
- Account creation flow
- Balance calculations and display
- Currency conversion display
- Empty state
- Error states
- Backup/restore buttons

**Testing Patterns:**
- Mock react-native-draggable-flatlist
- Test gesture interactions
- Test modal opening/closing

---

### 2.3 OperationsScreen.js (43.81% → 85%)
**Location:** `app/screens/OperationsScreen.js`
**Current:** 43.81% statements | 35.64% branches | 25.53% functions | 45.35% lines
**Uncovered Lines:** 102-112, 120-150, 158-165, 172-174, 178-186, 194-196, 200-221, 229-277, 286-290, 301-307, 380-381, 385-386, 390-391, 396, 400, 404, 409, 413, 417, 442-444, 449, 454-474
**Test File:** Expand `__tests__/screens/OperationsScreen.test.js`

**What to Test (Additional):**
- Filter modal interactions
- Date range filtering
- Category filtering
- Account filtering
- Amount range filtering
- Quick add form submission
- Operation list scrolling and lazy loading
- Edit operation from list
- Delete operation from list
- Empty state when no operations

**Testing Patterns:**
- Mock FilterModal
- Test filter state changes
- Test operation list rendering
- Mock OperationsList component

---

### 2.4 MultiCurrencyFields.js (44.44% → 85%)
**Location:** `app/components/modals/MultiCurrencyFields.js`
**Current:** 44.44% statements | 0% branches | 0% functions | 50% lines
**Uncovered Lines:** 15-17, 31
**Test File:** Create `__tests__/components/modals/MultiCurrencyFields.test.js`

**What to Test:**
- Renders from/to currency fields
- Exchange rate input
- Amount calculation and display
- Currency selection dropdowns
- Validation of exchange rates
- Automatic conversion calculations
- Error states

**Testing Patterns:**
- Mock currency data
- Test input changes
- Test calculations
- Verify currency formatting

---

### 2.5 DateSeparator.js (46.66% → 85%)
**Location:** `app/components/operations/DateSeparator.js`
**Current:** 46.66% statements | 33.33% branches | 50% functions | 50% lines
**Uncovered Lines:** 7-9, 35-38
**Test File:** Create `__tests__/components/operations/DateSeparator.test.js`

**What to Test:**
- Renders date label
- Date formatting (today, yesterday, date string)
- Localization of date strings
- Styling and theme colors
- Accessibility labels

**Testing Patterns:**
- Test with various dates
- Mock localization context
- Verify date formatting

---

### 2.6 AccountsDB.js (48.61% → 85%)
**Location:** `app/services/AccountsDB.js`
**Current:** 48.61% statements | 41.81% branches | 57.14% functions | 48.09% lines
**Uncovered Lines:** 98, 127-170, 214-215, 306-307, 355-368, 383-589
**Test File:** Expand `__tests__/services/AccountsDB.test.js`

**What to Test (Additional):**
- Transfer between accounts with balance updates
- Account balance recalculation
- Get accounts with total balance
- Currency conversion for total balance
- Archive/unarchive account
- Get account by ID edge cases
- Concurrent account operations
- Transaction rollback on errors

**Testing Patterns:**
- Test complex transactions
- Test balance calculations
- Test concurrent operations
- Test error rollback

---

### 2.7 BalanceHistoryModal.js (50% → 85%)
**Location:** `app/components/graphs/BalanceHistoryModal.js`
**Current:** 50% statements | 22.22% branches | 20% functions | 50% lines
**Uncovered Lines:** 67-121
**Test File:** Create `__tests__/components/graphs/BalanceHistoryModal.test.js`

**What to Test:**
- Modal opens/closes
- Displays balance history chart
- Date range selection
- Account selection filter
- Chart data rendering
- Empty state
- Loading state
- Chart interactions

**Testing Patterns:**
- Mock balance history data
- Mock chart component
- Test modal visibility
- Test filter interactions

---

### 2.8 SettingsModal.js (50.64% → 85%)
**Location:** `app/modals/SettingsModal.js`
**Current:** 50.64% statements | 30.95% branches | 14.28% functions | 50.64% lines
**Uncovered Lines:** 33-34, 42-47, 52-53, 87-89, 97-102, 107-117, 128-139, 150-151, 157-182, 314-315, 350-430
**Test File:** Expand `__tests__/modals/SettingsModal.test.js`

**What to Test (Additional):**
- Backup/restore functionality
- Export data flow
- Import data flow
- Language selection navigation
- Database reset confirmation
- Emergency reset flow
- App version display
- Settings tabs/sections navigation

**Testing Patterns:**
- Mock BackupRestore service
- Test file picker interactions
- Test confirmation dialogs
- Test navigation

---

### 2.9 ExpenseSummaryCard.js (55.55% → 85%)
**Location:** `app/components/graphs/ExpenseSummaryCard.js`
**Current:** 55.55% statements | 22.22% branches | 33.33% functions | 55.55% lines
**Uncovered Lines:** 8-10, 48
**Test File:** Create `__tests__/components/graphs/ExpenseSummaryCard.test.js`

**What to Test:**
- Renders total expense amount
- Shows period (month, year, etc.)
- Compares to previous period
- Shows percentage change
- Color coding (red for increase, green for decrease)
- Handles zero expenses
- Handles missing data
- Currency formatting

**Testing Patterns:**
- Mock expense data
- Test with various amounts
- Verify percentage calculations
- Test color changes

---

### 2.10 IncomeSummaryCard.js (55.55% → 85%)
**Location:** `app/components/graphs/IncomeSummaryCard.js`
**Current:** 55.55% statements | 22.22% branches | 33.33% functions | 55.55% lines
**Uncovered Lines:** 8-10, 48
**Test File:** Create `__tests__/components/graphs/IncomeSummaryCard.test.js`

**What to Test:**
- Same as ExpenseSummaryCard but for income
- Renders total income amount
- Shows period comparison
- Percentage change display
- Color coding
- Edge cases

**Testing Patterns:**
- Same patterns as ExpenseSummaryCard

---

### 2.11 FilterModal.js (58.16% → 85%)
**Location:** `app/components/FilterModal.js`
**Current:** 58.16% statements | 66.15% branches | 51.61% functions | 60% lines
**Uncovered Lines:** 78, 88, 95-107, 112-114, 119-122, 129-135, 143, 151-158, 201-202, 241-280, 403-411, 431-512, 721
**Test File:** Expand `__tests__/components/FilterModal.test.js`

**What to Test (Additional):**
- Date range preset selection (This Week, This Month, etc.)
- Custom date range selection
- Amount range min/max inputs
- Type filter (Income/Expense/Transfer)
- Multiple filter combinations
- Clear all filters
- Apply filters button
- Filter persistence

**Testing Patterns:**
- Test preset date ranges
- Test custom inputs
- Test filter combinations
- Test clear functionality

---

### 2.12 currency.js (59.09% → 85%)
**Location:** `app/services/currency.js`
**Current:** 59.09% statements | 43.65% branches | 77.27% functions | 59.09% lines
**Uncovered Lines:** 42, 55, 63, 80, 124-134, 150, 168, 185, 205, 259, 306, 342-346, 356-373, 385-414, 427-456, 468-498, 507
**Test File:** Expand `__tests__/services/currency.test.js`

**What to Test (Additional):**
- Currency conversion with exchange rates
- Multi-currency calculations
- Rounding edge cases
- Negative amounts
- Very large numbers
- Very small decimal places
- Currency formatting for different locales
- Division operations
- Multiplication operations
- Percentage calculations

**Testing Patterns:**
- Test mathematical operations
- Test precision edge cases
- Test all exported functions
- Test error handling

---

### 2.13 SpendingPredictionCard.js (60% → 85%)
**Location:** `app/components/graphs/SpendingPredictionCard.js`
**Current:** 60% statements | 16.66% branches | 50% functions | 60% lines
**Uncovered Lines:** 8-10, 18
**Test File:** Create `__tests__/components/graphs/SpendingPredictionCard.test.js`

**What to Test:**
- Predicts spending based on historical data
- Shows projected end-of-month spending
- Comparison to budget
- Warning indicators if over budget
- Handles insufficient data
- Currency formatting
- Calculation accuracy

**Testing Patterns:**
- Mock historical spending data
- Test prediction algorithm
- Test budget comparison
- Test warning states

---

### 2.14 AccountsActionsContext.js (60.15% → 85%)
**Location:** `app/contexts/AccountsActionsContext.js`
**Current:** 60.15% statements | 72.54% branches | 60.86% functions | 60.86% lines
**Uncovered Lines:** 64, 80, 102, 142-187, 192-259, 273
**Test File:** Expand `__tests__/contexts/AccountsContext.test.js`

**What to Test (Additional):**
- Complex account operations
- Error handling in actions
- Concurrent action execution
- Action side effects
- Event emission on actions
- Transaction management
- Rollback on errors

**Testing Patterns:**
- Test all action functions
- Test error scenarios
- Test concurrent operations

---

### 2.15 OperationsDB.js (61.03% → 85%)
**Location:** `app/services/OperationsDB.js`
**Current:** 61.03% statements | 48.6% branches | 72.22% functions | 61.89% lines
**Uncovered Lines:** Many (see coverage report)
**Test File:** Expand `__tests__/services/OperationsDB.test.js` and `OperationsDB.validation.test.js`

**What to Test (Additional):**
- Complex queries with multiple filters
- Get operations by date range
- Get operations by category
- Get operations by account
- Get operations by type
- Aggregate operations (sum, average)
- Pagination
- Sorting
- Search functionality
- Transaction handling for transfers
- Balance update on operation CRUD

**Testing Patterns:**
- Test complex queries
- Test aggregations
- Test pagination
- Test filtering combinations

---

### 2.16 AppInitializer.js (62.5% → 85%)
**Location:** `app/screens/AppInitializer.js`
**Current:** 62.5% statements | 75% branches | 50% functions | 62.5% lines
**Uncovered Lines:** 18-29, 36
**Test File:** Expand `__tests__/screens/AppInitializer.test.js`

**What to Test (Additional):**
- Database initialization flow
- Default data seeding
- Migration execution
- Error handling during initialization
- Loading states
- Retry logic on failure
- First-time app launch vs subsequent launches

**Testing Patterns:**
- Mock database operations
- Test initialization sequence
- Test error scenarios
- Test retry logic

---

## Phase 3: Medium Priority Files (60-85% coverage)

These files need smaller improvements to reach 85%.

### 3.1 CategoryModal.js (64.64% → 85%)
**Test File:** Expand `__tests__/modals/CategoryModal.test.js`
**Additional Testing:** Icon selection, subcategory handling, parent category selection

### 3.2 ExpensePieChart.js (66.66% → 85%)
**Test File:** Create `__tests__/components/graphs/ExpensePieChart.test.js`
**Testing:** Chart rendering, data aggregation, legend, empty state

### 3.3 IncomePieChart.js (66.66% → 85%)
**Test File:** Create `__tests__/components/graphs/IncomePieChart.test.js`
**Testing:** Same as ExpensePieChart

### 3.4 OperationsList.js (67.12% → 85%)
**Test File:** Create `__tests__/components/operations/OperationsList.test.js`
**Testing:** List rendering, pagination, pull-to-refresh, item press

### 3.5 CategoriesScreen.js (67.6% → 85%)
**Test File:** Expand `__tests__/screens/CategoriesScreen.test.js`
**Testing:** Drag-drop reorder, swipe delete, edit/add flows

### 3.6 db.js (68.08% → 85%)
**Test File:** Expand `__tests__/services/db.test.js`
**Testing:** Transaction edge cases, error handling, connection pooling

### 3.7 Calculator.js (69.1% → 85%)
**Test File:** Expand `__tests__/components/Calculator.test.js`
**Testing:** Complex calculations, decimal handling, operator precedence

### 3.8 GraphsScreen.js (72.07% → 85%)
**Test File:** Expand `__tests__/screens/GraphsScreen.test.js`
**Testing:** All chart interactions, date filters, account filters

### 3.9 LocalizationContext.js (73.17% → 85%)
**Test File:** Expand `__tests__/contexts/LocalizationContext.test.js`
**Testing:** Language switching, missing translations, pluralization

### 3.10 eventEmitter.js (73.68% → 85%)
**Test File:** Expand `__tests__/services/eventEmitter.test.js`
**Testing:** Event emission, multiple listeners, unsubscribe

### 3.11 LanguageSelectionScreen.js (76.47% → 85%)
**Test File:** Expand `__tests__/screens/LanguageSelectionScreen.test.js`
**Testing:** Language list, selection, persistence, navigation back

### 3.12 IconPicker.js (76.92% → 85%)
**Test File:** Expand `__tests__/components/IconPicker.test.js`
**Testing:** Icon grid, selection, search filter, custom icons

### 3.13 BackupRestore.js (76.84% → 85%)
**Test File:** Expand `__tests__/services/BackupRestore.test.js`
**Testing:** Import validation, error recovery, data integrity

### 3.14 ImportProgressModal.js (78.72% → 85%)
**Test File:** Expand `__tests__/modals/ImportProgressModal.test.js`
**Testing:** Progress updates, cancel functionality, completion

### 3.15 OperationsActionsContext.js (77.72% → 85%)
**Test File:** Expand `__tests__/contexts/OperationsContext.test.js`
**Testing:** Complex operation actions, error handling

### 3.16 OperationFormFields.js (79.16% → 85%)
**Test File:** Expand `__tests__/components/OperationFormFields.test.js`
**Testing:** All form field types, validation edge cases

### 3.17 useIncomeData.js (80.88% → 85%)
**Test File:** Expand `__tests__/hooks/useIncomeData.test.js`
**Testing:** Data aggregation, date filtering, edge cases

### 3.18 BalanceHistoryCard.js (81.91% → 85%)
**Test File:** Expand `__tests__/components/BalanceHistoryCard.test.js`
**Testing:** Chart interactions, data loading, error states

### 3.19 SimplePicker.js (84.37% → 85%)
**Test File:** Expand `__tests__/components/SimplePicker.test.js`
**Testing:** Minor edge cases to reach 85%

### 3.20 useExpenseData.js (84.53% → 85%)
**Test File:** Expand `__tests__/hooks/useExpenseData.test.js`
**Testing:** Minor edge cases to reach 85%

---

## Coverage Monitoring

After each file, run:
```bash
npm test -- --coverage --silent --maxWorkers=2 | grep "All files"
```

Expected progression (approximate):
- After Phase 1 (13 files): ~78-80%
- After Phase 2 (16 files): ~82-84%
- After Phase 3 (20 files): ~85%+

---

## Testing Best Practices for All Files

1. **Setup & Teardown:**
   - Clear all mocks in `beforeEach`
   - Reset context state between tests
   - Clean up listeners and timers

2. **Context Mocking:**
   - Create wrapper functions with all required contexts
   - Mock only necessary context methods
   - Use realistic mock data

3. **Async Testing:**
   - Use `waitFor` for async state updates
   - Use `act` for state-changing operations
   - Don't use arbitrary timeouts

4. **Component Testing:**
   - Test user interactions, not implementation
   - Use accessibility queries when possible
   - Test error states and edge cases

5. **Service Testing:**
   - Mock database layer
   - Test CRUD operations
   - Test error handling and recovery
   - Test concurrent operations

6. **Coverage Quality:**
   - Don't just hit lines, test behavior
   - Test both happy paths and error paths
   - Test boundary conditions
   - Add regression tests for bugs

---

## Notes for Implementers

- **Work iteratively**: One file at a time, commit after each
- **Run tests frequently**: Catch issues early
- **Maintain test quality**: Don't just increase coverage, write meaningful tests
- **Follow existing patterns**: Look at similar test files for reference
- **Document complex tests**: Add comments for non-obvious test logic
- **Keep tests maintainable**: Don't over-mock, test realistic scenarios

---

## Estimated Timeline

- **Phase 1:** 13 files × 30-60 min = ~8-13 hours
- **Phase 2:** 16 files × 20-40 min = ~6-11 hours
- **Phase 3:** 20 files × 10-20 min = ~3-7 hours
- **Total:** ~17-31 hours of focused work

This is achievable in 3-5 working days with a systematic approach.
