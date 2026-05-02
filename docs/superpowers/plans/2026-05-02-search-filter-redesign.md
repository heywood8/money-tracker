# Search Filter Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clunky flat filter dropdown with a card-styled top-anchored panel, add a `FilterChipStrip` showing active filters as removable chips below the search bar, and fix two bundled bugs (amount decimal loss, filter icon active state).

**Architecture:** `FilterChipStrip` is a new horizontal scroll of per-group chips rendered in `Header.js` below `SearchBar`. The existing `SearchOverlay` gains card styling (rounded bottom corners, shadow). `ExpandableFilters` replaces checkboxes with chips, adds a clear-all button, and fixes amount parsing. No changes to context or screen files.

**Tech Stack:** React Native, `@expo/vector-icons` (MaterialCommunityIcons), `@testing-library/react-native`, Jest

---

## File Map

| Status | File | Change |
|---|---|---|
| CREATE | `app/components/search/FilterChipStrip.js` | new chip strip component |
| CREATE | `__tests__/components/search/FilterChipStrip.test.js` | tests for chip strip |
| MODIFY | `app/components/search/SearchBar.js` | filter icon active color |
| MODIFY | `__tests__/components/search/SearchBar.test.js` | test filter icon color |
| MODIFY | `app/components/search/SearchOverlay.js` | card styling (shadow, border-radius) |
| MODIFY | `app/components/search/ExpandableFilters.js` | chips, compact labels, clear-all, fix amount parsing |
| MODIFY | `__tests__/components/search/ExpandableFilters.test.js` | update for chips + new behaviors |
| MODIFY | `app/components/Header.js` | render FilterChipStrip, add handleClearFilterGroup |

---

## Task 1: SearchBar — filter icon uses primary color when active

**Files:**
- Modify: `app/components/search/SearchBar.js:77`
- Modify: `__tests__/components/search/SearchBar.test.js`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('SearchBar filter button active state')` block in `__tests__/components/search/SearchBar.test.js`:

```js
it('filter icon uses primary color when filterCount > 0', () => {
  const { getByTestId } = render(
    <SearchBar {...defaultProps} filterCount={2} colors={{ ...mockColors, primary: '#FF3B30' }} />,
  );
  const button = getByTestId('filters-toggle-button');
  // The Icon inside has the color prop — find it via UNSAFE_getByProps
  const icon = button.findAllByType(require('@expo/vector-icons').MaterialCommunityIcons)[0];
  expect(icon.props.color).toBe('#FF3B30');
});

