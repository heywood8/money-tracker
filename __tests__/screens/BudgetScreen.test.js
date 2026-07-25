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

const mockShowDialog = jest.fn();
jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));

// Planned-operations context: mechanics stay in the standalone context; the
// merged screen hosts the list + execution UI. Configurable per test.
const mockExecute = jest.fn(async () => {});
const mockMarkExecuted = jest.fn(async () => {});
const mockUpdatePlanned = jest.fn(async () => {});
const mockDeletePlanned = jest.fn(async () => {});
let mockPlannedOperations = [];
jest.mock('../../app/contexts/PlannedOperationsContext', () => ({
  usePlannedOperations: () => ({
    plannedOperations: mockPlannedOperations,
    executePlannedOperation: mockExecute,
    markPlannedOperationExecuted: mockMarkExecuted,
    updatePlannedOperation: mockUpdatePlanned,
    deletePlannedOperation: mockDeletePlanned,
    // A planned op counts as done this month when it carries a lastExecutedMonth.
    isExecutedThisMonth: (op) => op.lastExecutedMonth != null,
  }),
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

let capturedPlannedModalProps = null;
jest.mock('../../app/modals/PlannedOperationModal', () => {
  return function MockPlannedOperationModal(props) {
    capturedPlannedModalProps = props;
    return null;
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

// The monthly plan section has its own dedicated test suite; stub it here so the
// screen-level tests stay focused and don't need the plan contexts. It's a
// forwardRef component (BudgetScreen's FAB opens its "add allocation" flow via
// ref), so the mock must be one too.
const mockOpenAddLine = jest.fn();
jest.mock('../../app/components/budgets/MonthlyPlanSection', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(function MockMonthlyPlanSection(props, ref) {
    React.useImperativeHandle(ref, () => ({ openAddLine: mockOpenAddLine }));
    return React.createElement(View, { testID: 'monthly-plan-section' });
  });
});

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
const makePlanned = (overrides = {}) => ({
  id: 'p1',
  name: 'Salary',
  type: 'income',
  amount: '1000',
  accountId: 'a1',
  categoryId: 'cat3',
  toAccountId: null,
  isRecurring: true,
  lastExecutedMonth: null,
  ...overrides,
});

const setBudgetsData = ({ loading = false, convertAll = true } = {}) => {
  mockBudgetsData = {
    loading,
    convertAllBudgets: convertAll,
    setConvertAllBudgets: mockSetConvertAll,
  };
};

// ── Tests ──────────────────────────────────────────────────────────────────
describe('BudgetScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedPlannedModalProps = null;
    mockPlannedOperations = [];
    setBudgetsData();
  });

  describe('Rendering', () => {
    // The old per-category "all budgets" list/totals card is gone (Budgets v3
    // phase 2 — consolidated into MonthlyPlanSection's recurring lines), so the
    // screen always renders its (stubbed) MonthlyPlanSection instead of an
    // empty state tied to a `budgets` list.
    it('renders the monthly plan section', async () => {
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
  });

  describe('Allocation creation (Budgets v3 phase 2)', () => {
    // The old category-picker + BudgetModal flow is gone; the FAB now opens
    // MonthlyPlanSection's own "add allocation" flow via a ref, so it needs no
    // screen-level modal state of its own.
    it('opens the monthly plan section\'s add-allocation flow from the FAB', async () => {
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-add-fab')).toBeTruthy());
      fireEvent.press(getByTestId('budget-add-fab'));
      expect(mockOpenAddLine).toHaveBeenCalledTimes(1);
    });
  });

  describe('Hosted planned templates', () => {
    it('renders income templates in their own section and expense templates alongside allocations', async () => {
      mockPlannedOperations = [
        makePlanned({ id: 'inc1', name: 'Salary', type: 'income' }),
        makePlanned({ id: 'exp1', name: 'Rent', type: 'expense', categoryId: 'cat1' }),
      ];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('planned-income-section')).toBeTruthy());
      expect(getByTestId('planned-expense-section')).toBeTruthy();
      expect(getByTestId('planned-row-inc1')).toBeTruthy();
      expect(getByTestId('planned-row-exp1')).toBeTruthy();
    });

    it('executes a planned template from its swipe action', async () => {
      const op = makePlanned({ id: 'exp1', name: 'Rent', type: 'expense', categoryId: 'cat1' });
      mockPlannedOperations = [op];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('execute-action-exp1')).toBeTruthy());
      fireEvent.press(getByTestId('execute-action-exp1'));
      await waitFor(() => expect(mockExecute).toHaveBeenCalledWith(op));
    });

    it('marks a planned template as executed without creating an operation', async () => {
      const op = makePlanned({ id: 'exp1', name: 'Rent', type: 'expense', categoryId: 'cat1' });
      mockPlannedOperations = [op];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('mark-executed-action-exp1')).toBeTruthy());
      fireEvent.press(getByTestId('mark-executed-action-exp1'));
      await waitFor(() => expect(mockMarkExecuted).toHaveBeenCalledWith(op));
    });

    it('shows the done badge and an undo action for an already-executed template', async () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const op = makePlanned({ id: 'inc1', name: 'Salary', type: 'income', lastExecutedMonth: thisMonth });
      mockPlannedOperations = [op];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('planned-check-inc1')).toBeTruthy());
      fireEvent.press(getByTestId('undo-action-inc1'));
      await waitFor(() => expect(mockUpdatePlanned).toHaveBeenCalledWith('inc1', { lastExecutedMonth: null }));
    });

    it('opens the planned-operation modal to add a template', async () => {
      mockPlannedOperations = [makePlanned({ id: 'inc1', type: 'income' })];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('planned-income-section-add')).toBeTruthy());
      fireEvent.press(getByTestId('planned-income-section-add'));
      await waitFor(() => expect(capturedPlannedModalProps.visible).toBe(true));
      expect(capturedPlannedModalProps.isNew).toBe(true);
    });

    it('opens a long-press menu with execution and edit actions', async () => {
      const op = makePlanned({ id: 'exp1', name: 'Rent', type: 'expense', categoryId: 'cat1' });
      mockPlannedOperations = [op];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('planned-row-exp1')).toBeTruthy());
      fireEvent(getByTestId('planned-row-exp1'), 'longPress');
      expect(mockShowDialog).toHaveBeenCalledWith('select_action', 'Rent', expect.any(Array));
    });
  });

  describe('Summary strip (Fix 1: ported from the former Planned tab)', () => {
    const thisMonth = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    };

    it('is not shown when there are no planned operations', async () => {
      mockPlannedOperations = [];
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('budget-month-header')).toBeTruthy());
      expect(queryByTestId('summary-pending-out')).toBeNull();
      expect(queryByTestId('summary-done-count')).toBeNull();
      expect(queryByTestId('summary-pending-in')).toBeNull();
      expect(queryByTestId('summary-progress-bar')).toBeNull();
    });

    it('aggregates pending/total amounts and execution progress across all template types', async () => {
      mockPlannedOperations = [
        makePlanned({ id: 'inc1', name: 'Salary', type: 'income', amount: '1000', lastExecutedMonth: null }),
        makePlanned({ id: 'exp1', name: 'Rent', type: 'expense', categoryId: 'cat1', amount: '500', lastExecutedMonth: thisMonth() }),
      ];
      const { getByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('summary-pending-out')).toBeTruthy());
      // Rent (500) is already executed this month, so nothing is pending-out and
      // done-count is 1 of 2; Salary (1000) is still pending-in, K-formatted.
      expect(getByTestId('summary-pending-out').props.children).toBe('0 / 500');
      expect(getByTestId('summary-done-count').props.children).toBe('1 / 2');
      expect(getByTestId('summary-pending-in').props.children).toBe('1K / 1K');
      expect(getByTestId('summary-progress-bar')).toBeTruthy();
    });

    it('hides while viewing a month other than the current one', async () => {
      mockPlannedOperations = [makePlanned({ id: 'inc1', type: 'income' })];
      const { getByTestId, queryByTestId } = await render(<BudgetScreen />);
      await waitFor(() => expect(getByTestId('summary-pending-out')).toBeTruthy());

      fireEvent.press(getByTestId('budget-prev-month'));
      await waitFor(() => expect(getByTestId('budget-jump-current')).toBeTruthy());
      expect(queryByTestId('summary-pending-out')).toBeNull();
    });
  });
});
