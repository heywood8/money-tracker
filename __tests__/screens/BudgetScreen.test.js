// __tests__/screens/BudgetScreen.test.js
/* eslint-disable react/prop-types */
import React from 'react';
import { act, render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import BudgetScreen from '../../app/screens/BudgetScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────
const COLORS = {
  background: '#111318',
  surface: '#1a1d24',
  card: '#1a1d24',
  text: '#e8eaf0',
  mutedText: '#7a7f8e',
  border: '#252830',
  primary: '#4A90D9',
  selected: '#2a2e38',
  altRow: '#16191f',
  income: '#4caf50',
  expense: '#f44336',
  transfer: '#2196f3',
  overspend: '#FF6B6B',
  scrim: 'rgba(0,0,0,0.32)',
  glassSurfaceStrong: 'rgba(120,120,120,0.12)',
};

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({ colors: COLORS }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));

const mockSetConvertAll = jest.fn();
let mockBudgetsData;
// The display currency lives in BudgetsDataContext now (the plan statuses have
// to be recomputed in it), so the mock has to behave like real state rather than
// a frozen value — the screen seeds it from the accounts and the header chip
// writes to it, and both have to re-render the screen.
jest.mock('../../app/contexts/BudgetsDataContext', () => {
  const ReactModule = require('react');
  return {
    useBudgetsData: () => {
      const [displayCurrency, setDisplayCurrency] = ReactModule.useState('');
      return { ...mockBudgetsData, displayCurrency, setDisplayCurrency };
    },
  };
});

// Context values must be referentially stable across renders (the real
// providers memoize them): a fresh accounts array on every render gives the
// screen's `currencies` memo a new identity each time, re-firing the
// unconvertible-currencies effect in an infinite loop.
jest.mock('../../app/contexts/CategoriesContext', () => {
  const categoriesValue = {
    categories: [
      { id: 'cat1', name: 'Food', icon: 'food', categoryType: 'expense' },
      { id: 'cat2', name: 'Transport', icon: 'bus', categoryType: 'expense' },
      { id: 'cat3', name: 'Salary', icon: 'cash', categoryType: 'income' },
    ],
  };
  return { useCategories: () => categoriesValue };
});

// Same stability contract as above, but settable: the currency-reset tests need
// to delete an account between renders. setAccounts() installs one new stable
// object; re-renders in between keep handing back that same identity.
let mockAccountsValue;
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => mockAccountsValue,
}));

jest.mock('../../app/services/OperationsDB', () => ({
  fetchRatesToTarget: jest.fn(async () => new Map([['RUB', '5']])),
  convertWithRateMap: jest.fn((amount, from, target, map) => {
    if (from === target) return amount;
    const rate = map.get(from);
    if (!rate) return null;
    return String(parseFloat(amount) * parseFloat(rate));
  }),
  getUnconvertibleCurrencies: jest.fn(async () => []),
}));

jest.mock('../../app/components/AddFAB', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function MockAddFAB({ onPress, testID }) {
    return React.createElement(Pressable, { onPress, testID },
      React.createElement(Text, {}, '+'));
  };
});

jest.mock('../../app/components/ModalBlurOverlay', () => () => null);

