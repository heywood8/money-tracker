// __tests__/components/budgets/BudgetPlanLineModal.test.js
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BudgetPlanLineModal from '../../../app/components/budgets/BudgetPlanLineModal';

const COLORS = {
  background: '#111318',
  surface: '#1a1d24',
  card: '#1a1d24',
  text: '#e8eaf0',
  mutedText: '#7a7f8e',
  border: '#252830',
  primary: '#4A90D9',
  secondary: '#333333',
  danger: '#ff5555',
  delete: '#ff6b6b',
  selected: '#2a2e38',
  inputBackground: '#333333',
  inputBorder: '#555555',
};

jest.mock('../../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({ colors: COLORS }),
}));
jest.mock('../../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (k) => k }),
}));
jest.mock('../../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn() }),
}));
jest.mock('../../../app/components/ModalBlurOverlay', () => () => null);

// The amount is a plain FormInput, so no calculator mock is needed.

const EXPENSE_CATEGORIES = [
  { id: 'cat1', name: 'Food', icon: 'food', categoryType: 'expense' },
];
const INCOME_CATEGORIES = [
  { id: 'inc1', name: 'Salary', icon: 'cash', categoryType: 'income' },
];
const ACCOUNTS = [
  { id: 1, name: 'Savings', currency: 'USD' },
];

const baseProps = () => ({
  visible: true,
  line: null,
  initialKind: 'expense',
  currency: 'USD',
  expenseCategories: EXPENSE_CATEGORIES,
  incomeCategories: INCOME_CATEGORIES,
  accounts: ACCOUNTS,
  onSaveLine: jest.fn(),
  onDeleteLine: jest.fn(),
  onClose: jest.fn(),
});

