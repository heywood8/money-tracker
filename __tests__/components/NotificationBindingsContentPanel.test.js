import React from 'react';
import { render, fireEvent, waitFor, within, act } from '@testing-library/react-native';
import NotificationBindingsContentPanel from '../../app/components/NotificationBindingsContentPanel';
import * as NotificationRulesDB from '../../app/services/NotificationRulesDB';
import * as AccountsDB from '../../app/services/AccountsDB';
import * as pipeline from '../../app/services/notifications/processBankNotifications';

// Mutable so each test can shape the accounts list (jest requires the `mock`
// prefix to reference it from the hoisted factory below).
let mockAccounts;
const mockUpdateAccount = jest.fn();
const mockReloadAccounts = jest.fn();

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff', surface: '#f5f5f5', primary: '#6200ee',
      text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
      delete: '#d9534f',
    },
  }),
}));
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({ accounts: mockAccounts }),
}));
jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: () => ({
    updateAccount: mockUpdateAccount,
    reloadAccounts: mockReloadAccounts,
  }),
}));
jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: 'c1', name: 'Food', categoryType: 'expense', parentId: null },
      { id: 'c2', name: 'Salary', categoryType: 'income', parentId: null },
      { id: 'f1', name: 'Shopping', type: 'folder', categoryType: 'expense', parentId: null },
      { id: 'c3', name: 'Books', type: 'entry', categoryType: 'expense', parentId: 'f1' },
    ],
  }),
}));

jest.mock('../../app/services/NotificationRulesDB');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/services/notifications/processBankNotifications');
// The secondary-label editors' suggestions, kept off the DB.
jest.mock('../../app/hooks/useLabelSuggestions', () => ({
  __esModule: true,
  default: jest.fn(() => []),
}));

const CARD_ACCOUNT = { id: 1, name: 'Checking', currency: 'AMD', cardMask: '4083***7027' };
const CASH_ACCOUNT = { id: 2, name: 'Cash', currency: 'AMD', cardMask: null };
const CATEGORY_RULE = {
  id: 'r1', merchant: 'COFFEE HOUSE', packageName: 'am.bank', categoryId: 'c1', labelOverride: null,
};
const LABEL_RULE = {
  id: 'r2', merchant: 'GROCERY', packageName: null, categoryId: null, labelOverride: 'Grocery Co',
};
const SKIP_RULE = {
  id: 'r3', merchant: 'AMERIABANK API GATE', packageName: 'am.bank', categoryId: null,
  labelOverride: null, skipCategory: true,
};