it('filter icon uses text color when filterCount is 0', () => {
  const { getByTestId } = render(
    <SearchBar {...defaultProps} filterCount={0} colors={{ ...mockColors, text: '#CCCCCC' }} />,
  );
  const button = getByTestId('filters-toggle-button');
  const icon = button.findAllByType(require('@expo/vector-icons').MaterialCommunityIcons)[0];
  expect(icon.props.color).toBe('#CCCCCC');
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- --silent --testPathPattern="SearchBar"
```

Expected: 2 new tests FAIL with color mismatch.

- [ ] **Step 3: Implement**

In `app/components/search/SearchBar.js`, find the `Icon` inside the filter button (line ~77) and change `color={colors.text}` to:

```jsx
<Icon name="filter-variant" size={22} color={filterCount > 0 ? colors.primary : colors.text} />
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- --silent --testPathPattern="SearchBar"
```

Expected: all SearchBar tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/components/search/SearchBar.js __tests__/components/search/SearchBar.test.js
git commit -m "fix(search): filter icon uses primary color when filters are active"
```

---

## Task 2: SearchOverlay — card styling

**Files:**
- Modify: `app/components/search/SearchOverlay.js:85-101` (styles block)

> Visual-only change. No behavioral tests needed — existing SearchOverlay tests should continue to pass without modification.

- [ ] **Step 1: Verify existing tests pass before touching anything**

```bash
npm test -- --silent --testPathPattern="SearchOverlay"
```

Expected: all pass.

- [ ] **Step 2: Update `filtersContainer` style**

In `app/components/search/SearchOverlay.js`, replace the `filtersContainer` style entry:

```js
// before
filtersContainer: {
  left: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  zIndex: 50,
},

// after
filtersContainer: {
  borderBottomLeftRadius: 14,
  borderBottomRightRadius: 14,
  elevation: 8,
  left: 0,
  position: 'absolute',
  right: 0,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.35,
  shadowRadius: 10,
  top: 0,
  zIndex: 50,
},
```

- [ ] **Step 3: Run to verify existing tests still pass**

```bash
npm test -- --silent --testPathPattern="SearchOverlay"
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/components/search/SearchOverlay.js
git commit -m "style(search): add card styling to filter panel (rounded corners, shadow)"
```

---

## Task 3: ExpandableFilters — compact labels + clear-all button

**Files:**
- Modify: `app/components/search/ExpandableFilters.js`
- Modify: `__tests__/components/search/ExpandableFilters.test.js`

- [ ] **Step 1: Write failing tests**

Add these to `__tests__/components/search/ExpandableFilters.test.js`:

```js
it('renders clear all button', () => {
  const { getByTestId } = render(<ExpandableFilters {...defaultProps} />);
  expect(getByTestId('clear-all-button')).toBeTruthy();
});

it('calls onFilterChange with all groups reset when clear all is pressed', () => {
  const { getByTestId } = render(<ExpandableFilters {...defaultProps} />);
  fireEvent.press(getByTestId('clear-all-button'));
  expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- --silent --testPathPattern="ExpandableFilters"
```

Expected: 2 new tests FAIL.

- [ ] **Step 3: Replace section titles and add clear-all**

In `app/components/search/ExpandableFilters.js`:

**a) Replace every section title `<Text>` with compact label style.** There are 5 sections (Type, Date Range, Amount Range, Accounts, Categories). Replace each:

```jsx
// before (all 5 sections use this pattern)
<Text style={[styles.sectionTitle, { color: colors.text }]}>
  {t('operation_type')}
</Text>

// after (all 5 sections)
<Text style={[styles.sectionLabel, { color: colors.mutedText }]}>
  {t('operation_type')}
</Text>
```

Apply to all 5 section titles: `operation_type`, `date_range`, `amount_range`, `accounts`, `categories`.

**b) Add clear-all button** at the bottom of the `<ScrollView>`, after the Categories section and before `</ScrollView>`:

```jsx
<TouchableOpacity
  testID="clear-all-button"
  style={styles.clearAllButton}
  onPress={() => onFilterChange({
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  })}
>
  <Text style={[styles.clearAllText, { color: colors.primary }]}>
    {t('clear_all')}
  </Text>
</TouchableOpacity>
```

**c) Update the styles block** — remove `sectionTitle`, add `sectionLabel` and clear-all styles:

```js
// remove:
sectionTitle: {
  fontSize: 16,
  fontWeight: '600',
  marginBottom: 10,
},

// add:
sectionLabel: {
  fontSize: 11,
  fontWeight: '600',
  letterSpacing: 0.5,
  marginBottom: 10,
  textTransform: 'uppercase',
},
clearAllButton: {
  alignItems: 'center',
  paddingVertical: 14,
},
clearAllText: {
  fontSize: 14,
  fontWeight: '600',
},
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- --silent --testPathPattern="ExpandableFilters"
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/components/search/ExpandableFilters.js __tests__/components/search/ExpandableFilters.test.js
git commit -m "feat(search): compact filter section labels and clear-all button"
```

---

## Task 4: ExpandableFilters — chips for accounts and categories

**Files:**
- Modify: `app/components/search/ExpandableFilters.js`
- Modify: `__tests__/components/search/ExpandableFilters.test.js`

- [ ] **Step 1: Update existing tests**

