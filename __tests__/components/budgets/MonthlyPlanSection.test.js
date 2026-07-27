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
  warning: '#F2A93B',
  overspend: '#FF6B6B',
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
          amount: '250', label: 'New', comment: null, kind: 'expense', categoryId: 'cat1', toAccountId: null, accountId: null, isRecurring: false, currency: null,
        }),
      }, React.createElement(Text, {}, 'save')),
      React.createElement(Pressable, {
        testID: 'mock-save-recurring-line',
        onPress: () => props.onSaveLine({
          amount: '65000', label: 'Rent', comment: null, kind: 'expense', categoryId: 'cat1', toAccountId: null, accountId: null, isRecurring: true, currency: 'USD',
        }),
      }, React.createElement(Text, {}, 'save recurring')),
      // Budgets v3 phase 3: expected income is a LINE now (kind 'income'), not a
      // plan-level figure — there is no separate income editor any more.
      React.createElement(Pressable, {
        testID: 'mock-save-income-line',
        onPress: () => props.onSaveLine({
          amount: '9000', label: 'Salary', comment: null, kind: 'income',
          categoryId: null, toAccountId: null, accountId: null, isRecurring: false, currency: null,
        }),
      }, React.createElement(Text, {}, 'income line')),
      React.createElement(Pressable, {
        testID: 'mock-save-template-line',
        onPress: () => props.onSaveLine({
          amount: '65000', label: 'Rent', comment: null, kind: 'expense',
          categoryId: 'cat1', toAccountId: null, accountId: 1, isRecurring: true, currency: 'USD',
        }),
      }, React.createElement(Text, {}, 'save template')),
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
    // Executable templates (Budgets v3 phase 3)
    executeLine: jest.fn(async () => ({ id: 99 })),
    markLineExecuted: jest.fn(async () => {}),
    unmarkLineExecuted: jest.fn(async () => {}),
  };
};

const INCOME_CATEGORIES = [
  { id: 'inc1', name: 'Salary', icon: 'cash', categoryType: 'income' },
];

// A recurring expense line carrying an executable template (Budgets v3 phase 3):
// accountId / hasTemplate are what make the execute actions appear.
const TEMPLATE_LINE = {
  id: 'l-tpl', planId: null, amount: '65000', label: 'Rent', comment: null,
  kind: 'expense', categoryId: 'cat1', toAccountId: null, accountId: 1,
  sortOrder: 0, isBroken: false, isRecurring: true, currency: 'USD',
  hasTemplate: true, lastExecutedMonth: null,
};

const renderSection = (ref, extraProps = {}) => render(
  <MonthlyPlanSection
    ref={ref}
    currency="USD"
    expenseCategories={EXPENSE_CATEGORIES}
    incomeCategories={INCOME_CATEGORIES}
    accounts={ACCOUNTS}
    {...extraProps}
  />,
);

const flatColor = (node) => StyleSheet.flatten(node.props.style)?.color;

// The dashed "+ Add income" / "+ Add allocation" rows are gone: the screen's
// single FAB opens the same editor through the section's imperative handle, and
// the editor's own kind segment picks income vs expense. Tests drive it the way
// the host does.
const openEditor = async (ref, kind = 'expense') => {
  await act(async () => {
    if (kind === 'income') {
      ref.current.openAddIncome();
    } else {
      ref.current.openAddLine();
    }
  });
};

// Reordering moved off the rows (a chevron pair on every one) and into the
// long-press action sheet. `t` is the identity function here, so an action's
// text is its translation key.
const lastDialogAction = (key) => {
  const calls = mockShowDialog.mock.calls;
  const buttons = calls[calls.length - 1][2];
  const action = buttons.find(b => b.text === key);
  if (!action) {
    throw new Error(`No "${key}" action in the last dialog: ${buttons.map(b => b.text).join(', ')}`);
  }
  return action;
};

const hasDialogAction = (key) => {
  const calls = mockShowDialog.mock.calls;
  return calls[calls.length - 1][2].some(b => b.text === key);
};

// Always act()-wrapped: several tests here long-press a row while its own
// reorder/save round trip is still in flight, and firing an event outside act()
// in that state leaves React work half-committed — which showed up not as a
// failure here but as the NEXT test rendering an empty tree.
const longPressLine = async (getByTestId, lineId) => {
  await act(async () => {
    fireEvent(getByTestId(`plan-line-${lineId}`), 'longPress');
  });
};

