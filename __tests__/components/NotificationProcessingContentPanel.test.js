import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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
    accounts: [
      { id: 1, name: 'Checking', currency: 'AMD' },
      { id: 2, name: 'Cash', currency: 'AMD' },
    ],
  }),
}));
jest.mock('../../app/contexts/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: 'c1', name: 'Food', type: 'entry', categoryType: 'expense', parentId: null, isShadow: false },
      { id: 'c2', name: 'Salary', type: 'entry', categoryType: 'income', parentId: null, isShadow: false },
      { id: 'f1', name: 'Bills', type: 'folder', categoryType: 'expense', parentId: null, isShadow: false },
      { id: 'c3', name: 'Rent', type: 'entry', categoryType: 'expense', parentId: 'f1', isShadow: false },
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
    pipeline.reAddNotification.mockResolvedValue({ created: 1, pending: 0, skipped: 0 });
    pipeline.resolveAtmTargetAccount.mockResolvedValue(null);
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

  it('saves a category picked from the inline grid', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([{ ...PENDING, accountId: 1 }]);
    const { getByText, getByTestId } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());

    // Expense categories render as grid chips; tap "Food" and wait for it to
    // register as the selection before saving.
    fireEvent.press(getByTestId('category-grid-c1'));
    await waitFor(() =>
      expect(getByTestId('category-grid-c1').props.accessibilityState.selected).toBe(true),
    );

    fireEvent.press(getByText('save'));
    await waitFor(() =>
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith(
        'p1', expect.objectContaining({ accountId: 1, categoryId: 'c1' }),
      ),
    );
  });

  it('drills into a folder to reach and save a nested category', async () => {
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([{ ...PENDING, accountId: 1 }]);
    const { getByText, getByTestId, queryByTestId } = await render(<NotificationProcessingContentPanel />);
    await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());

    // The nested "Rent" category is hidden until its "Bills" folder is opened.
    expect(queryByTestId('category-grid-c3')).toBeNull();
    fireEvent.press(getByTestId('category-grid-f1'));
    await waitFor(() => expect(getByTestId('category-grid-c3')).toBeTruthy());

    fireEvent.press(getByTestId('category-grid-c3'));
    await waitFor(() =>
      expect(getByTestId('category-grid-c3').props.accessibilityState.selected).toBe(true),
    );

    fireEvent.press(getByText('save'));
    await waitFor(() =>
      expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith(
        'p1', expect.objectContaining({ accountId: 1, categoryId: 'c3' }),
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

  it('shows a distinct "all filtered" empty state when every recent item is hidden', async () => {
    // Both captured apps are hidden → the feed is empty but notifications exist.
    notificationFilters.getHiddenPackages.mockResolvedValue(['am.bank', 'com.chat']);
    notificationFilters.filterNotificationsByApp.mockImplementation((items, hidden) =>
      items.filter((n) => !(hidden || []).includes(n.packageName)),
    );
    PendingNotificationsDB.getPendingNotifications.mockResolvedValue([]);
    const { getByText, queryByText } = await render(<NotificationProcessingContentPanel />);
    // Must use the "hidden by filters" copy, not the "nothing recorded" copy.
    await waitFor(() => expect(getByText('notifications_all_filtered')).toBeTruthy());
    expect(queryByText('notifications_empty')).toBeNull();
  });

  describe('ATM cash transfer review', () => {
    const ATM_PENDING = {
      id: 'pt1', kind: 'ATM CASH', type: 'transfer', amount: '200000.00', currency: 'AMD',
      cardMask: '4083***7027', merchant: 'ATM 401 REPUBLIC 67/1', date: '2026-07-01',
      accountId: 1, categoryId: null, packageName: 'am.bank',
    };

    it('shows a target-account picker instead of a category grid for a transfer', async () => {
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([ATM_PENDING]);
      const { getByText, queryByTestId } = await render(<NotificationProcessingContentPanel />);
      await waitFor(() => expect(getByText('ATM 401 REPUBLIC 67/1')).toBeTruthy());
      // The "To account" field is present and the category grid is not.
      expect(getByText('BANK_NOTIFICATIONS_TRANSFER_TO *')).toBeTruthy();
      expect(queryByTestId('category-grid-c1')).toBeNull();
    });

    it('keeps Save disabled until a target account is bound/chosen', async () => {
      // No cash account bound yet → target is unset → Save must be a no-op.
      pipeline.resolveAtmTargetAccount.mockResolvedValue(null);
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([ATM_PENDING]);
      const { getByText } = await render(<NotificationProcessingContentPanel />);
      await waitFor(() => expect(getByText('ATM 401 REPUBLIC 67/1')).toBeTruthy());

      fireEvent.press(getByText('save'));
      expect(pipeline.resolvePendingNotification).not.toHaveBeenCalled();
    });

    it('saves a transfer with the bound cash account pre-filled as the target', async () => {
      // The bound cash account (id 2) pre-fills the target picker.
      pipeline.resolveAtmTargetAccount.mockResolvedValue({ id: 2, currency: 'AMD' });
      PendingNotificationsDB.getPendingNotifications.mockResolvedValue([ATM_PENDING]);
      const { getByText } = await render(<NotificationProcessingContentPanel />);
      await waitFor(() => expect(getByText('ATM 401 REPUBLIC 67/1')).toBeTruthy());

      fireEvent.press(getByText('save'));
      await waitFor(() =>
        expect(pipeline.resolvePendingNotification).toHaveBeenCalledWith(
          'pt1', expect.objectContaining({ accountId: 1, toAccountId: 2 }),
        ),
      );
    });
  });

  describe('auto-refresh', () => {
    // Grab the 3-second tick the panel arms after its initial load. Spying on
    // setInterval and invoking the callback directly sidesteps the fragile
    // fake-timer/async-pipeline interaction while still asserting the contract.
    const getAutoRefreshTick = (spy) => {
      const call = spy.mock.calls.find(([, ms]) => ms === 3000);
      expect(call).toBeTruthy();
      return call[0];
    };

    it('arms a 3-second interval that re-runs the pipeline and reloads the lists', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      try {
        const { getByText } = await render(<NotificationProcessingContentPanel />);
        await waitFor(() => expect(getByText('NAREK MEHRABYAN')).toBeTruthy());

        const tick = getAutoRefreshTick(setIntervalSpy);
        const recentBefore = NotificationAccess.getRecentNotifications.mock.calls.length;
        const processBefore = pipeline.processBankNotifications.mock.calls.length;
        const pendingBefore = PendingNotificationsDB.getPendingNotifications.mock.calls.length;

        await act(async () => { await tick(); });

        expect(NotificationAccess.getRecentNotifications.mock.calls.length).toBe(recentBefore + 1);
        expect(pipeline.processBankNotifications.mock.calls.length).toBe(processBefore + 1);
        expect(PendingNotificationsDB.getPendingNotifications.mock.calls.length).toBe(pendingBefore + 1);
      } finally {
        setIntervalSpy.mockRestore();
      }
    });

    it('surfaces a notification that only arrives on a later refresh', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      try {
        const { getByText, queryByText } = await render(<NotificationProcessingContentPanel />);
        await waitFor(() => expect(getByText('New message')).toBeTruthy());
        // Not present yet — it hasn't been captured at mount time.
        expect(queryByText('Fresh purchase')).toBeNull();

        // The next fetch (fired by the interval tick) adds a fresh notification.
        NotificationAccess.getRecentNotifications.mockResolvedValue([
          { title: 'Chat', text: 'Fresh purchase', packageName: 'com.chat', postTime: 1718000200000 },
          BANK_RAW,
          CHAT_RAW,
        ]);
        const tick = getAutoRefreshTick(setIntervalSpy);
        await act(async () => { await tick(); });

        expect(getByText('Fresh purchase')).toBeTruthy();
      } finally {
        setIntervalSpy.mockRestore();
      }
    });
  });

  describe('re-add operation', () => {
    it('offers a re-add action on a bank-parseable recent notification', async () => {
      const { getByText, getAllByText } = await render(<NotificationProcessingContentPanel />);
      await waitFor(() => expect(getByText('New message')).toBeTruthy());
      // Only the bank card (not the chat card) exposes the re-add action.
      expect(getAllByText('bank_notifications_readd')).toHaveLength(1);
    });

    it('re-adds the operation and shows confirmation feedback', async () => {
      const { getByText } = await render(<NotificationProcessingContentPanel />);
      await waitFor(() => expect(getByText('bank_notifications_readd')).toBeTruthy());

      fireEvent.press(getByText('bank_notifications_readd'));
      await waitFor(() =>
        expect(pipeline.reAddNotification).toHaveBeenCalledWith(
          expect.objectContaining({ packageName: 'am.bank' }),
        ),
      );
      await waitFor(() => expect(getByText('bank_notifications_readd_created')).toBeTruthy());
    });
  });
});
