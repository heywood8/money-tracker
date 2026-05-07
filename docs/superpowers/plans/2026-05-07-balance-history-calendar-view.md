# Balance History Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BalanceHistoryModal with an inline calendar grid that toggles inside the BalanceHistoryCard via a header icon button.

**Architecture:** A new `BalanceHistoryCalendarView` component renders inside `BalanceHistoryCard` when `showCalendar` is true, replacing the chart+legend area. A toggle icon button (calendar-month ↔ chart-line) in the card header switches views and triggers table data loading. The modal and all its wiring in GraphsScreen are removed.

**Tech Stack:** React Native, `@testing-library/react-native`, `@expo/vector-icons` (MaterialCommunityIcons), existing `useBalanceHistory` hook.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/components/graphs/BalanceHistoryCalendarView.js` | Create | Calendar grid + inline edit row |
| `app/components/graphs/BalanceHistoryCard.js` | Modify | Add `showCalendar` state, toggle icon button, new edit props, remove `onChartPress` |
| `app/screens/GraphsScreen.js` | Modify | Remove modal state/handlers, pass edit props to card, add `onShowCalendar` |
| `app/components/graphs/BalanceHistoryModal.js` | Delete | — |
| `__tests__/components/graphs/BalanceHistoryCalendarView.test.js` | Create | Tests for the new calendar component |
| `__tests__/components/graphs/BalanceHistoryModal.test.js` | Delete | — |
| `__tests__/components/BalanceHistoryCard.test.js` | Modify | Remove `onChartPress` prop, add new edit props, add calendar toggle test |

---

## Task 1: Create `BalanceHistoryCalendarView` component

**Files:**
- Create: `app/components/graphs/BalanceHistoryCalendarView.js`
- Create: `__tests__/components/graphs/BalanceHistoryCalendarView.test.js`

### Data shape (from `useBalanceHistory`)

`balanceHistoryTableData` is an array of:
```js
{ date: 'YYYY-MM-DD', displayDate: '15', balance: '1500.00' | null }
```
`date` uses format `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`.

### Step 1.1: Write the failing tests

Create `__tests__/components/graphs/BalanceHistoryCalendarView.test.js`:

```js
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BalanceHistoryCalendarView from '../../../app/components/graphs/BalanceHistoryCalendarView';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));

const mockColors = {
  primary: '#6200ee',
  text: '#000',
  mutedText: '#666',
  border: '#e0e0e0',
  surface: '#fff',
  background: '#f5f5f5',
};

const makeTableData = (year, month) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { date: dateStr, displayDate: String(day), balance: null };
  });
};

const defaultProps = {
  colors: mockColors,
  t: (key) => key,
  selectedYear: 2024,
  selectedMonth: 0, // January
  balanceHistoryTableData: makeTableData(2024, 0),
  editingBalanceRow: null,
  editingBalanceValue: '',
  onEditingBalanceValueChange: jest.fn(),
  onEditBalance: jest.fn(),
  onCancelEdit: jest.fn(),
  onSaveBalance: jest.fn(),
  onDeleteBalance: jest.fn(),
};