The test `'renders account checkboxes'` and `'calls onFilterChange when account checkbox is pressed'` still test the same behavior, just with chips instead of checkboxes. The test bodies don't need to change — they find by text and fire press, which works for chips too. No test changes needed for this task.

- [ ] **Step 2: Verify tests pass before touching anything**

```bash
npm test -- --silent --testPathPattern="ExpandableFilters"
```

Expected: all pass.

- [ ] **Step 3: Replace accounts checkboxes with chips**

In `app/components/search/ExpandableFilters.js`, replace the entire accounts rendering block:

```jsx
// before
{accounts.map(account => {
  const isSelected = filters.accountIds.includes(account.id);
  return (
    <TouchableOpacity
      key={account.id}
      style={[styles.checkboxItem, { borderBottomColor: colors.border }]}
      onPress={() => toggleAccount(account.id)}
    >
      <Icon
        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={24}
        color={isSelected ? colors.primary : colors.mutedText}
      />
      <Text style={[styles.checkboxLabel, { color: colors.text }]}>
        {account.name}
      </Text>
    </TouchableOpacity>
  );
})}

// after
<View style={styles.chipContainer}>
  {accounts.map(account => {
    const isSelected = filters.accountIds.includes(account.id);
    return (
      <TouchableOpacity
        key={account.id}
        style={[styles.chip, {
          backgroundColor: isSelected ? colors.primary : colors.inputBackground,
          borderColor: colors.border,
        }]}
        onPress={() => toggleAccount(account.id)}
      >
        <Text style={[styles.chipText, { color: isSelected ? '#fff' : colors.text }]}>
          {account.name}
        </Text>
      </TouchableOpacity>
    );
  })}
</View>
```

- [ ] **Step 4: Replace categories checkboxes with chips**

Replace the entire categories rendering block:

```jsx
// before
{categories.filter(c => !c.isShadow).map(category => {
  const isSelected = filters.categoryIds.includes(category.id);
  return (
    <TouchableOpacity
      key={category.id}
      style={[styles.checkboxItem, { borderBottomColor: colors.border }]}
      onPress={() => toggleCategory(category.id)}
    >
      <Icon
        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={24}
        color={isSelected ? colors.primary : colors.mutedText}
      />
      <Icon name={category.icon || 'tag'} size={20} color={colors.text} style={styles.categoryIcon} />
      <Text style={[styles.checkboxLabel, { color: colors.text }]}>
        {category.nameKey ? t(category.nameKey) : category.name}
      </Text>
    </TouchableOpacity>
  );
})}

// after
<View style={styles.chipContainer}>
  {categories.filter(c => !c.isShadow).map(category => {
    const isSelected = filters.categoryIds.includes(category.id);
    return (
      <TouchableOpacity
        key={category.id}
        style={[styles.chip, {
          backgroundColor: isSelected ? colors.primary : colors.inputBackground,
          borderColor: colors.border,
        }]}
        onPress={() => toggleCategory(category.id)}
      >
        <Icon
          name={category.icon || 'tag'}
          size={14}
          color={isSelected ? '#fff' : colors.text}
        />
        <Text style={[styles.chipText, { color: isSelected ? '#fff' : colors.text }]}>
          {category.nameKey ? t(category.nameKey) : category.name}
        </Text>
      </TouchableOpacity>
    );
  })}
</View>
```

- [ ] **Step 5: Remove dead styles**

In the `StyleSheet.create` block, remove `checkboxItem`, `checkboxLabel`, and `categoryIcon` — they are no longer referenced.

- [ ] **Step 6: Run to verify pass**

```bash
npm test -- --silent --testPathPattern="ExpandableFilters"
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/components/search/ExpandableFilters.js
git commit -m "feat(search): replace account/category checkboxes with chips in filter panel"
```

---

## Task 5: ExpandableFilters — fix amount input decimal loss

