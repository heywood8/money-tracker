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
        onPress: () => props.onSaveLine({ amount: '250', label: 'New', comment: null, categoryId: 'cat1', toAccountId: null }),
      }, React.createElement(Text, {}, 'save')),
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

const setPlans = ({ plans = [], lines = [] } = {}) => {
  mockPlans = {
    plans,
    addPlan: jest.fn(async () => {}),
    copyPlan: jest.fn(async () => {}),
    updatePlan: jest.fn(async () => {}),
    addLine: jest.fn(async () => {}),
    updateLine: jest.fn(async () => {}),
    deleteLine: jest.fn(async () => {}),
    reorderLines: jest.fn(async () => {}),
    getPlanLines: jest.fn(async () => lines),
  };
};

const renderSection = () => render(
  <MonthlyPlanSection currency="USD" expenseCategories={EXPENSE_CATEGORIES} accounts={ACCOUNTS} />,
);

const flatColor = (node) => StyleSheet.flatten(node.props.style)?.color;

describe('MonthlyPlanSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedModalProps = null;
  });

  describe('Empty state', () => {
    it('shows create action and no copy action when there is no previous plan', () => {
      setPlans({ plans: [] });
      const { getByTestId, queryByTestId } = renderSection();
      expect(getByTestId('plan-empty-state')).toBeTruthy();
      expect(getByTestId('plan-create-empty')).toBeTruthy();
      expect(queryByTestId('plan-copy-last')).toBeNull();
    });

    it('creates an empty plan for the current month', () => {
      setPlans({ plans: [] });
      const { getByTestId } = renderSection();
      fireEvent.press(getByTestId('plan-create-empty'));
      expect(mockPlans.addPlan).toHaveBeenCalledWith({ month: THIS_MONTH, currency: 'USD' });
    });

    it('offers copy-from-last-month when a previous plan exists', () => {
      setPlans({ plans: [{ id: 'p0', month: PREV_MONTH, currency: 'USD', expectedIncome: '5000' }] });
      const { getByTestId } = renderSection();
      fireEvent.press(getByTestId('plan-copy-last'));
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
      const { getByTestId, getByText } = renderSection();
      expect(getByTestId('plan-income-row')).toBeTruthy();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(getByTestId('plan-line-l2')).toBeTruthy();
      // Label falls back to the linked account name for the label-less line.
      expect(getByText('Savings')).toBeTruthy();
      // allocated = 300 + 200 = 500, remainder = 1000 - 500 = 500
      expect(getByTestId('plan-remainder')).toHaveTextContent('500.00');
    });

    it('shows the remainder in the danger color when over-allocated', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '100' }],
        lines: [{ id: 'l1', planId: 'p1', amount: '500', label: 'Big', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false }],
      });
      const { getByTestId } = renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(flatColor(getByTestId('plan-remainder'))).toBe(COLORS.danger);
    });
  });

  describe('Interactions', () => {
    it('adds a line and reloads', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId } = renderSection();
      fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());
      expect(mockPlans.addLine).toHaveBeenCalledWith('p1', expect.objectContaining({ categoryId: 'cat1', sortOrder: 0 }));
    });

    it('saves expected income from the income editor', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId } = renderSection();
      fireEvent.press(getByTestId('plan-income-row'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      expect(capturedModalProps.mode).toBe('income');
      fireEvent.press(getByTestId('mock-save-income'));
      await waitFor(() => expect(mockPlans.updatePlan).toHaveBeenCalledWith('p1', { expectedIncome: '9000' }));
    });

    it('navigates months without state bleed (next month has no plan)', () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId, queryByTestId } = renderSection();
      // Current month has a plan → income row present.
      expect(getByTestId('plan-income-row')).toBeTruthy();
      fireEvent.press(getByTestId('plan-next-month'));
      // Next month has no plan → empty state, no income row.
      expect(getByTestId('plan-empty-state')).toBeTruthy();
      expect(queryByTestId('plan-income-row')).toBeNull();
    });
  });
});
