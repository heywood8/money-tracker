// __tests__/screens/BudgetScreen.test.js
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

jest.mock('../../app/contexts/AccountsDataContext', () => {
  const accountsValue = {
    accounts: [
      { id: 'a1', name: 'Ameria', currency: 'AMD' },
      { id: 'a2', name: 'Tinkoff', currency: 'RUB' },
    ],
  };
  return { useAccountsData: () => accountsValue };
});

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

let capturedModalProps = null;
jest.mock('../../app/modals/BudgetModal', () => {
  return function MockBudgetModal(props) {
    capturedModalProps = props;
    return null;
  };
});

jest.mock('../../app/components/BudgetProgressBar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockBudgetProgressBar({ budgetId }) {
    return React.createElement(View, { testID: `progress-${budgetId}` });
  };
});

jest.mock('../../app/components/AddFAB', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function MockAddFAB({ onPress, testID }) {
    return React.createElement(Pressable, { onPress, testID },
      React.createElement(Text, {}, '+'));
  };
});

jest.mock('../../app/components/ModalBlurOverlay', () => () => null);

jest.mock('@quidone/react-native-wheel-picker', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: function MockWheelPicker() {
      return React.createElement('WheelPicker', null);
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────
const makeStatus = (overrides = {}) => ({
  budgetId: 'b1',
  amount: '3000',
  currency: 'AMD',
  spent: '1000',
  remaining: '2000',
  percentage: 33.33,
  isExceeded: false,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
  status: 'safe',
  ...overrides,
});

const makeBudget = (overrides = {}) => ({
  id: 'b1',
  categoryId: 'cat1',
  amount: '3000',
  currency: 'AMD',
  periodType: 'monthly',
  startDate: '2026-01-01',
  endDate: null,
  isRecurring: true,
  rolloverEnabled: false,
  ...overrides,
});

const setBudgetsData = ({ budgets = [], statuses = [], loading = false, convertAll = true } = {}) => {
  mockBudgetsData = {
    budgets,
    budgetStatuses: new Map(statuses.map(s => [s.budgetId, s])),
    loading,
    convertAllBudgets: convertAll,
    setConvertAllBudgets: mockSetConvertAll,
  };
};

// ── Tests ──────────────────────────────────────────────────────────────────
describe('BudgetScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedModalProps = null;
    setBudgetsData();
  });

  describe('Rendering', () => {
    it('shows the empty state when there are no budgets', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-empty-state')).toBeTruthy());
    });

    it('shows a loading view while budgets load', async () => {
      setBudgetsData({ loading: true });
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      expect(getByTestId('budget-screen-loading')).toBeTruthy();
      expect(queryByTestId('budget-screen')).toBeNull();
    });

    it('renders a row with the category name and progress bar for each budget', async () => {
      setBudgetsData({ budgets: [makeBudget()], statuses: [makeStatus()] });
      const { getByText, getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByText('Food')).toBeTruthy());
      expect(getByTestId('progress-b1')).toBeTruthy();
    });

    it('renders converted grand totals when convert-all is on', async () => {
      setBudgetsData({
        budgets: [makeBudget(), makeBudget({ id: 'b2', categoryId: 'cat2', currency: 'RUB' })],
        statuses: [makeStatus(), makeStatus({ budgetId: 'b2', currency: 'RUB', amount: '400', spent: '100' })],
      });
      const { getByText } = await render(<BudgetScreen />);
      // 3000 AMD + 400 RUB * 5 = 5000 AMD budgeted; 1000 + 100 * 5 = 1500 spent
      await waitFor(() => expect(getByText(/total_budgeted:.*5[\s,.]?000/)).toBeTruthy());
      expect(getByText(/total_spent:.*1[\s,.]?500/)).toBeTruthy();
    });

    it('renders per-currency totals when convert-all is off', async () => {
      setBudgetsData({
        convertAll: false,
        budgets: [makeBudget(), makeBudget({ id: 'b2', categoryId: 'cat2', currency: 'RUB' })],
        statuses: [makeStatus(), makeStatus({ budgetId: 'b2', currency: 'RUB', amount: '400', spent: '100' })],
      });
      const { getAllByText } = await render(<BudgetScreen />);
      await waitFor(() => expect(getAllByText(/total_budgeted/)).toHaveLength(2));
    });

    it('warns about budget currencies that cannot be converted', async () => {
      // A budget in a currency with no rate to the selected currency (the mocked
      // rate map only knows RUB) is dropped from the totals and surfaced as a
      // warning — derived from the budget's own currency, not account currencies.
      setBudgetsData({
        budgets: [makeBudget({ id: 'bx', currency: 'XYZ' })],
        statuses: [makeStatus({ budgetId: 'bx', currency: 'XYZ' })],
      });
      const { getByTestId, getByText } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-unconverted-warning')).toBeTruthy());
      expect(getByText(/XYZ/)).toBeTruthy();
    });
  });

  describe('Convert toggle', () => {
    it('flips the convert-all mode via the context setter', async () => {
      setBudgetsData({ budgets: [makeBudget()], statuses: [makeStatus()] });
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-convert-toggle')).toBeTruthy());
      fireEvent.press(getByTestId('budget-convert-toggle'));
      expect(mockSetConvertAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('Budget creation and editing', () => {
    it('opens the category picker with expense categories only from the FAB', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      fireEvent.press(getByTestId('budget-add-fab'));
      await waitFor(() => expect(getByTestId('budget-category-option-cat1')).toBeTruthy());
      expect(getByTestId('budget-category-option-cat2')).toBeTruthy();
      expect(queryByTestId('budget-category-option-cat3')).toBeNull(); // income category excluded
    });

    it('opens BudgetModal in create mode after picking a category', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      fireEvent.press(getByTestId('budget-add-fab'));
      await waitFor(() => expect(getByTestId('budget-category-option-cat1')).toBeTruthy());
      fireEvent.press(getByTestId('budget-category-option-cat1'));
      await waitFor(() => expect(capturedModalProps.visible).toBe(true));
      expect(capturedModalProps.isNew).toBe(true);
      expect(capturedModalProps.categoryId).toBe('cat1');
      expect(capturedModalProps.categoryName).toBe('Food');
    });

    it('opens BudgetModal in edit mode when a budget row is tapped', async () => {
      const budget = makeBudget();
      setBudgetsData({ budgets: [budget], statuses: [makeStatus()] });
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-row-b1')).toBeTruthy());
      fireEvent.press(getByTestId('budget-row-b1'));
      await waitFor(() => expect(capturedModalProps.visible).toBe(true));
      expect(capturedModalProps.isNew).toBe(false);
      expect(capturedModalProps.budget).toBe(budget);
      expect(capturedModalProps.categoryName).toBe('Food');
    });
  });
});