describe('BalanceHistoryCalendarView', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('Grid rendering', () => {
    it('renders all 7 day-of-week headers', () => {
      const { getByText } = render(<BalanceHistoryCalendarView {...defaultProps} />);
      // There are two 'T' headers (Tuesday and Thursday) — use getAllByText
      expect(getByText('M')).toBeTruthy();
      expect(getByText('W')).toBeTruthy();
      expect(getByText('F')).toBeTruthy();
      expect(getByText('S')).toBeTruthy(); // Saturday
    });

    it('renders a cell for every day of the month', () => {
      const { getByTestId } = render(<BalanceHistoryCalendarView {...defaultProps} />);
      // January has 31 days
      expect(getByTestId('day-cell-1')).toBeTruthy();
      expect(getByTestId('day-cell-31')).toBeTruthy();
    });

    it('shows formatted balance in cells that have an entry', () => {
      const tableData = makeTableData(2024, 0);
      tableData[4].balance = '532000'; // day 5 → 532K
      tableData[14].balance = '1500000'; // day 15 → 1.5M
      const { getByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      expect(getByTestId('day-balance-5')).toBeTruthy();
      expect(getByTestId('day-balance-15')).toBeTruthy();
    });

    it('does not render a balance label for empty days', () => {
      const { queryByTestId } = render(<BalanceHistoryCalendarView {...defaultProps} />);
      expect(queryByTestId('day-balance-1')).toBeNull();
    });
  });

  describe('Day selection', () => {
    it('calls onEditBalance with correct date and empty string when tapping a day with no entry', () => {
      const { getByTestId } = render(<BalanceHistoryCalendarView {...defaultProps} />);
      fireEvent.press(getByTestId('day-cell-10'));
      expect(defaultProps.onEditBalance).toHaveBeenCalledWith('2024-01-10', '');
    });

    it('calls onEditBalance with existing balance when tapping a day with an entry', () => {
      const tableData = makeTableData(2024, 0);
      tableData[9].balance = '1200.00'; // day 10
      const { getByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      fireEvent.press(getByTestId('day-cell-10'));
      expect(defaultProps.onEditBalance).toHaveBeenCalledWith('2024-01-10', '1200.00');
    });

    it('shows the edit row after tapping a day', () => {
      const { getByTestId, queryByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} />,
      );
      expect(queryByTestId('calendar-edit-row')).toBeNull();
      fireEvent.press(getByTestId('day-cell-5'));
      expect(getByTestId('calendar-edit-row')).toBeTruthy();
    });
  });

  describe('Inline edit row', () => {
    it('calls onSaveBalance with the correct date when Save is pressed', () => {
      const { getByTestId } = render(<BalanceHistoryCalendarView {...defaultProps} />);
      fireEvent.press(getByTestId('day-cell-7'));
      fireEvent.press(getByTestId('calendar-save-btn'));
      expect(defaultProps.onSaveBalance).toHaveBeenCalledWith('2024-01-07');
    });

    it('hides the edit row after Save is pressed', () => {
      const { getByTestId, queryByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} />,
      );
      fireEvent.press(getByTestId('day-cell-7'));
      fireEvent.press(getByTestId('calendar-save-btn'));
      expect(queryByTestId('calendar-edit-row')).toBeNull();
    });

    it('shows delete button only for days with an existing entry', () => {
      const tableData = makeTableData(2024, 0);
      tableData[6].balance = '999.00'; // day 7 has entry
      const { getByTestId, queryByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      // Day with entry → delete shown
      fireEvent.press(getByTestId('day-cell-7'));
      expect(getByTestId('calendar-delete-btn')).toBeTruthy();
      // Tap cancel, then day without entry → no delete
      fireEvent.press(getByTestId('calendar-cancel-btn'));
      fireEvent.press(getByTestId('day-cell-1'));
      expect(queryByTestId('calendar-delete-btn')).toBeNull();
    });

    it('calls onDeleteBalance with the correct date and hides edit row', () => {
      const tableData = makeTableData(2024, 0);
      tableData[9].balance = '500'; // day 10
      const { getByTestId, queryByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} balanceHistoryTableData={tableData} />,
      );
      fireEvent.press(getByTestId('day-cell-10'));
      fireEvent.press(getByTestId('calendar-delete-btn'));
      expect(defaultProps.onDeleteBalance).toHaveBeenCalledWith('2024-01-10');
      expect(queryByTestId('calendar-edit-row')).toBeNull();
    });

    it('calls onCancelEdit and hides edit row when cancel is pressed', () => {
      const { getByTestId, queryByTestId } = render(
        <BalanceHistoryCalendarView {...defaultProps} />,
      );
      fireEvent.press(getByTestId('day-cell-3'));
      fireEvent.press(getByTestId('calendar-cancel-btn'));
      expect(defaultProps.onCancelEdit).toHaveBeenCalled();
      expect(queryByTestId('calendar-edit-row')).toBeNull();
    });
  });
});
```

- [ ] **Step 1.2: Run the tests — expect them to fail**

```bash
npm test -- --silent __tests__/components/graphs/BalanceHistoryCalendarView.test.js
```

Expected: FAIL — `Cannot find module '../../../app/components/graphs/BalanceHistoryCalendarView'`

- [ ] **Step 1.3: Implement `BalanceHistoryCalendarView`**

Create `app/components/graphs/BalanceHistoryCalendarView.js`:

```js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import PropTypes from 'prop-types';

const DAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const formatBalanceCompact = (balance) => {
  const num = parseFloat(balance);
  if (isNaN(num)) return balance;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return Math.round(num).toString();
};

const getDateStr = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const BalanceHistoryCalendarView = ({
  colors,
  selectedYear,
  selectedMonth,
  balanceHistoryTableData,
  editingBalanceValue,
  onEditingBalanceValueChange,
  onEditBalance,
  onCancelEdit,
  onSaveBalance,
  onDeleteBalance,
}) => {
  const [selectedDay, setSelectedDay] = useState(null);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  // Monday-first offset: Sun=0 → 6, Mon=1 → 0, ..., Sat=6 → 5
  const firstDayOffset = (new Date(selectedYear, selectedMonth, 1).getDay() + 6) % 7;

  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === selectedYear && now.getMonth() === selectedMonth;
  const todayDate = now.getDate();

  const getEntry = (day) => {
    const dateStr = getDateStr(selectedYear, selectedMonth, day);
    return balanceHistoryTableData.find((r) => r.date === dateStr) || null;
  };

  const handleDayPress = (day) => {
    const entry = getEntry(day);
    setSelectedDay(day);
    onEditBalance(getDateStr(selectedYear, selectedMonth, day), entry?.balance || '');
  };

  const handleSave = () => {
    if (selectedDay !== null) {
      onSaveBalance(getDateStr(selectedYear, selectedMonth, selectedDay));
      setSelectedDay(null);
    }
  };

  const handleDelete = () => {
    if (selectedDay !== null) {
      onDeleteBalance(getDateStr(selectedYear, selectedMonth, selectedDay));
      setSelectedDay(null);
    }
  };

  const handleCancel = () => {
    setSelectedDay(null);
    onCancelEdit();
  };

  // Build flat cell list: null for offset blanks, then day numbers
  const cells = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete final row
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEntry = selectedDay !== null ? getEntry(selectedDay) : null;

  return (
    <View>
      {/* Day-of-week header */}
      <View style={styles.headerRow}>
        {DAY_HEADERS.map((label, i) => (
          <View key={i} style={styles.cell}>
            <Text style={[styles.dayHeader, { color: colors.mutedText }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Week rows */}
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={styles.weekRow}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (day === null) {
              return <View key={col} style={styles.cell} />;
            }
            const entry = getEntry(day);
            const isToday = isCurrentMonth && day === todayDate;
            const isSelected = day === selectedDay;
            return (
              <TouchableOpacity
                key={col}
                testID={`day-cell-${day}`}
                style={[
                  styles.cell,
                  styles.dayCell,
                  entry && { backgroundColor: colors.primary + '22' },
                  isToday && { borderColor: colors.primary, borderWidth: 1 },
                  isSelected && { backgroundColor: colors.primary + '44' },
                ]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNumber, { color: entry ? colors.text : colors.mutedText }]}>
                  {day}
                </Text>
                {entry?.balance && (
                  <Text
                    testID={`day-balance-${day}`}
                    style={[styles.dayBalance, { color: colors.primary }]}
                    numberOfLines={1}
                  >
                    {formatBalanceCompact(entry.balance)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Inline edit row */}
      {selectedDay !== null && (
        <View
          testID="calendar-edit-row"
          style={[styles.editRow, { borderColor: colors.primary, backgroundColor: colors.surface }]}
        >
          <Text style={[styles.editDateLabel, { color: colors.mutedText }]}>
            {selectedDay}
          </Text>
          <TextInput
            testID="calendar-edit-input"
            style={[
              styles.editInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            value={editingBalanceValue}
            onChangeText={onEditingBalanceValueChange}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.mutedText}
          />
          <TouchableOpacity
            testID="calendar-save-btn"
            style={[styles.editBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
          >
            <Text style={styles.editBtnText}>✓</Text>
          </TouchableOpacity>
          {selectedEntry?.balance && (
            <TouchableOpacity
              testID="calendar-delete-btn"
              style={[styles.editBtn, styles.deleteBtn]}
              onPress={handleDelete}
            >
              <Text style={styles.editBtnText}>✕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="calendar-cancel-btn" onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={{ color: colors.mutedText, fontSize: 18 }}>×</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

BalanceHistoryCalendarView.propTypes = {
  colors: PropTypes.object.isRequired,
  selectedYear: PropTypes.number.isRequired,
  selectedMonth: PropTypes.number.isRequired,
  balanceHistoryTableData: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      displayDate: PropTypes.string,
      balance: PropTypes.string,
    }),
  ).isRequired,
  editingBalanceValue: PropTypes.string.isRequired,
  onEditingBalanceValueChange: PropTypes.func.isRequired,
  onEditBalance: PropTypes.func.isRequired,
  onCancelEdit: PropTypes.func.isRequired,
  onSaveBalance: PropTypes.func.isRequired,
  onDeleteBalance: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  cancelBtn: {
    padding: 4,
  },
  cell: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dayBalance: {
    fontSize: 8,
    fontWeight: '600',
  },
  dayCell: {
    borderRadius: 4,
    minHeight: 34,
    paddingVertical: 3,
  },
  dayHeader: {
    fontSize: 10,
    fontWeight: '600',
  },
  dayNumber: {
    fontSize: 11,
  },
  deleteBtn: {
    backgroundColor: '#f44336',
  },
  editBtn: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  editDateLabel: {
    fontSize: 12,
    marginRight: 8,
    minWidth: 24,
  },
  editInput: {
    borderRadius: 4,
    borderWidth: 1,
    flex: 1,
    fontSize: 13,
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'right',
  },
  editRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    padding: 8,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
});

export default BalanceHistoryCalendarView;
```

- [ ] **Step 1.4: Run the tests — expect them to pass**

```bash
npm test -- --silent __tests__/components/graphs/BalanceHistoryCalendarView.test.js
```

Expected: PASS — all 10 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add app/components/graphs/BalanceHistoryCalendarView.js __tests__/components/graphs/BalanceHistoryCalendarView.test.js
git commit -F local/commit_msg.txt
```

Commit message in `local/commit_msg.txt`:
```
feat(graphs): add BalanceHistoryCalendarView component

Inline calendar grid with day cells, balance display, and inline
edit/delete row. Replaces BalanceHistoryModal interaction model.

🧀
```

---

## Task 2: Update `BalanceHistoryCard`

**Files:**
- Modify: `app/components/graphs/BalanceHistoryCard.js`
- Modify: `__tests__/components/BalanceHistoryCard.test.js`

### What changes

1. Add `showCalendar` local state (default `false`)
2. Add toggle icon button in header (between balance amount and account picker)
3. Add `onShowCalendar` prop — called with no args when toggling to calendar; triggers table data load in GraphsScreen
4. Add edit props: `balanceHistoryTableData`, `editingBalanceValue`, `onEditingBalanceValueChange`, `onEditBalance`, `onCancelEdit`, `onSaveBalance`, `onDeleteBalance`
5. When `showCalendar = true`, render `<BalanceHistoryCalendarView>` instead of the chart + legend
6. Remove `onChartPress` prop and the `TouchableOpacity` wrapper around the chart

- [ ] **Step 2.1: Update the existing BalanceHistoryCard test**

In `__tests__/components/BalanceHistoryCard.test.js`:

a) Add mock for the new calendar component at the top with the other mocks:
```js
jest.mock('../../app/components/graphs/BalanceHistoryCalendarView', () => 'BalanceHistoryCalendarView');
```

b) Add mock for vector icons (if not already present — check top of file):
```js
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
```

c) Remove `onChartPress={jest.fn()}` from every `render(...)` call in the file. Add these new props in its place where needed (use minimal versions — just empty arrays/fns):
```js
balanceHistoryTableData={[]}
editingBalanceValue=""
onEditingBalanceValueChange={jest.fn()}
onEditBalance={jest.fn()}
onCancelEdit={jest.fn()}
onSaveBalance={jest.fn()}
onDeleteBalance={jest.fn()}
onShowCalendar={jest.fn()}
```

d) Add a new test for the toggle button:
```js
describe('Calendar toggle', () => {
  it('renders the calendar toggle button', () => {
    const { getByTestId } = render(
      <BalanceHistoryCard
        colors={mockColors}
        t={mockT}
        selectedAccount="acc1"
        onAccountChange={jest.fn()}
        accountItems={mockAccountItems}
        loadingBalanceHistory={false}
        balanceHistoryData={{
          labels: [1, 2, 3],
          actual: [{ x: 1, y: 1000 }],
          actualForChart: [1000, 1000, 1000],
          burndown: [],
          prevMonth: [],
        }}
        selectedYear={2024}
        selectedMonth={0}
        accounts={mockAccounts}
        balanceHistoryTableData={[]}
        editingBalanceValue=""
        onEditingBalanceValueChange={jest.fn()}
        onEditBalance={jest.fn()}
        onCancelEdit={jest.fn()}
        onSaveBalance={jest.fn()}
        onDeleteBalance={jest.fn()}
        onShowCalendar={jest.fn()}
      />,
    );
    expect(getByTestId('calendar-toggle-btn')).toBeTruthy();
  });

  it('calls onShowCalendar when switching to calendar view', () => {
    const onShowCalendar = jest.fn();
    const { getByTestId } = render(
      <BalanceHistoryCard
        colors={mockColors}
        t={mockT}
        selectedAccount="acc1"
        onAccountChange={jest.fn()}
        accountItems={mockAccountItems}
        loadingBalanceHistory={false}
        balanceHistoryData={{
          labels: [1, 2, 3],
          actual: [{ x: 1, y: 1000 }],
          actualForChart: [1000, 1000, 1000],
          burndown: [],
          prevMonth: [],
        }}
        selectedYear={2024}
        selectedMonth={0}
        accounts={mockAccounts}
        balanceHistoryTableData={[]}
        editingBalanceValue=""
        onEditingBalanceValueChange={jest.fn()}
        onEditBalance={jest.fn()}
        onCancelEdit={jest.fn()}
        onSaveBalance={jest.fn()}
        onDeleteBalance={jest.fn()}
        onShowCalendar={onShowCalendar}
      />,
    );
    fireEvent.press(getByTestId('calendar-toggle-btn'));
    expect(onShowCalendar).toHaveBeenCalled();
    // Pressing again (back to chart) should NOT call onShowCalendar again
    fireEvent.press(getByTestId('calendar-toggle-btn'));
    expect(onShowCalendar).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2.2: Run the existing card tests — expect failures due to missing `onChartPress` prop changes**

```bash
npm test -- --silent __tests__/components/BalanceHistoryCard.test.js
```

- [ ] **Step 2.3: Update `BalanceHistoryCard.js`**

**a) Add import** at the top (after existing imports):
```js
import BalanceHistoryCalendarView from './BalanceHistoryCalendarView';
```

**b) Add `showCalendar` state and new props** to the component:

Replace the function signature (currently starts at `const BalanceHistoryCard = ({`):
```js
const BalanceHistoryCard = ({
  colors,
  t,
  selectedAccount,
  onAccountChange,
  accountItems,
  loadingBalanceHistory,
  balanceHistoryData,
  selectedYear,
  selectedMonth,
  accounts,
  spendingPrediction,
  isCurrentMonth,
  closeLabel,
  // edit props (forwarded to calendar)
  balanceHistoryTableData,
  editingBalanceValue,
  onEditingBalanceValueChange,
  onEditBalance,
  onCancelEdit,
  onSaveBalance,
  onDeleteBalance,
  onShowCalendar,
}) => {
  const { hideBalances } = useDisplaySettings();
  const [showCalendar, setShowCalendar] = useState(false);
```

Add `useState` to the React import at line 1:
```js
import React, { useState } from 'react';
```

**c) Add toggle button in header** — find `{/* Account Pill Picker */}` and add the toggle button before it:
```jsx
{/* Calendar / Chart toggle */}
<TouchableOpacity
  testID="calendar-toggle-btn"
  style={[styles.calendarToggleBtn, { backgroundColor: colors.surface }]}
  onPress={() => {
    const next = !showCalendar;
    setShowCalendar(next);
    if (next) onShowCalendar();
  }}
  activeOpacity={0.7}
>
  <Icon
    name={showCalendar ? 'chart-line' : 'calendar-month'}
    size={18}
    color={colors.primary}
  />
</TouchableOpacity>
```

Add the `Icon` import at the top with other imports:
```js
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
```

**d) Replace the chart `TouchableOpacity` + `LineChart` block** with conditional rendering. Find:
```jsx
) : balanceHistoryData.actual && balanceHistoryData.actual.length > 0 ? (
  <>
    <TouchableOpacity
      testID="balance-history-chart"
      style={styles.balanceHistoryChartContainer}
      onPress={onChartPress}
      activeOpacity={0.7}
    >
```

Replace the entire block (from `<>` through the closing `</>` that includes both chart and legend table) with:
```jsx
) : balanceHistoryData.actual && balanceHistoryData.actual.length > 0 ? (
  <>
    {showCalendar ? (
      <BalanceHistoryCalendarView
        colors={colors}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        balanceHistoryTableData={balanceHistoryTableData}
        editingBalanceValue={editingBalanceValue}
        onEditingBalanceValueChange={onEditingBalanceValueChange}
        onEditBalance={onEditBalance}
        onCancelEdit={onCancelEdit}
        onSaveBalance={onSaveBalance}
        onDeleteBalance={onDeleteBalance}
      />
    ) : (
      <>
        <View style={styles.balanceHistoryChartContainer}>
          {/* existing LineChart IIFE — move here unchanged, no TouchableOpacity wrapper */}
          {(() => { /* ... existing chart rendering code ... */ })()}
        </View>
        {/* existing legend table block — move here unchanged */}
        {!hideBalances && (() => { /* ... existing legend code ... */ })()}
      </>
    )}
  </>
```

> ⚠️ Move the existing chart IIFE and legend IIFE verbatim — do not rewrite them. Just remove the `TouchableOpacity` wrapper and nest the two blocks inside the `showCalendar ? ... : (...)` else branch.

**e) Add new PropTypes** — remove `onChartPress` and add:
```js
balanceHistoryTableData: PropTypes.array.isRequired,
editingBalanceValue: PropTypes.string.isRequired,
onEditingBalanceValueChange: PropTypes.func.isRequired,
onEditBalance: PropTypes.func.isRequired,
onCancelEdit: PropTypes.func.isRequired,
onSaveBalance: PropTypes.func.isRequired,
onDeleteBalance: PropTypes.func.isRequired,
onShowCalendar: PropTypes.func.isRequired,
```

**f) Add new styles**:
```js
calendarToggleBtn: {
  alignItems: 'center',
  borderRadius: 8,
  height: 32,
  justifyContent: 'center',
  marginRight: 8,
  width: 32,
},
```

- [ ] **Step 2.4: Run all card tests — expect pass**

```bash
npm test -- --silent __tests__/components/BalanceHistoryCard.test.js
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add app/components/graphs/BalanceHistoryCard.js __tests__/components/BalanceHistoryCard.test.js
git commit -F local/commit_msg.txt
```

Commit message:
```
feat(graphs): add inline calendar toggle to BalanceHistoryCard

Replaces onChartPress/modal pattern with a calendar-month icon button
in the card header. Toggling to calendar view calls onShowCalendar to
trigger table data loading in the parent.

🧀
```

---

## Task 3: Update `GraphsScreen`

**Files:**
- Modify: `app/screens/GraphsScreen.js`

### What changes

1. Remove `balanceHistoryModalVisible` state
2. Remove `closeBalanceHistoryModal` callback
3. Remove `handleBalanceHistoryPress` callback and the call to `setBalanceHistoryModalVisible`
4. Add `handleShowCalendar` callback (calls `loadBalanceHistoryTable`)
5. Pass all edit props + `onShowCalendar` to `<BalanceHistoryCard>`
6. Remove `<BalanceHistoryModal>` and its import

- [ ] **Step 3.1: Make the changes to GraphsScreen**

Find and remove:
```js
const [balanceHistoryModalVisible, setBalanceHistoryModalVisible] = useState(false);
```

Find and remove:
```js
const closeBalanceHistoryModal = useCallback(() => {
  setBalanceHistoryModalVisible(false);
}, []);
```

Find and remove `handleBalanceHistoryPress` (the callback that calls `setBalanceHistoryModalVisible(true)` and `loadBalanceHistoryTable()`):
```js
// remove this entire callback
const handleBalanceHistoryPress = useCallback(async () => {
  setBalanceHistoryModalVisible(true);
  await loadBalanceHistoryTable();
}, [loadBalanceHistoryTable]);
```

Add in its place:
```js
const handleShowCalendar = useCallback(async () => {
  await loadBalanceHistoryTable();
}, [loadBalanceHistoryTable]);
```

On the `<BalanceHistoryCard>` element, remove `onChartPress={handleBalanceHistoryPress}` and add:
```jsx
onShowCalendar={handleShowCalendar}
balanceHistoryTableData={balanceHistoryTableData}
editingBalanceValue={editingBalanceValue}
onEditingBalanceValueChange={setEditingBalanceValue}
onEditBalance={handleEditBalance}
onCancelEdit={handleCancelEdit}
onSaveBalance={handleSaveBalance}
onDeleteBalance={handleDeleteBalance}
```

Remove the entire `<BalanceHistoryModal ... />` JSX block (the component and all its props).

Remove the import:
```js
import BalanceHistoryModal from '../components/graphs/BalanceHistoryModal';
```

- [ ] **Step 3.2: Run the full test suite**

```bash
npm test -- --silent
```

Expected: all passing except `BalanceHistoryModal.test.js` (which imports the file we're about to delete). If there are other failures, fix them before proceeding.

- [ ] **Step 3.3: Commit**

```bash
git add app/screens/GraphsScreen.js
git commit -F local/commit_msg.txt
```

Commit message:
```
feat(graphs): wire calendar edit props in GraphsScreen, remove modal

Replaces modal open/close flow with handleShowCalendar that loads
table data on demand. Edit handlers now flow directly to BalanceHistoryCard.

🧀
```

---

## Task 4: Delete `BalanceHistoryModal` and clean up

**Files:**
- Delete: `app/components/graphs/BalanceHistoryModal.js`
- Delete: `__tests__/components/graphs/BalanceHistoryModal.test.js`

- [ ] **Step 4.1: Delete the files**

```bash
git rm app/components/graphs/BalanceHistoryModal.js
git rm __tests__/components/graphs/BalanceHistoryModal.test.js
```

- [ ] **Step 4.2: Run the full test suite**

```bash
npm test -- --silent
```

Expected: all tests pass, no references to `BalanceHistoryModal` remain.

If any test file still imports `BalanceHistoryModal`, fix or remove that import before proceeding.

- [ ] **Step 4.3: Final commit**

```bash
git add -u
git commit -F local/commit_msg.txt
```

Commit message:
```
chore(graphs): remove BalanceHistoryModal and its tests

Modal replaced by inline calendar view in BalanceHistoryCard.

🧀
```

---

## Done

Push the branch and open a PR:

```bash
git push -u origin feat/balance-history-calendar-view
```

Then create PR with `gh pr create --body-file local/pr_body.txt`.