// The unified budgets list has its own dedicated test suite; stub it here so the
// screen-level tests stay focused and don't need the plan contexts. It's a
// forwardRef component (BudgetScreen's FAB opens its "add allocation" flow via
// ref), so the mock must be one too.
const mockOpenAddLine = jest.fn();
let capturedSectionProps = null;
jest.mock('../../app/components/budgets/MonthlyPlanSection', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return React.forwardRef(function MockMonthlyPlanSection(props, ref) {
    capturedSectionProps = props;
    React.useImperativeHandle(ref, () => ({ openAddLine: mockOpenAddLine }));
    return React.createElement(View, { testID: 'monthly-plan-section' },
      // The section reports the month's remainder up so the header can print it
      // — the figure a person acts on belongs where it is always on screen, not
      // at the bottom of a long scrolling card.
      React.createElement(Pressable, {
        testID: 'mock-report-remainder',
        onPress: () => props.onTotalsChange?.({
          remainder: '-85745', hasIncomeBasis: true, currency: 'AMD',
        }),
      }, React.createElement(Text, {}, 'report')),
      React.createElement(Pressable, {
        testID: 'mock-report-no-income',
        onPress: () => props.onTotalsChange?.({
          remainder: '0', hasIncomeBasis: false, currency: 'AMD',
        }),
      }, React.createElement(Text, {}, 'report none')));
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

// Currency is picked from the header chip's bottom sheet now — a row per
// currency, not a wheel parked over the list and not a dialog whose action
// buttons were the currencies.
// Both presses are awaited: the chip's press is what mounts the sheet, so the
// option it contains does not exist until that render has been flushed.
const pickCurrency = async (getByTestId, code) => {
  await fireEvent.press(getByTestId('budget-month-currency-chip'));
  await fireEvent.press(getByTestId(`budget-currency-option-${code}`));
};

// Every testID in the rendered tree, in the order it is laid out. `toJSON()`
// carries fiber back-references, so it cannot simply be stringified.
const collectTestIDs = (node, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(child => collectTestIDs(child, out));
    return out;
  }
  if (node.props?.testID) out.push(node.props.testID);
  (node.children || []).forEach(child => collectTestIDs(child, out));
  return out;
};

const setBudgetsData = ({ loading = false, convertAll = true } = {}) => {
  mockBudgetsData = {
    loading,
    convertAllBudgets: convertAll,
    setConvertAllBudgets: mockSetConvertAll,
  };
};

const DEFAULT_ACCOUNTS = [
  { id: 'a1', name: 'Ameria', currency: 'AMD' },
  { id: 'a2', name: 'Tinkoff', currency: 'RUB' },
];

const setAccounts = (accounts = DEFAULT_ACCOUNTS) => {
  mockAccountsValue = { accounts };
};

// ── Tests ──────────────────────────────────────────────────────────────────
describe('BudgetScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedSectionProps = null;
    setBudgetsData();
    setAccounts();
  });

  describe('Rendering', () => {
    // Budgets v3 collapsed the per-category budgets list, the monthly plan and
    // the Planned tab into one month-scoped list, so the screen is now a thin
    // host: month header, currency controls, FAB and Snackbar around it.
    it('renders the unified budgets list', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('monthly-plan-section')).toBeTruthy());
    });

    it('shows a loading view while budgets load', async () => {
      setBudgetsData({ loading: true });
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      expect(getByTestId('budget-screen-loading')).toBeTruthy();
      expect(queryByTestId('budget-screen')).toBeNull();
    });

    it('renders a single shared month header', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-header')).toBeTruthy());
      expect(getByTestId('budget-month-prev')).toBeTruthy();
      expect(getByTestId('budget-month-next')).toBeTruthy();
    });

    // Month and currency are one pair on one line, between the two arrows —
    // the header has no second row for the currency to sit on.
    it('renders the currency beside the month name, between the arrows', async () => {
      const { getByTestId, toJSON } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-currency-chip')).toBeTruthy());

      const rendered = collectTestIDs(toJSON());
      const order = ['budget-month-prev', 'budget-month-label', 'budget-month-currency-chip',
        'budget-month-next'].map(id => rendered.indexOf(id));

      expect(order.every(i => i >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    // The remainder is the month's figure, not part of the scope statement: it
    // lives in the body and scrolls under the header, which is the same glass
    // overlay the Graphs tab wears and must stay the same height on both.
    it('keeps the remainder figure in the body, out of the header', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-remainder')).toBeTruthy());

      expect(within(getByTestId('budget-month-header')).queryByTestId('budget-remainder')).toBeNull();
    });

    // The header floats over the list, so nothing but this padding keeps the
    // first row out from under the glass — and the header's height is not a
    // constant (a large font scale makes its one line taller).
    it('pads the list top by the height the header reports', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-surface')).toBeTruthy());

      await act(async () => {
        fireEvent(getByTestId('budget-month-surface'), 'layout', {
          nativeEvent: { layout: { height: 100 } },
        });
      });

      const padding = StyleSheet.flatten(
        getByTestId('budget-plan-list').props.contentContainerStyle,
      );
      expect(padding.paddingTop).toBe(112); // 100 measured + SPACING.md
    });

    it('does not show a jump-to-current-month affordance while viewing the current month', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-header')).toBeTruthy());
      expect(queryByTestId('budget-month-jump-current')).toBeNull();
    });

    it('passes expense and income categories to the list (income lines need income categories)', async () => {
      await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps).toBeTruthy());
      expect(capturedSectionProps.expenseCategories.map(c => c.id)).toEqual(['cat1', 'cat2']);
      expect(capturedSectionProps.incomeCategories.map(c => c.id)).toEqual(['cat3']);
    });
  });

  describe('Currency selection', () => {
    it('seeds the selection from the first account', async () => {
      await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps?.currency).toBe('AMD'));
    });

    it('hands the picked currency down to the list', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-currency-chip')).toBeTruthy());
      await pickCurrency(getByTestId, 'RUB');
      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));
    });

    // Regression: the init effect only re-seeded when accounts went empty, so a
    // selection whose last account was deleted survived — and since the picker is
    // only offered while there is more than one currency, deleting down to one
    // took away the only control that could have corrected it. The stale value kept
    // flowing into MonthlyPlanSection as the currency of any plan it creates.
    it('re-seeds when the selected currency loses its last account', async () => {
      const { getByTestId, queryByTestId, rerender } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-currency-chip')).toBeTruthy());
      await pickCurrency(getByTestId, 'RUB');
      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));

      setAccounts([{ id: 'a1', name: 'Ameria', currency: 'AMD' }]);
      await rerender(<BudgetScreen />);

      await waitFor(() => expect(capturedSectionProps.currency).toBe('AMD'));
      // And the picker really is gone, which is what made this unrecoverable.
      expect(queryByTestId('budget-month-currency-chip')).toBeNull();
    });

    it('clears the selection when the last account of any kind is deleted', async () => {
      const { rerender } = await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps?.currency).toBe('AMD'));

      setAccounts([]);
      await rerender(<BudgetScreen />);

      await waitFor(() => expect(capturedSectionProps.currency).toBe(''));
    });

    it('leaves a still-valid selection alone when an unrelated account is deleted', async () => {
      const { getByTestId, rerender } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-currency-chip')).toBeTruthy());
      await pickCurrency(getByTestId, 'RUB');
      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));

      setAccounts([
        { id: 'a2', name: 'Tinkoff', currency: 'RUB' },
        { id: 'a3', name: 'Other', currency: 'USD' },
      ]);
      await rerender(<BudgetScreen />);

      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));
    });
  });

  describe('Header remainder', () => {
    it('prints the remainder reported by the list', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('mock-report-remainder')).toBeTruthy());
      fireEvent.press(getByTestId('mock-report-remainder'));
      // Trimmed of an all-zero decimal part, and with no currency code: the
      // header names the unit and printing it again here would say "AMD"
      // twice on one screen.
      await waitFor(() => expect(getByTestId('budget-remainder')).toHaveTextContent('-85745'));
      expect(getByTestId('budget-remainder')).not.toHaveTextContent('AMD');
      expect(within(getByTestId('budget-month-currency-chip')).getByText('AMD')).toBeTruthy();
    });

    it('keeps the currency code on the hero when there is no chip to carry it', async () => {
      // One account currency means no picker — and then the hero is the only
      // place the screen names its unit at all.
      setAccounts([{ id: 'a1', name: 'Ameria', currency: 'AMD' }]);
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('mock-report-remainder')).toBeTruthy());
      fireEvent.press(getByTestId('mock-report-remainder'));
      await waitFor(() => expect(getByTestId('budget-remainder')).toHaveTextContent('-85745 AMD'));
      expect(queryByTestId('budget-month-currency-chip')).toBeNull();
    });

    it('replaces a negative remainder with the overspend colour', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('mock-report-remainder')).toBeTruthy());
      fireEvent.press(getByTestId('mock-report-remainder'));
      await waitFor(() => expect(getByTestId('budget-remainder')).toBeTruthy());
      expect(StyleSheet.flatten(getByTestId('budget-remainder').props.style).color)
        .toBe(COLORS.overspend);
    });

    it('shows the add-income prompt instead of a figure when no income is declared', async () => {
      const { getByTestId, queryByTestId, getByText } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('mock-report-no-income')).toBeTruthy());
      fireEvent.press(getByTestId('mock-report-no-income'));
      // With nothing to allocate FROM, the remainder degenerates into "minus
      // everything you planned" — a number in alarm red is worse than a prompt.
      await waitFor(() => expect(getByText('add_income_for_remainder')).toBeTruthy());
      expect(queryByTestId('budget-remainder')).toBeNull();
    });
  });

  describe('Convert toggle', () => {
    // It lives inside the currency sheet: what it converts *to* is the currency
    // picked there, and with a single account currency there is nothing to
    // convert at all.
    it('flips the convert-all mode via the context setter', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-currency-chip')).toBeTruthy());
      await fireEvent.press(getByTestId('budget-month-currency-chip'));

      await fireEvent.press(getByTestId('budget-currency-convert'));

      expect(mockSetConvertAll).toHaveBeenCalledTimes(1);
    });

    it('keeps the sheet open when the toggle is flipped', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-currency-chip')).toBeTruthy());
      await fireEvent.press(getByTestId('budget-month-currency-chip'));

      await fireEvent.press(getByTestId('budget-currency-convert'));

      // A setting, not a choice: dismissing on it would cost the user the sheet
      // they opened to change the currency.
      expect(queryByTestId('budget-currency-option-RUB')).toBeTruthy();
    });
  });

  describe('Month navigation (Fix 4: jump back to the current month)', () => {
    it('shows a jump-to-current-month affordance after navigating away, and returns on press', async () => {
      const { getByTestId, queryByTestId, queryByText } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-header')).toBeTruthy());
      const originalLabel = getByTestId('budget-month-label').props.children;

      fireEvent.press(getByTestId('budget-month-prev'));
      await waitFor(() => expect(getByTestId('budget-month-jump-current')).toBeTruthy());
      // The month label actually changed away from the current month.
      expect(getByTestId('budget-month-label').props.children).not.toBe(originalLabel);
      // Icon-only, beside the label: the labelled button used to occupy a row of
      // its own and pushed the hero figure and the whole plan down on any month
      // but this one. The wording survives as the accessibility label.
      expect(queryByText('jump_to_current_period')).toBeNull();
      expect(getByTestId('budget-month-jump-current').props.accessibilityLabel).toBe('jump_to_current_period');

      fireEvent.press(getByTestId('budget-month-jump-current'));
      await waitFor(() => expect(queryByTestId('budget-month-jump-current')).toBeNull());
      expect(getByTestId('budget-month-label').props.children).toBe(originalLabel);
    });

    it('drives the list month from the shared header', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps).toBeTruthy());
      const initialMonth = capturedSectionProps.month;
      fireEvent.press(getByTestId('budget-month-prev'));
      await waitFor(() => expect(capturedSectionProps.month).not.toBe(initialMonth));
    });
  });

  // The arrows are a stepper — right for the neighbouring month, wrong for one
  // half a year off, which took a tap per month travelled with the whole plan
  // re-rendering on the way past. The month name is the tap target for a grid
  // of the year's twelve.
  describe('Month picker', () => {
    it('opens a month grid from the month name', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-picker')).toBeTruthy());
      expect(queryByTestId('budget-month-picker-year')).toBeNull();

      fireEvent.press(getByTestId('budget-month-picker'));

      await waitFor(() => expect(getByTestId('budget-month-picker-year')).toBeTruthy());
      // Seeded on the scoped month's own year, with its cell marked.
      const month = capturedSectionProps.month;
      expect(getByTestId(`budget-month-picker-month-${month}`).props.accessibilityState.selected)
        .toBe(true);
    });

    it('scopes the screen to the picked month and closes the sheet', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps).toBeTruthy());
      const initialMonth = capturedSectionProps.month;
      const initialLabel = getByTestId('budget-month-label').props.children;
      const year = initialMonth.split('-')[0];
      // A month the stepper would need several taps to reach.
      const target = initialMonth.endsWith('-01') ? `${year}-09` : `${year}-01`;

      fireEvent.press(getByTestId('budget-month-picker'));
      await waitFor(() => expect(getByTestId(`budget-month-picker-month-${target}`)).toBeTruthy());
      fireEvent.press(getByTestId(`budget-month-picker-month-${target}`));

      await waitFor(() => expect(capturedSectionProps.month).toBe(target));
      expect(getByTestId('budget-month-label').props.children).not.toBe(initialLabel);
      expect(queryByTestId('budget-month-picker-year')).toBeNull();
      // Off the current month, so the jump-back affordance comes up as it does
      // for the arrows.
      expect(getByTestId('budget-month-jump-current')).toBeTruthy();
    });

    it('travels across years from the grid', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps).toBeTruthy());
      const year = Number(capturedSectionProps.month.split('-')[0]);

      fireEvent.press(getByTestId('budget-month-picker'));
      await waitFor(() => expect(getByTestId('budget-month-picker-prev-year')).toBeTruthy());
      fireEvent.press(getByTestId('budget-month-picker-prev-year'));
      await waitFor(() => expect(getByTestId(`budget-month-picker-month-${year - 1}-12`)).toBeTruthy());
      fireEvent.press(getByTestId(`budget-month-picker-month-${year - 1}-12`));

      await waitFor(() => expect(capturedSectionProps.month).toBe(`${year - 1}-12`));
    });

    // A tap that changes nothing must not send the plan through the month
    // transition, so re-picking the scoped month has to return the very same
    // state object rather than an equal one.
    it('leaves the month alone when the one already on screen is picked', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps).toBeTruthy());
      const month = capturedSectionProps.month;
      const label = getByTestId('budget-month-label').props.children;

      fireEvent.press(getByTestId('budget-month-picker'));
      await waitFor(() => expect(getByTestId(`budget-month-picker-month-${month}`)).toBeTruthy());
      fireEvent.press(getByTestId(`budget-month-picker-month-${month}`));

      await waitFor(() => expect(queryByTestId('budget-month-picker-year')).toBeNull());
      expect(capturedSectionProps.month).toBe(month);
      expect(getByTestId('budget-month-label').props.children).toBe(label);
      // Still the current month, so no jump-back affordance appeared.
      expect(queryByTestId('budget-month-jump-current')).toBeNull();
    });
  });

  describe('Allocation creation (Budgets v3 phase 2)', () => {
    // The old category-picker + BudgetModal flow is gone; the FAB now opens
    // MonthlyPlanSection's own "add allocation" flow via a ref, so it needs no
    // screen-level modal state of its own.
    it('opens the add-allocation flow of the unified list from the FAB', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-add-fab')).toBeTruthy());
      fireEvent.press(getByTestId('budget-add-fab'));
      expect(mockOpenAddLine).toHaveBeenCalledTimes(1);
    });
  });

  // The screen's Snackbar existed solely to report a row's execution ("added to
  // operations"). Executing a budget line is gone, so the screen hands the list
  // no notify channel at all.
  describe('Retired execution feedback', () => {
    it('passes no onNotify to the plan list', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('monthly-plan-section')).toBeTruthy());
      expect(capturedSectionProps.onNotify).toBeUndefined();
    });
  });
});
