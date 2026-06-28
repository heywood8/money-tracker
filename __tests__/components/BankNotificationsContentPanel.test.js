import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BankNotificationsContentPanel from '../../app/components/BankNotificationsContentPanel';
import * as pipeline from '../../app/services/notifications/processBankNotifications';
import * as PendingNotificationsDB from '../../app/services/PendingNotificationsDB';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff', surface: '#f5f5f5', primary: '#6200ee',
      text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
    },
  }),
}));
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    accounts: [{ id: 1, name: 'Checking', currency: 'AMD' }],
  }),
}));
jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: 'c1', name: 'Food', type: 'entry', categoryType: 'expense', isShadow: false },
      { id: 'c2', name: 'Salary', type: 'entry', categoryType: 'income', isShadow: false },
    ],
  }),
}));

jest.mock('../../app/services/notifications/processBankNotifications');
jest.mock('../../app/services/PendingNotificationsDB');

const PENDING = {
  id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '3900.00', currency: 'AMD',
  cardMask: '4083***7027', merchant: 'NAREK MEHRABYAN', date: '2026-06-28',
  accountId: null, categoryId: null, packageName: 'am.bank',
};

describe('BankNotificationsContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pipeline.isBankNotificationsEnabled.mockResolvedValue(true);
    pipeline.processBankNotifications.mockResolvedValue({ created: 0, pending: 1, skipped: 0 });
    pipeline.resolvePendingNotification.mockResolvedValue({ id: 1 });
    pipeline.dismissPendingNotification.mockResolvedValue();
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([PENDING]);
  });

  it('processes on mount and lists the pending notification', async () => {
    const { getByText } = await render(<BankNotificationsContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());
    expect(pipeline.processBankNotifications).toHaveBeenCalled();
    expect(getByText('3900.00 AMD')).toBeTruthy();
  });

  it('shows the empty state when nothing is pending', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
    const { getByText } = await render(<BankNotificationsContentPanel />);
    await waitFor(() => expect(getByText('bank_notifications_empty')).toBeTruthy());
  });

  it('does not process on mount when disabled', async () => {
    pipeline.isBankNotificationsEnabled.mockResolvedValue(false);
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
    render(<BankNotificationsContentPanel />);
    await waitFor(() => expect(PendingNotificationsDB.getPendingNotifications).toHaveBeenCalled());
    expect(pipeline.processBankNotifications).not.toHaveBeenCalled();
  });

  it('dismisses a pending item', async () => {
    const { getByText } = await render(<BankNotificationsContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());
    fireEvent.press(getByText('dismiss'));
    await waitFor(() =>
      expect(pipeline.dismissPendingNotification).toHaveBeenCalledWith('p1'),
    );
  });
});
