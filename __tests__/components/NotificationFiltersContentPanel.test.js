import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationFiltersContentPanel from '../../app/components/NotificationFiltersContentPanel';
import * as pipeline from '../../app/services/notifications/processBankNotifications';
import * as NotificationAccess from '../../app/services/NotificationAccess';
import * as notificationFilters from '../../app/services/notifications/notificationFilters';
import * as backgroundBankTask from '../../app/services/notifications/backgroundBankTask';

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

jest.mock('../../app/services/notifications/processBankNotifications');
jest.mock('../../app/services/NotificationAccess');
jest.mock('../../app/services/notifications/notificationFilters');
jest.mock('../../app/services/notifications/backgroundBankTask');

const KNOWN = ['com.android.systemui', 'com.banq.ameriabank', 'org.telegram.messenger'];

describe('NotificationFiltersContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    NotificationAccess.isNotificationAccessEnabled.mockResolvedValue(true);
    NotificationAccess.openNotificationAccessSettings.mockResolvedValue();
    NotificationAccess.getRecentNotifications.mockResolvedValue([]);
    pipeline.isBankNotificationsEnabled.mockResolvedValue(false);
    pipeline.setBankNotificationsEnabled.mockResolvedValue();
    pipeline.processBankNotifications.mockResolvedValue({ created: 0, pending: 0, skipped: 0 });
    notificationFilters.registerSeenPackages.mockResolvedValue(KNOWN);
    notificationFilters.getHiddenPackages.mockResolvedValue(['com.android.systemui']);
    notificationFilters.togglePackageVisibility.mockResolvedValue([]);
    notificationFilters.isPackageHidden.mockImplementation((pkg, hidden) => (hidden || []).includes(pkg));
    backgroundBankTask.isBackgroundAlertsEnabled.mockResolvedValue(false);
    backgroundBankTask.setBackgroundAlertsEnabled.mockResolvedValue();
    backgroundBankTask.syncBackgroundBankTaskRegistrationAsync.mockResolvedValue(true);
  });

  it('renders the background-alerts toggle, disabled while processing is off', async () => {
    pipeline.isBankNotificationsEnabled.mockResolvedValue(false);
    const { getByTestId, getByText } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() =>
      expect(getByTestId('bank-notifications-background-alerts-toggle')).toBeTruthy(),
    );
    expect(getByText('bank_notifications_background_alerts')).toBeTruthy();
    // The switch is disabled until bank processing is enabled.
    expect(getByTestId('bank-notifications-background-alerts-toggle').props.disabled).toBe(true);
  });

  it('enables the background-alerts toggle once processing is on', async () => {
    pipeline.isBankNotificationsEnabled.mockResolvedValue(true);
    backgroundBankTask.isBackgroundAlertsEnabled.mockResolvedValue(true);
    const { getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() =>
      expect(getByTestId('bank-notifications-background-alerts-toggle').props.disabled).toBe(false),
    );
  });

  it('shows the notification-access control and the bank toggle', async () => {
    const { getByText, getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByText('notification_access')).toBeTruthy());
    // Access already granted → "Manage" affordance.
    expect(getByText('manage')).toBeTruthy();
    expect(getByTestId('bank-notifications-toggle')).toBeTruthy();
    expect(getByText('bank_notifications_enable')).toBeTruthy();
  });

  it('offers a Grant action and opens settings when access is missing', async () => {
    NotificationAccess.isNotificationAccessEnabled.mockResolvedValue(false);
    const { getByText, getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByText('grant_access')).toBeTruthy());
    fireEvent.press(getByTestId('notification-access-button'));
    expect(NotificationAccess.openNotificationAccessSettings).toHaveBeenCalled();
  });

  it('lists every known app with a checkbox reflecting its visibility', async () => {
    const { getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByTestId('app-filter-com.banq.ameriabank')).toBeTruthy());

    // systemui is hidden → unchecked; the others are visible → checked.
    expect(getByTestId('app-filter-com.android.systemui').props.accessibilityState.checked).toBe(false);
    expect(getByTestId('app-filter-com.banq.ameriabank').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('app-filter-org.telegram.messenger').props.accessibilityState.checked).toBe(true);
  });

  it('toggles a visible app off when its row is tapped', async () => {
    const { getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByTestId('app-filter-org.telegram.messenger')).toBeTruthy());

    fireEvent.press(getByTestId('app-filter-org.telegram.messenger'));
    // Toggle is driven by package name only; the service flips from fresh state.
    await waitFor(() =>
      expect(notificationFilters.togglePackageVisibility).toHaveBeenCalledWith('org.telegram.messenger'),
    );
  });

  it('toggles a hidden app back on when its row is tapped', async () => {
    const { getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByTestId('app-filter-com.android.systemui')).toBeTruthy());

    fireEvent.press(getByTestId('app-filter-com.android.systemui'));
    await waitFor(() =>
      expect(notificationFilters.togglePackageVisibility).toHaveBeenCalledWith('com.android.systemui'),
    );
  });
});
