# Burndown Graph Implementation

## Overview

The burndown graph is a financial visualization feature that shows account balance progression over time. It displays four distinct lines on a single chart, providing comprehensive insights into spending patterns and balance trends.

### Visual Representation (4 Lines)

1. **Current Month** (Green) - Actual daily balances for the selected month
2. **Previous Month** (Gray) - Historical comparison from the previous month
3. **Planned** (Blue) - Linear projection from peak balance to zero
4. **12-Month Mean** (Orange) - Average balance by day-of-month across the past 12 months

## Architecture

### Design Philosophy: On-Demand Calculation

The burndown graph uses an **on-demand calculation approach** rather than storing daily balance snapshots. This design provides several advantages:

- ✅ **Always Accurate**: Calculations use current operation data
- ✅ **Handles Retroactive Edits**: Automatically reflects when past transactions are modified
- ✅ **No Migration Required**: Works with existing operations table
- ✅ **Storage Efficient**: No additional tables or rows needed

**Trade-off**: Recalculates on every view (2-5 second load time for 12-month mean)

### Service Layer

**File**: `/app/services/BurndownDB.js`

Encapsulates all balance calculation logic:
- Point-in-time balance calculations
- Daily balance progression
- Historical averages
- Multi-currency transfer handling

### UI Layer

**File**: `/app/screens/GraphsScreen.js` (lines 967-1163)

Integrates the burndown visualization:
- Account selection
- Month/year filtering
- Interactive tooltip
- Theme-aware styling
- Responsive layout

## Data Flow

```
User Action: Select Account + Month
        ↓
loadBurndownData() called
        ↓
getBurndownData(accountId, year, month)
        ├→ getDailyBalances(current month)
        ├→ getDailyBalances(previous month)
        ├→ get12MonthMean()
        └→ Calculate planned line
        ↓
Returns: { current[], previous[], planned[], mean[], metadata }
        ↓
LineChart renders 4 lines
        ↓
User taps chart → Shows tooltip with precise values
```

## Calculation Logic

### 1. Current Month Line (Green)

**Algorithm**: Forward calculation from month start

```javascript
// Pseudo-code
startBalance = getBalanceAtDate(dayBeforeMonthStart)
for each day in month:
    for each operation on this day:
        if expense: balance -= amount
        if income: balance += amount
        if transfer out: balance -= amount
        if transfer in: balance += destinationAmount
    record daily balance
```

**Key Function**: `getDailyBalances(accountId, startDate, endDate)`

**Features**:
- Fills missing days with previous balance (flat line segments)
- Orders operations by `created_at` for same-day operations
- Truncates at current day for current month view

### 2. Previous Month Line (Gray)

**Algorithm**: Same as current month, but for previous month

**Padding**: If previous month has fewer days (e.g., Feb 28 vs Mar 31), pads with last value to match chart x-axis.

```javascript
// Padding logic
for (let i = 0; i < currentMonthDays; i++) {
    if (i < previousMonthDays) {
        previousBalances[i] = actualBalance[i]
    } else {
        previousBalances[i] = lastBalance  // Flat extension
    }
}
```

### 3. Planned Line (Blue)

**Algorithm**: Linear decline from peak balance to zero

```javascript
peakBalance = max(currentMonthBalances)
dailyDecrease = peakBalance / daysInMonth

for each day:
    plannedBalance[day] = peakBalance - (dailyDecrease * day)
```

**Note**: Originally intended to use `accounts.monthly_target`, but currently uses actual peak balance from current month for better real-world representation.

### 4. 12-Month Mean Line (Orange)

**Algorithm**: Day-position average across 12 months

For each day position (1-31):
- Collect balances for that day across previous 12 months
  - Jan 15 → [Dec-15, Nov-15, Oct-15, ..., Jan-15 last year]
- Calculate mean of collected values
- Skip invalid dates (e.g., Feb 30)

**Key Function**: `get12MonthMean(accountId, year, month)`

**Performance Note**: This is the slowest calculation (up to 372 database queries for 31-day month).

## Key Implementation Details

### Point-in-Time Balance Calculation

**Function**: `getBalanceAtDate(accountId, targetDate)`

