// __tests__/components/budgets/MonthlyPlanSection.test.js
/* eslint-disable react/prop-types */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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
      }, React.createElement(Text, {}, 'income')),
      // Fix 1 (adversarial review round 2): re-save the currently-edited line
      // (props.line) with its scope flipped, keeping the SAME raw amount typed
      // in the editor — exactly what a real user toggling the recurring switch
      // without touching the amount field would produce. Conversion now
      // happens in BudgetPlansDB.updateLine (mocked at this level), so the
      // component is expected to forward the raw values UNTOUCHED.
      React.createElement(Pressable, {
        testID: 'mock-save-scope-to-oneoff',
        onPress: () => props.onSaveLine({
          amount: String(props.line?.amount ?? '0'),
          label: props.line?.label ?? null,
          comment: props.line?.comment ?? null,
          categoryId: props.line?.categoryId ?? null,
          toAccountId: props.line?.toAccountId ?? null,
          isRecurring: false,
          currency: null,
        }),
      }, React.createElement(Text, {}, 'to one-off')),
      React.createElement(Pressable, {
        testID: 'mock-save-scope-to-recurring',
        onPress: () => props.onSaveLine({
          amount: String(props.line?.amount ?? '0'),
          label: props.line?.label ?? null,
          comment: props.line?.comment ?? null,
          categoryId: props.line?.categoryId ?? null,
          toAccountId: props.line?.toAccountId ?? null,
          isRecurring: true,
          currency: 'EUR',
        }),
      }, React.createElement(Text, {}, 'to recurring')),
      // Fix 1's previously-missed sibling path: SAME scope (still recurring),
      // only the currency-chip picker changed — no isRecurring flip at all.
      React.createElement(Pressable, {
        testID: 'mock-save-currency-only',
        onPress: () => props.onSaveLine({
          amount: String(props.line?.amount ?? '0'),
          label: props.line?.label ?? null,
          comment: props.line?.comment ?? null,
          categoryId: props.line?.categoryId ?? null,
          toAccountId: props.line?.toAccountId ?? null,
          isRecurring: true,
          currency: 'USD',
        }),
      }, React.createElement(Text, {}, 'currency only')),
      React.createElement(Pressable, {
        testID: 'mock-delete-line',
        onPress: () => props.onDeleteLine(props.line?.id),
      }, React.createElement(Text, {}, 'delete')));
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

  describe('Currency/scope changes forwarded raw to updateLine (Fix 1, adversarial review round 2)', () => {
    // The conversion invariant used to live HERE (in the component), and only
    // fired on a scope change — a direct currency-chip edit with no scope
    // change went completely unconverted (the actual money-corrupting bug).
    // It now lives in BudgetPlansDB.updateLine (see BudgetPlansDB.test.js's
    // "currency-conversion invariant" describe block for the real conversion
    // coverage) — this component's job is just to forward the raw values
    // untouched, for EVERY path: scope-to-one-off, scope-to-recurring, AND the
    // previously-missed same-scope currency-only edit.

    it('forwards the raw amount and target plan when scope changes to one-off, without converting', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [{
          id: 'l-eur', planId: null, amount: '250', label: 'Rent', comment: null,
          categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
          isRecurring: true, currency: 'EUR',
        }],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-eur')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-l-eur'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());

      await fireEvent.press(getByTestId('mock-save-scope-to-oneoff'));

      await waitFor(() => expect(mockPlans.updateLine).toHaveBeenCalled());
      expect(mockPlans.updateLine).toHaveBeenCalledWith('l-eur', expect.objectContaining({
        amount: '250', isRecurring: false, planId: 'p1',
      }));
    });

    it('forwards the raw amount and new currency when scope changes to recurring, without converting', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [{
          id: 'l-oneoff', planId: 'p1', amount: '100', label: 'Groceries', comment: null,
          categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
          isRecurring: false, currency: null,
        }],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-oneoff')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-l-oneoff'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());

      await fireEvent.press(getByTestId('mock-save-scope-to-recurring'));

      await waitFor(() => expect(mockPlans.updateLine).toHaveBeenCalled());
      expect(mockPlans.updateLine).toHaveBeenCalledWith('l-oneoff', expect.objectContaining({
        amount: '100', isRecurring: true, currency: 'EUR',
      }));
    });

    // The sibling path the previous round's fix missed entirely: SAME scope
    // (still recurring), only the currency changed. Must reach updateLine
    // WITHOUT an `isRecurring` key (so BudgetPlansDB.updateLine takes its
    // direct-currency-edit branch, not the scope-change one) and with the
    // raw amount untouched — the DB layer is what converts it now.
    it('forwards a direct currency-chip edit on an already-recurring line (no scope change), without converting', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [{
          id: 'l-eur', planId: null, amount: '250', label: 'Rent', comment: null,
          categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
          isRecurring: true, currency: 'EUR',
        }],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-eur')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-l-eur'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());

      await fireEvent.press(getByTestId('mock-save-currency-only'));

      await waitFor(() => expect(mockPlans.updateLine).toHaveBeenCalled());
      expect(mockPlans.updateLine).toHaveBeenCalledWith('l-eur', expect.objectContaining({
        amount: '250', currency: 'USD',
      }));
      const updates = mockPlans.updateLine.mock.calls[0][1];
      expect(updates.isRecurring).toBeUndefined();
    });

    it('shows a translated error and does not save when updateLine rejects with exchange_rate_unavailable', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [{
          id: 'l-eur', planId: null, amount: '250', label: 'Rent', comment: null,
          categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
          isRecurring: true, currency: 'EUR',
        }],
      });
      // BudgetPlansDB.updateLine throws this specific (untranslated) message
      // when no rate is available to convert through (see BudgetPlansDB.js).
      mockPlans.updateLine = jest.fn(async () => { throw new Error('exchange_rate_unavailable'); });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-eur')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-l-eur'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());

      await fireEvent.press(getByTestId('mock-save-currency-only'));

      await waitFor(() => expect(mockShowDialog).toHaveBeenCalledWith(
        'Error', 'exchange_rate_unavailable', expect.anything(),
      ));
      // The modal stays open on error (not silently closed) so the user can retry.
      expect(getByTestId('mock-line-modal')).toBeTruthy();
    });
  });

  describe('Allocated/remainder prefer planStatus once resolved (Bug 3, adversarial review)', () => {
    it('shows planStatus.totals.allocated/plannedRemainder instead of the local same-currency-only estimate', async () => {
      // The local `totals` memo SKIPS a recurring line whose currency differs
      // from the plan's (it can't convert without an async rate lookup) — so it
      // would compute allocated = 300 (missing the 100 EUR line) and remainder =
      // 1000 - 300 = 700. planStatus, which DOES convert it, says 410 / 590.
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [
          { id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
          { id: 'l-eur', planId: null, amount: '100', label: 'Rent', comment: null, categoryId: 'cat2', toAccountId: null, sortOrder: 0, isBroken: false, isRecurring: true, currency: 'EUR' },
        ],
        planStatuses: new Map([['p1', {
          planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
          lines: [],
          totals: {
            expectedIncome: '1000.00', actualIncome: '0.00', allocated: '410.00',
            totalActual: '0.00', plannedRemainder: '590.00', actualRemainder: '1000.00',
          },
          unconvertible: [],
        }]]),
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());

      expect(getByTestId('plan-totals')).toHaveTextContent(/410\.00/);
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/300\.00 USD/);
      expect(getByTestId('plan-remainder')).toHaveTextContent(/590\.00/);
    });
  });

  describe('Totals freshness after a mutation (Fix 2, adversarial review round 2)', () => {
    // Mirrors Bug 3 above but from the OTHER direction: refreshPlanStatuses()
    // is fired-and-forgotten by the save/delete handlers (never awaited), so a
    // still-in-flight (or, as here, permanently stubbed no-op) status recompute
    // must not keep showing its now-stale totals once the user has saved —
    // this component's own `lines`/`plan` state is already fresh at that point.
    it('shows fresh local totals immediately after adding a line, not the stale planStatus', async () => {
      const staleStatus = {
        planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
        lines: [],
        totals: {
          expectedIncome: '1000.00', actualIncome: '0.00', allocated: '999.00',
          totalActual: '0.00', plannedRemainder: '1.00', actualRemainder: '1000.00',
        },
        unconvertible: [],
      };
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [],
        planStatuses: new Map([['p1', staleStatus]]),
      });
      // refreshPlanStatuses is a no-op jest.fn() in this test (setPlans's
      // default) — planStatus never actually changes, so the ONLY way the
      // totals row can stop showing 999.00/1.00 after the save is by no longer
      // trusting a stale planStatus.
      mockPlans.getLinesForMonth = jest.fn()
        .mockResolvedValueOnce([]) // initial mount load
        .mockResolvedValue([
          { id: 'l1', planId: 'p1', amount: '300', label: 'New', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
        ]);
      const { getByTestId } = await renderSection();

      // Before any mutation: the (not-yet-stale) planStatus totals show as-is.
      await waitFor(() => expect(getByTestId('plan-totals')).toHaveTextContent(/999\.00/));

      await fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());

      // allocated = 300 (the new line), remainder = 1000 - 300 = 700 — the
      // fresh LOCAL estimate, not the stale planStatus's 999.00 / 1.00.
      await waitFor(() => expect(getByTestId('plan-totals')).toHaveTextContent(/300\.00/));
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/999\.00/);
      expect(getByTestId('plan-remainder')).toHaveTextContent(/700\.00/);
    });

    it('shows fresh local totals immediately after deleting a line, not the stale planStatus', async () => {
      const staleStatus = {
        planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
        lines: [],
        totals: {
          expectedIncome: '1000.00', actualIncome: '0.00', allocated: '300.00',
          totalActual: '0.00', plannedRemainder: '700.00', actualRemainder: '1000.00',
        },
        unconvertible: [],
      };
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [
          { id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
        ],
        planStatuses: new Map([['p1', staleStatus]]),
      });
      mockPlans.getLinesForMonth = jest.fn()
        .mockResolvedValueOnce([
          { id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
        ])
        .mockResolvedValue([]); // after delete
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());

      await fireEvent.press(getByTestId('plan-line-l1'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-delete-line'));

      // allocated = 0, remainder = 1000 — fresh, not the stale 300.00 / 700.00.
      await waitFor(() => expect(getByTestId('plan-remainder')).toHaveTextContent(/1000\.00/));
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/300\.00 USD/);
    });
  });

  describe('Double-tap save race guard (Bug 4, adversarial review)', () => {
    it('ignores a second rapid line-save while the first ensurePlan()/addPlan() is still in flight', async () => {
      setPlans({ plans: [], lines: [] });
      let resolveAddPlan;
      mockPlans.addPlan = jest.fn(() => new Promise((resolve) => { resolveAddPlan = resolve; }));
      const { getByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-add-line'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());

      // First tap: starts handleSaveLine, which sets the busy flag synchronously
      // before awaiting ensurePlan()/addPlan() (deliberately left unresolved).
      // Don't await the press itself — that would block on the whole handler,
      // including the still-pending addPlan() promise. Instead wait for the
      // observable side effect (addPlan actually invoked) as the signal that
      // busy=true has committed, matching how two real taps land on separate
      // event-loop turns milliseconds apart (never the same microtask).
      fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addPlan).toHaveBeenCalledTimes(1));

      // Second tap while the first save is still in flight — must be a no-op.
      fireEvent.press(getByTestId('mock-save-line'));

      resolveAddPlan({ id: 'p1' });
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());

      expect(mockPlans.addPlan).toHaveBeenCalledTimes(1);
    });

    it('ignores a second rapid income-save while the first save is still in flight', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      let resolveUpdatePlan;
      mockPlans.updatePlan = jest.fn(() => new Promise((resolve) => { resolveUpdatePlan = resolve; }));
      const { getByTestId, queryByTestId } = await renderSection();
      await fireEvent.press(getByTestId('plan-income-row'));
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());

      fireEvent.press(getByTestId('mock-save-income'));
      await waitFor(() => expect(mockPlans.updatePlan).toHaveBeenCalledTimes(1));

      // Second tap while the first save is still in flight — must be a no-op.
      fireEvent.press(getByTestId('mock-save-income'));

      resolveUpdatePlan();
      await waitFor(() => expect(queryByTestId('mock-line-modal')).toBeNull()); // modal closed = save completed

      expect(mockPlans.updatePlan).toHaveBeenCalledTimes(1);
    });
  });

  describe('Optimistic reorder (Bug 6, adversarial review)', () => {
    it('reflects a recurring-line move immediately, before reorderRecurringLines resolves', async () => {
      setPlans({
        plans: [],
        lines: [
          { id: 'l-a', planId: null, amount: '10', label: 'A', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false, isRecurring: true, currency: 'USD' },
          { id: 'l-b', planId: null, amount: '20', label: 'B', comment: null, categoryId: 'cat2', toAccountId: null, sortOrder: 1, isBroken: false, isRecurring: true, currency: 'USD' },
        ],
      });
      // Never resolves during this test — proves the visible order change comes
      // from the optimistic setLines(), not from awaiting this call + reloadLines().
      mockPlans.reorderRecurringLines = jest.fn(() => new Promise(() => {}));
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-a')).toBeTruthy());
      // Before the move: l-a is first (its up-arrow is disabled), l-b is second.
      expect(getByTestId('plan-line-up-l-a').props.accessibilityState.disabled).toBe(true);
      expect(getByTestId('plan-line-up-l-b').props.accessibilityState.disabled).toBe(false);

      fireEvent.press(getByTestId('plan-line-down-l-a'));

      // reorderRecurringLines never resolves in this test, so reloadLines()
      // (which runs AFTER awaiting it) never runs either — the only way this
      // assertion can pass at all is the optimistic setLines() call that
      // happens BEFORE that await. Without it, this would time out.
      await waitFor(() => {
        expect(getByTestId('plan-line-up-l-a').props.accessibilityState.disabled).toBe(false);
        expect(getByTestId('plan-line-up-l-b').props.accessibilityState.disabled).toBe(true);
      });
    });
  });

  describe('Move double-tap race guard (Fix 3, adversarial review round 2)', () => {
    // Neither move handler had ANY double-tap guard before this fix — two fast
    // taps on the same arrow (both landing before reorderRecurringLines/
    // reorderLines resolves) could each read the same pre-move snapshot and
    // fire two overlapping, conflicting reorder calls.
    it('ignores a second rapid move tap on a recurring line while the first reorder is still in flight', async () => {
      setPlans({
        plans: [],
        lines: [
          { id: 'l-a', planId: null, amount: '10', label: 'A', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false, isRecurring: true, currency: 'USD' },
          { id: 'l-b', planId: null, amount: '20', label: 'B', comment: null, categoryId: 'cat2', toAccountId: null, sortOrder: 1, isBroken: false, isRecurring: true, currency: 'USD' },
        ],
      });
      // Resolves on its own microtask (not manually controlled) — the two taps
      // below still land in the same synchronous JS task, before that microtask
      // runs, which is all the race needs; avoids leaving a manually-resolved
      // promise's continuation to settle at some unpredictable point relative
      // to test boundaries.
      mockPlans.reorderRecurringLines = jest.fn().mockResolvedValue(undefined);
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-a')).toBeTruthy());

      // Two taps in immediate succession (same JS task, before either resolves)
      // — a state-only guard would not catch this; only a synchronous ref does.
      await act(async () => {
        fireEvent.press(getByTestId('plan-line-down-l-a'));
        fireEvent.press(getByTestId('plan-line-down-l-a'));
      });

      await waitFor(() => expect(mockPlans.getLinesForMonth).toHaveBeenCalledTimes(2)); // mount + one reconcile

      expect(mockPlans.reorderRecurringLines).toHaveBeenCalledTimes(1);
    });

    it('ignores a second rapid move tap on a one-off line while the first reorder is still in flight', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [
          { id: 'l1', planId: 'p1', amount: '100', label: 'A', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
          { id: 'l2', planId: 'p1', amount: '200', label: 'B', comment: null, categoryId: 'cat2', toAccountId: null, sortOrder: 1, isBroken: false },
        ],
      });
      mockPlans.reorderLines = jest.fn().mockResolvedValue(undefined);
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByTestId('plan-line-down-l1'));
        fireEvent.press(getByTestId('plan-line-down-l1'));
      });

      await waitFor(() => expect(mockPlans.getLinesForMonth).toHaveBeenCalledTimes(2));

      expect(mockPlans.reorderLines).toHaveBeenCalledTimes(1);
    });
  });

  describe('Unconvertible recurring line (Bug 5, adversarial review)', () => {
    it('shows the line\'s own currency/amount instead of mislabeling it as the plan currency', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [{
          id: 'l-jpy', planId: null, amount: '10000', label: 'Rent Tokyo', comment: null,
          categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
          isRecurring: true, currency: 'JPY',
        }],
        planStatuses: new Map([['p1', {
          planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
          lines: [{
            lineId: 'l-jpy', broken: false, amount: '10000', actual: '0', remaining: '10000',
            percentage: 0, isExceeded: false, status: 'unconvertible',
          }],
          totals: {
            expectedIncome: '1000.00', actualIncome: '0.00', allocated: '0.00',
            totalActual: '0.00', plannedRemainder: '1000.00', actualRemainder: '1000.00',
          },
          unconvertible: ['JPY'],
        }]]),
      });
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-unconvertible-l-jpy')).toBeTruthy());
      expect(getByTestId('plan-line-unconvertible-l-jpy')).toHaveTextContent(/10000/);
      expect(getByTestId('plan-line-unconvertible-l-jpy')).toHaveTextContent(/JPY/);
      // Not rendered as a normal progress bar (which would mislabel it as USD).
      expect(queryByTestId('plan-line-broken-l-jpy')).toBeNull();
    });
  });
});