**Files:**
- Modify: `app/components/search/ExpandableFilters.js`
- Modify: `__tests__/components/search/ExpandableFilters.test.js`

- [ ] **Step 1: Write the failing test**

Add to `__tests__/components/search/ExpandableFilters.test.js`:

```js
describe('Amount range input', () => {
  it('preserves decimal point mid-typing without calling onFilterChange', () => {
    const { getByPlaceholderText } = render(<ExpandableFilters {...defaultProps} />);
    const minInput = getByPlaceholderText('min_amount');

    fireEvent.changeText(minInput, '1.');

    // onFilterChange should NOT be called while still typing
    expect(defaultProps.onFilterChange).not.toHaveBeenCalled();
    // Input should still show '1.'
    expect(minInput.props.value).toBe('1.');
  });

  it('calls onFilterChange with parsed float on blur', () => {
    const { getByPlaceholderText } = render(<ExpandableFilters {...defaultProps} />);
    const minInput = getByPlaceholderText('min_amount');

    fireEvent.changeText(minInput, '1.5');
    fireEvent(minInput, 'blur');

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      amountRange: { min: 1.5, max: null },
    });
  });

  it('calls onFilterChange with null on blur when input cleared', () => {
    const { getByPlaceholderText } = render(
      <ExpandableFilters {...defaultProps} filters={{ ...defaultFilters, amountRange: { min: 5, max: null } }} />,
    );
    const minInput = getByPlaceholderText('min_amount');

    fireEvent.changeText(minInput, '');
    fireEvent(minInput, 'blur');

    expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
      amountRange: { min: null, max: null },
    });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- --silent --testPathPattern="ExpandableFilters"
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Add local string state for amounts**

At the top of the `ExpandableFilters` component body (after the date picker state declarations), add:

```js
const [localMinAmount, setLocalMinAmount] = useState(
  filters.amountRange.min !== null ? String(filters.amountRange.min) : '',
);
const [localMaxAmount, setLocalMaxAmount] = useState(
  filters.amountRange.max !== null ? String(filters.amountRange.max) : '',
);
```

- [ ] **Step 4: Replace both amount TextInputs**

Replace the min `TextInput`:

```jsx
// before
<TextInput
  style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
  value={filters.amountRange.min !== null ? String(filters.amountRange.min) : ''}
  onChangeText={(text) => {
    const value = text === '' ? null : parseFloat(text);
    onFilterChange({ amountRange: { ...filters.amountRange, min: value } });
  }}
  placeholder={t('min_amount')}
  placeholderTextColor={colors.mutedText}
  keyboardType="numeric"
/>

// after
<TextInput
  style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
  value={localMinAmount}
  onChangeText={setLocalMinAmount}
  onBlur={() => {
    const value = localMinAmount === '' ? null : parseFloat(localMinAmount);
    onFilterChange({ amountRange: { ...filters.amountRange, min: isNaN(value) ? null : value } });
  }}
  placeholder={t('min_amount')}
  placeholderTextColor={colors.mutedText}
  keyboardType="numeric"
/>
```

Replace the max `TextInput`:

```jsx
// before
<TextInput
  style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
  value={filters.amountRange.max !== null ? String(filters.amountRange.max) : ''}
  onChangeText={(text) => {
    const value = text === '' ? null : parseFloat(text);
    onFilterChange({ amountRange: { ...filters.amountRange, max: value } });
  }}
  placeholder={t('max_amount')}
  placeholderTextColor={colors.mutedText}
  keyboardType="numeric"
/>

