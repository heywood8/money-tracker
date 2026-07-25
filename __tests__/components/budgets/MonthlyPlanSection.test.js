// __tests__/components/budgets/MonthlyPlanSection.test.js
/* eslint-disable react/prop-types */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import MonthlyPlanSection from '../../../app/components/budgets/MonthlyPlanSection';

const COLORS = {
  background: '#111318',
  surface: '#1a1d24',
  card: '#1a1d24',
  text: '#e8eaf0',
  mutedText: '#7a7f8e',
  border: '#252830',
  primary: '#4A90D9',
  danger: '#ff5555',
  delete: '#ff6b6b',
  selected: '#2a2e38',
  altRow: '#16191f',
};

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({ colors: COLORS }),
}));

jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));

const mockShowDialog = jest.fn();
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));

let mockPlans;
jest.mock('../../../app/contexts/BudgetPlansContext', () => ({
  useBudgetPlans: () => mockPlans,
}));

// Stub the line editor modal: dedicated tests cover its internals. Here it just
// exposes buttons to drive the section's save/income handlers.
let capturedModalProps = null;
jest.mock('../../../app/components/budgets/BudgetPlanLineModal', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return function MockLineModal(props) {
    capturedModalProps = props;
    if (!props.visible) return null;
    return React.createElement(View, { testID: 'mock-line-modal' },
      React.createElement(Pressable, {
        testID: 'mock-save-line',
        onPress: () => props.onSaveLine({
          amount: '250', label: 'New', comment: null, categoryId: 'cat1', toAccountId: null, isRecurring: false, currency: null,
        }),
      }, React.createElement(Text, {}, 'save')),
      React.createElement(Pressable, {
        testID: 'mock-save-recurring-line',
        onPress: () => props.onSaveLine({
          amount: '65000', label: 'Rent', comment: null, categoryId: 'cat1', toAccountId: null, isRecurring: true, currency: 'USD',
        }),
      }, React.createElement(Text, {}, 'save recurring')),
      React.createElement(Pressable, {
        testID: 'mock-save-income',
        onPress: () => props.onSaveIncome('9000'),
      }, React.createElement(Text, {}, 'income')));
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shift = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const THIS_MONTH = monthKey(new Date());
const PREV_MONTH = shift(THIS_MONTH, -1);

const EXPENSE_CATEGORIES = [
  { id: 'cat1', name: 'Food', icon: 'food', categoryType: 'expense' },
  { id: 'cat2', name: 'Transport', icon: 'bus', categoryType: 'expense' },
];
const ACCOUNTS = [
  { id: 1, name: 'Savings', currency: 'USD' },
  { id: 2, name: 'Cash', currency: 'USD' },
];

const setPlans = ({ plans = [], lines = [], planStatuses = new Map() } = {}) => {
  mockPlans = {
    plans,
    planStatuses,
    refreshPlanStatuses: jest.fn(async () => {}),
    addPlan: jest.fn(async () => ({ id: 'p1' })),
    copyPlan: jest.fn(async () => {}),
    updatePlan: jest.fn(async () => {}),
    addLine: jest.fn(async () => {}),
    addRecurringLine: jest.fn(async () => {}),
    updateLine: jest.fn(async () => {}),
    deleteLine: jest.fn(async () => {}),
    reorderLines: jest.fn(async () => {}),
    reorderRecurringLines: jest.fn(async () => {}),
    getPlanLines: jest.fn(async () => lines),
    // The section now loads its lines (recurring UNION this month's one-off
    // lines) via getLinesForMonth rather than getPlanLines directly.
    getLinesForMonth: jest.fn(async () => lines),
  };
};

const renderSection = (ref) => render(
  <MonthlyPlanSection ref={ref} currency="USD" expenseCategories={EXPENSE_CATEGORIES} accounts={ACCOUNTS} />,
);

const flatColor = (node) => StyleSheet.flatten(node.props.style)?.color;

describe('MonthlyPlanSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedModalProps = null;
  });

  describe('Empty state', () => {
    it('shows create action and no copy action when there is no previous plan', async () => {
      setPlans({ plans: [] });
      const { getByTestId, queryByTestId } = await renderSection();
      expect(getByTestId('plan-empty-state')).toBeTruthy();
      expect(getByTestId('plan-create-empty')).toBeTruthy();
      expect(queryByTestId('plan-copy-last')).toBeNull();
    });

    it('creates an empty plan for the current month', async () => {
      setPlans({ plans: [] });
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-create-empty'));
      expect(mockPlans.addPlan).toHaveBeenCalledWith({ month: THIS_MONTH, currency: 'USD' });
    });

    it('offers copy-from-last-month when a previous plan exists', async () => {
      setPlans({ plans: [{ id: 'p0', month: PREV_MONTH, currency: 'USD', expectedIncome: '5000' }] });
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-copy-last'));
      expect(mockPlans.copyPlan).toHaveBeenCalledWith(PREV_MONTH, THIS_MONTH);
    });
  });

  describe('Plan rendering', () => {
    const planWithLines = () => setPlans({
      plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
      lines: [
        { id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: 'weekly', categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
        { id: 'l2', planId: 'p1', amount: '200', label: null, comment: null, categoryId: null, toAccountId: 1, sortOrder: 1, isBroken: false },
      ],
    });

    it('renders income, lines and computed totals', async () => {
      planWithLines();
      const { getByTestId, getByText } = await renderSection();
      expect(getByTestId('plan-income-row')).toBeTruthy();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(getByTestId('plan-line-l2')).toBeTruthy();
      // Label falls back to the linked account name for the label-less line.
      expect(getByText('Savings')).toBeTruthy();
      // allocated = 300 + 200 = 500, remainder = 1000 - 500 = 500
      expect(getByTestId('plan-remainder')).toHaveTextContent(/500\.00/);
    });

    it('shows the remainder in the danger color when over-allocated', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '100' }],
        lines: [{ id: 'l1', planId: 'p1', amount: '500', label: 'Big', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false }],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(flatColor(getByTestId('plan-remainder'))).toBe(COLORS.danger);
    });
  });

  describe('Plan vs actual', () => {
    const LINES = [
      { id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
      { id: 'l2', planId: 'p1', amount: '200', label: null, comment: null, categoryId: null, toAccountId: 1, sortOrder: 1, isBroken: false },
    ];
    const STATUS = {
      planId: 'p1',
      month: THIS_MONTH,
      currency: 'USD',
      convertAll: true,
      lines: [
        { lineId: 'l1', broken: false, amount: '300', actual: '150.00', remaining: '150.00', percentage: 50, isExceeded: false, status: 'safe' },
        { lineId: 'l2', broken: false, amount: '200', actual: '250.00', remaining: '-50.00', percentage: 125, isExceeded: true, status: 'exceeded' },
      ],
      totals: {
        expectedIncome: '1000.00', actualIncome: '800.00', allocated: '500.00',
        totalActual: '400.00', plannedRemainder: '500.00', actualRemainder: '400.00',
      },
      unconvertible: [],
    };
    const setPlanWithStatus = (status = STATUS, lines = LINES) => setPlans({
      plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
      lines,
      planStatuses: new Map([['p1', status]]),
    });

    it('renders per-line progress with actuals and status details', async () => {
      setPlanWithStatus();
      const { getByTestId, getByText } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      // StatusProgressBar details: "actual / amount" and the remaining text.
      expect(getByText('150.00 / 300')).toBeTruthy();
      expect(getByText('remaining_budget: 150.00')).toBeTruthy();
      expect(getByText('50%')).toBeTruthy();
      // The exceeded transfer line shows the over-budget wording.
      expect(getByText('over_budget_by 50.00')).toBeTruthy();
    });

    it('shows actual income against expected income in the header', async () => {
      setPlanWithStatus();
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(getByTestId('plan-income-row')).toHaveTextContent(/800\.00 \/ 1000\.00 USD/);
    });

    it('renders the totals row with allocated, actual, and planned remainder', async () => {
      setPlanWithStatus();
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-actual-total')).toBeTruthy());
      expect(getByTestId('plan-actual-total')).toHaveTextContent(/400\.00/);
      expect(getByTestId('plan-remainder')).toHaveTextContent(/500\.00/);
    });

    it('shows an inline warning for a broken line instead of a progress bar', async () => {
      const brokenLine = { id: 'l3', planId: 'p1', amount: '50', label: 'Old', comment: null, categoryId: null, toAccountId: null, sortOrder: 2, isBroken: true };
      const status = {
        ...STATUS,
        lines: [...STATUS.lines, { lineId: 'l3', broken: true, amount: '50', actual: '0', remaining: '50', percentage: 0, isExceeded: false, status: 'broken' }],
      };
      setPlanWithStatus(status, [...LINES, brokenLine]);
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-broken-l3')).toBeTruthy());
      expect(getByTestId('plan-line-broken-l3')).toHaveTextContent(/relink_target/);
    });

    it('warns about unconvertible currencies', async () => {
      setPlanWithStatus({ ...STATUS, unconvertible: ['XYZ', 'ZAR'] });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-unconverted-warning')).toBeTruthy());
      expect(getByTestId('plan-unconverted-warning')).toHaveTextContent(/XYZ, ZAR/);
    });

    it('does not render the unconvertible warning when all currencies convert', async () => {
      setPlanWithStatus();
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(queryByTestId('plan-unconverted-warning')).toBeNull();
    });

    it('triggers a status refresh after saving a line', async () => {
      setPlanWithStatus();
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());
      expect(mockPlans.refreshPlanStatuses).toHaveBeenCalled();
    });
  });

  describe('Interactions', () => {
    it('adds a line and reloads', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());
      expect(mockPlans.addLine).toHaveBeenCalledWith('p1', expect.objectContaining({ categoryId: 'cat1', sortOrder: 0 }));
    });

    it('saves expected income from the income editor', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-income-row'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      expect(capturedModalProps.mode).toBe('income');
      await fireEvent.press(getByTestId('mock-save-income'));
      await waitFor(() => expect(mockPlans.updatePlan).toHaveBeenCalledWith('p1', { expectedIncome: '9000' }));
    });

    it('navigates months without state bleed (next month has no plan)', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId, queryByTestId } = await renderSection();
      // Current month has a plan → income row present.
      expect(getByTestId('plan-income-row')).toBeTruthy();
      await fireEvent.press(getByTestId('plan-next-month'));
      // Next month has no plan → empty state, no income row.
      await waitFor(() => expect(getByTestId('plan-empty-state')).toBeTruthy());
      expect(queryByTestId('plan-income-row')).toBeNull();
    });
  });

  describe('Recurring lines (Budgets v3 phase 2)', () => {
    const recurringLine = {
      id: 'l-rec', planId: null, amount: '65000', label: 'Rent', comment: null,
      categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
      isRecurring: true, currency: 'USD',
    };

    it('renders a recurring line even for a month with no plan created yet', async () => {
      setPlans({ plans: [], lines: [recurringLine] });
      const { getByTestId, getByText, queryByTestId } = await renderSection();
      // No plan for this month, but the recurring line still shows (and so does
      // the empty-plan CTA below it, for income/one-off allocations).
      await waitFor(() => expect(getByTestId('plan-line-l-rec')).toBeTruthy());
      expect(getByTestId('plan-empty-state')).toBeTruthy();
      expect(queryByTestId('plan-income-row')).toBeNull();
      expect(getByText('recurring_allocation')).toBeTruthy();
    });

    it('adding a recurring allocation calls addRecurringLine, not addLine, and needs no plan', async () => {
      setPlans({ plans: [], lines: [] });
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-recurring-line'));
      await waitFor(() => expect(mockPlans.addRecurringLine).toHaveBeenCalled());
      expect(mockPlans.addRecurringLine).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'USD', categoryId: 'cat1', sortOrder: 0 }),
      );
      expect(mockPlans.addPlan).not.toHaveBeenCalled();
    });

    it('saving a one-off allocation for a plan-less month lazily creates the plan first', async () => {
      setPlans({ plans: [], lines: [recurringLine] });
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addPlan).toHaveBeenCalledWith({ month: THIS_MONTH, currency: 'USD' }));
      expect(mockPlans.addLine).toHaveBeenCalledWith('p1', expect.objectContaining({ categoryId: 'cat1' }));
    });

    it('exposes openAddLine via ref for a host FAB', async () => {
      setPlans({ plans: [], lines: [] });
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      expect(getByTestId).toBeTruthy();
      await waitFor(() => expect(ref.current).toBeTruthy());
      ref.current.openAddLine();
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
    });
  });
});
