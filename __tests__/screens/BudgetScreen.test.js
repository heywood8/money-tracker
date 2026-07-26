// __tests__/screens/BudgetScreen.test.js
/* eslint-disable react/prop-types */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BudgetScreen from '../../app/screens/BudgetScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
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
    },
  }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));

const mockSetConvertAll = jest.fn();
let mockBudgetsData;
jest.mock('../../app/contexts/BudgetsDataContext', () => ({
  useBudgetsData: () => mockBudgetsData,
}));

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
// ref), so the mock must be one too. It also exposes a button that fires the
// host's onNotify, which is how row-level execution feedback reaches the
// screen's Snackbar.
const mockOpenAddLine = jest.fn();
let capturedSectionProps = null;
jest.mock('../../app/components/budgets/MonthlyPlanSection', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return React.forwardRef(function MockMonthlyPlanSection(props, ref) {
    capturedSectionProps = props;
    React.useImperativeHandle(ref, () => ({ openAddLine: mockOpenAddLine }));
    return React.createElement(View, { testID: 'monthly-plan-section' },
      React.createElement(Pressable, {
        testID: 'mock-notify',
        onPress: () => props.onNotify?.('added_to_operations'),
      }, React.createElement(Text, {}, 'notify')));
  });
});

// The native wheel renders nothing under Jest, so stand in a tappable row per
// option — that is the only way a test can drive the selection the way a user does.
jest.mock('@quidone/react-native-wheel-picker', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: function MockWheelPicker({ data = [], onValueChanged }) {
      return React.createElement(
        View,
        { testID: 'currency-wheel' },
        data.map((item) => React.createElement(Pressable, {
          key: item.value,
          testID: `currency-option-${item.value}`,
          onPress: () => onValueChanged?.({ item }),
        })),
      );
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────
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
      expect(getByTestId('budget-prev-month')).toBeTruthy();
      expect(getByTestId('budget-next-month')).toBeTruthy();
    });

    it('does not show a jump-to-current-month affordance while viewing the current month', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-header')).toBeTruthy());
      expect(queryByTestId('budget-jump-current')).toBeNull();
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
      await waitFor(() => expect(getByTestId('currency-option-RUB')).toBeTruthy());
      fireEvent.press(getByTestId('currency-option-RUB'));
      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));
    });

    // Regression: the init effect only re-seeded when accounts went empty, so a
    // selection whose last account was deleted survived — and since the wheel is
    // only rendered while currencyItems.length > 1, deleting down to one currency
    // took away the only control that could have corrected it. The stale value kept
    // flowing into MonthlyPlanSection as the currency of any plan it creates.
    it('re-seeds when the selected currency loses its last account', async () => {
      const { getByTestId, queryByTestId, rerender } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('currency-option-RUB')).toBeTruthy());
      fireEvent.press(getByTestId('currency-option-RUB'));
      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));

      setAccounts([{ id: 'a1', name: 'Ameria', currency: 'AMD' }]);
      await rerender(<BudgetScreen />);

      await waitFor(() => expect(capturedSectionProps.currency).toBe('AMD'));
      // And the wheel really is gone, which is what made this unrecoverable.
      expect(queryByTestId('currency-option-RUB')).toBeNull();
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
      await waitFor(() => expect(getByTestId('currency-option-RUB')).toBeTruthy());
      fireEvent.press(getByTestId('currency-option-RUB'));
      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));

      setAccounts([
        { id: 'a2', name: 'Tinkoff', currency: 'RUB' },
        { id: 'a3', name: 'Other', currency: 'USD' },
      ]);
      await rerender(<BudgetScreen />);

      await waitFor(() => expect(capturedSectionProps.currency).toBe('RUB'));
    });
  });

  describe('Convert toggle', () => {
    it('flips the convert-all mode via the context setter', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-convert-toggle')).toBeTruthy());
      fireEvent.press(getByTestId('budget-convert-toggle'));
      expect(mockSetConvertAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('Month navigation (Fix 4: jump back to the current month)', () => {
    it('shows a jump-to-current-month affordance after navigating away, and returns on press', async () => {
      const { getByTestId, queryByTestId, getByText } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-header')).toBeTruthy());
      const originalLabel = getByTestId('budget-month-label').props.children;

      fireEvent.press(getByTestId('budget-prev-month'));
      await waitFor(() => expect(getByTestId('budget-jump-current')).toBeTruthy());
      // The month label actually changed away from the current month.
      expect(getByTestId('budget-month-label').props.children).not.toBe(originalLabel);
      expect(getByText('jump_to_current_period')).toBeTruthy();

      fireEvent.press(getByTestId('budget-jump-current'));
      await waitFor(() => expect(queryByTestId('budget-jump-current')).toBeNull());
      expect(getByTestId('budget-month-label').props.children).toBe(originalLabel);
    });

    it('drives the list month from the shared header', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(capturedSectionProps).toBeTruthy());
      const initialMonth = capturedSectionProps.month;
      fireEvent.press(getByTestId('budget-prev-month'));
      await waitFor(() => expect(capturedSectionProps.month).not.toBe(initialMonth));
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

  describe('Execution feedback (Budgets v3 phase 3)', () => {
    // Executing a template happens on a row inside the list, but the Snackbar
    // belongs at the screen's bottom edge — the list reports through onNotify.
    it('surfaces the message a row reports through onNotify', async () => {
      const { getByTestId, queryByText, getByText } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('mock-notify')).toBeTruthy());
      expect(queryByText('added_to_operations')).toBeNull();
      fireEvent.press(getByTestId('mock-notify'));
      await waitFor(() => expect(getByText('added_to_operations')).toBeTruthy());
    });
  });
});