const moveLine = async (getByTestId, lineId, direction) => {
  await longPressLine(getByTestId, lineId);
  await act(async () => {
    lastDialogAction(direction === -1 ? 'move_up' : 'move_down').onPress();
  });
};

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
      expect(getByTestId('plan-income-header')).toBeTruthy();
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

    // Regression: with no expected income declared the remainder degenerated to
    // "minus everything you planned" and rendered in alarm red the moment a
    // first-time user added their very first line.
    it('prompts for income instead of showing a negative remainder when none is declared', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: null }],
        lines: [{ id: 'l1', planId: 'p1', amount: '500', label: 'Big', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false }],
      });
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(queryByTestId('plan-remainder')).toBeNull();
      expect(getByTestId('plan-remainder-hint')).toBeTruthy();
    });

    it('shows the remainder again once an income line declares one', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: null }],
        lines: [
          { id: 'i1', planId: 'p1', amount: '900', label: null, comment: null, categoryId: null, toAccountId: null, kind: 'income', sortOrder: 0, isBroken: false },
          { id: 'l1', planId: 'p1', amount: '500', label: 'Big', comment: null, categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false },
        ],
      });
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      expect(queryByTestId('plan-remainder-hint')).toBeNull();
      expect(getByTestId('plan-remainder')).toHaveTextContent(/400\.00/);
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
      const { getByTestId, getByText, queryByText } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      // The amount column carries the pair — actual against target, the two
      // figures a person compares, as compact magnitudes: a row is scanned, not
      // audited, and the pair shares one line with the category name.
      expect(getByText('150 / 300')).toBeTruthy();
      // "remaining: 150" is gone with the bar (target minus actual, both right
      // there), so is the "50%" badge (the fill encodes the ratio), and so is
      // "over budget by 50" — it made an overspent row two lines tall while
      // every other row was one, restating a subtraction the pair already shows.
      expect(queryByText('remaining_budget: 150.00')).toBeNull();
      expect(queryByText('50%')).toBeNull();
      expect(queryByText('over_budget_by 50')).toBeNull();
      // The overspent row says so with its tone instead.
      expect(getByTestId('plan-line-fill-l2')).toBeTruthy();
    });

    it('shows actual income against expected income in the header', async () => {
      setPlanWithStatus();
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      // Compact magnitudes: the income header is a context figure, and two exact
      // 6-digit amounts plus a currency code did not fit beside the section title.
      expect(getByTestId('plan-income-total')).toHaveTextContent(/800 \/ 1K USD/);
    });

    it('renders the totals row with allocated, actual, and planned remainder', async () => {
      setPlanWithStatus();
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-actual-total')).toBeTruthy());
      // Allocated/actual are compact (orientation), the remainder stays exact —
      // it is the number the user acts on.
      expect(getByTestId('plan-actual-total')).toHaveTextContent(/400 USD/);
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
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      await openEditor(ref);
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());
      expect(mockPlans.refreshPlanStatuses).toHaveBeenCalled();
    });
  });

  describe('Interactions', () => {
    it('adds a line and reloads', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      await openEditor(ref);
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());
      expect(mockPlans.addLine).toHaveBeenCalledWith('p1', expect.objectContaining({ categoryId: 'cat1', sortOrder: 0 }));
    });

    it('adds an income line from the income section (Budgets v3 phase 3)', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '0' }], lines: [] });
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      await openEditor(ref, 'income');
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      // The editor opens pre-set to the income kind.
      expect(capturedModalProps.initialKind).toBe('income');
      await fireEvent.press(getByTestId('mock-save-income-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalledWith(
        'p1', expect.objectContaining({ kind: 'income', amount: '9000' }),
      ));
    });

    it('navigates months without state bleed (next month has no plan)', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { getByTestId, queryByTestId } = await renderSection();
      // Current month has a plan → no empty-plan CTA.
      expect(queryByTestId('plan-empty-state')).toBeNull();
      await fireEvent.press(getByTestId('plan-next-month'));
      // Next month has no plan → empty state.
      await waitFor(() => expect(getByTestId('plan-empty-state')).toBeTruthy());
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
      // No plan for this month, but the recurring line still shows (and so do
      // the empty-plan CTAs below it, for income/one-off allocations).
      await waitFor(() => expect(getByTestId('plan-line-l-rec')).toBeTruthy());
      expect(getByTestId('plan-empty-state')).toBeTruthy();
      expect(queryByTestId('plan-line-execute-l-rec')).toBeNull(); // no template → not executable
      // Scope is a glyph beside the name now, not an uppercase text line.
      expect(getByTestId('plan-line-recurring-l-rec')).toBeTruthy();
      // ...but NOT the "no plan yet" copy: it sat directly under a populated
      // list and above a totals row, contradicting both.
      expect(queryByTestId('plan-create-empty')).toBeTruthy();
      expect(() => getByText('no_plan_for_month')).toThrow();
    });

    it('keeps the "no plan yet" copy for a genuinely blank month', async () => {
      setPlans({ plans: [], lines: [] });
      const { getByText, getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-empty-state')).toBeTruthy());
      expect(getByText('no_plan_for_month')).toBeTruthy();
    });

    it('adding a recurring allocation calls addRecurringLine, not addLine, and needs no plan', async () => {
      setPlans({ plans: [], lines: [] });
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      await openEditor(ref);
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
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      await openEditor(ref);
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
        'error', 'exchange_rate_unavailable', expect.anything(),
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

      expect(getByTestId('plan-totals')).toHaveTextContent(/410 USD/);
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/300 USD/);
      expect(getByTestId('plan-remainder')).toHaveTextContent(/590\.00/);
    });
  });

  // Regression: switching the header's currency chip to AMD left the whole tab
  // reading in the plan's stored currency. The section resolved its unit as
  // `plan.currency || currency`, so a plan created back when the only account
  // was in RUB pinned every figure to RUB whatever the chip said.
  describe('Display currency (host chip) wins over the plan\'s stored currency', () => {
    const planInRub = (extra = {}) => setPlans({
      plans: [{ id: 'p1', month: THIS_MONTH, currency: 'RUB', expectedIncome: '1000' }],
      lines: [{
        id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: null,
        categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
      }],
      ...extra,
    });

    it('reports the chip currency, not the plan\'s, to the host header', async () => {
      planInRub();
      const onTotalsChange = jest.fn();
      const { getByTestId } = await renderSection(undefined, {
        currency: 'AMD', month: THIS_MONTH, onTotalsChange,
      });
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());
      await waitFor(() => expect(onTotalsChange).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'AMD' }),
      ));
    });

    it('ignores a plan status still computed in the previous currency', async () => {
      // The context recomputes statuses in the newly picked currency, but that
      // is async: for a render or two the map still holds RUB figures. Printing
      // those beside rows already converted to AMD is exactly the mixed-units
      // bug the conversion exists to prevent — so the section falls back to its
      // own same-currency estimate (300) and hides the actual column entirely.
      planInRub({
        planStatuses: new Map([['p1', {
          planId: 'p1', month: THIS_MONTH, currency: 'RUB', convertAll: false,
          lines: [],
          totals: {
            expectedIncome: '1000.00', actualIncome: '0.00', allocated: '99999.00',
            totalActual: '88888.00', plannedRemainder: '-98999.00', actualRemainder: '0.00',
          },
          unconvertible: [],
        }]]),
      });
      const { getByTestId, queryByTestId } = await renderSection(undefined, {
        currency: 'AMD', month: THIS_MONTH,
      });
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());

      expect(getByTestId('plan-totals')).toHaveTextContent(/300/);
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/99999|100K/);
      expect(queryByTestId('plan-actual-total')).toBeNull();
    });

    it('uses a status once it arrives in the chip currency', async () => {
      planInRub({
        planStatuses: new Map([['p1', {
          planId: 'p1', month: THIS_MONTH, currency: 'AMD', convertAll: false,
          lines: [],
          totals: {
            expectedIncome: '1000.00', actualIncome: '0.00', allocated: '410.00',
            totalActual: '250.00', plannedRemainder: '590.00', actualRemainder: '750.00',
          },
          unconvertible: [],
        }]]),
      });
      const { getByTestId } = await renderSection(undefined, {
        currency: 'AMD', month: THIS_MONTH,
      });
      await waitFor(() => expect(getByTestId('plan-line-l1')).toBeTruthy());

      expect(getByTestId('plan-totals')).toHaveTextContent(/410/);
      expect(getByTestId('plan-actual-total')).toHaveTextContent(/250/);
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
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);

      // Before any mutation: the (not-yet-stale) planStatus totals show as-is.
      await waitFor(() => expect(getByTestId('plan-totals')).toHaveTextContent(/999 USD/));

      await openEditor(ref);
      await waitFor(() => expect(getByTestId('mock-line-modal')).toBeTruthy());
      await fireEvent.press(getByTestId('mock-save-line'));
      await waitFor(() => expect(mockPlans.addLine).toHaveBeenCalled());

      // allocated = 300 (the new line), remainder = 1000 - 300 = 700 — the
      // fresh LOCAL estimate, not the stale planStatus's 999.00 / 1.00.
      await waitFor(() => expect(getByTestId('plan-totals')).toHaveTextContent(/300 USD/));
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/999 USD/);
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
      expect(getByTestId('plan-totals')).not.toHaveTextContent(/300 USD/);
    });
  });

  describe('Double-tap save race guard (Bug 4, adversarial review)', () => {
    it('ignores a second rapid line-save while the first ensurePlan()/addPlan() is still in flight', async () => {
      setPlans({ plans: [], lines: [] });
      let resolveAddPlan;
      mockPlans.addPlan = jest.fn(() => new Promise((resolve) => { resolveAddPlan = resolve; }));
      const ref = React.createRef();
      const { getByTestId } = await renderSection(ref);
      await openEditor(ref);
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

    it('ignores a second rapid execute tap while the first execution is still in flight', async () => {
      // Executing twice would create the operation twice — the exact
      // double-charge the atomic executeAndMark path exists to prevent.
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [TEMPLATE_LINE],
      });
      mockPlans.executeLine = jest.fn().mockResolvedValue({ id: 1 });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-execute-l-tpl')).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByTestId('plan-line-execute-l-tpl'));
        fireEvent.press(getByTestId('plan-line-execute-l-tpl'));
      });

      expect(mockPlans.executeLine).toHaveBeenCalledTimes(1);
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
      // Held open across the assertions below — proves the visible order change
      // comes from the optimistic setLines(), not from awaiting this call +
      // reloadLines(). Released at the end of the test rather than left dangling:
      // a promise that never settles leaves React work in flight past teardown,
      // which corrupted every test that ran after this one.
      let releaseReorder;
      mockPlans.reorderRecurringLines = jest.fn(
        () => new Promise((resolve) => { releaseReorder = resolve; }),
      );
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-a')).toBeTruthy());
      // Before the move: l-a is first, so its action sheet offers only "down".
      // (The sheet omits a move that has nowhere to land — it used to be a pair
      // of chevrons whose disabled state said the same thing.)
      await longPressLine(getByTestId, 'l-a');
      expect(hasDialogAction('move_up')).toBe(false);
      expect(hasDialogAction('move_down')).toBe(true);

      await moveLine(getByTestId, 'l-a', 1);

      // reorderRecurringLines never resolves in this test, so reloadLines()
      // (which runs AFTER awaiting it) never runs either — the only way the
      // order below can have changed is the optimistic setLines() call that
      // happens BEFORE that await.
      await longPressLine(getByTestId, 'l-a');
      expect(hasDialogAction('move_up')).toBe(true);
      expect(hasDialogAction('move_down')).toBe(false);

      await act(async () => { releaseReorder(); });
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
      // The action is grabbed once and fired twice, which is what a real double
      // tap on one sheet button does; re-opening the sheet in between would
      // instead exercise the sheet's own bounds check.
      // Two taps in immediate succession (same JS task, before either resolves)
      // — a state-only guard would not catch this; only a synchronous ref does.
      // The action is grabbed once and fired twice, which is what a real double
      // tap on one sheet button does; re-opening the sheet in between would
      // instead exercise the sheet's own bounds check.
      await longPressLine(getByTestId, 'l-a');
      const moveDown = lastDialogAction('move_down');
      await act(async () => {
        moveDown.onPress();
        moveDown.onPress();
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

      await longPressLine(getByTestId, 'l1');
      const moveDown = lastDialogAction('move_down');
      await act(async () => {
        moveDown.onPress();
        moveDown.onPress();
      });

      await waitFor(() => expect(mockPlans.getLinesForMonth).toHaveBeenCalledTimes(2));

      expect(mockPlans.reorderLines).toHaveBeenCalledTimes(1);
    });
  });

  describe('Row density', () => {
    const doneLine = {
      id: 'l-done', planId: null, amount: '300', label: 'Rent', comment: 'monthly',
      kind: 'expense', categoryId: 'cat1', toAccountId: null, accountId: 1, sortOrder: 0,
      isBroken: false, isRecurring: true, currency: 'USD',
      hasTemplate: true, lastExecutedMonth: THIS_MONTH,
    };
    const statusFor = (actual, amount, isExceeded) => new Map([['p1', {
      planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
      lines: [{
        lineId: 'l-done', broken: false, amount, actual,
        remaining: String(Number(amount) - Number(actual)), percentage: (actual / amount) * 100,
        isExceeded, status: isExceeded ? 'exceeded' : 'safe',
      }],
      totals: {
        expectedIncome: '1000.00', actualIncome: '0.00', allocated: amount,
        totalActual: actual, plannedRemainder: '700.00', actualRemainder: '1000.00',
      },
      unconvertible: [],
    }]]);

    it('collapses a done row to a single line — no fill, no comment', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [doneLine],
        planStatuses: statusFor('300', '300', false),
      });
      const { getByTestId, queryByTestId, queryByText } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-done')).toBeTruthy());
      // A done line's fill reads 100% by construction of "executed" — which is
      // what the check badge already says.
      expect(queryByTestId('plan-line-fill-l-done')).toBeNull();
      expect(queryByText('monthly')).toBeNull();
      expect(getByTestId('plan-line-check-l-done')).toBeTruthy();
    });

    it('still shows the fill on a done row that went over target', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [doneLine],
        planStatuses: statusFor('420', '300', true),
      });
      const { getByTestId, getByText } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-done')).toBeTruthy());
      // Overspend is news; burying it under a state the user set by hand is how
      // a row stops being worth reading.
      expect(getByText('420 / 300')).toBeTruthy();
      expect(getByTestId('plan-line-fill-l-done')).toBeTruthy();
      expect(fillTone(getByTestId, 'l-done')).toContain(COLORS.overspend);
    });

    // The row's fill IS its progress bar. Whether the spend is ahead of the
    // month's pace is said in the fill's TONE — there is no vertical "today"
    // marker anymore: Android draws a 1dp dashed border solid, so one per row at
    // the same x stacked into an unbroken grey line down the card that read as a
    // rendering artefact rather than as a date.
    const pacedLine = (id, actual, amount, isExceeded = false) => ({
      plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
      lines: [{
        id, planId: 'p1', amount, label: 'Food', comment: null, kind: 'expense',
        categoryId: 'cat1', toAccountId: null, sortOrder: 0, isBroken: false,
      }],
      planStatuses: new Map([['p1', {
        planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
        lines: [{
          lineId: id, broken: false, amount, actual,
          remaining: String(Number(amount) - Number(actual)),
          percentage: (Number(actual) / Number(amount)) * 100,
          isExceeded, status: isExceeded ? 'exceeded' : 'safe',
        }],
        totals: {
          expectedIncome: '1000.00', actualIncome: '0.00', allocated: amount,
          totalActual: actual, plannedRemainder: '0.00', actualRemainder: '0.00',
        },
        unconvertible: [],
      }]]),
    });

    const fillTone = (getByTestId, id) =>
      StyleSheet.flatten(getByTestId(`plan-line-fill-${id}-bar`).props.style).backgroundColor;

    it('draws no vertical today marker across the fill on the current month', async () => {
      setPlans(pacedLine('l-pace', '10', '100'));
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-fill-l-pace')).toBeTruthy());
      expect(queryByTestId('plan-line-fill-l-pace-pace')).toBeNull();
    });

    it('draws no vertical today marker on a month that is not the current one either', async () => {
      const previous = pacedLine('l-pace', '10', '100');
      previous.plans[0].month = PREV_MONTH;
      previous.planStatuses = new Map([['p1', {
        ...previous.planStatuses.get('p1'), month: PREV_MONTH,
      }]]);
      setPlans(previous);
      const { getByTestId, queryByTestId } = await renderSection(undefined, { month: PREV_MONTH });
      await waitFor(() => expect(getByTestId('plan-line-fill-l-pace')).toBeTruthy());
      expect(queryByTestId('plan-line-fill-l-pace-pace')).toBeNull();
    });

    // Three signals, replacing four fixed spent-percentage bands. The old scale
    // graded how much of the envelope was gone without knowing the date, so 99%
    // on the 27th and 76% on the 3rd came out the same shade of "fine".
    it('leaves a line that is behind the month pace untinted', async () => {
      // 1% spent — behind any pace, on any day. Colour is spent only where there
      // is something to say: with every row tinted, ten coloured blocks sat side
      // by side and none of them stood out.
      setPlans(pacedLine('l-calm', '1', '100'));
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-fill-l-calm')).toBeTruthy());
      const tone = fillTone(getByTestId, 'l-calm');
      expect(tone).toContain(COLORS.mutedText);
      expect(tone).not.toContain(COLORS.warning);
      expect(tone).not.toContain(COLORS.overspend);
    });

    it('tints a line that is ahead of the month pace with the warning tone', async () => {
      // 99% spent — ahead of the month's pace on any day of it.
      setPlans(pacedLine('l-ahead', '99', '100'));
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-fill-l-ahead')).toBeTruthy());
      expect(fillTone(getByTestId, 'l-ahead')).toContain(COLORS.warning);
    });

    it('tints a line past its target with the overspend tone', async () => {
      setPlans(pacedLine('l-over', '140', '100', true));
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-fill-l-over')).toBeTruthy());
      expect(fillTone(getByTestId, 'l-over')).toContain(COLORS.overspend);
    });

    it('states the ratio once in the template strip', async () => {
      setPlans({
        plans: [],
        lines: [
          TEMPLATE_LINE,
          { ...TEMPLATE_LINE, id: 'l-tpl2', lastExecutedMonth: THIS_MONTH },
        ],
      });
      const { getByTestId, queryByText } = await renderSection();
      await waitFor(() => expect(getByTestId('summary-done-count')).toHaveTextContent('1 / 2'));
      // The bar under it draws the same ratio; a "done: 1 / remaining: 1" line
      // below that was a third and fourth statement of one fact.
      expect(getByTestId('summary-progress-bar')).toBeTruthy();
      expect(queryByText('done_count: 1')).toBeNull();
      expect(queryByText('remaining_count: 1')).toBeNull();
    });

    it('has no add rows — the screen FAB owns adding', async () => {
      setPlans({ plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }], lines: [] });
      const { queryByTestId } = await renderSection();
      expect(queryByTestId('plan-add-line')).toBeNull();
      expect(queryByTestId('plan-add-income')).toBeNull();
    });
  });

  describe('Single-currency display', () => {
    // The screen is scoped to one selected currency, so no amount on it may be
    // printed in another. A recurring line that stores its own currency used to
    // render the STORED figure ("300000 AMD") directly above a progress bar built
    // from the converted one ("69000 / 69000" in RUB) — two units stacked with
    // nothing saying which was which. AMD→RUB is 0.23 in the bundled offline rate
    // table, so 300000 AMD is exactly the 69000 RUB the bar was already showing.
    const rubPlanWithAmdLine = () => setPlans({
      plans: [{ id: 'p1', month: THIS_MONTH, currency: 'RUB', expectedIncome: '450000' }],
      lines: [{
        id: 'l-amd', planId: null, amount: '300000', label: 'Rent', comment: null,
        kind: 'expense', categoryId: 'cat1', toAccountId: null, sortOrder: 0,
        isBroken: false, isRecurring: true, currency: 'AMD',
      }],
    });

    it('converts a foreign-currency line into the plan currency and prints no foreign code', async () => {
      rubPlanWithAmdLine();
      const { getByTestId } = await renderSection(undefined, { currency: 'RUB' });
      // 69000 RUB, as the compact magnitude a row prints.
      await waitFor(() => expect(getByTestId('plan-line-l-amd')).toHaveTextContent(/69K/));
      expect(getByTestId('plan-line-l-amd')).not.toHaveTextContent(/300/);
      expect(getByTestId('plan-line-l-amd')).not.toHaveTextContent(/AMD/);
    });

    it('counts a converted line in the local allocated total instead of skipping it', async () => {
      rubPlanWithAmdLine();
      const { getByTestId } = await renderSection(undefined, { currency: 'RUB' });
      // The local estimate used to skip any line whose currency differed from the
      // plan's, so this row contributed 0 and the remainder read the full 450000.
      await waitFor(() => expect(getByTestId('plan-totals')).toHaveTextContent(/69K RUB/));
      expect(getByTestId('plan-remainder')).toHaveTextContent(/381000/);
    });

    it('sums the template summary strip in the plan currency, not raw stored amounts', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'RUB', expectedIncome: '450000' }],
        lines: [{
          id: 'l-amd', planId: null, amount: '300000', label: 'Rent', comment: null,
          kind: 'expense', categoryId: 'cat1', toAccountId: null, accountId: 1,
          sortOrder: 0, isBroken: false, isRecurring: true, currency: 'AMD',
          hasTemplate: true, lastExecutedMonth: null,
        }],
      });
      const { getByTestId } = await renderSection(undefined, { currency: 'RUB' });
      // 300000 AMD = 69000 RUB. The strip used to add the bare stored number and
      // print "300K" with no unit at all, contradicting every other figure here.
      await waitFor(() => expect(getByTestId('summary-pending-out')).toHaveTextContent(/69K \/ 69K RUB/));
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
      // The screen is single-currency, so the amount column normally prints a
      // bare number in the plan currency. This is the one exception: with no rate
      // there is nothing to convert, so the row keeps the stored figure AND its
      // own code — a labelled foreign number is honest, an unlabelled one is not.
      // The warning sub-row just explains it, without repeating the amount.
      expect(getByTestId('plan-line-l-jpy')).toHaveTextContent(/10000 JPY/);
      expect(getByTestId('plan-line-unconvertible-l-jpy'))
        .toHaveTextContent(/graphs_currencies_not_converted/);
      // Not rendered as a normal progress bar (which would mislabel it as USD).
      expect(queryByTestId('plan-line-broken-l-jpy')).toBeNull();
    });
  });
  describe('Executable templates (Budgets v3 phase 3)', () => {
    it('offers execute / mark-done on a line with a template and runs the execution', async () => {
      setPlans({ plans: [], lines: [TEMPLATE_LINE] });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-execute-l-tpl')).toBeTruthy());
      expect(getByTestId('plan-line-done-l-tpl')).toBeTruthy();

      await fireEvent.press(getByTestId('plan-line-execute-l-tpl'));
      // The row's visible name rides along so the created operation is not blank
      // when the line carries no explicit label.
      await waitFor(() => expect(mockPlans.executeLine).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'l-tpl' }),
        'Rent',
      ));
      // Lines are reloaded so the row picks up its new done state.
      expect(mockPlans.getLinesForMonth).toHaveBeenCalledTimes(2);
    });

    it('marks a template done without creating an operation', async () => {
      setPlans({ plans: [], lines: [TEMPLATE_LINE] });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-done-l-tpl')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-done-l-tpl'));
      await waitFor(() => expect(mockPlans.markLineExecuted).toHaveBeenCalled());
      expect(mockPlans.executeLine).not.toHaveBeenCalled();
    });

    it('shows a done badge and an undo action once executed this month', async () => {
      setPlans({
        plans: [],
        lines: [{ ...TEMPLATE_LINE, lastExecutedMonth: THIS_MONTH }],
      });
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-check-l-tpl')).toBeTruthy());
      expect(queryByTestId('plan-line-execute-l-tpl')).toBeNull();
      await fireEvent.press(getByTestId('plan-line-undo-l-tpl'));
      await waitFor(() => expect(mockPlans.unmarkLineExecuted).toHaveBeenCalledWith('l-tpl'));
    });

    it('does not offer execution for a month other than the current one', async () => {
      setPlans({ plans: [], lines: [TEMPLATE_LINE] });
      const { getByTestId, queryByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-execute-l-tpl')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-next-month'));
      await waitFor(() => expect(queryByTestId('plan-line-execute-l-tpl')).toBeNull());
    });

    it('reports execution feedback to the host via onNotify', async () => {
      setPlans({ plans: [], lines: [TEMPLATE_LINE] });
      const onNotify = jest.fn();
      const { getByTestId } = await renderSection(undefined, { onNotify });
      await waitFor(() => expect(getByTestId('plan-line-execute-l-tpl')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-execute-l-tpl'));
      await waitFor(() => expect(onNotify).toHaveBeenCalledWith('added_to_operations'));
    });

    it('summarizes template progress (pending out / done / pending in)', async () => {
      setPlans({
        plans: [],
        lines: [
          TEMPLATE_LINE,
          {
            ...TEMPLATE_LINE, id: 'l-inc', kind: 'income', label: 'Salary', amount: '220000',
            categoryId: null, accountId: 2, lastExecutedMonth: THIS_MONTH,
          },
        ],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('planned-summary-strip')).toBeTruthy());
      expect(getByTestId('summary-done-count')).toHaveTextContent('1 / 2');
      // The strip now labels its currency, and sums with the same precise decimal
      // math as the totals row — it used to add bare parseFloat values across
      // whatever currencies the templates stored and print them with no unit.
      expect(getByTestId('summary-pending-out')).toHaveTextContent(/65K \/ 65K USD/);
      // The income template is already done, so nothing is pending in.
      expect(getByTestId('summary-pending-in')).toHaveTextContent(/0 \/ 220K USD/);
    });

    it('has no summary strip when no line carries a template', async () => {
      setPlans({
        plans: [],
        lines: [{ ...TEMPLATE_LINE, accountId: null, hasTemplate: false }],
      });
      const { queryByTestId, getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-tpl')).toBeTruthy());
      expect(queryByTestId('planned-summary-strip')).toBeNull();
    });

    // Regression: the row's meta line reused the `execute` button caption, so it
    // read as a command sitting where its sibling branch prints a state ("done")
    // — and it kept saying so on months where execution is disabled anyway.
    // The uppercase "RECURRING · PENDING_EXECUTION" line under every row is gone
    // — it repeated the default on nearly all of them while being the loudest
    // thing after the amount. Scope is a glyph beside the name, template state is
    // a badge on the category icon, and both are spelled out in the row's
    // accessibility label, which a screen reader reads and a glyph cannot say.
    it('marks a pending template with a badge and names the state for a screen reader', async () => {
      setPlans({ plans: [], lines: [TEMPLATE_LINE] });
      const { queryByText, getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-tpl')).toBeTruthy());
      expect(getByTestId('plan-line-pending-l-tpl')).toBeTruthy();
      expect(getByTestId('plan-line-recurring-l-tpl')).toBeTruthy();
      expect(getByTestId('plan-line-l-tpl').props.accessibilityLabel)
        .toContain('recurring, pending_execution');
      expect(queryByText('recurring · pending_execution')).toBeNull();
    });

    it('marks an executed template as done and drops the pending badge', async () => {
      setPlans({ plans: [], lines: [{ ...TEMPLATE_LINE, lastExecutedMonth: THIS_MONTH }] });
      const { queryByTestId, getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-l-tpl')).toBeTruthy());
      expect(getByTestId('plan-line-check-l-tpl')).toBeTruthy();
      expect(queryByTestId('plan-line-pending-l-tpl')).toBeNull();
      expect(getByTestId('plan-line-l-tpl').props.accessibilityLabel).toContain('recurring, done');
    });
  });

  describe('Income lines (Budgets v3 phase 3)', () => {
    it('sums income lines into the expected income shown in the income header', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '0' }],
        lines: [
          { id: 'i1', planId: 'p1', amount: '220', label: 'Salary', comment: null, kind: 'income', categoryId: null, toAccountId: null, sortOrder: 0, isBroken: false, isRecurring: false, currency: null },
          { id: 'i2', planId: 'p1', amount: '180', label: 'Advance', comment: null, kind: 'income', categoryId: null, toAccountId: null, sortOrder: 1, isBroken: false, isRecurring: false, currency: null },
          { id: 'l1', planId: 'p1', amount: '300', label: 'Groceries', comment: null, kind: 'expense', categoryId: 'cat1', toAccountId: null, sortOrder: 2, isBroken: false, isRecurring: false, currency: null },
        ],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-i1')).toBeTruthy());
      // Expected income = 220 + 180 = 400; income lines are NOT allocations, so
      // allocated stays 300 and the remainder is 100.
      expect(getByTestId('plan-income-total')).toHaveTextContent(/400 USD/);
      expect(getByTestId('plan-totals')).toHaveTextContent(/300 USD/);
      expect(getByTestId('plan-remainder')).toHaveTextContent(/100\.00/);
    });

    it('falls back to the stored expected income of the plan when there are no income lines', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '1000' }],
        lines: [],
      });
      const { getByTestId } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-income-total')).toBeTruthy());
      expect(getByTestId('plan-income-total')).toHaveTextContent(/1K USD/);
    });

    it('renders no progress bar for an income line', async () => {
      setPlans({
        plans: [{ id: 'p1', month: THIS_MONTH, currency: 'USD', expectedIncome: '0' }],
        lines: [
          { id: 'i1', planId: 'p1', amount: '220', label: 'Salary', comment: null, kind: 'income', categoryId: null, toAccountId: null, sortOrder: 0, isBroken: false, isRecurring: false, currency: null },
        ],
        planStatuses: new Map([['p1', {
          planId: 'p1', month: THIS_MONTH, currency: 'USD', convertAll: false,
          lines: [{ lineId: 'i1', broken: false, amount: '220', actual: '0', remaining: '220', percentage: 0, isExceeded: false, status: 'income' }],
          totals: {
            expectedIncome: '220.00', actualIncome: '150.00', allocated: '0.00',
            totalActual: '0.00', plannedRemainder: '220.00', actualRemainder: '150.00',
          },
          unconvertible: [],
        }]]),
      });
      const { getByTestId, queryByText } = await renderSection();
      await waitFor(() => expect(getByTestId('plan-line-i1')).toBeTruthy());
      expect(queryByText('0 / 220')).toBeNull();
      expect(getByTestId('plan-income-total')).toHaveTextContent(/150 \/ 220 USD/);
    });
  });
});
