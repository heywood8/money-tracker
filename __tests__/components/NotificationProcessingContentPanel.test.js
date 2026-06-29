import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationProcessingContentPanel from '../../app/components/NotificationProcessingContentPanel';
import * as pipeline from '../../app/services/notifications/processBankNotifications';
import * as PendingNotificationsDB from '../../app/services/PendingNotificationsDB';
import * as NotificationAccess from '../../app/services/NotificationAccess';
import * as notificationFilters from '../../app/services/notifications/notificationFilters';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));
jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff', surface: '#f5f5f5', primary: '#6200ee',
      text: '#000', mutedText: '#888', border: '#ddd', selected: '#eee',
      income: '#4a8a4a',
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
jest.mock('../../app/services/NotificationAccess');
jest.mock('../../app/services/notifications/notificationFilters', () => ({
  getHiddenPackages: jest.fn(),
  registerSeenPackages: jest.fn(),
  filterNotificationsByApp: jest.fn(),
}));

const PENDING = {
  id: 'p1', kind: 'PURCHASE', type: 'expense', amount: '3900.00', currency: 'AMD',
  cardMask: '4083***7027', merchant: 'NAREK MEHRABYAN', date: '2026-06-28',
  accountId: null, categoryId: null, packageName: 'am.bank',
};

// A raw notification whose text parses as a bank transaction.
const BANK_RAW = {
  title: 'АРКА транзакции',
  text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
  packageName: 'am.bank',
  postTime: 1718000000000,
};
const CHAT_RAW = {
  title: 'Chat', text: 'New message', packageName: 'com.chat', postTime: 1718000100000,
};

describe('NotificationProcessingContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NotificationAccess.getRecentNotifications.mockResolvedValue([BANK_RAW, CHAT_RAW]);
    // Re-establish filter defaults each test (clearAllMocks wipes call data only,
    // but we reset implementations here so per-test overrides can't leak).
    notificationFilters.getHiddenPackages.mockResolvedValue([]);
    notificationFilters.registerSeenPackages.mockResolvedValue([]);
    notificationFilters.filterNotificationsByApp.mockImplementation((items) => items);
    pipeline.isBankNotificationsEnabled.mockResolvedValue(true);
    pipeline.processBankNotifications.mockResolvedValue({ created: 0, pending: 1, skipped: 0 });
    pipeline.resolvePendingNotification.mockResolvedValue({ id: 1 });
    pipeline.dismissPendingNotification.mockResolvedValue();
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([PENDING]);
  });

  it('processes on mount and lists the pending notification', async () => {
    const { getByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());
    expect(pipeline.processBankNotifications).toHaveBeenCalled();
    expect(getByText('3900.00 AMD')).toBeTruthy();
  });

  it('shows the review empty state when nothing is pending', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
    const { getByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('bank_notifications_empty')).toBeTruthy());
  });

  it('does not process on mount when disabled', async () => {
    pipeline.isBankNotificationsEnabled.mockResolvedValue(false);
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
    render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(PendingNotificationsDB.getPendingNotifications).toHaveBeenCalled());
    expect(pipeline.processBankNotifications).not.toHaveBeenCalled();
  });

  it('keeps Save disabled for a C2C transfer until a category is chosen', async () => {
    // Account pre-filled, but a C2C transfer must also have a category.
    const C2C_PENDING = {
      id: 'p2', kind: 'C2C', type: 'expense', amount: '19200.00', currency: 'AMD',
      cardMask: '4083***7027', merchant: 'N. DORVANYAN', date: '2026-06-28',
      accountId: 1, categoryId: null, packageName: 'am.bank',
    };
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([C2C_PENDING]);
    const { getByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('N. DORVANYAN')).toBeTruthy());

    fireEvent.press(getByText('save'));
    expect(pipeline.resolvePendingNotification).not.toHaveBeenCalled();
  });

  it('allows saving a purchase with only an account chosen (category optional)', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([{ ...PENDING, accountId: 1 }]);
    const { getByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());

    fireEvent.press(getByText('save'));
    await waitFor(() =>
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith(
        'p1', expect.objectContaining({ accountId: 1 }),
      ),
    );
  });

  it('dismisses a pending item', async () => {
    const { getByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());
    fireEvent.press(getByText('dismiss'));
    await waitFor(() =>
      expect(pipeline.dismissPendingNotification).toHaveBeenCalledWith('p1'),
    );
  });

  it('lists the recent notifications and badges the bank-parseable one', async () => {
    const { getAllByText, getByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('New message')).toBeTruthy());
    // The bank notification gets the "bank operation" badge; the chat one does not.
    expect(getAllByText('notification_bank_badge')).toHaveLength(1);
  });

  it('hides notifications from apps the user has filtered out', async () => {
    notificationFilters.getHiddenPackages.mockResolvedValue(['com.chat']);
    // Real filtering for this test so the hidden app is actually dropped.
    notificationFilters.filterNotificationsByApp.mockImplementation((items, hidden) =>
      items.filter((n) => !(hidden || []).includes(n.packageName)),
    );
    const { getByText, queryByText } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());
    // The chat notification's app is hidden, so its text must not appear.
    expect(queryByText('New message')).toBeNull();
  });
});
