import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationFiltersContentPanel from '../../app/components/NotificationFiltersContentPanel';
import * as pipeline from '../../app/services/notifications/processBankNotifications';
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

jest.mock('../../app/services/notifications/processBankNotifications');
jest.mock('../../app/services/NotificationAccess');
jest.mock('../../app/services/notifications/notificationFilters');

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
    notificationFilters.setPackageVisible.mockResolvedValue([]);
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

  it('hides a visible app when its row is tapped', async () => {
    const { getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByTestId('app-filter-org.telegram.messenger')).toBeTruthy());

    fireEvent.press(getByTestId('app-filter-org.telegram.messenger'));
    // Currently visible → toggling makes it hidden (visible=false).
    await waitFor(() =>
      expect(notificationFilters.setPackageVisible).toHaveBeenCalledWith('org.telegram.messenger', false),
    );
  });

  it('re-shows a hidden app when its row is tapped', async () => {
    const { getByTestId } = await render(<NotificationFiltersContentPanel />);
    await waitFor(() => expect(getByTestId('app-filter-com.android.systemui')).toBeTruthy());

    fireEvent.press(getByTestId('app-filter-com.android.systemui'));
    // Currently hidden → toggling makes it visible (visible=true).
    await waitFor(() =>
      expect(notificationFilters.setPackageVisible).toHaveBeenCalledWith('com.android.systemui', true),
    );
  });
});