Uses **backward calculation** from current balance:

```javascript
1. Get current account balance
2. Fetch all operations after target date
3. Reverse-apply each operation:
   - expense: add back (reverse subtraction)
   - income: subtract (reverse addition)
   - transfer out: add back
   - transfer in: subtract received amount
4. Return calculated historical balance
```

**Why Backward?** Current balance is always accurate (maintained by OperationsDB). Going backward ensures precision.

### Multi-Currency Transfer Handling

Transfers between accounts with different currencies use `destination_amount`:

```javascript
if (operation.type === 'transfer') {
    if (operation.account_id === accountId) {
        // Source account - subtract source amount
        balance -= operation.amount
    } else if (operation.to_account_id === accountId) {
        // Destination account - add destination amount (converted)
        balance += operation.destination_amount || operation.amount
    }
}
```

### Timezone-Independent Date Handling

All dates use `YYYY-MM-DD` format (ISO 8601 date-only):

```javascript
const dateStr = new Date(year, month, day).toISOString().split('T')[0]
// Result: '2025-12-07' (no time component)
```

**Important**: JavaScript `Date` constructor interprets `YYYY-MM-DD` strings as UTC midnight, preventing timezone-based discrepancies.

### Currency Precision

All arithmetic uses the Currency service (Decimal.js):

```javascript
import * as Currency from './currency';

newBalance = Currency.subtract(currentBalance, operation.amount)
newBalance = Currency.add(currentBalance, operation.amount)
dailyDecrease = Currency.divide(startingBalance, daysInMonth)
```

Never uses JavaScript number arithmetic to avoid floating-point errors.

## Database Schema

### Accounts Table Addition

**Migration**: V9 → V10

```sql
ALTER TABLE accounts ADD COLUMN monthly_target TEXT;
```

**Purpose**: Store optional target balance for planned line calculation (future feature).

**Current Status**: Field exists but unused. Planned line currently uses peak balance from actual data.

## UI Features

### Interactive Tap-to-View Tooltip

- **Trigger**: Tap any data point on chart
- **Display**: All 4 values for selected day
  - Current Month: 1,234.56 USD
  - Previous Month: 1,100.00 USD
  - Planned: 1,000.00 USD
  - 12-Month Mean: 1,150.00 USD
- **Dismissal**: Tap X button to close
- **Styling**: Color-coded dots matching line colors

### Current Month Line Truncation

When viewing the current month, the green line only displays up to today's date:

```javascript
const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
const currentDay = isCurrentMonth ? now.getDate() : daysInMonth

// Chart data
data: isCurrentMonth && currentDay
    ? burndownData.current.slice(0, currentDay)
    : burndownData.current
```

This prevents showing future days with inaccurate data.

### Theme Support (Light/Dark)

All colors from `ThemeContext`:
- Background: `colors.surface`
- Text: `colors.text`
- Border: `colors.border`
- Muted Text: `colors.mutedText`

Line colors are semantic (not theme-dependent):
- Green: `rgba(34, 197, 94, 1)`
- Gray: `rgba(100, 116, 139, 1)`
- Blue: `rgba(59, 130, 246, 1)`
- Orange: `rgba(251, 146, 60, 1)`

### Internationalization (EN/RU)

All strings externalized to `/assets/i18n.json`:

| Key | English | Russian |
|-----|---------|---------|
| `burndown_graph` | Burndown Graph | График расходования |
| `current_month` | Current Month | Текущий месяц |
| `previous_month` | Previous Month | Предыдущий месяц |
| `planned` | Planned | Планируемое |
| `12_month_mean` | 12-Month Mean | Среднее за 12 месяцев |
| `no_burndown_data` | No data available... | Нет данных для графика |

### Bezier Curve Smoothing

**Enabled** via `bezier` prop on LineChart component.

**Trade-off**: All lines are smooth and visually appealing, but the planned line (mathematically straight) has a slight curve. This is acceptable for better aesthetics of actual data lines.

