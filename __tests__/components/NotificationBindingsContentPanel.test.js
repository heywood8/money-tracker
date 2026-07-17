import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
    ],
  }),
}));

jest.mock('../../app/services/NotificationRulesDB');
jest.mock('../../app/services/AccountsDB');
jest.mock('../../app/services/notifications/processBankNotifications');

const CARD_ACCOUNT = { id: 1, name: 'Checking', currency: 'AMD', cardMask: '4083***7027' };
const CASH_ACCOUNT = { id: 2, name: 'Cash', currency: 'AMD', cardMask: null };
const CATEGORY_RULE = {
  id: 'r1', merchant: 'COFFEE HOUSE', packageName: 'am.bank', categoryId: 'c1', labelOverride: null,
};
const LABEL_RULE = {
  id: 'r2', merchant: 'GROCERY', packageName: null, categoryId: null, labelOverride: 'Grocery Co',
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
    NotificationRulesDB.upsertMerchantRule.mockResolvedValue();
    NotificationRulesDB.upsertMerchantLabel.mockResolvedValue();
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

  it('removes a name binding via clearMerchantRuleLabel', async () => {
    mockAccounts = [CASH_ACCOUNT];
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([LABEL_RULE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);

    const { getAllByLabelText, getByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('GROCERY')).toBeTruthy());
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    fireEvent.press(await waitFor(() => getByLabelText('delete')));
    await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleLabel).toHaveBeenCalledWith('r2'));
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
