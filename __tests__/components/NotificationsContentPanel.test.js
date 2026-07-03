import React from 'react';
import { render } from '@testing-library/react-native';
import NotificationsContentPanel, { NotificationCard } from '../../app/components/NotificationsContentPanel';

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({ t: (key) => key }),
}));

jest.mock('../../app/contexts/ThemeColorsContext', () => ({
  useThemeColors: () => ({
    colors: {
      background: '#fff',
      surface: '#f5f5f5',
      primary: '#6200ee',
      selected: '#e8f0ff',
      text: '#000',
      mutedText: '#888',
      border: '#ddd',
    },
  }),
}));

jest.mock('../../app/styles/layout', () => ({
  HORIZONTAL_PADDING: 16,
  SPACING: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  BORDER_RADIUS: { sm: 4, md: 8, lg: 16 },
}));

const baseProps = {
  isLoading: false,
  notifications: [],
  onRefresh: jest.fn(),
  bottomInset: 0,
};

describe('NotificationsContentPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state while fetching', async () => {
    const { getByText } = await render(
      <NotificationsContentPanel {...baseProps} isLoading />,
    );
    expect(getByText('notifications_loading')).toBeTruthy();
  });

  it('shows an empty state when there are no notifications', async () => {
    const { getByText } = await render(<NotificationsContentPanel {...baseProps} />);
    expect(getByText('notifications_empty')).toBeTruthy();
  });

  it('renders one card per recent notification', async () => {
    const notifications = [
      { title: 'Bank', text: 'You spent $5', packageName: 'com.bank', postTime: 1718000000000 },
      { title: 'Chat', text: 'New message', packageName: 'com.chat', postTime: 1718000100000 },
    ];
    const { getByText } = await render(
      <NotificationsContentPanel {...baseProps} notifications={notifications} />,
    );
    expect(getByText('notifications_recent')).toBeTruthy();
    expect(getByText('Bank')).toBeTruthy();
    expect(getByText('You spent $5')).toBeTruthy();
    expect(getByText('Chat')).toBeTruthy();
    expect(getByText('New message')).toBeTruthy();
    expect(getByText('com.bank')).toBeTruthy();
  });

  it('highlights notifications that parse as bank transactions with a badge', async () => {
    const notifications = [
      // Parses as a bank transaction (Ameria ARCA layout).
      {
        title: 'АРКА транзакции',
        text: 'PURCHASE | 3,900.00 AMD | 4083***7027, | NAREK MEHRABYAN, AM | 28.06.2026 10:15 | BALANCE: 133,719.97 AMD',
        packageName: 'am.bank',
        postTime: 1718000000000,
      },
      // A plain chat notification — no badge.
      { title: 'Chat', text: 'New message', packageName: 'com.chat', postTime: 1718000100000 },
    ];
    const { getByText, getAllByText } = await render(
      <NotificationsContentPanel {...baseProps} notifications={notifications} />,
    );
    expect(getByText('New message')).toBeTruthy();
    expect(getAllByText('notification_bank_badge')).toHaveLength(1);
  });

  it('falls back to a "no text" label when a notification has neither title nor text', async () => {
    const notifications = [
      { title: '', text: '', packageName: 'com.empty', postTime: 1718000000000 },
    ];
    const { getByText } = await render(
      <NotificationsContentPanel {...baseProps} notifications={notifications} />,
    );
    expect(getByText('notification_no_text')).toBeTruthy();
  });

  describe('NotificationCard entry animation', () => {
    const colors = {
      surface: '#f5f5f5', primary: '#6200ee', selected: '#e8f0ff',
      text: '#000', mutedText: '#888', border: '#ddd',
    };
    const t = (key) => key;

    it('renders its content when animating in', async () => {
      const notification = {
        title: 'Bank', text: 'You spent $5', packageName: 'com.bank', postTime: 1718000000000,
      };
      const { getByText } = await render(
        <NotificationCard notification={notification} colors={colors} t={t} animateIn />,
      );
      // The fade/slide-in wrapper must not swallow the card's content.
      expect(getByText('Bank')).toBeTruthy();
      expect(getByText('You spent $5')).toBeTruthy();
    });

    it('renders its content at rest when not animating', async () => {
      const notification = {
        title: 'Chat', text: 'New message', packageName: 'com.chat', postTime: 1718000100000,
      };
      const { getByText } = await render(
        <NotificationCard notification={notification} colors={colors} t={t} />,
      );
      expect(getByText('New message')).toBeTruthy();
    });
  });
});