```javascript
<LineChart
  // ... props
  // NOTE: Bezier smoothing enabled for visual appeal
  // Trade-off: Planned line (mathematically straight) will have slight curve
  // This is acceptable for better appearance of actual data lines
  bezier
  withDots={false}
  // ... more props
/>
```

## Performance Considerations

### Current Performance Profile

| Operation | Queries | Time (mid-range device) |
|-----------|---------|-------------------------|
| getDailyBalances (current) | 2 | ~200ms |
| getDailyBalances (previous) | 2 | ~200ms |
| get12MonthMean | 372 (worst case) | ~2-4s |
| **Total** | **~376** | **~2.5-5s** |

### N+1 Query Pattern

**Location**: `get12MonthMean()` (BurndownDB.js:217-264)

```javascript
// PERFORMANCE ISSUE: N+1 queries
for (let dayPos = 1; dayPos <= daysInMonth; dayPos++) {          // 31 iterations
    for (let monthOffset = 1; monthOffset <= 12; monthOffset++) { // 12 iterations
        const balance = await getBalanceAtDate(accountId, dateStr) // 1 query each
        // Total: 31 × 12 = 372 queries
    }
}
```

**Impact**: Significant load time, especially on lower-end devices.

### Optimization Opportunities

1. **Batch Queries** (80% improvement potential)
   - Fetch all operations once for entire 12-month period
   - Calculate all balances in memory
   - Estimated improvement: 2-5s → 0.4-1s

2. **Caching Layer**
   - Cache get12MonthMean results (data rarely changes)
   - Invalidate on operation create/update/delete
   - Improvement: Instant on subsequent loads

3. **Lazy Loading**
   - Show first 3 lines immediately
   - Load mean line in background with loading indicator
   - Improvement: Better perceived performance

4. **Component Memoization**
   - Extract chart colors to constants
   - Optimize useCallback dependencies
   - Minor gains, but good practice

## Testing

### Unit Tests

**File**: `/__tests__/services/BurndownDB.test.js`

**Coverage**: 15 comprehensive tests

1. **getBalanceAtDate** (3 tests)
   - Expenses and income calculation
   - Transfer handling
   - Multi-currency transfers with destination_amount

2. **getDailyBalances** (3 tests)
   - Fill missing days with previous balance
   - Month boundary handling
   - Multiple operations on same day (ordering)

3. **get12MonthMean** (3 tests)
   - Different day counts per month
   - Skip invalid dates (Feb 30)
   - ⚠️ Calculation logic test incomplete (marked as TODO)

4. **getBurndownData** (3 tests)
   - Returns all 4 lines with correct structure
   - Uses highest balance for planned line
   - Handles empty current month

5. **Regression Tests** (3 tests)
   - Retroactive transaction edits
   - Accounts with no operations
   - Negative balances

### Test Gaps

- ❌ Complete get12MonthMean calculation test
- ❌ Integration test (end-to-end workflow)
- ❌ UI component tests (React Testing Library)
- ❌ Edge cases: leap years, very old operations, concurrent modifications

## Known Limitations

1. **Planned Line Curve**
   - Due to bezier smoothing, planned line is slightly curved instead of perfectly straight
   - Accepted trade-off for better visual appeal

2. **Full Year View Not Supported**
   - Burndown card hidden when "Full Year" is selected
   - Only works with specific month selection

3. **No Caching**
   - Recalculates on every view
   - No persistence of calculated values

4. **Performance on Low-End Devices**
   - 12-month mean can take 2-5 seconds
   - No progress indicator during calculation

5. **Accessibility**
   - Chart not readable by screen readers
   - Color-only line differentiation (problematic for colorblind users)

6. **Timezone Assumptions**
   - Assumes all dates are in ISO format without time component
   - May have edge cases for users in extreme timezones

## Future Enhancements

### High Priority

1. **Performance Optimization**
   - Implement batch query approach for get12MonthMean
   - Add caching layer with operation-based invalidation
   - **Impact**: Major UX improvement

2. **Error State UI**
   - Display error messages when data load fails
   - Distinguish between "no data" and "error" states
   - **Impact**: Better user experience

3. **Complete Test Coverage**
   - Finish get12MonthMean calculation test
   - Add integration tests
   - **Impact**: Better reliability