// after
<TextInput
  style={[styles.amountInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
  value={localMaxAmount}
  onChangeText={setLocalMaxAmount}
  onBlur={() => {
    const value = localMaxAmount === '' ? null : parseFloat(localMaxAmount);
    onFilterChange({ amountRange: { ...filters.amountRange, max: isNaN(value) ? null : value } });
  }}
  placeholder={t('max_amount')}
  placeholderTextColor={colors.mutedText}
  keyboardType="numeric"
/>
```

- [ ] **Step 5: Run to verify pass**

```bash
npm test -- --silent --testPathPattern="ExpandableFilters"
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/components/search/ExpandableFilters.js __tests__/components/search/ExpandableFilters.test.js
git commit -m "fix(search): preserve decimal point mid-typing in amount range inputs"
```

---

## Task 6: FilterChipStrip — new component

**Files:**
- Create: `app/components/search/FilterChipStrip.js`
- Create: `__tests__/components/search/FilterChipStrip.test.js`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/search/FilterChipStrip.test.js`:

```js
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FilterChipStrip from '../../../app/components/search/FilterChipStrip';

describe('FilterChipStrip', () => {
  const mockColors = {
    surface: '#1A1A1A',
    primary: '#007AFF',
    border: '#333333',
    text: '#FFFFFF',
  };
  const mockT = (key) => key;

  const emptySearchState = {
    text: '',
    types: [],
    accountIds: [],
    categoryIds: [],
    dateRange: { startDate: null, endDate: null },
    amountRange: { min: null, max: null },
  };

  const defaultProps = {
    searchState: emptySearchState,
    onClearGroup: jest.fn(),
    colors: mockColors,
    t: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no filter groups are active', () => {
    const { toJSON } = render(<FilterChipStrip {...defaultProps} />);
    expect(toJSON()).toBeNull();
  });

  it('renders a chip for active types (single type shows type name)', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, types: ['expense'] }}
      />,
    );
    expect(getByText('expense')).toBeTruthy();
  });

  it('renders "operation_type: N" for multiple active types', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, types: ['expense', 'income'] }}
      />,
    );
    expect(getByText('operation_type: 2')).toBeTruthy();
  });

  it('renders a chip for active date range (both dates)', () => {
    const { getByTestId } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, dateRange: { startDate: '2024-04-01', endDate: '2024-04-30' } }}
      />,
    );
    expect(getByTestId('chip-dateRange')).toBeTruthy();
  });

  it('renders a chip for start date only', () => {
    const { getByTestId } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, dateRange: { startDate: '2024-04-01', endDate: null } }}
      />,
    );
    expect(getByTestId('chip-dateRange')).toBeTruthy();
  });

  it('renders "accounts: N" chip for active accountIds', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, accountIds: ['a1', 'a2'] }}
      />,
    );
    expect(getByText('accounts: 2')).toBeTruthy();
  });

  it('renders "categories: N" chip for active categoryIds', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, categoryIds: ['c1'] }}
      />,
    );
    expect(getByText('categories: 1')).toBeTruthy();
  });

  it('renders "> min" label for min-only amount range', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, amountRange: { min: 50, max: null } }}
      />,
    );
    expect(getByText('> 50')).toBeTruthy();
  });

  it('renders "< max" label for max-only amount range', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, amountRange: { min: null, max: 200 } }}
      />,
    );
    expect(getByText('< 200')).toBeTruthy();
  });

  it('renders "min – max" label for both amount bounds', () => {
    const { getByText } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, amountRange: { min: 50, max: 200 } }}
      />,
    );
    expect(getByText('50 – 200')).toBeTruthy();
  });

  it('calls onClearGroup with "types" when types chip ✕ is pressed', () => {
    const { getByTestId } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, types: ['expense'] }}
      />,
    );
    fireEvent.press(getByTestId('clear-chip-types'));
    expect(defaultProps.onClearGroup).toHaveBeenCalledWith('types');
  });

  it('calls onClearGroup with "accountIds" when accounts chip ✕ is pressed', () => {
    const { getByTestId } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{ ...emptySearchState, accountIds: ['a1'] }}
      />,
    );
    fireEvent.press(getByTestId('clear-chip-accountIds'));
    expect(defaultProps.onClearGroup).toHaveBeenCalledWith('accountIds');
  });

  it('renders multiple chips when multiple groups are active', () => {
    const { getByTestId } = render(
      <FilterChipStrip
        {...defaultProps}
        searchState={{
          ...emptySearchState,
          types: ['expense'],
          accountIds: ['a1'],
          categoryIds: ['c1'],
        }}
      />,
    );
    expect(getByTestId('chip-types')).toBeTruthy();
    expect(getByTestId('chip-accountIds')).toBeTruthy();
    expect(getByTestId('chip-categoryIds')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- --silent --testPathPattern="FilterChipStrip"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `app/components/search/FilterChipStrip.js`:

```js
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import PropTypes from 'prop-types';
import { HORIZONTAL_PADDING } from '../../styles/layout';

const formatDateLabel = (dateRange) => {
  const { startDate, endDate } = dateRange;
  const fmt = (d) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `${fmt(startDate)} –`;
  if (endDate) return `– ${fmt(endDate)}`;
  return null;
};

const formatAmountLabel = (amountRange) => {
  const { min, max } = amountRange;
  if (min !== null && max !== null) return `${min} – ${max}`;
  if (min !== null) return `> ${min}`;
  if (max !== null) return `< ${max}`;
  return null;
};

const FilterChipStrip = ({ searchState, onClearGroup, colors, t }) => {
  const chips = [];

  if (searchState.types.length > 0) {
    const label =
      searchState.types.length === 1
        ? t(searchState.types[0])
        : `${t('operation_type')}: ${searchState.types.length}`;
    chips.push({ key: 'types', label });
  }

  if (searchState.dateRange.startDate || searchState.dateRange.endDate) {
    chips.push({ key: 'dateRange', label: formatDateLabel(searchState.dateRange) });
  }

  if (searchState.amountRange.min !== null || searchState.amountRange.max !== null) {
    chips.push({ key: 'amountRange', label: formatAmountLabel(searchState.amountRange) });
  }

  if (searchState.accountIds.length > 0) {
    chips.push({ key: 'accountIds', label: `${t('accounts')}: ${searchState.accountIds.length}` });
  }

  if (searchState.categoryIds.length > 0) {
    chips.push({
      key: 'categoryIds',
      label: `${t('categories')}: ${searchState.categoryIds.length}`,
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      contentContainerStyle={styles.content}
    >
      {chips.map(({ key, label }) => (
        <View
          key={key}
          testID={`chip-${key}`}
          style={[
            styles.chip,
            { backgroundColor: `${colors.primary}20`, borderColor: colors.primary },
          ]}
        >
          <Text style={[styles.chipText, { color: colors.primary }]}>{label}</Text>
          <TouchableOpacity
            testID={`clear-chip-${key}`}
            onPress={() => onClearGroup(key)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          >
            <Icon name="close" size={13} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
};

FilterChipStrip.propTypes = {
  searchState: PropTypes.shape({
    types: PropTypes.array.isRequired,
    accountIds: PropTypes.array.isRequired,
    categoryIds: PropTypes.array.isRequired,
    dateRange: PropTypes.shape({
      startDate: PropTypes.string,
      endDate: PropTypes.string,
    }).isRequired,
    amountRange: PropTypes.shape({
      min: PropTypes.number,
      max: PropTypes.number,
    }).isRequired,
  }).isRequired,
  onClearGroup: PropTypes.func.isRequired,
  colors: PropTypes.shape({
    surface: PropTypes.string.isRequired,
    primary: PropTypes.string.isRequired,
    border: PropTypes.string.isRequired,
  }).isRequired,
  t: PropTypes.func.isRequired,
};

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  container: {
    borderBottomWidth: 1,
  },
  content: {
    gap: 7,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: 7,
  },
});

export default FilterChipStrip;
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- --silent --testPathPattern="FilterChipStrip"
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/components/search/FilterChipStrip.js __tests__/components/search/FilterChipStrip.test.js
git commit -m "feat(search): add FilterChipStrip component for active filter chips"
```

---

## Task 7: Header — render FilterChipStrip

**Files:**
- Modify: `app/components/Header.js`

> Header tests live in `__tests__/components/Header.test.js` and `__tests__/components/Header-rightContent.test.js`. Check they still pass after this task — no new tests required since FilterChipStrip is already covered by its own test suite and the logic here is a simple conditional render.

- [ ] **Step 1: Verify Header tests pass before touching anything**

```bash
npm test -- --silent --testPathPattern="Header"
```

Expected: all pass.

- [ ] **Step 2: Add imports to Header.js**

At the top of `app/components/Header.js`, add:

```js
import FilterChipStrip from './search/FilterChipStrip';
```

Also destructure `updateSearchFilters` from `useOperationsActions` (it's already imported):

```js
// find this line:
const { setSearchText } = useOperationsActions();

// change to:
const { setSearchText, updateSearchFilters } = useOperationsActions();
```

- [ ] **Step 3: Add handleClearFilterGroup**

Inside the `Header` function body, after `handleToggleFilters`, add:

```js
const handleClearFilterGroup = useCallback((groupKey) => {
  const clearValues = {
    types: { types: [] },
    dateRange: { dateRange: { startDate: null, endDate: null } },
    amountRange: { amountRange: { min: null, max: null } },
    accountIds: { accountIds: [] },
    categoryIds: { categoryIds: [] },
  };
  updateSearchFilters(clearValues[groupKey]);
}, [updateSearchFilters]);
```

- [ ] **Step 4: Wrap the search-mode branch in a column container and add the chip strip**

The outer `<View style={[styles.container, ...]}>` is currently `flexDirection: 'row'`. When search is open, we need a column layout so SearchBar and FilterChipStrip stack vertically.

Replace the return statement's outer View and the `searchMode === 'open'` branch:

```jsx
return (
  <View
    style={[
      styles.container,
      { backgroundColor: colors.background, borderBottomColor: colors.border },
      searchMode === 'open' && styles.containerSearchMode,
    ]}
  >
    {searchMode === 'open' ? (
      <>
        <SearchBar
          searchText={searchState?.text || ''}
          onSearchTextChange={setSearchText}
          onToggleFilters={handleToggleFilters}
          onClose={handleCloseSearch}
          filterCount={getSearchFilterCount ? getSearchFilterCount() : 0}
          colors={colors}
          t={t}
        />
        {hasActiveSearch && (
          <FilterChipStrip
            searchState={searchState}
            onClearGroup={handleClearFilterGroup}
            colors={colors}
            t={t}
          />
        )}
      </>
    ) : (
      // ... existing non-search content unchanged ...
    )}
  </View>
);
```

- [ ] **Step 5: Add `containerSearchMode` style**

In the `StyleSheet.create` block of `Header.js`, add:

```js
containerSearchMode: {
  alignItems: 'stretch',
  flexDirection: 'column',
  paddingHorizontal: 0,
},
```

(`SearchBar` and `FilterChipStrip` each handle their own `paddingHorizontal` via `HORIZONTAL_PADDING`.)

- [ ] **Step 6: Run all tests**

```bash
npm test -- --silent
```

Expected: all tests pass. If any Header tests fail due to the layout change, update them to reflect the new structure.

- [ ] **Step 7: Commit**

```bash
git add app/components/Header.js
git commit -m "feat(search): render FilterChipStrip in header when search open with active filters"
```

---

## Task 8: Full test run + cleanup

- [ ] **Step 1: Run the full suite**

```bash
npm test -- --silent
```

Expected: 0 failed tests.

- [ ] **Step 2: If any failures, fix them before proceeding**

Common causes: Header layout tests checking `flexDirection` or `paddingHorizontal` on the container. Update assertions to match the new conditional style.

- [ ] **Step 3: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "test: fix header layout test assertions for search mode column layout"
```