describe('NotificationBindingsContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccounts = [CARD_ACCOUNT, CASH_ACCOUNT];
    mockUpdateAccount.mockResolvedValue();
    mockReloadAccounts.mockResolvedValue();
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([CATEGORY_RULE, LABEL_RULE]);
    NotificationRulesDB.clearMerchantRuleCategory.mockResolvedValue();
    NotificationRulesDB.clearMerchantRuleLabel.mockResolvedValue();
    NotificationRulesDB.clearMerchantRuleSkipCategory.mockResolvedValue();
    NotificationRulesDB.upsertMerchantRule.mockResolvedValue();
    NotificationRulesDB.upsertMerchantLabel.mockResolvedValue();
    NotificationRulesDB.upsertMerchantSkipCategory.mockResolvedValue();
    NotificationRulesDB.upsertMerchantSecondaryLabels.mockResolvedValue();
    NotificationRulesDB.clearMerchantRuleSecondaryLabels.mockResolvedValue();
    NotificationRulesDB.clearMerchantRuleLabels.mockResolvedValue();
    AccountsDB.addAccountCardMask.mockResolvedValue();
    AccountsDB.removeAccountCardMask.mockResolvedValue();
    pipeline.resolveAtmTargetAccount.mockResolvedValue({ id: 2, name: 'Cash', currency: 'AMD' });
    pipeline.setAtmTargetAccount.mockResolvedValue();
    pipeline.clearAtmTargetAccount.mockResolvedValue();
  });

  it('lists card, ATM, category, and name bindings', async () => {
    const { getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('4083***7027')).toBeTruthy());
    expect(getByText('notification_bindings_atm')).toBeTruthy();
    expect(getByText('COFFEE HOUSE')).toBeTruthy();
    expect(getByText('GROCERY')).toBeTruthy();
  });

  it('shows an empty state when there are no bindings at all', async () => {
    mockAccounts = [CASH_ACCOUNT];
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);

    const { getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('notification_bindings_empty')).toBeTruthy());
  });

  it('removes a card binding by dropping just that card from the account', async () => {
    const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('4083***7027')).toBeTruthy());
    // Removal is two-tap: arm the first row (the card), then confirm.
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    const confirm = await waitFor(() => getByLabelText('delete'));
    fireEvent.press(confirm);
    await waitFor(() => expect(AccountsDB.removeAccountCardMask).toHaveBeenCalledWith(1, '4083***7027'));
  });

  it('does not remove a binding when the delete confirmation is cancelled', async () => {
    const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('4083***7027')).toBeTruthy());
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]); // arm
    fireEvent.press(await waitFor(() => getByLabelText('cancel'))); // back out
    expect(AccountsDB.removeAccountCardMask).not.toHaveBeenCalled();
  });

  it('lists each card of a multi-card account as its own binding row', async () => {
    mockAccounts = [{ id: 1, name: 'Checking', currency: 'AMD', cardMask: '4083***7027|*1234' }, CASH_ACCOUNT];
    const { getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('4083***7027')).toBeTruthy());
    expect(getByText('*1234')).toBeTruthy();
  });

  it('removes the ATM cash target binding', async () => {
    const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('notification_bindings_atm')).toBeTruthy());
    // The ATM row is the second binding in the card section (after the card row).
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[1]); // arm ATM
    fireEvent.press(await waitFor(() => getByLabelText('delete'))); // confirm
    await waitFor(() => expect(pipeline.clearAtmTargetAccount).toHaveBeenCalled());
  });

  it('removes a category binding via clearMerchantRuleCategory', async () => {
    mockAccounts = [CASH_ACCOUNT];
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([CATEGORY_RULE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);

    const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('COFFEE HOUSE')).toBeTruthy());
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    fireEvent.press(await waitFor(() => getByLabelText('delete')));
    await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleCategory).toHaveBeenCalledWith('r1'));
  });

  describe('Category picker', () => {
    beforeEach(() => {
      mockAccounts = [CASH_ACCOUNT];
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([CATEGORY_RULE]);
      pipeline.resolveAtmTargetAccount.mockResolvedValue(null);
    });

    it('shows the category tile grid only after the field is tapped', async () => {
      const { getByTestId, queryByTestId } = await render(<NotificationBindingsContentPanel />);
      const field = await waitFor(() => getByTestId('binding-category-field-r1'));
      expect(queryByTestId('binding-category-option-r1-c1')).toBeNull();
      await fireEvent.press(field);
      expect(getByTestId('binding-category-option-r1-c1')).toBeTruthy();
      // Root level of the tree: the folder is a tile, its child is not shown yet,
      // and income categories are filtered out.
      expect(getByTestId('binding-category-option-r1-f1')).toBeTruthy();
      expect(queryByTestId('binding-category-option-r1-c3')).toBeNull();
      expect(queryByTestId('binding-category-option-r1-c2')).toBeNull();
    });

    it('drills into a folder and re-points the binding to the nested category', async () => {
      const { getByTestId, queryByTestId } = await render(<NotificationBindingsContentPanel />);
      await fireEvent.press(await waitFor(() => getByTestId('binding-category-field-r1')));
      await fireEvent.press(getByTestId('binding-category-option-r1-f1'));
      await fireEvent.press(getByTestId('binding-category-option-r1-c3'));
      await waitFor(() => expect(NotificationRulesDB.upsertMerchantRule)
        .toHaveBeenCalledWith('COFFEE HOUSE', 'c3', 'am.bank', { overrideSkip: true }));
      // Picking collapses the grid.
      expect(queryByTestId('binding-category-option-r1-c1')).toBeNull();
    });

    it('switches a bound merchant to "don’t bind" from the unfolded grid', async () => {
      const { getByTestId, queryByTestId } = await render(<NotificationBindingsContentPanel />);
      await fireEvent.press(await waitFor(() => getByTestId('binding-category-field-r1')));
      await fireEvent.press(getByTestId('binding-category-skip-r1'));
      await waitFor(() => expect(NotificationRulesDB.upsertMerchantSkipCategory)
        .toHaveBeenCalledWith('COFFEE HOUSE', 'am.bank'));
      expect(NotificationRulesDB.upsertMerchantRule).not.toHaveBeenCalled();
      expect(queryByTestId('binding-category-option-r1-c1')).toBeNull();
    });
  });

  describe('"Don’t bind to category" merchants', () => {
    beforeEach(() => {
      mockAccounts = [CASH_ACCOUNT];
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([SKIP_RULE]);
      pipeline.resolveAtmTargetAccount.mockResolvedValue(null);
    });

    it('lists the merchant under category bindings with the option as its value', async () => {
      const { getByText, getByTestId } = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(getByText('AMERIABANK API GATE')).toBeTruthy());
      expect(getByTestId('binding-category-field-r3')).toBeTruthy();
      expect(getByText('bank_notifications_skip_category_binding')).toBeTruthy();
    });

    it('lifts the mark via clearMerchantRuleSkipCategory, not clearMerchantRuleCategory', async () => {
      const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(getByText('AMERIABANK API GATE')).toBeTruthy());
      fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
      fireEvent.press(await waitFor(() => getByLabelText('delete')));
      await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleSkipCategory).toHaveBeenCalledWith('r3'));
      expect(NotificationRulesDB.clearMerchantRuleCategory).not.toHaveBeenCalled();
    });

    it('replaces the mark with a category picked from the grid', async () => {
      const { getByTestId } = await render(<NotificationBindingsContentPanel />);
      await fireEvent.press(await waitFor(() => getByTestId('binding-category-field-r3')));
      await fireEvent.press(getByTestId('binding-category-option-r3-c1'));
      await waitFor(() => expect(NotificationRulesDB.upsertMerchantRule)
        .toHaveBeenCalledWith('AMERIABANK API GATE', 'c1', 'am.bank', { overrideSkip: true }));
    });

    it('offers no "don’t bind" option for a merchant already marked that way', async () => {
      const { getByTestId, queryByTestId } = await render(<NotificationBindingsContentPanel />);
      await fireEvent.press(await waitFor(() => getByTestId('binding-category-field-r3')));
      expect(getByTestId('binding-category-option-r3-c1')).toBeTruthy();
      expect(queryByTestId('binding-category-skip-r3')).toBeNull();
    });
  });

  it('removes a name binding, with its secondary labels, via clearMerchantRuleLabels', async () => {
    mockAccounts = [CASH_ACCOUNT];
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([LABEL_RULE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);

    const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('GROCERY')).toBeTruthy());
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    fireEvent.press(await waitFor(() => getByLabelText('delete')));
    await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleLabels).toHaveBeenCalledWith('r2'));
    expect(NotificationRulesDB.clearMerchantRuleLabel).not.toHaveBeenCalled();
  });

  describe('secondary labels on a name binding', () => {
    const TAGGED_RULE = { ...LABEL_RULE, secondaryLabels: ['Food', 'Weekly'] };
    const TAGS_ONLY_RULE = {
      id: 'r4', merchant: 'N. DORVANYAN', packageName: 'am.bank', categoryId: null,
      labelOverride: null, secondaryLabels: ['Rent'],
    };
    const editorOf = (utils, id) => utils.getByTestId(`binding-secondary-labels-${id}`);

    it('shows a binding’s secondary labels as chips under its name', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([TAGGED_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('GROCERY')).toBeTruthy());
      const editor = within(editorOf(utils, 'r2'));
      expect(editor.getByText('Food')).toBeTruthy();
      expect(editor.getByText('Weekly')).toBeTruthy();
    });

    it('lists a binding that has secondary labels but no name', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([TAGS_ONLY_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('N. DORVANYAN')).toBeTruthy());
      expect(within(editorOf(utils, 'r4')).getByText('Rent')).toBeTruthy();
    });

    it('saves an added label at once', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([TAGGED_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('GROCERY')).toBeTruthy());
      const input = within(editorOf(utils, 'r2')).getByTestId('label-input-field');
      await fireEvent.changeText(input, 'Family,');
      await waitFor(() => expect(NotificationRulesDB.upsertMerchantSecondaryLabels).toHaveBeenCalledWith(
        'GROCERY', ['Food', 'Weekly', 'Family'], null,
      ));
    });

    it('writes quick edits in order and reloads only once they have all landed', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([TAGGED_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('GROCERY')).toBeTruthy());
      const reloadsAtMount = NotificationRulesDB.getAllMerchantRules.mock.calls.length;

      let releaseFirst;
      NotificationRulesDB.upsertMerchantSecondaryLabels.mockImplementationOnce(
        () => new Promise((resolve) => { releaseFirst = resolve; }),
      );
      const input = within(editorOf(utils, 'r2')).getByTestId('label-input-field');
      await fireEvent.changeText(input, 'Family,');
      await fireEvent.changeText(input, 'Kids,');
      // Both chips are up while the first write is still pending, and nothing
      // has reloaded over them.
      expect(within(editorOf(utils, 'r2')).getByText('Kids')).toBeTruthy();
      expect(NotificationRulesDB.getAllMerchantRules).toHaveBeenCalledTimes(reloadsAtMount);

      await act(async () => { releaseFirst(); });
      await waitFor(() => expect(NotificationRulesDB.upsertMerchantSecondaryLabels).toHaveBeenCalledTimes(2));
      expect(NotificationRulesDB.upsertMerchantSecondaryLabels).toHaveBeenLastCalledWith(
        'GROCERY', ['Food', 'Weekly', 'Family', 'Kids'], null,
      );
      await waitFor(() => expect(NotificationRulesDB.getAllMerchantRules).toHaveBeenCalledTimes(reloadsAtMount + 1));
    });

    it('clears the column when the last label is removed', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([TAGS_ONLY_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('N. DORVANYAN')).toBeTruthy());
      await fireEvent.press(within(editorOf(utils, 'r4')).getByTestId('label-remove-Rent'));
      await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleSecondaryLabels).toHaveBeenCalledWith('r4'));
      expect(NotificationRulesDB.upsertMerchantSecondaryLabels).not.toHaveBeenCalled();
    });

    it('keeps the secondary labels when only the name is blanked and saved', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([TAGGED_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('GROCERY')).toBeTruthy());
      await fireEvent.changeText(utils.getByDisplayValue('Grocery Co'), '');
      await fireEvent.press(utils.getByLabelText('save'));
      await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleLabel).toHaveBeenCalledWith('r2'));
      expect(NotificationRulesDB.clearMerchantRuleLabels).not.toHaveBeenCalled();
    });

    it('finds a binding by one of its secondary labels', async () => {
      NotificationRulesDB.getAllMerchantRules.mockResolvedValue([CATEGORY_RULE, TAGGED_RULE]);
      const utils = await render(<NotificationBindingsContentPanel />);
      await waitFor(() => expect(utils.getByText('GROCERY')).toBeTruthy());
      await fireEvent.changeText(utils.getByPlaceholderText('search'), 'week');
      await waitFor(() => expect(utils.queryByText('COFFEE HOUSE')).toBeNull());
      expect(utils.getByText('GROCERY')).toBeTruthy();
    });
  });

  it('binds a card by hand from the add-card editor', async () => {
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);
    const { getByLabelText, getByPlaceholderText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByLabelText('notification_bindings_add_card')).toBeTruthy());
    fireEvent.press(getByLabelText('notification_bindings_add_card'));
    // Account picker defaults to the first account (id 1); type the last 4 digits.
    const last4 = await waitFor(() => getByPlaceholderText('notification_bindings_card_last4'));
    fireEvent.changeText(last4, '9999');
    fireEvent.press(await waitFor(() => getByLabelText('save')));
    await waitFor(() => expect(AccountsDB.addAccountCardMask).toHaveBeenCalledWith(1, '9999'));
  });

  it('filters every section by the search query', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('COFFEE HOUSE')).toBeTruthy());
    fireEvent.changeText(getByPlaceholderText('search'), 'grocery');
    await waitFor(() => expect(queryByText('COFFEE HOUSE')).toBeNull());
    expect(getByText('GROCERY')).toBeTruthy();
    expect(queryByText('4083***7027')).toBeNull();
  });
});