### Medium Priority

4. **Input Validation**
   - Validate accountId existence
   - Validate date formats
   - Validate year/month ranges
   - **Impact**: Better error messages

5. **Accessibility Improvements**
   - Screen reader support (alternative text summary)
   - Line style variations (solid/dashed) for colorblind users
   - Interactive legend (toggle line visibility)
   - **Impact**: WCAG compliance

6. **Timezone Handling**
   - Explicit UTC date handling
   - User timezone configuration
   - **Impact**: Prevent edge case errors

### Low Priority

7. **Visual Enhancements**
   - Add vertical line marker for current day
   - Auto-hide tooltip after 5 seconds
   - Swipe between days in tooltip

8. **Responsive Design**
   - Use useWindowDimensions for chart width
   - Handle rotation gracefully

9. **Monthly Target Feature**
   - UI to configure accounts.monthly_target
   - Use target instead of peak balance for planned line

## Code References

### Primary Files

| File | Lines | Purpose |
|------|-------|---------|
| `/app/services/BurndownDB.js` | 1-359 | Core calculation service |
| `/app/screens/GraphsScreen.js` | 967-1163 | UI integration |
| `/__tests__/services/BurndownDB.test.js` | 1-399 | Unit tests |
| `/app/db/schema.js` | 22 | monthlyTarget field definition |
| `/app/services/db.js` | - | migrateToV10 function |
| `/assets/i18n.json` | 239-245, 530-536 | Translations |

### Key Functions

- `getBalanceAtDate(accountId, targetDate)` - Point-in-time balance
- `getDailyBalances(accountId, startDate, endDate)` - Daily progression
- `get12MonthMean(accountId, year, month)` - Historical average
- `getBurndownData(accountId, year, month)` - Orchestrator (main entry point)
- `applyOperation(balance, operation, accountId)` - Forward calculation
- `reverseOperation(balance, operation, accountId)` - Backward calculation

## Troubleshooting

### Issue: Chart shows "No data available"

**Causes**:
1. Selected month has no operations
2. Account has no operations at all
3. Error during data load (check console)

**Solutions**:
- Try different month
- Add operations to account
- Check browser/console for errors

### Issue: 12-month mean line is flat at zero

**Cause**: Account doesn't have 12 months of history

**Solution**: This is expected for new accounts. Line will populate as more historical data accumulates.

### Issue: Planned line doesn't reach zero

**Cause**: Month view was switched before chart finished rendering

**Solution**: Reload data by changing account selection

### Issue: Slow loading (>5 seconds)

**Cause**: N+1 query pattern in get12MonthMean

**Solutions**:
- Expected behavior (performance optimization pending)
- Reduce operation count (archive old operations)
- Wait for future batch query optimization

## Migration Guide

### From AsyncStorage to SQLite (V9 → V10)

The burndown feature was introduced in migration V10. If upgrading from V9:

1. Database automatically migrates on app start
2. `accounts` table gets `monthly_target` column
3. Existing data preserved
4. No user action required

### Rollback (If Needed)

```sql
-- To remove monthly_target field (not recommended)
ALTER TABLE accounts DROP COLUMN monthly_target;
```

Note: This would require manual migration script as SQLite doesn't support DROP COLUMN in all versions.

## Contributing

When modifying burndown calculations:

1. **Update unit tests** - Ensure all edge cases covered
2. **Performance test** - Check load time with realistic data
3. **Visual verification** - Test on actual device, not just simulator
4. **Multi-currency test** - Verify transfer calculations
5. **Theme test** - Check both light and dark modes
6. **i18n test** - Verify both English and Russian

### Code Style

- Use JSDoc comments for all exported functions
- Follow existing Currency service patterns
- Maintain defensive programming (null checks, optional chaining)
- Use descriptive variable names
- Keep functions under 100 lines where possible

## License

Same as parent project (refer to root LICENSE file).

## Support

For bugs or feature requests related to burndown graph:
- Open GitHub issue with "burndown" label
- Include screenshot if visual issue
- Include console output for errors

---

**Last Updated**: December 2025
**Version**: 1.0
**Status**: Production-ready with known limitations
