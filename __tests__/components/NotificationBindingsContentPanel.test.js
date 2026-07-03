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
    AccountsDB.setAccountCardMask.mockResolvedValue();
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

  it('removes a card binding by clearing the account card mask', async () => {
    const { getAllByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('4083***7027')).toBeTruthy());
    // First remove button belongs to the card binding (rendered first).
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledWith(1, { cardMask: null }, false));
  });

  it('removes the ATM cash target binding', async () => {
    const { getAllByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('notification_bindings_atm')).toBeTruthy());
    // The ATM row is the second binding in the card section (after the card row).
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[1]);
    await waitFor(() => expect(pipeline.clearAtmTargetAccount).toHaveBeenCalled());
  });

  it('removes a category binding via clearMerchantRuleCategory', async () => {
    mockAccounts = [CASH_ACCOUNT];
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([CATEGORY_RULE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);

    const { getAllByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('COFFEE HOUSE')).toBeTruthy());
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleCategory).toHaveBeenCalledWith('r1'));
  });

  it('removes a name binding via clearMerchantRuleLabel', async () => {
    mockAccounts = [CASH_ACCOUNT];
    NotificationRulesDB.getAllMerchantRules.mockResolvedValue([LABEL_RULE]);
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);

    const { getAllByLabelText, getByText } = await render(<NotificationBindingsContentPanel />);
    await waitFor(() => expect(getByText('GROCERY')).toBeTruthy());
    fireEvent.press(getAllByLabelText('notification_bindings_remove')[0]);
    await waitFor(() => expect(NotificationRulesDB.clearMerchantRuleLabel).toHaveBeenCalledWith('r2'));
  });
});