describe('BudgetPlanLineModal', () => {
  it('refuses to save a line with no tracking target', async () => {
    const props = baseProps();
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    await waitFor(() => expect(getByTestId('plan-line-amount')).toBeTruthy());
    await fireEvent.changeText(getByTestId('plan-line-amount'), '100');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).not.toHaveBeenCalled();
    await waitFor(() => expect(getByTestId('plan-line-error')).toBeTruthy());
  });

  it('saves a category-linked line once a target is chosen', async () => {
    const props = baseProps();
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    // Open the target picker and select the expense category.
    await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
    // The picker stays open for further categories now, so close it explicitly.
    await fireEvent.press(getByTestId('plan-target-done'));
    await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      amount: '150',
      categoryIds: ['cat1'],
      toAccountId: null,
    }));
  });

  // Migration 0021: one line, several categories.
  it('saves every category picked, and drops one that is tapped again', async () => {
    const props = {
      ...baseProps(),
      expenseCategories: [
        { id: 'cat1', name: 'Groceries', categoryType: 'expense' },
        { id: 'cat2', name: 'Cafes', categoryType: 'expense' },
        { id: 'cat3', name: 'Taxi', categoryType: 'expense' },
      ],
    };
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    await fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
    await fireEvent.press(getByTestId('plan-target-option-cat-cat2'));
    await fireEvent.press(getByTestId('plan-target-option-cat-cat3'));
    // Tapping a selected category removes it — the picker toggles, not replaces.
    await fireEvent.press(getByTestId('plan-target-option-cat-cat2'));
    await fireEvent.press(getByTestId('plan-target-done'));
    await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      categoryIds: ['cat1', 'cat3'],
    }));
  });

  it('offers no roll-up toggle — descendants always count', async () => {
    const props = baseProps();
    const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
    expect(queryByTestId('plan-line-include-children-toggle')).toBeNull();
    await fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
    await fireEvent.press(getByTestId('plan-target-done'));
    await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
    // Still absent with a category picked — the flag is gone from the UI entirely.
    expect(queryByTestId('plan-line-include-children-toggle')).toBeNull();
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(
      expect.not.objectContaining({ includeChildren: expect.anything() }),
    );
  });

  it('seeds the picker from an edited line\'s stored category set', async () => {
    const props = {
      ...baseProps(),
      expenseCategories: [
        { id: 'cat1', name: 'Groceries', categoryType: 'expense' },
        { id: 'cat2', name: 'Cafes', categoryType: 'expense' },
      ],
      line: {
        id: 'l1', amount: '150', kind: 'expense',
        categoryId: 'cat1', categoryIds: ['cat1', 'cat2'],
      },
    };
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-line-save'));
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      categoryIds: ['cat1', 'cat2'],
    }));
  });

  it('saves an account (transfer) target line', async () => {
    const props = baseProps();
    const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
    await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-picker'));
    await waitFor(() => expect(getByTestId('plan-target-tab-account')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-tab-account'));
    await waitFor(() => expect(getByTestId('plan-target-option-acc-1')).toBeTruthy());
    await fireEvent.press(getByTestId('plan-target-option-acc-1'));
    await fireEvent.changeText(getByTestId('plan-line-amount'), '400');
    await fireEvent.press(getByTestId('plan-line-save'));
    // Choosing a destination account settles the kind as a transfer.
    expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
      amount: '400',
      kind: 'transfer',
      categoryIds: [],
      toAccountId: 1,
    }));
  });

  // Categories nest, and the picker used to lay every level out as one flat list.
  // It now renders the app's shared category grid.
  describe('Target picker hierarchy', () => {
    const nested = [
      { id: 'food', name: 'Food', type: 'folder', categoryType: 'expense' },
      { id: 'groceries', name: 'Groceries', type: 'entry', categoryType: 'expense', parentId: 'food' },
      { id: 'taxi', name: 'Taxi', type: 'entry', categoryType: 'expense' },
    ];

    it('keeps a folder\'s children behind it until it is opened', async () => {
      const props = { ...baseProps(), expenseCategories: nested };
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-food')).toBeTruthy());
      expect(queryByTestId('plan-target-option-cat-groceries')).toBeNull();

      await fireEvent.press(getByTestId('plan-target-option-cat-food'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-groceries')).toBeTruthy());
      expect(queryByTestId('plan-target-option-cat-taxi')).toBeNull();
    });

    it('saves a nested category reached through its folder', async () => {
      const props = { ...baseProps(), expenseCategories: nested };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-food')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-food'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-groceries')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-groceries'));
      await fireEvent.press(getByTestId('plan-target-done'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        categoryIds: ['groceries'],
      }));
    });

    it('saves the folder itself as a target — its subtree rolls up into it', async () => {
      const props = { ...baseProps(), expenseCategories: nested };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-food')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-food'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-whole-food')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-whole-food'));
      await fireEvent.press(getByTestId('plan-target-done'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        categoryIds: ['food'],
      }));
    });
  });

  describe('Account pickers', () => {
    const multiCurrency = [
      { id: 1, name: 'Savings', currency: 'USD', balance: '100' },
      { id: 2, name: 'Cash amd', currency: 'AMD', balance: '5000' },
      { id: 3, name: 'Checking', currency: 'USD', balance: '20' },
    ];

    it('groups transfer targets by currency', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-tab-account')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-tab-account'));
      await waitFor(() => expect(getByTestId('plan-target-option-acc-1')).toBeTruthy());
      expect(getByTestId('plan-target-option-acc-group-USD')).toBeTruthy();
      expect(getByTestId('plan-target-option-acc-group-AMD')).toBeTruthy();
    });

    // The execution-account row is gone with the executable-template feature:
    // operations come from bank notifications now, so a budget line has no
    // account to run itself from. The two account pickers left are the transfer
    // TARGET and the spending-account filter.
    it('offers no execution-account row', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
      expect(queryByTestId('plan-account-picker')).toBeNull();
    });
  });

  // Migration 0024: a second, independent filter — WHERE the money left from.
  describe('Spending-account filter', () => {
    const multiCurrency = [
      { id: 1, name: 'Savings', currency: 'USD', balance: '100' },
      { id: 2, name: 'Cash amd', currency: 'AMD', balance: '5000' },
      { id: 3, name: 'Checking', currency: 'USD', balance: '20' },
    ];

    it('saves an account-only line — no category needed', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-sources-picker'));
      await waitFor(() => expect(getByTestId('plan-sources-option-1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-sources-option-1'));
      await fireEvent.press(getByTestId('plan-sources-done'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'expense',
        categoryIds: [],
        sourceAccountIds: [1],
      }));
    });

    it('toggles accounts and keeps the panel open', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-sources-picker'));
      await waitFor(() => expect(getByTestId('plan-sources-option-1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-sources-option-1'));
      await fireEvent.press(getByTestId('plan-sources-option-3'));
      // A second tap removes it — the grid toggles, it does not replace.
      await fireEvent.press(getByTestId('plan-sources-option-1'));
      await fireEvent.press(getByTestId('plan-sources-option-2'));
      await fireEvent.press(getByTestId('plan-sources-done'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        sourceAccountIds: [3, 2],
      }));
    });

    it('sends both filters when a category and an account are picked', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.press(getByTestId('plan-target-done'));
      await fireEvent.press(getByTestId('plan-sources-picker'));
      await waitFor(() => expect(getByTestId('plan-sources-option-2')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-sources-option-2'));
      await fireEvent.press(getByTestId('plan-sources-done'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        categoryIds: ['cat1'],
        sourceAccountIds: [2],
      }));
    });

    it('clears the filter back to "any account"', async () => {
      const props = {
        ...baseProps(),
        accounts: multiCurrency,
        line: {
          id: 'l1', amount: '500', kind: 'expense',
          categoryId: 'cat1', categoryIds: ['cat1'], sourceAccountIds: [1, 3],
        },
      };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-sources-picker'));
      await waitFor(() => expect(getByTestId('plan-sources-option-all')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-sources-option-all'));
      await fireEvent.press(getByTestId('plan-sources-done'));
      await fireEvent.press(getByTestId('plan-line-save'));
      // An empty array, not an omitted field: the DB layer reads "absent" as
      // "leave the filter alone", so clearing has to be said out loud.
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        sourceAccountIds: [],
      }));
    });

    it('seeds the picker from an edited line\'s stored filter', async () => {
      const props = {
        ...baseProps(),
        accounts: multiCurrency,
        line: {
          id: 'l1', amount: '500', kind: 'expense',
          categoryId: null, categoryIds: [], sourceAccountIds: [3],
        },
      };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        sourceAccountIds: [3],
      }));
    });

    it('is not offered for transfer or income lines', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      expect(getByTestId('plan-sources-picker')).toBeTruthy();
      await fireEvent.press(getByTestId('plan-line-kind-transfer'));
      await waitFor(() => expect(queryByTestId('plan-sources-picker')).toBeNull());
      await fireEvent.press(getByTestId('plan-line-kind-income'));
      expect(queryByTestId('plan-sources-picker')).toBeNull();
    });

    it('drops a filter carried over from a line switched to transfer', async () => {
      const props = { ...baseProps(), accounts: multiCurrency };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-sources-picker'));
      await waitFor(() => expect(getByTestId('plan-sources-option-1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-sources-option-1'));
      await fireEvent.press(getByTestId('plan-sources-done'));
      await fireEvent.press(getByTestId('plan-line-kind-transfer'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-tab-account')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-tab-account'));
      await fireEvent.press(getByTestId('plan-target-option-acc-2'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'transfer',
        toAccountId: 2,
        sourceAccountIds: [],
      }));
    });
  });

  describe('Target picker search', () => {
    const manyCategories = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, name: `Category ${i}`, categoryType: 'expense',
    }));

    it('offers no search field for a list that fits on one screen', async () => {
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...baseProps()} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      expect(queryByTestId('plan-target-search')).toBeNull();
    });

    it('filters a long category list down to what was typed', async () => {
      const props = { ...baseProps(), expenseCategories: manyCategories };
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-search')).toBeTruthy());
      await fireEvent.changeText(getByTestId('plan-target-search'), 'category 7');
      await waitFor(() => expect(queryByTestId('plan-target-option-cat-c0')).toBeNull());
      expect(getByTestId('plan-target-option-cat-c7')).toBeTruthy();
    });

    it('reopening the picker starts from an unfiltered list', async () => {
      const props = { ...baseProps(), expenseCategories: manyCategories };
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-search')).toBeTruthy());
      await fireEvent.changeText(getByTestId('plan-target-search'), 'category 7');
      await waitFor(() => expect(queryByTestId('plan-target-option-cat-c0')).toBeNull());
      await fireEvent.press(getByTestId('plan-target-option-cat-c7'));
      await fireEvent.press(getByTestId('plan-target-done'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-c0')).toBeTruthy());
    });
  });

  describe('Line kinds (Budgets v3 phase 3)', () => {
    it('an income line saves without requiring a target', async () => {
      const props = { ...baseProps(), initialKind: 'income' };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-amount')).toBeTruthy());
      await fireEvent.changeText(getByTestId('plan-line-amount'), '2500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'income', amount: '2500', categoryIds: [], toAccountId: null,
      }));
    });

    it('an income line offers income categories, not expense ones', async () => {
      const props = { ...baseProps(), initialKind: 'income' };
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-inc1')).toBeTruthy());
      expect(queryByTestId('plan-target-option-cat-cat1')).toBeNull();
      // ...and no transfer-target tab: income tracks no destination account.
      expect(queryByTestId('plan-target-tab-account')).toBeNull();
    });

    it('switching kind to transfer drops a category picked for an expense line', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.press(getByTestId('plan-line-kind-transfer'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '100');
      await fireEvent.press(getByTestId('plan-line-save'));
      // No destination account chosen, so the save is refused rather than saved
      // as a transfer that still carries a category.
      expect(props.onSaveLine).not.toHaveBeenCalled();
      await waitFor(() => expect(getByTestId('plan-line-error')).toBeTruthy());
    });
  });

  describe('Retired execution template', () => {
    // A saved line carries no execution account any more, and an existing line
    // that still holds one in the database must not smuggle it back through the
    // editor — that column is legacy data now, not something this form owns.
    it('never sends an execution account back to the host', async () => {
      const props = {
        ...baseProps(),
        line: {
          id: 'l1', amount: '100', label: 'Rent', comment: null, kind: 'expense',
          categoryId: 'cat1', toAccountId: null, accountId: 1, isRecurring: false, currency: 'USD',
        },
      };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(
        expect.not.objectContaining({ accountId: expect.anything() }),
      );
    });
  });

  describe('Recurring toggle (Budgets v3 phase 2)', () => {
    it('defaults a new line to one-off (isRecurring false, currency null)', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-picker'));
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ isRecurring: false, currency: null }));
    });

    it('the currency picker is offered on a one-off line too, not only a recurring one', async () => {
      const props = { ...baseProps(), accounts: [...ACCOUNTS, { id: 2, name: 'Foreign', currency: 'EUR' }] };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      expect(getByTestId('plan-line-currency-USD')).toBeTruthy();
      await fireEvent.press(getByTestId('plan-line-recurring-toggle'));
      await waitFor(() => expect(getByTestId('plan-line-currency-USD')).toBeTruthy());
    });

    it('offers no currency picker when there is only one currency to pick', async () => {
      // A single chip is the plan's own currency, permanently selected: it is
      // not a choice, and the amount's label already names that currency.
      const props = baseProps();
      const { getByTestId, queryByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      expect(queryByTestId('plan-line-currency-USD')).toBeNull();
      // ...and the line still saves as inheriting the plan's currency.
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.press(getByTestId('plan-target-done'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '150');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ currency: null }));
    });

    it('a one-off line on a currency other than the plan\'s saves that currency', async () => {
      const props = { ...baseProps(), accounts: [...ACCOUNTS, { id: 2, name: 'Foreign', currency: 'EUR' }] };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-currency-EUR')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-currency-EUR'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        isRecurring: false, currency: 'EUR',
      }));
    });

    it('a one-off line left on the plan currency still saves currency: null (inherit)', async () => {
      const props = { ...baseProps(), accounts: [...ACCOUNTS, { id: 2, name: 'Foreign', currency: 'EUR' }] };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-currency-EUR')).toBeTruthy());
      // Away and back: the picker must not pin the plan's own currency onto the row.
      await fireEvent.press(getByTestId('plan-line-currency-EUR'));
      await fireEvent.press(getByTestId('plan-line-currency-USD'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        isRecurring: false, currency: null,
      }));
    });

    it('saves a recurring line with the chosen currency and no plan-specific target requirement change', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-recurring-toggle'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '65000');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({
        amount: '65000', categoryIds: ['cat1'], isRecurring: true, currency: 'USD',
      }));
    });

    it('picking a different currency chip changes the saved currency', async () => {
      const props = { ...baseProps(), accounts: [...ACCOUNTS, { id: 2, name: 'Foreign', currency: 'EUR' }] };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-recurring-toggle')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-recurring-toggle'));
      await waitFor(() => expect(getByTestId('plan-line-currency-EUR')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-currency-EUR'));
      await fireEvent.press(getByTestId('plan-target-picker'));
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
      await fireEvent.changeText(getByTestId('plan-line-amount'), '500');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ currency: 'EUR' }));
    });

    it('initializes the toggle and currency from an existing recurring line when editing', async () => {
      const props = {
        ...baseProps(),
        line: {
          id: 'l1', amount: '65000', label: 'Rent', comment: null,
          categoryId: 'cat1', toAccountId: null, kind: 'expense', isRecurring: true, currency: 'EUR',
        },
      };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-currency-EUR')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ isRecurring: true, currency: 'EUR' }));
    });
  });

  describe('saving prop (Bug 4, adversarial review — double-tap Save guard)', () => {
    it('disables the Save button while a save is in flight', async () => {
      const props = { ...baseProps(), saving: true };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      expect(getByTestId('plan-line-save').props.accessibilityState.disabled).toBe(true);
    });

    it('ignores a Save tap while saving=true, even if the disabled style has not applied yet', async () => {
      // Belt-and-suspenders: handleSave itself checks `saving` and bails, so a
      // tap that somehow lands on the button before its disabled prop commits
      // still can't fire a second onSaveLine.
      const props = { ...baseProps(), saving: true };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).not.toHaveBeenCalled();
    });

    it('re-enables the Save button once saving becomes false', async () => {
      const props = { ...baseProps(), saving: false };
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await waitFor(() => expect(getByTestId('plan-line-save')).toBeTruthy());
      expect(getByTestId('plan-line-save').props.accessibilityState.disabled).toBe(false);
    });
  });

  // The amount field lost the Calculator that used to police its input, leaving
  // only the comma->dot normalization. `t` is the identity here, so the rendered
  // error text IS the translation key.
  describe('Amount input (regression)', () => {
    const withTarget = async (getByTestId) => {
      await waitFor(() => expect(getByTestId('plan-target-picker')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-picker'));
      await waitFor(() => expect(getByTestId('plan-target-option-cat-cat1')).toBeTruthy());
      await fireEvent.press(getByTestId('plan-target-option-cat-cat1'));
    };

    it('normalizes a locale decimal comma to a dot', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await withTarget(getByTestId);
      await fireEvent.changeText(getByTestId('plan-line-amount'), '1,5');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).toHaveBeenCalledWith(expect.objectContaining({ amount: '1.5' }));
    });

    it('normalizes EVERY comma, not just the first', async () => {
      // A single replace() left "1.234,56" — still unparseable, but it also meant
      // the field's own handler could no longer be trusted to produce a dot-only
      // value, so the invalid input reached validation instead of being normalized.
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await withTarget(getByTestId);
      await fireEvent.changeText(getByTestId('plan-line-amount'), '1,234,56');
      expect(getByTestId('plan-line-amount').props.value).toBe('1.234.56');
    });

    it('blames an unparseable amount on parsing, not on being non-positive', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await withTarget(getByTestId);
      await fireEvent.changeText(getByTestId('plan-line-amount'), '1,234,56');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).not.toHaveBeenCalled();
      await waitFor(() => expect(getByTestId('plan-line-error')).toBeTruthy());
      expect(getByTestId('plan-line-error').props.children).toBe('valid_amount_required');
    });

    it('still reports a well-formed zero as non-positive', async () => {
      const props = baseProps();
      const { getByTestId } = await render(<BudgetPlanLineModal {...props} />);
      await withTarget(getByTestId);
      await fireEvent.changeText(getByTestId('plan-line-amount'), '0');
      await fireEvent.press(getByTestId('plan-line-save'));
      expect(props.onSaveLine).not.toHaveBeenCalled();
      await waitFor(() => expect(getByTestId('plan-line-error')).toBeTruthy());
      expect(getByTestId('plan-line-error').props.children).toBe('amount_must_be_greater_than_zero');
    });

    it('labels the field with the plan currency when the line has no currency of its own', async () => {
      // A template-less one-off line stores currency: null and is priced in the
      // plan's currency; the label used to go bare in that case.
      const { getByText } = await render(<BudgetPlanLineModal {...baseProps()} currency="EUR" />);
      await waitFor(() => expect(getByText('amount · EUR')).toBeTruthy());
    });
  });
});
